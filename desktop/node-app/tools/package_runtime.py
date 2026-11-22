#!/usr/bin/env python3
"""Bundle the runtime of Descall Node (CI, windows-latest; also works on Linux for a dry run).

Output (default desktop/target/node-runtime, the path tauri.bundle.conf.json bundles):
  runtime/node.exe           official Node.js win-x64, sha256 pinned in runtime.lock.json
  runtime/cloudflared.exe    GitHub release asset, checked against the release digest
                             (and the pinned sha256 once set)
  backend/frontend/backend/  the repository's backend with production dependencies
  backend/frontend/src/i18n/locales, backend/infra/cloudflare/edge-config.json
                             (files the backend reads from outside its folder)
  runtime-manifest.json      sha256 of the two executables; the app checks them before
                             every first start (descall_node::manifest)

Usage: package_runtime.py [--out DIR] [--skip-backend] [--skip-download]
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
NODE_APP = HERE.parent
REPO = NODE_APP.parent.parent

# Never bundled: tests, local env files, dev caches.
EXCLUDE_DIRS = {"node_modules", "test", "tests", "__tests__", ".cache", "coverage"}
EXCLUDE_FILES = {".env", ".env.local", ".env.production", ".env.development"}



# Files of the repository the backend loads from outside frontend/backend (lib/locales.js reads
# frontend/src/i18n/locales.json, the sitemap route imports frontend/src/site/*, version from
# frontend/package.json, the AASA file ...). Found by scanning the backend's runtime sources for
# relative require()/import()/path.join(__dirname, ...) literals, then following the relative
# imports of what they reach. Tests, selftests, frontend/dist and env files are never included.
_REF_RE = re.compile(r"""(?:require|import)\(\s*["'`](\.\.?/[^"'`]+)["'`]|from\s+["'](\.\.?/[^"']+)["']""")
_JOIN_RE = re.compile(r"path\.(?:join|resolve)\(\s*__dirname\s*,([^)]*)\)")
_STR_RE = re.compile(r"""["'`]([^"'`]*)["'`]""")
_TEST_NAME = re.compile(r"\.(?:selftest|test|spec|unit\.test|integration\.test|e2e)\.[cm]?js$")


def _resolve(base: Path, rel: str):
    target = (base / rel).resolve()
    for cand in (target, Path(str(target) + ".js"), Path(str(target) + ".json"), target / "index.js"):
        if cand.is_file():
            return cand
    return None


def outside_backend_files(repo: Path = REPO) -> list:
    frontend = (repo / "frontend").resolve()
    backend = (frontend / "backend").resolve()
    found, queue = set(), []

    def consider(base: Path, rel: str):
        f = _resolve(base, rel)
        if f is None:
            return
        if backend in f.parents or frontend not in f.parents:
            return
        relp = f.relative_to(frontend)
        if relp.parts[0] in ("dist", "node_modules") or relp.name.startswith(".env") or _TEST_NAME.search(relp.name):
            return
        if f not in found:
            found.add(f)
            queue.append(f)

    for root, dirs, files in os.walk(backend):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for name in files:
            if not re.search(r"\.[cm]?js$", name) or _TEST_NAME.search(name):
                continue
            path = Path(root) / name
            text = path.read_text(encoding="utf-8", errors="ignore")
            for m in _REF_RE.finditer(text):
                consider(path.parent, m.group(1) or m.group(2))
            for m in _JOIN_RE.finditer(text):
                parts = _STR_RE.findall(m.group(1))
                if parts:
                    consider(path.parent, os.path.join(*parts))
    while queue:
        f = queue.pop()
        if f.suffix not in (".js", ".mjs", ".cjs"):
            continue
        for m in _REF_RE.finditer(f.read_text(encoding="utf-8", errors="ignore")):
            consider(f.parent, m.group(1) or m.group(2))
    return sorted(str(f.relative_to(repo)).replace("\\", "/") for f in found)

def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check_sha(p: Path, *expected) -> str:
    got = sha256_file(p)
    for e in expected:
        if e and got.lower() != e.lower().removeprefix("sha256:"):
            raise SystemExit(f"checksum mismatch for {p.name}: got {got}, expected {e}")
    return got


def keep(rel: Path) -> bool:
    if any(part in EXCLUDE_DIRS for part in rel.parts[:-1]) or rel.name in EXCLUDE_DIRS:
        return False
    return rel.name not in EXCLUDE_FILES and not rel.name.startswith(".env.")


def copy_tree(src: Path, dst: Path) -> int:
    n = 0
    for root, dirs, files in os.walk(src):
        rel_root = Path(root).relative_to(src)
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            rel = rel_root / f
            if not keep(rel):
                continue
            (dst / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(Path(root) / f, dst / rel)
            n += 1
    return n


def download(url: str, to: Path, headers=None) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "descall-node-build", **(headers or {})})
    with urllib.request.urlopen(req, timeout=120) as r, open(to, "wb") as f:
        shutil.copyfileobj(r, f)


def github_json(url: str):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "descall-node-build"}
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
        return json.load(r)


def fetch_cloudflared(lock: dict, out: Path) -> str:
    repo, version, asset = lock["repo"], lock["version"], lock["asset"]
    rel = github_json(f"https://api.github.com/repos/{repo}/releases/" + ("latest" if version == "latest" else f"tags/{version}"))
    a = next((x for x in rel["assets"] if x["name"] == asset), None)
    if not a or not a.get("digest"):
        raise SystemExit(f"{asset} (with a published digest) not found in {repo} {rel.get('tag_name')}")
    download(a["browser_download_url"], out)
    got = check_sha(out, a["digest"], lock.get("sha256"))
    print(f"cloudflared {rel['tag_name']} sha256 {got} (pin it in runtime.lock.json)")
    return rel["tag_name"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "desktop" / "target" / "node-runtime"))
    ap.add_argument("--skip-backend", action="store_true")
    ap.add_argument("--skip-download", action="store_true")
    args = ap.parse_args(argv)
    out = Path(args.out)
    lock = json.loads((NODE_APP / "runtime.lock.json").read_text())
    rt = out / "runtime"
    rt.mkdir(parents=True, exist_ok=True)
    manifest = {"node": lock["node"]["version"], "cloudflared": None, "files": []}

    if not args.skip_download:
        node = rt / "node.exe"
        download(lock["node"]["url"], node)
        check_sha(node, lock["node"]["sha256"])
        manifest["cloudflared"] = fetch_cloudflared(lock["cloudflared"], rt / "cloudflared.exe")
        for name in ("node.exe", "cloudflared.exe"):
            p = rt / name
            manifest["files"].append({"path": f"runtime/{name}", "sha256": sha256_file(p), "size": p.stat().st_size})

    if not args.skip_backend:
        be = out / "backend"
        if be.exists():
            shutil.rmtree(be)
        n = copy_tree(REPO / "frontend" / "backend", be / "frontend" / "backend")
        n += copy_tree(REPO / "frontend" / "src" / "i18n" / "locales", be / "frontend" / "src" / "i18n" / "locales")
        for rel in outside_backend_files(REPO):
            (be / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(REPO / rel, be / rel)
            n += 1
        edge = REPO / "infra" / "cloudflare" / "edge-config.json"
        if edge.exists():
            (be / "infra" / "cloudflare").mkdir(parents=True, exist_ok=True)
            shutil.copy2(edge, be / "infra" / "cloudflare" / "edge-config.json")
        npm = shutil.which("npm") or shutil.which("npm.cmd")
        if not npm:
            raise SystemExit("npm not found")
        subprocess.run([npm, "ci", "--omit=dev", "--no-audit", "--no-fund"], cwd=be / "frontend" / "backend", check=True)
        print(f"backend: {n} files + production node_modules")

    (out / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"runtime ready in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

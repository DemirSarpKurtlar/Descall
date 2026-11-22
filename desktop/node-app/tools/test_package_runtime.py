"""Offline tests of package_runtime.py (no network): checksums, what is bundled, the lock."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import package_runtime as pr  # noqa: E402


class PackageRuntimeTest(unittest.TestCase):
    def test_checksum(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.exe"
            p.write_bytes(b"abc")
            want = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
            self.assertEqual(pr.check_sha(p, "sha256:" + want.upper(), None), want)
            with self.assertRaises(SystemExit):
                pr.check_sha(p, "00" * 32)

    def test_secrets_and_tests_are_never_bundled(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d) / "src", Path(d) / "dst"
            for rel in ["server.js", "lib/a.js", ".env", ".env.production", "test/x.test.js", "node_modules/m/index.js", "routes/node.js"]:
                (src / rel).parent.mkdir(parents=True, exist_ok=True)
                (src / rel).write_text("x")
            pr.copy_tree(src, dst)
            got = sorted(str(p.relative_to(dst)).replace("\\", "/") for p in dst.rglob("*") if p.is_file())
            self.assertEqual(got, ["lib/a.js", "routes/node.js", "server.js"])

    def test_backend_files_outside_its_folder_are_bundled(self):
        # The PC node crashed at boot: lib/locales.js requires frontend/src/i18n/locales.json,
        # which the bundle did not carry. Every runtime reference the backend makes outside
        # frontend/backend must be in the list, and the list must hold no tests, dist or env files.
        files = pr.outside_backend_files(pr.REPO)
        for must in ("frontend/src/i18n/locales.json", "frontend/package.json",
                     "frontend/src/site/sitemapCatalog.js", "frontend/src/i18n/registry.js"):
            self.assertIn(must, files)
        for f in files:
            self.assertFalse(f.startswith("frontend/backend/"), f)
            self.assertFalse(f.startswith("frontend/dist/"), f)
            self.assertNotRegex(f, r"\.(selftest|test|spec)\.[cm]?js$")
            self.assertNotIn(".env", Path(f).name)
        # Copy them like main() does and check that nothing the backend points at is missing.
        import shutil
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            pr.copy_tree(pr.REPO / "frontend" / "backend", root / "frontend" / "backend")
            pr.copy_tree(pr.REPO / "frontend" / "src" / "i18n" / "locales", root / "frontend" / "src" / "i18n" / "locales")
            for rel in files:
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(pr.REPO / rel, root / rel)
            self.assertEqual(sorted(pr.outside_backend_files(root)), sorted(files))

    def test_lock_pins_node(self):
        lock = json.loads((pr.NODE_APP / "runtime.lock.json").read_text())
        self.assertTrue(lock["node"]["version"].startswith("v24."))
        self.assertEqual(len(lock["node"]["sha256"]), 64)
        self.assertIn(lock["node"]["version"], lock["node"]["url"])
        self.assertEqual(lock["cloudflared"]["asset"], "cloudflared-windows-amd64.exe")

    def test_bundle_config_matches_output(self):
        conf = json.loads((pr.NODE_APP / "tauri.bundle.conf.json").read_text())
        res = conf["bundle"]["resources"]
        self.assertIn("../target/node-runtime/runtime/", res)
        self.assertEqual(res["../target/node-runtime/runtime-manifest.json"], "runtime-manifest.json")


if __name__ == "__main__":
    unittest.main()

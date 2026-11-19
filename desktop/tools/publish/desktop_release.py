"""Release helpers for the Tauri desktop app (.github/workflows/tauri-release.yml).

Standard library only, except `verify-updater`, which needs `cryptography` (as the setup crate's
tools/release.py does). Keys: docs/desktop/anahtarlar.md.

  desktop_release.py key-status setup   desktop/keys/setup-manifest.pub
  desktop_release.py key-status updater desktop/keys/tauri-updater.pub
      Prints the key (setup: the base64 key line; updater: the value tauri.conf.json takes) and
      exits 0, or explains why it is still a placeholder / malformed and exits 3.
  desktop_release.py verify-updater <installer> <installer.sig> <tauri-updater.pub>
      Checks a `tauri signer sign` signature exactly as tauri-plugin-updater will (exit 1 if not).
  desktop_release.py payload <out.zip> <file>=<name-in-zip> ...
      Deterministic zip (fixed timestamps, sorted) for the setup's payload.
  desktop_release.py latest-json <out> --version 4.0.0 --url <installer url> --sig <installer.sig> [--notes ..]
      The static updater feed (https://v2.tauri.app/plugin/updater/#static-json-file).
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
import sys
import zipfile

PLACEHOLDER = 3


def _key_lines(text):
    return [l.strip() for l in text.splitlines() if l.strip() and not l.strip().startswith("#") and not l.strip().lower().startswith("untrusted comment:")]


def _minisign_pub(line):
    """Raw 42-byte minisign public key ("Ed" + key id + Ed25519 key) from its base64 line."""
    try:
        b = base64.b64decode(line, validate=True)
    except Exception:
        raise ValueError("not base64")
    if len(b) != 42 or b[:2] != b"Ed":
        raise ValueError("not a minisign Ed25519 public key")
    return b


def setup_pub(text):
    keys = _key_lines(text)
    if not keys or any(k.startswith("REPLACE_WITH") for k in keys):
        raise LookupError("placeholder: the owner has not generated the setup manifest key yet")
    if len(keys) != 1:
        raise ValueError("expected exactly one key line")
    _minisign_pub(keys[0])
    return keys[0]


def updater_pub(text):
    """tauri.conf.json `plugins.updater.pubkey`: the .pub file `tauri signer generate` wrote, i.e.
    base64 of a two-line minisign public key file. A bare minisign key line is accepted too and
    wrapped the same way."""
    keys = _key_lines(text)
    if not keys or any(k.startswith("REPLACE_WITH") for k in keys):
        raise LookupError("placeholder: the owner has not generated the updater key yet")
    if len(keys) != 1:
        raise ValueError("expected exactly one line")
    try:
        inner = base64.b64decode(keys[0], validate=True)
    except Exception:
        raise ValueError("not base64")
    if len(inner) == 42 and inner[:2] == b"Ed":
        wrapped = "untrusted comment: minisign public key\n" + keys[0] + "\n"
        return base64.b64encode(wrapped.encode()).decode()
    inner_keys = _key_lines(inner.decode("utf-8", "replace"))
    if len(inner_keys) != 1:
        raise ValueError("not a `tauri signer generate` public key")
    _minisign_pub(inner_keys[0])
    return keys[0]


def _updater_raw_pub(value):
    return _minisign_pub(_key_lines(base64.b64decode(value).decode("utf-8", "replace"))[0])


def verify_minisig(data, sig_text, raw_pub):
    """minisign verification: prehashed ("ED") or legacy ("Ed"), trusted comment included."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    lines = [l for l in sig_text.splitlines() if l.strip()]
    if len(lines) < 4 or not lines[2].startswith("trusted comment: "):
        raise ValueError("malformed signature")
    sig = base64.b64decode(lines[1])
    if len(sig) != 74 or sig[:2] not in (b"ED", b"Ed"):
        raise ValueError("malformed signature")
    if sig[2:10] != raw_pub[2:10]:
        raise ValueError("signed with another key (key id differs from the public key)")
    key = Ed25519PublicKey.from_public_bytes(raw_pub[10:42])
    msg = hashlib.blake2b(data, digest_size=64).digest() if sig[:2] == b"ED" else data
    key.verify(sig[10:74], msg)
    key.verify(base64.b64decode(lines[3]), sig[10:74] + lines[2][len("trusted comment: "):].encode())


def verify_updater(installer, sig_file, pub_file):
    pub = updater_pub(open(pub_file, encoding="utf-8").read())
    # The .sig `tauri signer sign` writes is base64 of the minisign signature file.
    sig_text = base64.b64decode(open(sig_file, encoding="utf-8").read().strip()).decode("utf-8")
    verify_minisig(open(installer, "rb").read(), sig_text, _updater_raw_pub(pub))


def payload(out, pairs):
    entries = []
    for p in pairs:
        src, _, name = p.partition("=")
        name = name or os.path.basename(src)
        if name.startswith("/") or ".." in name.split("/") or "\\" in name:
            raise ValueError(f"unsafe name in payload: {name}")
        entries.append((name, src))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, src in sorted(entries):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(src, "rb") as f:
                z.writestr(info, f.read())


def latest_json(version, url, sig_file, notes, pub_date=None):
    sig = open(sig_file, encoding="utf-8").read().strip()
    if not url.startswith("https://"):
        raise ValueError("updater url must be https")
    pub_date = pub_date or datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    entry = {"signature": sig, "url": url}
    # "windows-x86_64-nsis" is what the plugin looks for first for an NSIS install.
    return {"version": version, "notes": notes, "pub_date": pub_date, "platforms": {"windows-x86_64-nsis": entry, "windows-x86_64": entry}}


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("key-status"); k.add_argument("kind", choices=["setup", "updater"]); k.add_argument("file")
    v = sub.add_parser("verify-updater"); v.add_argument("installer"); v.add_argument("sig"); v.add_argument("pub")
    p = sub.add_parser("payload"); p.add_argument("out"); p.add_argument("files", nargs="+")
    l = sub.add_parser("latest-json"); l.add_argument("out"); l.add_argument("--version", required=True)
    l.add_argument("--url", required=True); l.add_argument("--sig", required=True); l.add_argument("--notes", default="")
    a = ap.parse_args(argv)
    if a.cmd == "key-status":
        try:
            text = open(a.file, encoding="utf-8").read()
            print(setup_pub(text) if a.kind == "setup" else updater_pub(text))
        except FileNotFoundError:
            print(f"{a.file}: missing", file=sys.stderr)
            return PLACEHOLDER
        except LookupError as e:
            print(f"{a.file}: {e}", file=sys.stderr)
            return PLACEHOLDER
        except ValueError as e:
            print(f"{a.file}: malformed ({e})", file=sys.stderr)
            return PLACEHOLDER
        return 0
    if a.cmd == "verify-updater":
        try:
            verify_updater(a.installer, a.sig, a.pub)
        except Exception as e:
            print(f"updater signature check failed: {str(e) or type(e).__name__}", file=sys.stderr)
            return 1
        print(f"ok: {os.path.basename(a.installer)} verifies with {a.pub}")
        return 0
    if a.cmd == "payload":
        payload(a.out, a.files)
        return 0
    if a.cmd == "latest-json":
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(latest_json(a.version, a.url, a.sig, a.notes), f, ensure_ascii=False, indent=2)
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())

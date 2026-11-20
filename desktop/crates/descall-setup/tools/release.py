"""Release helpers for Descall-Setup (no third-party tools beyond `cryptography`).

  release.py manifest <payload.zip> <out-dir> --version 4.0.0 --mirror https://cdn.descall.com/desktop/4.0.0/=Istanbul,tr:İstanbul
      Writes <out-dir>/manifest.json with per-part SHA-256 (part size --part-size, default 1.3 MiB).
  release.py sign <file> --key <key-file>             -> <file>.minisig (minisign "ED" prehashed format)
      --key also takes an environment variable: --key env:DESCALL_SETUP_SIGNING_KEY (CI secret).
  release.py verify <file> --pub <pub-file>           -> checks <file>.minisig against the public key (exit 1 if not)
  release.py keygen <key-file> <pub-file>             -> Ed25519 secret key as one base64 line (keep secret, never
      commit; it is the DESCALL_SETUP_SIGNING_KEY secret) + minisign public key (desktop/keys/setup-manifest.pub)

  Key formats `sign` reads: the base64 line keygen writes, the older raw 40-byte file, or an
  unencrypted minisign secret key (`minisign -G -W`).
  release.py pack <Descall-Setup.exe> <payload.zip> <manifest.json> <manifest.json.minisig> <out.exe>
      Offline installer: appends payload + manifest + signature + trailer. Sign the result with
      signtool afterwards; Authenticode covers the overlay and the setup finds it before the
      certificate table.

The manifest key is its own Ed25519 key (docs/desktop/anahtarlar.md), separate from the Tauri
updater key; signatures made by `minisign -S` with it verify the same way.
"""
import argparse, base64, hashlib, json, os, struct, sys, zipfile

MAGIC = b"DSPAYLD1"


def _ed():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    return Ed25519PrivateKey


def _pub_line(sk, key_id):
    from cryptography.hazmat.primitives import serialization
    pk = sk.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(b"Ed" + key_id + pk).decode()


def keygen(key_path, pub_path):
    if os.path.exists(key_path):
        sys.exit(f"{key_path} already exists: refusing to overwrite a secret key")
    seed = os.urandom(32)
    key_id = os.urandom(8)
    sk = _ed().from_private_bytes(seed)
    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(base64.b64encode(key_id + seed).decode() + "\n")
    with open(pub_path, "w") as f:
        f.write(_pub_line(sk, key_id) + "\n")


def load_key(spec):
    """(key_id, seed) from a key file or `env:NAME`. Raises ValueError with a readable reason."""
    if spec.startswith("env:"):
        raw = os.environ.get(spec[4:], "").encode()
        if not raw.strip():
            raise ValueError(f"environment variable {spec[4:]} is empty")
    else:
        raw = open(spec, "rb").read()
    if len(raw) == 40 and not raw.strip().isascii():
        return raw[:8], raw[8:40]  # older raw keygen output
    lines = [l.strip() for l in raw.decode("utf-8", "replace").splitlines() if l.strip() and not l.lower().startswith("untrusted comment:")]
    if len(lines) != 1:
        raise ValueError("expected one base64 line (release.py keygen) or a minisign secret key")
    try:
        b = base64.b64decode(lines[0], validate=True)
    except Exception:
        raise ValueError("key is not valid base64")
    if len(b) == 40:
        return b[:8], b[8:40]
    # minisign secret key: Ed | kdf alg | cksum alg | salt 32 | opslimit 8 | memlimit 8 | key id 8 | sk 64 | checksum 32
    if len(b) == 158 and b[:2] == b"Ed":
        if b[2:4] != b"\0\0":
            raise ValueError("minisign key is password-protected: make it with `minisign -G -W` (no password)")
        key_id, sk, cksum = b[54:62], b[62:126], b[126:158]
        if hashlib.blake2b(b"Ed" + key_id + sk, digest_size=32).digest() != cksum:
            raise ValueError("minisign key checksum mismatch")
        return key_id, sk[:32]
    raise ValueError(f"unknown key format ({len(b)} bytes)")


def pub_from_file(path):
    """The base64 key line of a minisign public key file (comment and `#` lines skipped)."""
    lines = [l.strip() for l in open(path, encoding="utf-8").read().splitlines()]
    keys = [l for l in lines if l and not l.startswith("#") and not l.lower().startswith("untrusted comment:")]
    if len(keys) != 1:
        raise ValueError(f"{path}: expected exactly one key line")
    b = base64.b64decode(keys[0], validate=True)
    if len(b) != 42 or b[:2] != b"Ed":
        raise ValueError(f"{path}: not a minisign Ed25519 public key")
    return keys[0]


def verify(path, pub_line, sig_path=None):
    """minisign verification (prehashed "ED" or legacy "Ed"), trusted comment included."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    pk = base64.b64decode(pub_line)
    lines = open(sig_path or path + ".minisig", encoding="utf-8").read().splitlines()
    sig = base64.b64decode(lines[1])
    if sig[2:10] != pk[2:10]:
        raise ValueError("signed with another key (key id differs)")
    data = open(path, "rb").read()
    msg = hashlib.blake2b(data, digest_size=64).digest() if sig[:2] == b"ED" else data
    key = Ed25519PublicKey.from_public_bytes(pk[10:42])
    key.verify(sig[10:74], msg)
    tc = lines[2][len("trusted comment: "):].encode()
    key.verify(base64.b64decode(lines[3]), sig[10:74] + tc)


def sign(path, key_spec, trusted="descall-setup manifest"):
    key_id, seed = load_key(key_spec)
    sk = _ed().from_private_bytes(seed)
    data = open(path, "rb").read()
    digest = hashlib.blake2b(data, digest_size=64).digest()
    sig = sk.sign(digest)
    tc = f"timestamp:0\tfile:{os.path.basename(path)}\t{trusted}".encode()
    gsig = sk.sign(sig + tc)
    out = "untrusted comment: signature from descall release key\n"
    out += base64.b64encode(b"ED" + key_id + sig).decode() + "\n"
    out += "trusted comment: " + tc.decode() + "\n"
    out += base64.b64encode(gsig).decode() + "\n"
    with open(path + ".minisig", "w") as f:
        f.write(out)


def manifest(zip_path, out_dir, version, mirrors, part_size, notes):
    data = open(zip_path, "rb").read()
    with zipfile.ZipFile(zip_path) as z:
        infos = [i for i in z.infolist() if not i.is_dir()]
        installed = sum(i.file_size for i in infos)
    parts = [hashlib.sha256(data[i:i + part_size]).hexdigest() for i in range(0, len(data), part_size)]
    ms = []
    for m in mirrors:
        base, _, labels = m.partition("=")
        lab = {}
        for item in filter(None, labels.split(",")):
            k, _, v = item.partition(":")
            if v:
                lab[k] = v
            else:
                lab["en"] = k
        ms.append({"base": base, "label": lab})
    doc = {
        "product": "Descall", "version": version, "arch": "x64", "minWindowsBuild": 19041,
        "payload": {"file": os.path.basename(zip_path), "sha256": hashlib.sha256(data).hexdigest(), "size": len(data),
                    "installedSize": installed, "files": len(infos), "partSize": part_size, "parts": parts},
        "mirrors": ms, "notes": notes, "legacyBackupDays": 14,
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)


def pack(setup, zip_path, man, sig, out):
    blobs = [open(p, "rb").read() for p in (zip_path, man, sig)]
    with open(out, "wb") as f:
        f.write(open(setup, "rb").read())
        for b in blobs:
            f.write(b)
        f.write(MAGIC + struct.pack("<QQQ", *(len(b) for b in blobs)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("keygen"); k.add_argument("seed"); k.add_argument("pub")
    s = sub.add_parser("sign"); s.add_argument("file"); s.add_argument("--key", required=True)
    v = sub.add_parser("verify"); v.add_argument("file"); v.add_argument("--pub", required=True); v.add_argument("--sig")
    m = sub.add_parser("manifest"); m.add_argument("zip"); m.add_argument("out")
    m.add_argument("--version", required=True); m.add_argument("--mirror", action="append", default=[])
    m.add_argument("--part-size", type=int, default=1363148); m.add_argument("--notes", default="[]")
    p = sub.add_parser("pack"); [p.add_argument(x) for x in ("setup", "zip", "manifest", "sig", "out")]
    a = ap.parse_args()
    if a.cmd == "keygen": keygen(a.seed, a.pub)
    elif a.cmd == "sign":
        try:
            sign(a.file, a.key)
        except ValueError as e:
            sys.exit(f"cannot sign: {e}")
    elif a.cmd == "verify":
        try:
            verify(a.file, pub_from_file(a.pub), a.sig)
        except Exception as e:
            sys.exit(f"signature check failed: {str(e) or type(e).__name__}")
        print(f"ok: {a.file} is signed by {a.pub}")
    elif a.cmd == "manifest": manifest(a.zip, a.out, a.version, a.mirror, a.part_size, json.loads(a.notes))
    elif a.cmd == "pack": pack(a.setup, a.zip, a.manifest, a.sig, a.out)

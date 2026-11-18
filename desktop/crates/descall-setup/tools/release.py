"""Release helpers for Descall-Setup (no third-party tools beyond `cryptography`).

  release.py manifest <payload.zip> <out-dir> --version 4.0.0 --mirror https://cdn.descall.com/desktop/4.0.0/=Istanbul,tr:İstanbul
      Writes <out-dir>/manifest.json with per-part SHA-256 (part size --part-size, default 1.3 MiB).
  release.py sign <file> --key <seed-file>            -> <file>.minisig (minisign "ED" prehashed format)
  release.py keygen <seed-file> <pub-file>            -> raw Ed25519 seed (keep secret, never commit) + minisign public key
  release.py pack <Descall-Setup.exe> <payload.zip> <manifest.json> <manifest.json.minisig> <out.exe>
      Offline installer: appends payload + manifest + signature + trailer. Sign the result with
      signtool afterwards; Authenticode covers the overlay and the setup finds it before the
      certificate table.

The production key is the Tauri updater minisign key (`tauri signer generate`); signatures made by
`tauri signer sign` / `minisign -S` verify the same way.
"""
import argparse, base64, hashlib, json, os, struct, sys, zipfile

MAGIC = b"DSPAYLD1"


def _ed():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    return Ed25519PrivateKey


def keygen(seed_path, pub_path):
    from cryptography.hazmat.primitives import serialization
    seed = os.urandom(32)
    key_id = os.urandom(8)
    sk = _ed().from_private_bytes(seed)
    pk = sk.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    with open(seed_path, "wb") as f:
        f.write(key_id + seed)
    with open(pub_path, "w") as f:
        f.write(base64.b64encode(b"Ed" + key_id + pk).decode())


def sign(path, seed_path, trusted="descall-setup manifest"):
    blob = open(seed_path, "rb").read()
    key_id, seed = blob[:8], blob[8:40]
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
    m = sub.add_parser("manifest"); m.add_argument("zip"); m.add_argument("out")
    m.add_argument("--version", required=True); m.add_argument("--mirror", action="append", default=[])
    m.add_argument("--part-size", type=int, default=1363148); m.add_argument("--notes", default="[]")
    p = sub.add_parser("pack"); [p.add_argument(x) for x in ("setup", "zip", "manifest", "sig", "out")]
    a = ap.parse_args()
    if a.cmd == "keygen": keygen(a.seed, a.pub)
    elif a.cmd == "sign": sign(a.file, a.key)
    elif a.cmd == "manifest": manifest(a.zip, a.out, a.version, a.mirror, a.part_size, json.loads(a.notes))
    elif a.cmd == "pack": pack(a.setup, a.zip, a.manifest, a.sig, a.out)

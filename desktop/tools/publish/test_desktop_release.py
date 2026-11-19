"""python3 -m unittest discover -s desktop/tools/publish   (needs `cryptography`)

testdata/: a throwaway updater key made with `tauri signer generate` (its private half was
deleted; only the public key and one signature `tauri signer sign` made are kept), so the
check below is the real Tauri format, not our own idea of it.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import desktop_release as dr  # noqa: E402

DATA = os.path.join(HERE, "testdata")
SETUP_TOOL = os.path.join(HERE, "..", "..", "crates", "descall-setup", "tools", "release.py")
KEYS = os.path.join(HERE, "..", "..", "keys")


def data(name):
    return os.path.join(DATA, name)


class UpdaterSignature(unittest.TestCase):
    def test_a_tauri_signature_verifies(self):
        dr.verify_updater(data("installer.bin"), data("installer.bin.sig"), data("updater-test.pub"))

    def test_other_bytes_or_key_fail(self):
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "x.bin")
            with open(bad, "wb") as f:
                f.write(open(data("installer.bin"), "rb").read() + b"!")
            with self.assertRaises(Exception):
                dr.verify_updater(bad, data("installer.bin.sig"), data("updater-test.pub"))
            other = os.path.join(d, "other.pub")
            line = base64.b64encode(b"Ed" + b"\x01" * 8 + b"\x02" * 32).decode()
            with open(other, "w") as f:
                f.write(base64.b64encode(f"untrusted comment: x\n{line}\n".encode()).decode())
            with self.assertRaisesRegex(ValueError, "another key"):
                dr.verify_updater(data("installer.bin"), data("installer.bin.sig"), other)


class KeyFiles(unittest.TestCase):
    def test_repo_placeholders_are_reported_as_such(self):
        for kind, name in (("setup", "setup-manifest.pub"), ("updater", "tauri-updater.pub")):
            path = os.path.join(KEYS, name)
            text = open(path, encoding="utf-8").read()
            if "REPLACE_WITH" not in text:
                continue  # the owner put the real key in: checked by test_real_keys_parse
            with self.assertRaises(LookupError):
                (dr.setup_pub if kind == "setup" else dr.updater_pub)(text)
            self.assertEqual(dr.main(["key-status", kind, path]), dr.PLACEHOLDER)

    def test_real_keys_parse(self):
        for kind, name in (("setup", "setup-manifest.pub"), ("updater", "tauri-updater.pub")):
            text = open(os.path.join(KEYS, name), encoding="utf-8").read()
            if "REPLACE_WITH" not in text:
                (dr.setup_pub if kind == "setup" else dr.updater_pub)(text)

    def test_updater_pub_formats(self):
        tauri_pub = open(data("updater-test.pub"), encoding="utf-8").read()
        self.assertEqual(dr.updater_pub(tauri_pub), tauri_pub.strip(), "the .pub file as is")
        inner = base64.b64decode(tauri_pub).decode().splitlines()[1]
        wrapped = dr.updater_pub("# comment\n" + inner + "\n")
        self.assertEqual(dr._updater_raw_pub(wrapped), dr._updater_raw_pub(tauri_pub.strip()), "a bare minisign line is wrapped")
        for bad in ["not base64!", base64.b64encode(b"hello").decode(), "a\nb"]:
            with self.assertRaises(ValueError):
                dr.updater_pub(bad)

    def test_setup_pub(self):
        line = base64.b64encode(b"Ed" + b"\x01" * 8 + b"\x02" * 32).decode()
        self.assertEqual(dr.setup_pub("# c\nuntrusted comment: minisign public key\n" + line), line)
        with self.assertRaises(ValueError):
            dr.setup_pub(base64.b64encode(b"Ed" + b"\x01" * 8).decode())


class SetupManifestKey(unittest.TestCase):
    """The setup crate's release.py: keygen -> secret text -> sign from env -> verify."""

    def run_tool(self, *args, env=None):
        return subprocess.run([sys.executable, SETUP_TOOL, *args], capture_output=True, text=True, env=env)

    def test_round_trip_through_an_environment_secret(self):
        with tempfile.TemporaryDirectory() as d:
            key, pub, man = (os.path.join(d, n) for n in ("k.key", "k.pub", "manifest.json"))
            self.assertEqual(self.run_tool("keygen", key, pub).returncode, 0)
            self.assertEqual(self.run_tool("keygen", key, pub).returncode, 1, "never overwrites a secret key")
            dr.setup_pub(open(pub).read())
            with open(man, "w") as f:
                json.dump({"version": "4.0.0"}, f)
            env = dict(os.environ, DESCALL_SETUP_SIGNING_KEY=open(key).read())
            self.assertEqual(self.run_tool("sign", man, "--key", "env:DESCALL_SETUP_SIGNING_KEY", env=env).returncode, 0)
            self.assertEqual(self.run_tool("verify", man, "--pub", pub).returncode, 0)
            env["DESCALL_SETUP_SIGNING_KEY"] = ""
            r = self.run_tool("sign", man, "--key", "env:DESCALL_SETUP_SIGNING_KEY", env=env)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("empty", r.stderr)
            with open(man, "a") as f:
                f.write(" ")
            self.assertNotEqual(self.run_tool("verify", man, "--pub", pub).returncode, 0, "tampered manifest")


class Outputs(unittest.TestCase):
    def test_payload_is_deterministic_and_safe(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "Descall.exe")
            with open(src, "wb") as f:
                f.write(b"MZ" * 100)
            a, b = os.path.join(d, "a.zip"), os.path.join(d, "b.zip")
            dr.payload(a, [f"{src}=Descall.exe", f"{src}=uninstall.exe"])
            dr.payload(b, [f"{src}=uninstall.exe", f"{src}=Descall.exe"])
            self.assertEqual(open(a, "rb").read(), open(b, "rb").read())
            self.assertEqual(zipfile.ZipFile(a).namelist(), ["Descall.exe", "uninstall.exe"])
            for bad in ("../x.exe", "/abs.exe", "a\\b.exe"):
                with self.assertRaises(ValueError):
                    dr.payload(os.path.join(d, "c.zip"), [f"{src}={bad}"])

    def test_latest_json_is_the_plugins_static_format(self):
        v = dr.latest_json("4.0.1", "https://github.com/o/r/releases/download/desktop-v4.0.1/Descall_4.0.1_x64-setup.exe", data("installer.bin.sig"), "fixes", pub_date="2026-11-19T00:00:00Z")
        self.assertEqual(v["version"], "4.0.1")
        for k in ("windows-x86_64-nsis", "windows-x86_64"):
            self.assertEqual(v["platforms"][k]["signature"], open(data("installer.bin.sig")).read().strip())
        with self.assertRaises(ValueError):
            dr.latest_json("4.0.1", "http://insecure/x.exe", data("installer.bin.sig"), "")


if __name__ == "__main__":
    unittest.main()

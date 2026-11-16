#!/usr/bin/env python3
"""Make sure an App ID (bundle identifier) exists in the Apple Developer portal, with the
capabilities it needs, using the App Store Connect API key the iOS workflows already use.

Idempotent: an existing identifier or capability is left as it is. Never deletes anything,
never prints secrets.

Env: ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID,
     REG_BUNDLE_ID (e.g. com.descall.app.broadcast), REG_NAME (e.g. "Descall Broadcast"),
     REG_CAPABILITIES (comma separated, e.g. "APP_GROUPS").

The App Store Connect API cannot pick which App Group an App ID belongs to; Xcode's
cloud-managed signing (-allowProvisioningUpdates at export) applies the group from the
extension's entitlements, and the IPA check in ios-testflight.yml verifies the result.
"""
import os, sys, time, jwt, requests

API = "https://api.appstoreconnect.apple.com"
KEY = open(os.environ["ASC_KEY_PATH"]).read()
KID, ISS = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"]
IDENT = os.environ["REG_BUNDLE_ID"].strip()
NAME = (os.environ.get("REG_NAME") or IDENT).strip()
CAPS = [c.strip() for c in (os.environ.get("REG_CAPABILITIES") or "").split(",") if c.strip()]
S = requests.Session()


def tok():
    now = int(time.time())
    return jwt.encode({"iss": ISS, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
                      KEY, algorithm="ES256", headers={"kid": KID, "typ": "JWT"})


def call(method, path, **kw):
    r = S.request(method, API + path, headers={"Authorization": "Bearer " + tok()}, timeout=60, **kw)
    if r.status_code >= 400:
        print(f"HTTP {r.status_code} {method} {path.split('?')[0]}: {r.text[:1500]}")
        r.raise_for_status()
    return r.json() if r.content else {}


def find_bundle(ident):
    rows = call("GET", f"/v1/bundleIds?filter[identifier]={ident}&limit=200").get("data", [])
    return next((b for b in rows if b["attributes"].get("identifier") == ident), None)


bundle = find_bundle(IDENT)
if bundle:
    print(f"App ID {IDENT} already registered ({bundle['id']})")
else:
    bundle = call("POST", "/v1/bundleIds", json={"data": {"type": "bundleIds", "attributes": {
        "identifier": IDENT, "name": NAME, "platform": "IOS"}}})["data"]
    print(f"App ID {IDENT} registered ({bundle['id']})")

have = {c["attributes"].get("capabilityType")
        for c in call("GET", f"/v1/bundleIds/{bundle['id']}/bundleIdCapabilities").get("data", [])}
for cap in CAPS:
    if cap in have:
        print(f"{cap}: already enabled")
        continue
    call("POST", "/v1/bundleIdCapabilities", json={"data": {
        "type": "bundleIdCapabilities",
        "attributes": {"capabilityType": cap},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle["id"]}}}}})
    print(f"{cap}: enabled")

# The main app must keep its App Group capability (the extensions share its container).
main = find_bundle("com.descall.app")
if main:
    main_caps = {c["attributes"].get("capabilityType")
                 for c in call("GET", f"/v1/bundleIds/{main['id']}/bundleIdCapabilities").get("data", [])}
    if "APP_GROUPS" not in main_caps:
        print("::warning::com.descall.app has no APP_GROUPS capability in the portal")
sys.exit(0)

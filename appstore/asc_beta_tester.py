#!/usr/bin/env python3
"""Add a TestFlight tester to the app's existing external beta group (App Store Connect API).

Never submits anything for App Store review or beta app review. Never prints secrets.
Env: ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID, TESTER_EMAIL, optional GROUP_NAME, BUNDLE_ID, ASSIGN_BUILD.
"""
import os, sys, time, jwt, requests

API = "https://api.appstoreconnect.apple.com"
KEY = open(os.environ["ASC_KEY_PATH"]).read()
KID, ISS = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"]
BUNDLE = os.environ.get("BUNDLE_ID") or "com.descall.app"
EMAIL = os.environ["TESTER_EMAIL"].strip()
GROUP_NAME = (os.environ.get("GROUP_NAME") or "").strip()
ASSIGN_BUILD = (os.environ.get("ASSIGN_BUILD") or "true").lower() == "true"
S = requests.Session()

def tok():
    now = int(time.time())
    return jwt.encode({"iss": ISS, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
                      KEY, algorithm="ES256", headers={"kid": KID, "typ": "JWT"})

def call(method, path, **kw):
    r = S.request(method, path if path.startswith("http") else API + path,
                  headers={"Authorization": "Bearer " + tok()}, timeout=60, **kw)
    if r.status_code >= 400:
        print(f"HTTP {r.status_code} {method} {path.split('?')[0]}: {r.text[:1500]}")
        r.raise_for_status()
    return r.json() if r.content else {}

def all_pages(path):
    out, url = [], path
    while url:
        j = call("GET", url)
        out += j.get("data", [])
        url = j.get("links", {}).get("next")
    return out

app = call("GET", f"/v1/apps?filter[bundleId]={BUNDLE}")["data"][0]
APP_ID = app["id"]
print(f"App: {app['attributes']['name']} ({APP_ID})")

groups = all_pages(f"/v1/apps/{APP_ID}/betaGroups?limit=200")
info = []
for g in groups:
    a = g["attributes"]
    testers = all_pages(f"/v1/betaGroups/{g['id']}/betaTesters?limit=200")
    builds = all_pages(f"/v1/betaGroups/{g['id']}/builds?limit=200")
    info.append((g, len(testers), builds))
    print(f"Group '{a['name']}' id={g['id']} internal={a.get('isInternalGroup')} "
          f"publicLink={a.get('publicLinkEnabled')} testers={len(testers)} "
          f"builds={[b['attributes']['version'] for b in builds][:10]}")

ext = [x for x in info if not x[0]["attributes"].get("isInternalGroup")]
if GROUP_NAME:
    ext = [x for x in ext if x[0]["attributes"]["name"] == GROUP_NAME]
if not ext:
    print("::error::No matching EXTERNAL beta group exists. Not creating one; report back.")
    sys.exit(2)
ext.sort(key=lambda x: (x[1], len(x[2])), reverse=True)
group, ntest, gbuilds = ext[0]
GID, GNAME = group["id"], group["attributes"]["name"]
print(f"Chosen external group: '{GNAME}' ({GID}), testers before={ntest}")

# Tester
existing = call("GET", f"/v1/betaTesters?filter[email]={requests.utils.quote(EMAIL)}&filter[apps]={APP_ID}&limit=5")["data"]
if not existing:
    existing = call("GET", f"/v1/betaTesters?filter[email]={requests.utils.quote(EMAIL)}&limit=5")["data"]
if existing:
    tid = existing[0]["id"]
    print(f"Tester already exists ({tid}); adding to group")
    in_group = {t["id"] for t in all_pages(f"/v1/betaGroups/{GID}/betaTesters?limit=200")}
    if tid in in_group:
        print("Tester already in group")
    else:
        call("POST", f"/v1/betaGroups/{GID}/relationships/betaTesters",
             json={"data": [{"type": "betaTesters", "id": tid}]})
        print("Added existing tester to group")
else:
    j = call("POST", "/v1/betaTesters", json={"data": {"type": "betaTesters",
        "attributes": {"email": EMAIL, "firstName": "Beta", "lastName": "Tester"},
        "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": GID}]}}}})
    tid = j["data"]["id"]
    print(f"Created tester {tid} in group '{GNAME}'")

# Latest VALID build and group assignment (never submits for review)
blist = call("GET", f"/v1/builds?filter[app]={APP_ID}&filter[processingState]=VALID&filter[expired]=false"
                    f"&sort=-uploadedDate&limit=5&include=buildBetaDetail,preReleaseVersion")
inc = {(i["type"], i["id"]): i for i in blist.get("included", [])}
def ext_state(b):
    rel = b["relationships"].get("buildBetaDetail", {}).get("data")
    return inc.get(("buildBetaDetails", rel["id"]), {}).get("attributes", {}).get("externalBuildState") if rel else None
def short(b):
    pv = b["relationships"].get("preReleaseVersion", {}).get("data")
    v = inc.get(("preReleaseVersions", pv["id"]), {}).get("attributes", {}).get("version") if pv else "?"
    return f"{v} ({b['attributes']['version']}) uploaded={b['attributes']['uploadedDate']} external={ext_state(b)}"
for b in blist["data"]:
    print("Recent VALID build:", short(b))
gb_ids = {b["id"] for b in all_pages(f"/v1/betaGroups/{GID}/builds?limit=200")}
if blist["data"]:
    latest = blist["data"][0]
    if latest["id"] in gb_ids:
        print("Latest valid build already in group")
    elif ASSIGN_BUILD:
        call("POST", f"/v1/betaGroups/{GID}/relationships/builds",
             json={"data": [{"type": "builds", "id": latest["id"]}]})
        print("Assigned latest valid build to group (no beta review submission made)")
    st = ext_state(latest)
    if st not in ("BETA_APPROVED", "IN_BETA_TESTING", "READY_FOR_BETA_TESTING"):
        try:
            sub = call("GET", f"/v1/builds/{latest['id']}/betaAppReviewSubmission").get("data")
            print("Latest build beta review submission:", sub and sub["attributes"].get("betaReviewState"))
        except Exception:
            pass
        print(f"NOTE: latest build externalBuildState={st}; it may need Beta App Review before external testers can install. NOT submitting.")

t = call("GET", f"/v1/betaTesters/{tid}")["data"]["attributes"]
print(f"RESULT tester state={t.get('state')} inviteType={t.get('inviteType')} group='{GNAME}'")
final = all_pages(f"/v1/betaGroups/{GID}/builds?limit=200")
print("RESULT group builds:", [b["attributes"]["version"] for b in final][:15])

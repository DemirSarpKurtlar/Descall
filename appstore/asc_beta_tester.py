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

MODE = (os.environ.get("MODE") or "external").strip()
print(f"Mode: {MODE}")

def find_user_and_invites():
    q = requests.utils.quote(EMAIL)
    users = call("GET", f"/v1/users?filter[username]={q}&limit=5")["data"]
    invites = call("GET", f"/v1/userInvitations?filter[email]={q}&limit=5")["data"]
    for u in users:
        a = u["attributes"]
        print(f"User exists: id={u['id']} roles={a.get('roles')} allAppsVisible={a.get('allAppsVisible')}")
    for i in invites:
        a = i["attributes"]
        print(f"Invitation exists: id={i['id']} roles={a.get('roles')} expires={a.get('expirationDate')} allAppsVisible={a.get('allAppsVisible')}")
    return users, invites

if MODE == "invite-user":
    users, invites = find_user_and_invites()
    if users or invites:
        print("RESULT user/invitation already exists; not creating another")
        sys.exit(0)
    base = {"email": EMAIL, "firstName": os.environ.get("FIRST_NAME") or "cnrbsk11",
            "lastName": os.environ.get("LAST_NAME") or "Tester", "roles": ["MARKETING"],
            "provisioningAllowed": False}
    try:
        j = call("POST", "/v1/userInvitations", json={"data": {"type": "userInvitations",
            "attributes": dict(base, allAppsVisible=False),
            "relationships": {"visibleApps": {"data": [{"type": "apps", "id": APP_ID}]}}}})
        print("Invitation created with visibleApps = Descall only")
    except requests.HTTPError:
        print("Limited-visibility invite rejected; retrying with allAppsVisible=true")
        j = call("POST", "/v1/userInvitations", json={"data": {"type": "userInvitations",
            "attributes": dict(base, allAppsVisible=True)}})
        print("Invitation created with allAppsVisible=true")
    a = j["data"]["attributes"]
    print(f"RESULT invitation id={j['data']['id']} roles={a.get('roles')} expires={a.get('expirationDate')} allAppsVisible={a.get('allAppsVisible')}")
    sys.exit(0)

if MODE == "add-internal":
    users, invites = find_user_and_invites()
    gname = GROUP_NAME or "Descall Ekip"
    grp = [g for g in all_pages(f"/v1/apps/{APP_ID}/betaGroups?limit=200")
           if g["attributes"]["name"] == gname and g["attributes"].get("isInternalGroup")]
    if not grp:
        print(f"::error::Internal group '{gname}' not found"); sys.exit(2)
    GID = grp[0]["id"]
    if not users:
        print(f"RESULT not added: no accepted App Store Connect user for this email yet (pending invitations: {len(invites)}). Accept the Apple invite, then re-run add-internal.")
    existing = call("GET", f"/v1/betaTesters?filter[email]={requests.utils.quote(EMAIL)}&limit=5")["data"]
    try:
        if existing:
            tid = existing[0]["id"]
            if tid in {t["id"] for t in all_pages(f"/v1/betaGroups/{GID}/betaTesters?limit=200")}:
                print("Tester already in group")
            else:
                call("POST", f"/v1/betaGroups/{GID}/relationships/betaTesters",
                     json={"data": [{"type": "betaTesters", "id": tid}]})
                print("Added existing tester to group")
        else:
            j = call("POST", "/v1/betaTesters", json={"data": {"type": "betaTesters",
                "attributes": {"email": EMAIL, "firstName": "cnrbsk11", "lastName": "Tester"},
                "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": GID}]}}}})
            tid = j["data"]["id"]
            print(f"Created tester {tid} in '{gname}'")
    except requests.HTTPError:
        print(f"RESULT add to '{gname}' failed (expected while the invite is pending)")
        sys.exit(0 if not users else 1)
    t = call("GET", f"/v1/betaTesters/{tid}")["data"]["attributes"]
    print(f"RESULT tester state={t.get('state')} inviteType={t.get('inviteType')} group='{gname}'")
    sys.exit(0)

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

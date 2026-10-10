#!/usr/bin/env python3
"""App Store Connect metadata sync for Descall (com.descall.app), run by
.github/workflows/appstore-metadata.yml. Direct App Store Connect API calls (no fastlane).

Modes:
  apply   create/update the App Store version record and everything below, then verify
          (renames the editable/rejected version to APP_VERSION, attaches the build, replaces
          screenshots whose checksums differ). Never submits.
  verify  read-only: print what is currently set (no writes), plus screenshot counts per locale,
          attached build, banned listing words and review submissions
  submit  read-only verify first; only if it reports no errors and no warnings, submit the version
          for review (manual release). Resubmits an UNRESOLVED_ISSUES submission (items marked
          resolved) or creates/uses a READY_FOR_REVIEW one. Requires --build.

Inputs (env): ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID, APP_VERSION,
  DEMO_A_USERNAME, DEMO_A_PASSWORD, DEMO_B_USERNAME, DEMO_B_PASSWORD, REVIEW_PHONE,
  REVIEW_EMAIL, REVIEW_FIRST_NAME, REVIEW_LAST_NAME.
Never prints secret values (demo credentials, phone, notes with credentials).
"""
import argparse, hashlib, json, os, sys, time
from pathlib import Path

import jwt
import requests

API = "https://api.appstoreconnect.apple.com"
HERE = Path(__file__).resolve().parent
EDITABLE_VERSION_STATES = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED",
                           "INVALID_BINARY", "DEVELOPER_REMOVED_FROM_SALE"}
SCREENSHOT_SETS = [("iphone69", "APP_IPHONE_67", (1320, 2868)), ("ipad13", "APP_IPAD_PRO_3GEN_129", (2064, 2752))]
EXCLUDED_TERRITORIES = {"CHN"}  # China mainland
# Removed / hidden features that must never appear in the live listing text (case-insensitive).
BANNED_LISTING = ["valorant", "riot", "dimaai", "dima ai", "call recording", "record calls", "arama kayd", "görüşme kayd"]

errors, warnings = [], []
def log(msg): print(msg, flush=True)
def warn(msg): warnings.append(msg); print(f"::warning::{msg}", flush=True)
def err(msg): errors.append(msg); print(f"::error::{msg}", flush=True)


class ASC:
    def __init__(self):
        self.key = Path(os.environ["ASC_KEY_PATH"]).read_text()
        self.kid, self.iss = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"]
        self._tok, self._exp = None, 0
        self.s = requests.Session()

    def token(self):
        now = int(time.time())
        if not self._tok or now > self._exp - 60:
            self._exp = now + 1100
            self._tok = jwt.encode({"iss": self.iss, "iat": now, "exp": self._exp, "aud": "appstoreconnect-v1"},
                                   self.key, algorithm="ES256", headers={"kid": self.kid, "typ": "JWT"})
        return self._tok

    def req(self, method, path, body=None, params=None, ok=(200, 201, 204), quiet_codes=()):
        url = path if path.startswith("http") else API + path
        for attempt in range(5):
            r = self.s.request(method, url, params=params, timeout=60,
                               headers={"Authorization": f"Bearer {self.token()}", "Content-Type": "application/json"},
                               data=json.dumps(body) if body is not None else None)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(3 * (attempt + 1)); continue
            break
        if r.status_code in ok:
            return r.json() if r.content else {}
        if r.status_code in quiet_codes:
            return None
        detail = ""
        try:
            detail = "; ".join(f"{e.get('code')}: {e.get('detail') or e.get('title')}" for e in r.json().get("errors", []))
        except Exception:
            detail = r.text[:500]
        raise RuntimeError(f"{method} {path} -> HTTP {r.status_code}: {detail}")

    def get(self, path, **params):
        return self.req("GET", path, params=params or None)

    def get_all(self, path, **params):
        params.setdefault("limit", 200)
        out, url, p = [], path, params
        while url:
            d = self.req("GET", url, params=p)
            out += d.get("data", [])
            url, p = d.get("links", {}).get("next"), None
        return out


def rel(type_, id_):
    return {"data": {"type": type_, "id": id_}}


def step(name):
    def deco(fn):
        def wrapper(*a, **k):
            log(f"\n=== {name}")
            try:
                return fn(*a, **k)
            except Exception as e:  # keep going; report at the end
                err(f"{name}: {e}")
        return wrapper
    return deco


# ---------------------------------------------------------------------------
def load_inputs():
    meta = json.loads((HERE / "metadata.json").read_text())
    age = {k: v for k, v in json.loads((HERE / "age-rating.json").read_text()).items() if not k.startswith("_")}
    notes = (HERE / "review-notes.txt").read_text().strip()
    for key in ("DEMO_A_USERNAME", "DEMO_A_PASSWORD", "DEMO_B_USERNAME", "DEMO_B_PASSWORD"):
        val = os.environ.get(key, "")
        if not val:
            err(f"secret for {key} is empty")
        notes = notes.replace("{{%s}}" % key, val)
    assert "{{" not in notes, "unfilled placeholder in review notes"
    if len(notes) > 4000:
        err(f"review notes are {len(notes)} chars (limit 4000)")
    return meta, age, notes


@step("App record")
def app_record(asc, app_id, meta, apply):
    app = asc.get(f"/v1/apps/{app_id}")["data"]["attributes"]
    log(f"bundleId={app.get('bundleId')} name={app.get('name')} primaryLocale={app.get('primaryLocale')} "
        f"contentRights={app.get('contentRightsDeclaration')}")
    if app.get("bundleId") != "com.descall.app":
        raise RuntimeError("unexpected bundle id")
    return app


@step("App info (name, subtitle, privacy URL, category, primary locale)")
def app_info(asc, app_id, meta, apply):
    infos = asc.get_all(f"/v1/apps/{app_id}/appInfos")
    def st(i): return i["attributes"].get("state") or i["attributes"].get("appStoreState")
    editable = [i for i in infos if st(i) not in ("READY_FOR_DISTRIBUTION", "REPLACED_WITH_NEW_INFO", "READY_FOR_SALE")]
    info = (editable or infos)[0]
    log(f"appInfo {info['id']} state={st(info)}")
    locs = {l["attributes"]["locale"]: l for l in asc.get_all(f"/v1/appInfos/{info['id']}/appInfoLocalizations")}
    for locale, m in meta["locales"].items():
        attrs = {"name": m["name"], "subtitle": m["subtitle"], "privacyPolicyUrl": meta["shared"]["privacyPolicyUrl"]}
        if not apply:
            continue
        if locale in locs:
            asc.req("PATCH", f"/v1/appInfoLocalizations/{locs[locale]['id']}",
                    {"data": {"type": "appInfoLocalizations", "id": locs[locale]["id"], "attributes": attrs}})
        else:
            asc.req("POST", "/v1/appInfoLocalizations", {"data": {"type": "appInfoLocalizations",
                    "attributes": {"locale": locale, **attrs}, "relationships": {"appInfo": rel("appInfos", info["id"])}}})
        log(f"  {locale}: name/subtitle/privacy URL set")
    if apply:
        asc.req("PATCH", f"/v1/appInfos/{info['id']}", {"data": {"type": "appInfos", "id": info["id"],
                "relationships": {"primaryCategory": rel("appCategories", meta["shared"]["primaryCategory"])}}})
        log(f"  primary category -> {meta['shared']['primaryCategory']}")
        app_attrs = {"primaryLocale": meta["shared"]["primaryLocale"], "contentRightsDeclaration": "USES_THIRD_PARTY_CONTENT"}
        asc.req("PATCH", f"/v1/apps/{app_id}", {"data": {"type": "apps", "id": app_id, "attributes": app_attrs}})
        log(f"  app primaryLocale -> tr, contentRightsDeclaration -> USES_THIRD_PARTY_CONTENT (GIPHY GIFs)")
    return info


@step("Age rating")
def age_rating(asc, info, age, apply):
    d = asc.get(f"/v1/appInfos/{info['id']}/ageRatingDeclaration")["data"]
    if apply:
        known = set(d["attributes"].keys())
        attrs = {k: v for k, v in age.items() if k in known or k in ("socialMedia", "socialMediaAgeRestricted", "ageAssurance")}
        skipped = sorted(set(age) - set(attrs))
        if skipped:
            warn(f"age rating keys not offered by the API right now: {skipped}")
        asc.req("PATCH", f"/v1/ageRatingDeclarations/{d['id']}",
                {"data": {"type": "ageRatingDeclarations", "id": d["id"], "attributes": attrs}})
        d = asc.get(f"/v1/appInfos/{info['id']}/ageRatingDeclaration")["data"]
    mismatch = {k: (d["attributes"].get(k), v) for k, v in age.items() if d["attributes"].get(k) != v}
    log(f"  declaration {d['id']}: {json.dumps(d['attributes'], sort_keys=True)}")
    if mismatch:
        (err if apply else warn)(f"age rating differs from age-rating.json: {mismatch}")
    info_attrs = asc.get(f"/v1/appInfos/{info['id']}")["data"]["attributes"]
    # appStoreAgeRating uses the pre-iOS 26 scale: the new 13+ shows as TWELVE_PLUS there.
    if info_attrs.get("appStoreAgeRating") not in ("TWELVE_PLUS", "THIRTEEN_PLUS"):
        warn(f"App Store age rating is {info_attrs.get('appStoreAgeRating')}, expected 13+ (TWELVE_PLUS on the legacy scale)")
    log(f"  computed rating (appInfo): {info_attrs.get('appStoreAgeRating')} "
        f"kids={info_attrs.get('kidsAgeBand')} brazil={info_attrs.get('brazilAgeRatingV2') or info_attrs.get('brazilAgeRating')}")


@step("App Store version")
def store_version(asc, app_id, version, meta, apply):
    versions = asc.get_all(f"/v1/apps/{app_id}/appStoreVersions", **{"filter[platform]": "IOS"})
    def st(v): return v["attributes"].get("appVersionState") or v["attributes"].get("appStoreState")
    for v in versions:
        log(f"  existing {v['attributes']['versionString']} state={st(v)} id={v['id']}")
    match = next((v for v in versions if v["attributes"]["versionString"] == version), None)
    if not apply:
        return match
    attrs = {"copyright": meta["shared"]["copyright"], "releaseType": "AFTER_APPROVAL"}
    if match:
        if st(match) not in EDITABLE_VERSION_STATES and st(match) not in ("PREPARE_FOR_SUBMISSION",):
            raise RuntimeError(f"version {version} is in state {st(match)} and can't be edited")
        v = match
    else:
        editable = next((v for v in versions if st(v) in EDITABLE_VERSION_STATES), None)
        if editable:
            log(f"  renaming editable version {editable['attributes']['versionString']} -> {version}")
            attrs["versionString"] = version
            v = editable
        else:
            v = asc.req("POST", "/v1/appStoreVersions", {"data": {"type": "appStoreVersions",
                        "attributes": {"platform": "IOS", "versionString": version, **attrs},
                        "relationships": {"app": rel("apps", app_id)}}})["data"]
            log(f"  created version {version} ({v['id']})")
    asc.req("PATCH", f"/v1/appStoreVersions/{v['id']}", {"data": {"type": "appStoreVersions", "id": v["id"], "attributes": attrs}})
    log(f"  version {version}: copyright set, releaseType AFTER_APPROVAL")
    return asc.get(f"/v1/appStoreVersions/{v['id']}")["data"]


@step("Version localizations (description, keywords, promo, What's New, URLs)")
def version_localizations(asc, ver, meta, apply):
    locs = {l["attributes"]["locale"]: l for l in asc.get_all(f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")}
    result = {}
    for locale, m in meta["locales"].items():
        attrs = {"description": m["description"], "keywords": m["keywords"], "promotionalText": m["promotionalText"],
                 "supportUrl": meta["shared"]["supportUrl"], "marketingUrl": meta["shared"]["marketingUrl"],
                 "whatsNew": m["whatsNew"]}
        if apply:
            def write(a):
                if locale in locs:
                    return asc.req("PATCH", f"/v1/appStoreVersionLocalizations/{locs[locale]['id']}",
                                   {"data": {"type": "appStoreVersionLocalizations", "id": locs[locale]["id"], "attributes": a}})["data"]
                return asc.req("POST", "/v1/appStoreVersionLocalizations", {"data": {"type": "appStoreVersionLocalizations",
                               "attributes": {"locale": locale, **a}, "relationships": {"appStoreVersion": rel("appStoreVersions", ver["id"])}}})["data"]
            try:
                locs[locale] = write(attrs)
            except RuntimeError as e:
                if "whatsNew" not in str(e):
                    raise
                warn(f"{locale}: What's New not accepted for this version (first release?): {e}")
                attrs.pop("whatsNew")
                locs[locale] = write(attrs)
            log(f"  {locale}: {', '.join(attrs)} set")
        result[locale] = locs.get(locale)
    return result


def md5(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


@step("Screenshots")
def screenshots(asc, vlocs, apply, ver=None):
    from PIL import Image
    if ver:
        all_locs = {l["attributes"]["locale"]: l for l in asc.get_all(f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")}
        extra = sorted(set(all_locs) - set(vlocs))
        if extra:
            warn(f"version has localizations not in metadata.json (screenshots not managed there): {extra}")
    for folder, display_type, size in SCREENSHOT_SETS:
        files = sorted((HERE / "screenshots" / folder).glob("*.png"))
        if not files:
            warn(f"no {folder} screenshots committed yet ({display_type}); skipped")
            continue
        for f in files:
            with Image.open(f) as im:
                if im.size != size:
                    raise RuntimeError(f"{f.name} is {im.size}, expected {size} for {display_type}")
        for locale, loc in vlocs.items():
            if not loc:
                continue
            sets = asc.get_all(f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")
            sset = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == display_type), None)
            existing = asc.get_all(f"/v1/appScreenshotSets/{sset['id']}/appScreenshots") if sset else []
            have = [(s["attributes"].get("sourceFileChecksum"), s["attributes"].get("assetDeliveryState", {}).get("state")) for s in existing]
            want = [md5(f) for f in files]
            if [h[0] for h in have] == want and all(h[1] == "COMPLETE" for h in have):
                log(f"  {locale} {display_type}: {len(files)} screenshots already up to date")
                continue
            if not apply:
                warn(f"{locale} {display_type}: {len(existing)} screenshots on ASC, {len(files)} committed (differs)")
                continue
            if not sset:
                sset = asc.req("POST", "/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets",
                               "attributes": {"screenshotDisplayType": display_type},
                               "relationships": {"appStoreVersionLocalization": rel("appStoreVersionLocalizations", loc["id"])}}})["data"]
            for s in existing:
                asc.req("DELETE", f"/v1/appScreenshots/{s['id']}")
            ids = []
            for f in files:
                data = f.read_bytes()
                shot = asc.req("POST", "/v1/appScreenshots", {"data": {"type": "appScreenshots",
                               "attributes": {"fileName": f"{folder}-{f.name}", "fileSize": len(data)},
                               "relationships": {"appScreenshotSet": rel("appScreenshotSets", sset["id"])}}})["data"]
                for op in shot["attributes"]["uploadOperations"]:
                    chunk = data[op["offset"]: op["offset"] + op["length"]]
                    hdrs = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
                    r = requests.request(op["method"], op["url"], headers=hdrs, data=chunk, timeout=120)
                    if r.status_code >= 300:
                        raise RuntimeError(f"upload of {f.name} failed: HTTP {r.status_code}")
                asc.req("PATCH", f"/v1/appScreenshots/{shot['id']}", {"data": {"type": "appScreenshots", "id": shot["id"],
                        "attributes": {"uploaded": True, "sourceFileChecksum": md5(f)}}})
                ids.append(shot["id"])
            for _ in range(40):
                states = [asc.get(f"/v1/appScreenshots/{i}")["data"]["attributes"].get("assetDeliveryState", {}) for i in ids]
                if all(s.get("state") in ("COMPLETE", "FAILED") for s in states):
                    break
                time.sleep(5)
            bad = [s for s in states if s.get("state") != "COMPLETE"]
            if bad:
                raise RuntimeError(f"{locale} {display_type}: processing not complete: {bad}")
            asc.req("PATCH", f"/v1/appScreenshotSets/{sset['id']}/relationships/appScreenshots",
                    {"data": [{"type": "appScreenshots", "id": i} for i in ids]})
            log(f"  {locale} {display_type}: uploaded {len(ids)} screenshots (COMPLETE)")
    # Final per-locale report (always)
    for locale, loc in vlocs.items():
        if not loc:
            continue
        for s in asc.get_all(f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets"):
            shots = asc.get_all(f"/v1/appScreenshotSets/{s['id']}/appScreenshots")
            states = sorted({(x["attributes"].get("assetDeliveryState") or {}).get("state") for x in shots})
            log(f"  report {locale} {s['attributes']['screenshotDisplayType']}: {len(shots)} screenshots, states={states}")
            managed = {dt for _, dt, _ in SCREENSHOT_SETS}
            if s["attributes"]["screenshotDisplayType"] in managed and (len(shots) == 0 or states != ["COMPLETE"]):
                (err if apply else warn)(f"{locale} {s['attributes']['screenshotDisplayType']}: {len(shots)} screenshots, states={states}")


@step("App Review information")
def review_detail(asc, ver, notes, apply):
    phone = os.environ.get("REVIEW_PHONE", "").strip()
    attrs = {"contactFirstName": os.environ["REVIEW_FIRST_NAME"], "contactLastName": os.environ["REVIEW_LAST_NAME"],
             "contactEmail": os.environ["REVIEW_EMAIL"], "demoAccountRequired": True,
             "demoAccountName": os.environ.get("DEMO_A_USERNAME", ""), "demoAccountPassword": os.environ.get("DEMO_A_PASSWORD", ""),
             "notes": notes}
    if phone:
        attrs["contactPhone"] = phone
    else:
        warn("ASC_REVIEW_PHONE is not set: contact phone left empty (required before submitting)")
    cur = asc.req("GET", f"/v1/appStoreVersions/{ver['id']}/appStoreReviewDetail", ok=(200,), quiet_codes=(404,))
    cur = (cur or {}).get("data")
    if apply:
        if cur:
            asc.req("PATCH", f"/v1/appStoreReviewDetails/{cur['id']}", {"data": {"type": "appStoreReviewDetails", "id": cur["id"], "attributes": attrs}})
        else:
            asc.req("POST", "/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": attrs,
                    "relationships": {"appStoreVersion": rel("appStoreVersions", ver["id"])}}})
        cur = asc.get(f"/v1/appStoreVersions/{ver['id']}/appStoreReviewDetail")["data"]
    if not cur:
        warn("no App Review details yet"); return
    a = cur["attributes"]
    log(f"  contact: {a.get('contactFirstName')} {a.get('contactLastName')} <{a.get('contactEmail')}> "
        f"phone={'set' if a.get('contactPhone') else 'MISSING'}")
    log(f"  demoAccountRequired={a.get('demoAccountRequired')} demoAccountName={'set' if a.get('demoAccountName') else 'MISSING'} "
        f"demoAccountPassword={'set' if a.get('demoAccountPassword') else 'MISSING'} notes={len(a.get('notes') or '')} chars")
    if apply:
        for k in ("contactFirstName", "contactLastName", "contactEmail", "demoAccountName", "demoAccountPassword", "notes", "contactPhone"):
            if k in attrs and (a.get(k) or "") != attrs[k]:
                err(f"App Review field {k} did not round-trip")


@step("Availability (all territories except China mainland)")
def availability(asc, app_id, apply):
    territories = [t["id"] for t in asc.get_all("/v1/territories")]
    want = {t: t not in EXCLUDED_TERRITORIES for t in territories}
    av = asc.req("GET", f"/v1/apps/{app_id}/appAvailabilityV2", ok=(200,), quiet_codes=(404,))
    av = (av or {}).get("data")
    if not av:
        if not apply:
            warn("availability not set yet"); return
        included = [{"type": "territoryAvailabilities", "id": f"${{t{i}}}", "attributes": {"available": want[t]},
                     "relationships": {"territory": rel("territories", t)}} for i, t in enumerate(territories)]
        asc.req("POST", "/v2/appAvailabilities", {"data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": True},
                "relationships": {"app": rel("apps", app_id), "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": x["id"]} for x in included]}}},
                "included": included})
        log(f"  created availability: {sum(want.values())} territories on, off: {sorted(EXCLUDED_TERRITORIES)}")
        av = asc.get(f"/v1/apps/{app_id}/appAvailabilityV2")["data"]
    tas = asc.get_all(f"/v2/appAvailabilities/{av['id']}/territoryAvailabilities", include="territory")
    changed = 0
    for ta in tas:
        terr = ta["relationships"]["territory"]["data"]["id"]
        if terr in want and ta["attributes"].get("available") != want[terr]:
            if apply:
                asc.req("PATCH", f"/v1/territoryAvailabilities/{ta['id']}", {"data": {"type": "territoryAvailabilities", "id": ta["id"],
                        "attributes": {"available": want[terr]}}})
                changed += 1
            else:
                warn(f"territory {terr} available={ta['attributes'].get('available')} (want {want[terr]})")
    if changed:
        tas = asc.get_all(f"/v2/appAvailabilities/{av['id']}/territoryAvailabilities", include="territory")
    avail = {ta["relationships"]["territory"]["data"]["id"]: ta["attributes"].get("available") for ta in tas}
    off = sorted(t for t, v in avail.items() if not v)
    log(f"  {len(avail)} territories, {sum(1 for v in avail.values() if v)} available; not available: {off}; patched {changed}")
    if apply and off != sorted(EXCLUDED_TERRITORIES & set(avail)):
        err(f"availability mismatch, unavailable territories: {off}")


@step("Price (Free)")
def price(asc, app_id, apply):
    sched = asc.req("GET", f"/v1/apps/{app_id}/appPriceSchedule", ok=(200,), quiet_codes=(404,))
    sched = (sched or {}).get("data")
    current = None
    if sched:
        mp = asc.req("GET", f"/v1/appPriceSchedules/{sched['id']}/manualPrices", params={"include": "appPricePoint,territory", "limit": 50},
                     ok=(200,), quiet_codes=(404,)) or {}
        pts = {i["id"]: i for i in mp.get("included", []) if i["type"] == "appPricePoints"}
        current = [pts.get(p["relationships"]["appPricePoint"]["data"]["id"], {}).get("attributes", {}).get("customerPrice") for p in mp.get("data", [])]
        log(f"  current manual prices (customerPrice): {current}")
    if current and all(str(c) in ("0", "0.0", "0.00") for c in current):
        log("  already Free"); return
    if not apply:
        warn("price is not set to Free yet"); return
    points = asc.get_all(f"/v1/apps/{app_id}/appPricePoints", **{"filter[territory]": "USA"})
    free = next(p for p in points if float(p["attributes"]["customerPrice"]) == 0.0)
    asc.req("POST", "/v1/appPriceSchedules", {"data": {"type": "appPriceSchedules", "relationships": {
            "app": rel("apps", app_id), "baseTerritory": rel("territories", "USA"),
            "manualPrices": {"data": [{"type": "appPrices", "id": "${free}"}]}}},
            "included": [{"type": "appPrices", "id": "${free}", "attributes": {"startDate": None},
                          "relationships": {"appPricePoint": rel("appPricePoints", free["id"])}}]})
    log("  price schedule set: Free (base territory USA)")


@step("Build")
def build(asc, app_id, ver, version, apply, wait_minutes, pin=""):
    cur = asc.req("GET", f"/v1/appStoreVersions/{ver['id']}/build", ok=(200,), quiet_codes=(404,))
    cur = (cur or {}).get("data")
    deadline = time.time() + wait_minutes * 60
    while True:
        q = {"filter[app]": app_id, "filter[preReleaseVersion.version]": version,
             "filter[processingState]": "VALID", "sort": "-uploadedDate", "limit": 1}
        if pin:
            q["filter[version]"] = pin  # exact build number (CFBundleVersion)
        builds = asc.get("/v1/builds", **q).get("data", [])
        if builds or time.time() > deadline or not apply:
            break
        log("  no VALID build yet, waiting 60 s"); time.sleep(60)
    if not builds:
        (err if apply else warn)(f"no VALID build {pin or ''} for {version}".replace("  ", " ")); return None
    b = builds[0]
    log(f"  latest VALID build: {b['attributes']['version']} id={b['id']} state={b['attributes'].get('processingState')} uploaded {b['attributes'].get('uploadedDate')} "
        f"usesNonExemptEncryption={b['attributes'].get('usesNonExemptEncryption')}")
    if apply:
        if b["attributes"].get("usesNonExemptEncryption") is None:
            asc.req("PATCH", f"/v1/builds/{b['id']}", {"data": {"type": "builds", "id": b["id"], "attributes": {"usesNonExemptEncryption": False}}})
        if not cur or cur["id"] != b["id"]:
            asc.req("PATCH", f"/v1/appStoreVersions/{ver['id']}/relationships/build", rel("builds", b["id"]))
        log(f"  attached build {b['attributes']['version']} to version {version}")
    cur = asc.req("GET", f"/v1/appStoreVersions/{ver['id']}/build", ok=(200,), quiet_codes=(404,))
    cur = (cur or {}).get("data")
    if not cur:
        (err if apply else warn)("no build attached to the version")
    else:
        ca = cur["attributes"]
        log(f"  attached build: {ca.get('version')} id={cur['id']} processingState={ca.get('processingState')} "
            f"expired={ca.get('expired')} usesNonExemptEncryption={ca.get('usesNonExemptEncryption')}")
        if ca.get("version") != b["attributes"]["version"]:
            (err if apply else warn)(f"attached build {ca.get('version')} != expected {b['attributes']['version']}")
        if ca.get("processingState") != "VALID":
            (err if apply else warn)(f"attached build is {ca.get('processingState')}")
    return b


@step("Review submissions (read-only)")
def review_submissions(asc, app_id, ver):
    subs = asc.get_all("/v1/reviewSubmissions", **{"filter[app]": app_id, "filter[platform]": "IOS"})
    out = []
    for sub in subs:
        a = sub["attributes"]
        items = asc.get_all(f"/v1/reviewSubmissions/{sub['id']}/items", include="appStoreVersion")
        desc = []
        for it in items:
            v = ((it.get("relationships") or {}).get("appStoreVersion") or {}).get("data") or {}
            desc.append(f"item {it['id']} state={it['attributes'].get('state')} version={v.get('id')}")
        log(f"  submission {sub['id']} state={a.get('state')} submitted={a.get('submittedDate')} items: {desc or 'none'}")
        out.append((sub, items))
    if ver:
        va = asc.get(f"/v1/appStoreVersions/{ver['id']}")["data"]["attributes"]
        log(f"  version {va.get('versionString')} appVersionState={va.get('appVersionState')} appStoreState={va.get('appStoreState')}")
        if any(s[0]["attributes"].get("state") in ("WAITING_FOR_REVIEW", "IN_REVIEW") for s in out):
            warn("a review submission is already waiting for / in review")
    return out


@step("Listing text check (removed features)")
def listing_text_check(asc, ver):
    for l in asc.get_all(f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations"):
        at = l["attributes"]
        for k in ("description", "keywords", "promotionalText", "whatsNew"):
            low = (at.get(k) or "").lower()
            hits = [w for w in BANNED_LISTING if w in low]
            if hits:
                err(f"{at['locale']} {k} mentions removed features: {hits}")
    log(f"  checked live description/keywords/promo/What's New for {BANNED_LISTING}")


@step("Submit for review")
def submit(asc, app_id, ver, pin, subs):
    blockers = list(errors) + list(warnings)
    if not pin:
        blockers.append("--build is required for submit")
    cur = asc.req("GET", f"/v1/appStoreVersions/{ver['id']}/build", ok=(200,), quiet_codes=(404,))
    cur = (cur or {}).get("data")
    attached = cur["attributes"].get("version") if cur else None
    if not attached:
        blockers.append("no build attached")
    elif pin and attached != pin:
        blockers.append(f"attached build {attached} != requested {pin}")
    elif cur["attributes"].get("processingState") != "VALID":
        blockers.append(f"attached build {attached} is {cur['attributes'].get('processingState')}")
    if not os.environ.get("REVIEW_PHONE", "").strip():
        blockers.append("contact phone missing")
    for folder, _, _ in SCREENSHOT_SETS:
        if not list((HERE / "screenshots" / folder).glob("*.png")):
            blockers.append(f"{folder} screenshots missing")
    log(f"  preflight: attached build={attached} errors={len(errors)} warnings={len(warnings)}")
    if blockers:
        raise RuntimeError(f"not submitting, blockers: {blockers}")
    subs = subs or []
    def has_ver(items):
        return any((((it.get("relationships") or {}).get("appStoreVersion") or {}).get("data") or {}).get("id") == ver["id"] for it in items)
    unresolved = [(s, i) for s, i in subs if s["attributes"].get("state") == "UNRESOLVED_ISSUES" and has_ver(i)]
    ready = [(s, i) for s, i in subs if s["attributes"].get("state") == "READY_FOR_REVIEW"]
    if unresolved:
        sub, items = unresolved[0]
        log(f"  resubmitting UNRESOLVED_ISSUES submission {sub['id']}")
        for it in items:
            if it["attributes"].get("state") in ("REJECTED", "UNRESOLVED_ISSUES") or it["attributes"].get("resolved") is False:
                asc.req("PATCH", f"/v1/reviewSubmissionItems/{it['id']}", {"data": {"type": "reviewSubmissionItems", "id": it["id"],
                        "attributes": {"resolved": True}}})
                log(f"  item {it['id']} marked resolved")
    else:
        sub, items = ready[0] if ready else (asc.req("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions",
                    "attributes": {"platform": "IOS"}, "relationships": {"app": rel("apps", app_id)}}})["data"], [])
        if not has_ver(items):
            asc.req("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
                    "relationships": {"reviewSubmission": rel("reviewSubmissions", sub["id"]), "appStoreVersion": rel("appStoreVersions", ver["id"])}}})
            log(f"  added version item to submission {sub['id']}")
    asc.req("PATCH", f"/v1/reviewSubmissions/{sub['id']}", {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}})
    sa = asc.get(f"/v1/reviewSubmissions/{sub['id']}")["data"]["attributes"]
    va = asc.get(f"/v1/appStoreVersions/{ver['id']}")["data"]["attributes"]
    log(f"  review submission {sub['id']} state={sa.get('state')} submittedDate={sa.get('submittedDate')}")
    log(f"  version {va.get('versionString')} state={va.get('appVersionState') or va.get('appStoreState')}")


def readback(asc, app_id, ver, meta):
    if not ver:
        return

    log("\n=== Read-back")
    for l in asc.get_all(f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations"):
        at = l["attributes"]
        want = meta["locales"].get(at["locale"])
        diffs = [k for k in ("description", "keywords", "promotionalText", "whatsNew")
                 if want and (at.get(k) or "") != (want[k] or "")] if want else []
        log(f"  {at['locale']}: desc={len(at.get('description') or '')} kw={len(at.get('keywords') or '')} "
            f"promo={len(at.get('promotionalText') or '')} whatsNew={len(at.get('whatsNew') or '')} "
            f"support={at.get('supportUrl')} marketing={at.get('marketingUrl')} differs={diffs or 'none'}")
    v = asc.get(f"/v1/appStoreVersions/{ver['id']}")["data"]["attributes"]
    log(f"  version {v.get('versionString')} state={v.get('appVersionState') or v.get('appStoreState')} "
        f"copyright={v.get('copyright')} releaseType={v.get('releaseType')}")
    info2 = asc.get_all(f"/v1/apps/{app_id}/appInfos")
    for i in info2:
        for l in asc.get_all(f"/v1/appInfos/{i['id']}/appInfoLocalizations"):
            at = l["attributes"]
            log(f"  appInfo {i['id']} {at['locale']}: name={at.get('name')} subtitle={at.get('subtitle')} privacy={at.get('privacyPolicyUrl')}")
        cat = asc.req("GET", f"/v1/appInfos/{i['id']}/primaryCategory", ok=(200,), quiet_codes=(404,))
        log(f"  appInfo {i['id']} primaryCategory={((cat or {}).get('data') or {}).get('id')}")
    app = asc.get(f"/v1/apps/{app_id}")["data"]["attributes"]
    log(f"  app primaryLocale={app.get('primaryLocale')} contentRights={app.get('contentRightsDeclaration')}")



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["apply", "verify", "submit", "release-auto"], default="apply")
    ap.add_argument("--wait-build-minutes", type=int, default=0)
    ap.add_argument("--build", default="", help="exact build number to attach (blank = latest VALID)")
    a = ap.parse_args()
    apply = a.mode == "apply"
    app_id, version = os.environ["ASC_APP_ID"], os.environ["APP_VERSION"]
    log(f"Descall App Store Connect sync: app {app_id}, version {version}, mode={a.mode}, build={a.build or 'latest VALID'}")
    meta, age, notes = load_inputs()
    asc = ASC()
    app_record(asc, app_id, meta, apply)
    info = app_info(asc, app_id, meta, apply)
    if info:
        age_rating(asc, info, age, apply)
    ver = store_version(asc, app_id, version, meta, apply)
    if ver:
        vlocs = version_localizations(asc, ver, meta, apply) or {}
        screenshots(asc, vlocs, apply, ver)
        review_detail(asc, ver, notes, apply)
    else:
        (err if apply else warn)(f"no App Store version record for {version}")
    availability(asc, app_id, apply)
    price(asc, app_id, apply)
    if ver:
        build(asc, app_id, ver, version, apply, a.wait_build_minutes, a.build.strip())

    # Read-back summary of the text fields (always)
    try:
        readback(asc, app_id, ver, meta)
    except Exception as e:
        err(f"read-back: {e}")

    if ver:
        listing_text_check(asc, ver)
    subs = review_submissions(asc, app_id, ver)

    if a.mode == "release-auto":
        if ver:
            asc.req("PATCH", f"/v1/appStoreVersions/{ver['id']}", {"data": {"type": "appStoreVersions", "id": ver["id"],
                    "attributes": {"releaseType": "AFTER_APPROVAL"}}})
            rt = asc.get(f"/v1/appStoreVersions/{ver['id']}")["data"]["attributes"].get("releaseType")
            log(f"  releaseType now {rt}")
            if rt != "AFTER_APPROVAL":
                err(f"releaseType is {rt}, expected AFTER_APPROVAL")
        else:
            err("release-auto requested but the version is missing")

    if a.mode == "submit":
        if ver:
            submit(asc, app_id, ver, a.build.strip(), subs)
        else:
            err("submit requested but the version is missing")

    log("\n=== Summary")
    log(f"warnings: {len(warnings)}")
    for w in warnings: log(f"  - {w}")
    log(f"errors: {len(errors)}")
    for e in errors: log(f"  - {e}")
    log("Not available in the App Store Connect API (set in the web UI): App Privacy nutrition labels.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

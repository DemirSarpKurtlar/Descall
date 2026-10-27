"""In-App Event for the App Store product page (appEvents API), used by asc_metadata.py.

event_apply(): create or update the event described in in-app-event/event.json (reference name,
badge, purpose, priority, schedule for all available territories, tr + en-US texts) and upload the
event card (16:9) and details page (9:16) images for every locale. Never submits.
event_report(): read-only status (state, schedule, localizations, media), returns the event or None.
The event is added to the version's review submission by asc_metadata.submit().
"""
import datetime as dt, hashlib, json, time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent / "in-app-event"
LIMITS = {"name": 30, "shortDescription": 50, "longDescription": 120}
SIZES = {"EVENT_CARD": [(1920, 1080), (3840, 2160)], "EVENT_DETAILS_PAGE": [(1080, 1920), (2160, 3840)]}
BANNED = ["valorant", "riot", "lfg", "looking for group", "takım bul", "dimaai", "dima ai", "call recording",
          "record calls", "arama kayd", "görüşme kayd"]
EDITABLE = {"DRAFT", "READY_FOR_REVIEW", "REJECTED"}


def load():
    p = HERE / "event.json"
    if not p.exists():
        return None
    ev = json.loads(p.read_text())
    for locale, m in ev["locales"].items():
        for k, lim in LIMITS.items():
            if len(m[k]) > lim:
                raise RuntimeError(f"event {locale} {k} is {len(m[k])} chars (limit {lim})")
            hits = [w for w in BANNED if w in m[k].lower()]
            if hits:
                raise RuntimeError(f"event {locale} {k} mentions removed features: {hits}")
    return ev


def find(asc, app_id, ev):
    events = asc.get_all(f"/v1/apps/{app_id}/appEvents")
    return next((e for e in events if e["attributes"].get("referenceName") == ev["referenceName"]), None)


def _iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def schedule(asc, ev, excluded):
    terr = sorted(t["id"] for t in asc.get_all("/v1/territories") if t["id"] not in excluded)
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = now + dt.timedelta(hours=int(ev.get("startDelayHours", 2)) + 1)
    end = start + dt.timedelta(days=int(ev.get("durationDays", 21)))
    return [{"territories": terr, "publishStart": _iso(start), "eventStart": _iso(start), "eventEnd": _iso(end)}]


def _upload_media(asc, loc_id, ev, log, rel):
    from PIL import Image
    have = asc.get_all(f"/v1/appEventLocalizations/{loc_id}/appEventScreenshots")
    for asset, fname in ev["media"].items():
        f = HERE / fname
        with Image.open(f) as im:
            if im.size not in SIZES[asset] or im.mode != "RGB":
                raise RuntimeError(f"{fname} is {im.size} {im.mode}, expected RGB {SIZES[asset]} for {asset}")
        data = f.read_bytes()
        cur = [s for s in have if s["attributes"].get("appEventAssetType") == asset]
        if cur and all((s["attributes"].get("assetDeliveryState") or {}).get("state") == "COMPLETE" for s in cur) \
                and any(s["attributes"].get("fileName") == f"{hashlib.md5(data).hexdigest()[:10]}-{fname}" for s in cur):
            log(f"    {asset}: already uploaded")
            continue
        for s in cur:
            asc.req("DELETE", f"/v1/appEventScreenshots/{s['id']}")
        shot = asc.req("POST", "/v1/appEventScreenshots", {"data": {"type": "appEventScreenshots",
                       "attributes": {"fileName": f"{hashlib.md5(data).hexdigest()[:10]}-{fname}", "fileSize": len(data),
                                      "appEventAssetType": asset},
                       "relationships": {"appEventLocalization": rel("appEventLocalizations", loc_id)}}})["data"]
        for op in shot["attributes"]["uploadOperations"]:
            chunk = data[op["offset"]: op["offset"] + op["length"]]
            hdrs = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
            r = requests.request(op["method"], op["url"], headers=hdrs, data=chunk, timeout=120)
            if r.status_code >= 300:
                raise RuntimeError(f"upload of {fname} failed: HTTP {r.status_code}")
        asc.req("PATCH", f"/v1/appEventScreenshots/{shot['id']}", {"data": {"type": "appEventScreenshots", "id": shot["id"],
                "attributes": {"uploaded": True}}})
        state = None
        for _ in range(40):
            state = (asc.get(f"/v1/appEventScreenshots/{shot['id']}")["data"]["attributes"].get("assetDeliveryState") or {})
            if state.get("state") in ("COMPLETE", "FAILED"):
                break
            time.sleep(5)
        if (state or {}).get("state") != "COMPLETE":
            raise RuntimeError(f"{asset} processing not complete: {state}")
        log(f"    {asset}: uploaded {fname} (COMPLETE)")


def event_apply(asc, app_id, log, warn, rel, excluded):
    ev = load()
    if not ev:
        log("  no in-app-event/event.json; skipped"); return None
    e = find(asc, app_id, ev)
    attrs = {"referenceName": ev["referenceName"], "badge": ev["badge"], "priority": ev["priority"],
             "purpose": ev["purpose"], "primaryLocale": ev["primaryLocale"],
             "purchaseRequirement": ev["purchaseRequirement"], "territorySchedules": schedule(asc, ev, excluded)}
    if e and e["attributes"].get("eventState") not in EDITABLE:
        raise RuntimeError(f"event {e['id']} is {e['attributes'].get('eventState')} and can't be edited")
    if e:
        asc.req("PATCH", f"/v1/appEvents/{e['id']}", {"data": {"type": "appEvents", "id": e["id"], "attributes": attrs}})
        log(f"  updated event {e['id']}")
    else:
        e = asc.req("POST", "/v1/appEvents", {"data": {"type": "appEvents", "attributes": attrs,
                    "relationships": {"app": rel("apps", app_id)}}})["data"]
        log(f"  created event {e['id']}")
    s = attrs["territorySchedules"][0]
    log(f"  schedule: publish/start {s['publishStart']} end {s['eventEnd']} territories={len(s['territories'])}")
    locs = {l["attributes"]["locale"]: l for l in asc.get_all(f"/v1/appEvents/{e['id']}/localizations")}
    for locale, m in ev["locales"].items():
        a = {k: m[k] for k in LIMITS}
        if locale in locs:
            loc = asc.req("PATCH", f"/v1/appEventLocalizations/{locs[locale]['id']}", {"data": {"type": "appEventLocalizations",
                          "id": locs[locale]["id"], "attributes": a}})["data"]
        else:
            loc = asc.req("POST", "/v1/appEventLocalizations", {"data": {"type": "appEventLocalizations",
                          "attributes": {"locale": locale, **a}, "relationships": {"appEvent": rel("appEvents", e["id"])}}})["data"]
        log(f"  {locale}: name/shortDescription/longDescription set")
        _upload_media(asc, loc["id"], ev, log, rel)
    return e


def event_report(asc, app_id, log, warn, strict=False):
    ev = load()
    if not ev:
        return None
    e = find(asc, app_id, ev)
    if not e:
        (warn if strict else log)(f"  in-app event '{ev['referenceName']}' not created yet")
        return None
    e = asc.get(f"/v1/appEvents/{e['id']}")["data"]
    a = e["attributes"]
    sch = (a.get("territorySchedules") or [{}])[0]
    log(f"  event {e['id']} '{a.get('referenceName')}' state={a.get('eventState')} badge={a.get('badge')} "
        f"purpose={a.get('purpose')} priority={a.get('priority')} start={sch.get('eventStart')} end={sch.get('eventEnd')} "
        f"territories={len(sch.get('territories') or [])}")
    for l in asc.get_all(f"/v1/appEvents/{e['id']}/localizations"):
        la = l["attributes"]
        shots = asc.get_all(f"/v1/appEventLocalizations/{l['id']}/appEventScreenshots")
        media = {s["attributes"].get("appEventAssetType"): (s["attributes"].get("assetDeliveryState") or {}).get("state") for s in shots}
        log(f"    {la.get('locale')}: name={la.get('name')!r} short={la.get('shortDescription')!r} media={media}")
        if strict and set(media) != {"EVENT_CARD", "EVENT_DETAILS_PAGE"} or strict and any(v != "COMPLETE" for v in media.values()):
            warn(f"event {la.get('locale')} media incomplete: {media}")
    return e

#!/usr/bin/env python3
"""Upload a signed AAB to a Google Play track with the Play Developer API v3.

Used by .github/workflows/android-build.yml (job play-upload, off unless
vars.PLAY_UPLOAD_ENABLED == 'true'). Steps: create an edit, upload the bundle,
set the track release, commit. The service account key comes from the
PLAY_SERVICE_ACCOUNT_JSON environment variable and is never printed.

Needs: google-auth and requests (installed by the workflow).
The app must already exist in Play Console with its first AAB uploaded by hand.
"""

import argparse
import json
import os
import sys
import time

API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
UPLOAD_API = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def fail(message):
    print(f"::error::{message}")
    sys.exit(1)


def session_from_env():
    raw = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON", "")
    if not raw.strip():
        fail("PLAY_SERVICE_ACCOUNT_JSON is empty")
    try:
        info = json.loads(raw)
    except json.JSONDecodeError:
        fail("PLAY_SERVICE_ACCOUNT_JSON is not valid JSON")
    if info.get("type") != "service_account":
        fail("PLAY_SERVICE_ACCOUNT_JSON is not a service account key")
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession

    creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    print(f"Service account: {info.get('client_email', '?')}")
    return AuthorizedSession(creds)


def call(session, method, url, retries=3, **kwargs):
    for attempt in range(1, retries + 1):
        res = session.request(method, url, timeout=600, **kwargs)
        if res.status_code < 500 and res.status_code != 429:
            break
        print(f"{method} {url.split('?')[0]} -> {res.status_code} (attempt {attempt})")
        if attempt < retries:
            time.sleep(15 * attempt)
    if res.status_code >= 300:
        try:
            detail = res.json().get("error", {}).get("message", res.text)
        except ValueError:
            detail = res.text
        fail(f"{method} {url.split('?')[0]} failed with {res.status_code}: {detail[:500]}")
    return res.json() if res.content else {}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--package", required=True)
    parser.add_argument("--aab", required=True)
    parser.add_argument("--track", default="internal")
    parser.add_argument("--status", default="draft", choices=["draft", "completed"])
    parser.add_argument("--release-name", default="")
    args = parser.parse_args()

    if not os.path.isfile(args.aab):
        fail(f"AAB not found: {args.aab}")

    session = session_from_env()
    base = f"{API}/{args.package}"

    edit = call(session, "POST", f"{base}/edits", json={})
    edit_id = edit["id"]
    print(f"Edit {edit_id} created")

    with open(args.aab, "rb") as fh:
        bundle = call(
            session,
            "POST",
            f"{UPLOAD_API}/{args.package}/edits/{edit_id}/bundles?uploadType=media",
            data=fh.read(),
            headers={"Content-Type": "application/octet-stream"},
        )
    version_code = str(bundle["versionCode"])
    print(f"Uploaded bundle versionCode {version_code} (sha256 {bundle.get('sha256', '?')})")

    release = {"versionCodes": [version_code], "status": args.status}
    if args.release_name:
        release["name"] = args.release_name[:50]
    call(
        session,
        "PUT",
        f"{base}/edits/{edit_id}/tracks/{args.track}",
        json={"track": args.track, "releases": [release]},
    )
    print(f"Track {args.track}: release {version_code} ({args.status})")

    call(session, "POST", f"{base}/edits/{edit_id}:commit")
    print(f"Edit {edit_id} committed")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Deploy the SPLAT lobby Worker (splat-lobby) via the Cloudflare API.

Uses the approved custom.cloudflare credential flow (cf.call) — no raw
token anywhere. Uploads the esbuild bundle as a single module with the
Durable Object binding + SQLite migration, enables the workers.dev
subdomain, and prints the live base URL.

Usage:
  ./node_modules/.bin/esbuild worker/src/index.js --bundle --format=esm \
      --outfile=/tmp/splat-lobby-bundle.mjs
  python3 worker/deploy_lobby.py [/tmp/splat-lobby-bundle.mjs]
"""
import importlib.util
import json
import os
import sys
import uuid

BIN = os.path.expanduser("~/workspace/custom-connectors/custom.cloudflare/bin")
spec = importlib.util.spec_from_file_location("cf", os.path.join(BIN, "cf.py"))
cf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cf)

ACCOUNT = "60e002269f939f90f01dfea7f4910a8b"
NAME = "splat-lobby"
BUNDLE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/splat-lobby-bundle.mjs"


def main():
    with open(BUNDLE, "rb") as f:
        script = f.read()
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2026-11-13",
        "bindings": [
            {"type": "durable_object_namespace", "name": "LOBBY",
             "class_name": "LobbyRoom"},
        ],
        "migrations": {
            "tag": "v1",
            "new_sqlite_classes": ["LobbyRoom"],
        },
    }
    boundary = "----cf" + uuid.uuid4().hex
    parts = []
    parts.append(("--" + boundary + "\r\n"
                  'Content-Disposition: form-data; name="metadata"\r\n'
                  "Content-Type: application/json\r\n\r\n").encode()
                 + json.dumps(metadata).encode() + b"\r\n")
    parts.append(("--" + boundary + "\r\n"
                  'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n'
                  "Content-Type: application/javascript+module\r\n\r\n").encode()
                 + script + b"\r\n")
    parts.append(("--" + boundary + "--\r\n").encode())
    body = b"".join(parts)
    status, payload = cf.call(
        "PUT", f"/accounts/{ACCOUNT}/workers/scripts/{NAME}",
        body=body, content_type=f"multipart/form-data; boundary={boundary}")
    print("upload:", status)
    print(json.dumps(payload, indent=2)[:2000])
    if status >= 300:
        return 1

    status, payload = cf.call(
        "POST", f"/accounts/{ACCOUNT}/workers/scripts/{NAME}/subdomain",
        body={"enabled": True})
    print("subdomain enable:", status, json.dumps(payload)[:500])
    if status >= 300:
        return 1

    status, payload = cf.call("GET", f"/accounts/{ACCOUNT}/workers/subdomain")
    print("subdomain:", status, json.dumps(payload)[:500])
    sub = (payload.get("result") or {}).get("subdomain")
    if sub:
        print("LIVE BASE URL: https://%s.%s.workers.dev" % (NAME, sub))
    return 0


if __name__ == "__main__":
    sys.exit(main())

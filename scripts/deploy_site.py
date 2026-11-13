#!/usr/bin/env python3
"""Deploy the X Arena / SPLAT site to Cloudflare Pages (project 'x-arena', branch main).

Full 4-step flow (AGENTS.md lesson 2026-11-05): build manifest ->
check-missing -> upload missing blobs -> POST /pages/assets/upsert-hashes
-> check-missing must be 0 -> create production deployment.
Verifies production afterwards is the caller's job (md5 compare).
"""
import base64
import hashlib
import importlib.util
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

BIN = os.path.expanduser("~/workspace/custom-connectors/custom.cloudflare/bin")
spec = importlib.util.spec_from_file_location("cf", os.path.join(BIN, "cf.py"))
cf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cf)

ACCOUNT = "60e002269f939f90f01dfea7f4910a8b"
PROJECT = "x-arena"
ROOT = os.path.expanduser("~/workspace/ct-arena-clone/dist")
BRANCH = "main"


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def get_jwt():
    status, payload = cf.call(
        "GET", "/accounts/%s/pages/projects/%s/upload-token" % (ACCOUNT, PROJECT))
    tok = (payload.get("result") or {}).get("jwt")
    if not tok:
        raise RuntimeError("no jwt: http %s" % status)
    return tok


JWT = None


def jwt_call(path, payload, timeout=300):
    global JWT
    for attempt in range(4):
        req = urllib.request.Request(
            "https://api.cloudflare.com/client/v4" + path,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + JWT},
            method="POST")
        try:
            with urllib.request.build_opener(cf.NoRedirect()).open(req, timeout=timeout) as resp:
                return resp.status, cf.read_json_response(resp)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                p = json.loads(raw)
            except Exception:
                p = {"raw": raw[:500]}
            if e.code in (401, 403) and attempt < 3:
                JWT = get_jwt()
                continue
            return e.code, p
    return 0, {}


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def check_missing(hashes):
    missing = []
    for chunk in chunked(hashes, 1000):
        s, p = jwt_call("/pages/assets/check-missing", {"hashes": chunk})
        res = p.get("result")
        if isinstance(res, list):
            missing.extend(res)
        elif isinstance(res, dict):
            missing.extend(res.get("missing") or [])
        else:
            raise RuntimeError("check-missing bad result http %s: %s" % (s, json.dumps(p)[:300]))
    return missing


def upsert(hashes):
    for chunk in chunked(hashes, 1000):
        s, p = jwt_call("/pages/assets/upsert-hashes", {"hashes": chunk})
        if not p.get("success"):
            raise RuntimeError("upsert failed http %s: %s" % (s, json.dumps(p)[:300]))


def main():
    global JWT
    files = {}
    for dirpath, _dirs, filenames in os.walk(ROOT):
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = "/" + os.path.relpath(full, ROOT).replace(os.sep, "/")
            with open(full, "rb") as f:
                content = f.read()
            key = hashlib.md5(content).hexdigest()
            ctype = mimetypes.guess_type(fn)[0] or "application/octet-stream"
            files[rel] = (key, content, ctype)
    log("files:", {p: v[0] for p, v in files.items()})

    JWT = get_jwt()
    all_hashes = sorted({v[0] for v in files.values()})
    by_hash = {}
    for path, (key, content, ctype) in files.items():
        by_hash.setdefault(key, (content, ctype))

    missing = check_missing(all_hashes)
    log("missing before upload:", len(missing))
    if missing:
        body = []
        for hsh in missing:
            content, ctype = by_hash[hsh]
            body.append({"key": hsh, "value": base64.b64encode(content).decode(),
                         "base64": True, "metadata": {"contentType": ctype}})
        s, p = jwt_call("/pages/assets/upload", body)
        if not p.get("success"):
            raise RuntimeError("upload failed http %s: %s" % (s, json.dumps(p)[:300]))
        log("uploaded", len(body), "blobs")
    upsert(all_hashes)
    missing = check_missing(all_hashes)
    log("missing after upsert:", len(missing))
    if missing:
        log("FATAL still missing:", missing)
        return 1

    manifest = {path: key for path, (key, _c, _t) in files.items()}
    boundary = "----pg" + uuid.uuid4().hex
    parts = []
    parts.append(("--" + boundary + "\r\n"
                  'Content-Disposition: form-data; name="manifest"\r\n\r\n').encode()
                 + json.dumps(manifest).encode() + b"\r\n")
    parts.append(("--" + boundary + "\r\n"
                  'Content-Disposition: form-data; name="branch"\r\n\r\n').encode()
                 + BRANCH.encode() + b"\r\n")
    parts.append(("--" + boundary + "--\r\n").encode())
    status, payload = cf.call(
        "POST", "/accounts/%s/pages/projects/%s/deployments" % (ACCOUNT, PROJECT),
        body=b"".join(parts),
        content_type="multipart/form-data; boundary=" + boundary)
    result = payload.get("result") or {}
    log("deployment http", status, "success", payload.get("success"))
    log("deployment url:", result.get("url"), "| environment:",
        result.get("environment"), "| id:", result.get("id"))
    if not payload.get("success"):
        print(json.dumps(payload)[:2000])
        return 1
    log("DEPLOY OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

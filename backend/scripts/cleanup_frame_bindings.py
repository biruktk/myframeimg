#!/usr/bin/env python3
"""
cleanup_frame_bindings.py — resolve a frame that keeps reverting to stale content.

DB is JSON-backed (data/myframe-db.json), not SQL. This script is the equivalent
of the requested "delete from frame_user_roles where frame_id=:mac and user_id<>:owner"
cleanup. Album playback uses the `play` flow (`POST /api/frames/:mac/slideshow`);
strategy_bin has been removed.

Usage:
  python3 scripts/cleanup_frame_bindings.py --mac 3CDC75895918            # dry-run report
  python3 scripts/cleanup_frame_bindings.py --mac 3CDC75895918 --apply    # perform cleanup

Behavior (with --apply):
  - Keeps only the primary owner (frames[].ownerUserId) as a binding.
  - Removes all other frameUserRoles (co-owners AND members).
  - Clears frames[].sharedToUserIds.
  - Removes the frame from family groups that don't include the primary owner.
  - Deletes standalone invite codes for the frame (guests can no longer re-join).
  - Writes a timestamped backup before modifying.
"""
import argparse
import json
import shutil
import sys
import time

DB_PATH = "/var/myframe/backend/data/myframe-db.json"


def normalize_mac(raw):
    return "".join(ch for ch in str(raw or "") if ch.isalnum()).upper()


def find_frame(data, mac_key):
    for f in data.get("frames", []):
        candidates = (f.get("id"), f.get("bleMac"), f.get("stationMac"))
        if any(normalize_mac(c) == mac_key for c in candidates):
            return f
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--mac", required=True, help="Frame MAC (any alias: id/ble/station)")
    ap.add_argument("--apply", action="store_true", help="Persist changes (default: dry-run)")
    args = ap.parse_args()

    mac_key = normalize_mac(args.mac)
    if len(mac_key) < 8:
        sys.exit("invalid MAC: %s" % args.mac)

    with open(DB_PATH) as fh:
        data = json.load(fh)

    frame = find_frame(data, mac_key)
    if frame is None:
        sys.exit("frame_not_found: %s (checked id/bleMac/stationMac)" % mac_key)

    fid = frame["id"]
    owner = str(frame.get("ownerUserId") or "").strip()
    roles = [r for r in data.get("frameUserRoles", []) if r.get("frameId") == fid]
    shared = list(frame.get("sharedToUserIds") or [])

    print("frame      : %s" % fid)
    print("stationMac : %s" % frame.get("stationMac"))
    print("bleMac     : %s" % frame.get("bleMac"))
    print("primary    : %s" % owner)
    print("bindings   :")
    for r in roles:
        print("  - %s [%s] (createdAt %s)" % (r.get("userId"), r.get("role"), r.get("createdAtMs")))
    for uid in shared:
        if uid not in [r.get("userId") for r in roles]:
            print("  - %s [sharedToUserIds]" % uid)

    to_remove = [r for r in roles if r.get("userId") != owner]
    print("\nwould remove %d binding(s): %s" % (len(to_remove), ", ".join(r.get("userId") for r in to_remove) or "none"))

    groups = [g for g in data.get("familyGroups", []) if fid in (g.get("frameIds") or [])]
    for g in groups:
        has_owner = any(m.get("userId") == owner for m in g.get("members", []))
        if not has_owner:
            print("would remove frame from family group %s (%s)" % (g.get("id"), g.get("name")))

    invite_codes = [c for c in data.get("frameInviteCodes", []) if c.get("deviceId") == fid]
    if invite_codes:
        print("would delete %d invite code(s) for frame" % len(invite_codes))

    uploads = [u for u in data.get("uploads", [])
               if (u.get("deviceId") or "").upper() == fid.upper()]
    if uploads:
        print("recent uploads for frame: %d" % len(uploads))

    if not args.apply:
        print("\n[dry-run] no changes written. Re-run with --apply to persist.")
        return 0

    backup = DB_PATH + ".bak_cleanup_%d" % int(time.time())
    shutil.copy2(DB_PATH, backup)
    print("\nbackup written: %s" % backup)

    # 1. Unbind all except primary owner
    data["frameUserRoles"] = [
        r for r in data.get("frameUserRoles", []) if not (r.get("frameId") == fid and r.get("userId") != owner)
    ]
    # 2. Clear shared users
    frame["sharedToUserIds"] = [uid for uid in frame.get("sharedToUserIds") or [] if uid == owner]
    # 3. Drop frame from family groups without the primary owner
    data["familyGroups"] = [
        (g if any(m.get("userId") == owner for m in g.get("members", []))
         else {**g, "frameIds": [x for x in g.get("frameIds", []) if x != fid]})
        for g in data.get("familyGroups", [])
    ]
    # 4. Delete standalone invite codes
    if "frameInviteCodes" in data:
        data["frameInviteCodes"] = [c for c in data["frameInviteCodes"] if c.get("deviceId") != fid]
    # 5. Audit trail
    data.setdefault("auditLog", []).insert(0, {
        "id": "audit_%d_cleanup" % int(time.time() * 1000),
        "actor": "cleanup_script",
        "action": "frame_unbind_all_except_owner",
        "target": fid,
        "atMs": int(time.time() * 1000),
        "meta": {"owner": owner, "removed": [r.get("userId") for r in to_remove]},
    })

    with open(DB_PATH, "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    print("\nchanges persisted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

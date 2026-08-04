/**
 * SQL reference for frame co-ownership (JSON store mirrors this table).
 *
 * Production persistence is myframe-db.json.frameUserRoles[], hydrated on read
 * from legacy ownerUserId / sharedToUserIds.
 */
CREATE TABLE IF NOT EXISTS frame_user_roles (
    frame_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (frame_id, user_id)
);

-- Rules:
-- 1) Manual Bluetooth / Wi-Fi bind  → INSERT/UPSERT role=OWNER (unlimited co-owners).
-- 2) Family invite / web link join → INSERT/UPSERT role=MEMBER (never demotes OWNER).
-- 3) Existing OWNER rows are never overwritten to MEMBER.

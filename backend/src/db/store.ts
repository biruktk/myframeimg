import fs from "fs";
import path from "path";

export type MyframeDb = {
  users: Array<{
    id: string;
    email: string;
    name: string;
    subscriptionTier: "free" | "pro";
    familyGroupId: string | null;
    status: "active" | "suspended" | "banned";
    createdAtMs: number;
    lastSeenAtMs: number | null;
    /** scrypt-derived password (optional until user registers via app). */
    passwordSalt?: string;
    passwordHash?: string;
  }>;
  familyGroups: Array<{
    id: string;
    name: string;
    inviteCode: string;
    members: Array<{ userId: string; role: "owner" | "member" }>;
    frameIds: string[];
  }>;
  frames: Array<{
    id: string;
    bleMac: string;
    ownerUserId: string;
    wifiSsid: string | null;
    wifiStatus: "online" | "offline" | "never_provisioned";
    firmwareVersion: string;
    lastSeenAtMs: number | null;
    uptimeMs: number;
    photoQueueDepth: number;
    location?: { lat: number; lng: number };
    ota: { targetVersion: string | null; status: "idle" | "queued" | "updating" | "failed" | "success" };
  }>;
  device: {
    id: string;
    name: string;
    room: string;
    connected: boolean;
    transport: { wifi: boolean; bluetooth: boolean };
    capacityBytes: number;
    usedBytes: number;
    startedAtMs: number;
    lastPhotoAtMs: number | null;
    photoCount: number;
  };
  settings: {
    account: { name: string; email: string; birthday: string | null };
    notifications: {
      birthdayReminders: boolean;
      uploadAlerts: boolean;
      offlineAlerts: boolean;
    };
    preferences: {
      theme: "light" | "dark" | "system";
      autoRotateMinutes: number;
      autoSync: boolean;
    };
    integrations: {
      googlePhotosConnected: boolean;
      icloudConnected: boolean;
      wechatConnected: boolean;
    };
  };
  uploads: Array<{
    id: string;
    filename: string;
    bytes: number;
    deviceId: string;
    atMs: number;
    checksumSha256: string;
    deliveredToFrame?: boolean;
    deliveryMode?: string;
    deliveryCheckedAtMs?: number;
  }>;
  playlists: Array<{
    id: string;
    title: string;
    photoIds: string[];
    scheduleRule: string | null;
    assignedFrameIds: string[];
    system: boolean;
  }>;
  notifications: Array<{
    id: string;
    userId: string;
    type: "photo_sent" | "frame_offline" | "admin_broadcast";
    token: string | null;
    delivered: boolean;
    atMs: number;
  }>;
  bleProvisionLogs: Array<{
    id: string;
    frameId: string;
    atMs: number;
    transport: "ffff" | "vendor_2760";
    writeChar: string;
    notifyChar: string;
    payloadPreview: string;
    ack: boolean;
    notes?: string;
  }>;
  featureFlags: Record<string, { enabled: boolean; tier: "all" | "free" | "pro" }>;
  auditLog: Array<{
    id: string;
    actor: string;
    action: string;
    target: string;
    atMs: number;
    meta?: Record<string, unknown>;
  }>;
  faqs: Array<{
    id: string;
    question: string;
    answer: string;
    updatedAtMs: number;
  }>;
  /** Slideshow playlists keyed by BLE MAC stripped of separators (uppercase hex), e.g. D0CF13F0161E */
  slideshowsByBleMac?: Record<
    string,
    {
      imageIds: string[];
      intervalMinutes: number;
      updatedAtMs: number;
    }
  >;
  commerceEvents: Array<{
    id: string;
    type: "items_sold";
    quantity: number;
    sku: string | null;
    orderId: string | null;
    atMs: number;
    meta: Record<string, unknown> | null;
  }>;
};

const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "myframe-db.json");

function createInitialDb(): MyframeDb {
  const now = Date.now();
  return {
    users: [
      {
        id: "usr_1",
        email: "owner@example.com",
        name: "Owner",
        subscriptionTier: "pro",
        familyGroupId: "fam_1",
        status: "active",
        createdAtMs: now,
        lastSeenAtMs: now,
      },
    ],
    familyGroups: [
      {
        id: "fam_1",
        name: "Family Group",
        inviteCode: "INVITE-ABCD",
        members: [{ userId: "usr_1", role: "owner" }],
        frameIds: ["YX-133P-001"],
      },
    ],
    frames: [
      {
        id: "YX-133P-001",
        bleMac: "D0:CF:13:F0:16:1E",
        ownerUserId: "usr_1",
        wifiSsid: null,
        wifiStatus: "never_provisioned",
        firmwareVersion: "1.2.0",
        lastSeenAtMs: null,
        uptimeMs: 0,
        photoQueueDepth: 0,
        ota: { targetVersion: null, status: "idle" },
      },
    ],
    device: {
      id: "YX-133P-001",
      name: "MyFrame (Primary)",
      room: "Family Room",
      connected: false,
      transport: { wifi: false, bluetooth: false },
      capacityBytes: 16 * 1024 * 1024 * 1024,
      usedBytes: 0,
      startedAtMs: now,
      lastPhotoAtMs: null,
      photoCount: 0,
    },
    settings: {
      account: { name: "MyFrame User", email: "", birthday: null },
      notifications: {
        birthdayReminders: true,
        uploadAlerts: true,
        offlineAlerts: true,
      },
      preferences: {
        theme: "system",
        autoRotateMinutes: 10,
        autoSync: true,
      },
      integrations: {
        googlePhotosConnected: false,
        icloudConnected: false,
        wechatConnected: false,
      },
    },
    uploads: [],
    playlists: [
      {
        id: "pl_family_moments",
        title: "Family Moments",
        photoIds: [],
        scheduleRule: null,
        assignedFrameIds: ["YX-133P-001"],
        system: true,
      },
    ],
    notifications: [],
    bleProvisionLogs: [],
    featureFlags: {
      quick_send_home: { enabled: true, tier: "all" },
      ai_generate: { enabled: true, tier: "pro" },
    },
    auditLog: [],
    slideshowsByBleMac: {},
    commerceEvents: [],
    faqs: [
      {
        id: "faq_pair",
        question: "How do I pair a frame?",
        answer: "Open Home, tap Pair/Device Info, then scan the QR code on your frame.",
        updatedAtMs: now,
      },
      {
        id: "faq_upload",
        question: "What if upload fails?",
        answer: "Check Wi‑Fi/Bluetooth and try again. In offline mode, use SD export.",
        updatedAtMs: now,
      },
    ],
  };
}

function ensureDbFile() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(createInitialDb(), null, 2), "utf8");
  }
}

function readDbRaw(): MyframeDb {
  ensureDbFile();
  const raw = fs.readFileSync(dbPath, "utf8");
  const parsed = JSON.parse(raw) as MyframeDb;
  if (!Array.isArray(parsed.commerceEvents)) {
    parsed.commerceEvents = [];
  }
  if (!parsed.slideshowsByBleMac || typeof parsed.slideshowsByBleMac !== "object") {
    parsed.slideshowsByBleMac = {};
  }
  return parsed;
}

function writeDbRaw(db: MyframeDb) {
  ensureDbFile();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

export const db = {
  read(): MyframeDb {
    return readDbRaw();
  },
  write(next: MyframeDb) {
    writeDbRaw(next);
  },
  mutate(mutator: (draft: MyframeDb) => void): MyframeDb {
    const next = readDbRaw();
    mutator(next);
    writeDbRaw(next);
    return next;
  },
};

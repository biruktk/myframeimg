import fs from "fs";
import path from "path";

export type MyframeDb = {
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
  faqs: Array<{
    id: string;
    question: string;
    answer: string;
    updatedAtMs: number;
  }>;
};

const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "myframe-db.json");

function createInitialDb(): MyframeDb {
  const now = Date.now();
  return {
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
  return JSON.parse(raw) as MyframeDb;
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

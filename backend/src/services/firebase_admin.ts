import { initializeApp, applicationDefault, cert, App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { ServiceAccount } from "firebase-admin";
import fs from "fs";
import path from "path";

import { db } from "../db/store";

let _app: App | null = null;

function getServiceAccountPath(): string | null {
  const envPath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "").trim();
  if (envPath) {
    const resolved = path.resolve(__dirname, "..", "..", envPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  const secretsDir = path.resolve(__dirname, "..", "..", "secrets");
  if (!fs.existsSync(secretsDir)) return null;
  const files = fs.readdirSync(secretsDir).filter((f) => f.endsWith(".json") && f.includes("firebase"));
  if (files.length === 0) return null;
  const sorted = files.sort().reverse();
  return path.join(secretsDir, sorted[0]);
}

export function isFirebaseConfigured(): boolean {
  try {
    return getServiceAccountPath() !== null || String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? "").trim().length > 0;
  } catch {
    return false;
  }
}

function initFirebase(): App {
  if (_app) return _app;

  const base64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? "").trim();
  let credential;

  if (base64) {
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    credential = cert(decoded as ServiceAccount);
  } else {
    const saPath = getServiceAccountPath();
    if (!saPath) throw new Error("Firebase service account not found");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
    credential = applicationDefault();
  }

  _app = initializeApp({ credential, projectId: "myframe-b9ba9" });
  return _app;
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const data = db.read();
  const user = data.users.find((u) => u.id === userId);
  const tokens = user?.fcmTokens ?? [];
  if (tokens.length === 0) return;

  const messaging = getMessaging(initFirebase());
  const results = await Promise.allSettled(
    tokens.map((token) =>
      messaging.send({
        token,
        notification: { title, body },
        apns: {
          payload: { aps: { sound: "default" } },
        },
        android: {
          priority: "high",
          notification: { channelId: "security_alerts" },
        },
      }),
    ),
  );

  const invalidTokens = new Set<string>();
  results.forEach((r, i) => {
    if (r.status === "rejected" && String(r.reason).includes("registration-token-not-registered")) {
      invalidTokens.add(tokens[i]);
    }
  });

  if (invalidTokens.size > 0) {
    db.mutate((draft) => {
      draft.users = draft.users.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          fcmTokens: (u.fcmTokens ?? []).filter((t) => !invalidTokens.has(t)),
        };
      });
    });
  }
}

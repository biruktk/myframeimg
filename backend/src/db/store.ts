import fs from "fs";
import path from "path";

import type { MarketingSiteStored } from "../data/marketing_defaults";
import { defaultBlogPosts } from "../data/blog_defaults";
import { marketingSiteSeed } from "../data/marketing_defaults";

/** Extra persisted tables for `/managemyframe` (not merged into MarketingSiteStored). */
export type MarketingCmsState = {
  sitemaps: Array<{ id: number; loc: string; changefreq: string; priority: string }>;
  shippingMethods: Array<{ id: number; name: string; price: string; eta: string; is_active: string }>;
  productCategories: Array<{
    id: number;
    name: string;
    image_url: string;
    popular: string;
    featured: string;
    status: string;
  }>;
  blogs: Array<Record<string, unknown>>;
  languages: Array<{
    id: number;
    code: string;
    name: string;
    native_name: string;
    language_order: number;
    is_default: string;
    is_active: string;
  }> | null;
  currencies: Array<{
    id: number;
    name: string;
    sign: string;
    value: string;
    is_default: string;
    is_active: string;
  }> | null;
  mail: Record<string, string>;
  documentation: { pdfUrl: string; pdfButtonLabel: string };
  contact: Record<string, string>;
  contactMessages: Array<{
    id: string;
    name: string;
    email: string;
    message: string;
    status: string;
    created_at: string;
  }>;
  permalinks: Array<{ page_key: string; page_name: string; slug: string }>;
  cmsAdmins: Array<{
    id: number;
    name: string;
    email: string;
    username: string;
    role: string;
    passwordHash?: string;
  }>;
};

export function marketingCmsSeed(): MarketingCmsState {
  return {
    sitemaps: [],
    shippingMethods: [],
    productCategories: [],
    blogs: defaultBlogPosts.map((post) => ({ ...post })),
    languages: null,
    currencies: null,
    mail: {},
    documentation: {
      pdfUrl: "/downloads/myframe-product-documentation.pdf",
      pdfButtonLabel: "Download MyFrame product documentation (PDF)",
    },
    contact: {
      publicEmail: "contact@myframe.ink",
      officeTitle: "Hong Kong Headquarters",
      officeAddress: "",
      officeDescription: "",
      mapEmbedUrl: "",
    },
    contactMessages: [],
    permalinks: [
      { page_key: "home", page_name: "Home", slug: "" },
      { page_key: "cart", page_name: "Cart & Checkout", slug: "cart-checkout.html" },
    ],
    cmsAdmins: [{ id: 1, name: "Administrator", email: "admin@local", username: "admin", role: "super_admin" }],
  };
}

export type MyframeDb = {
  organizations: Array<{
    id: string;
    name: string;
    status: "active" | "suspended";
    createdAtMs: number;
  }>;
  enterpriseApiKeys: Array<{
    id: string;
    orgId: string;
    name: string;
    keyPrefix: string;
    secretHash: string;
    createdAtMs: number;
    lastUsedAtMs: number | null;
    expiresAtMs: number | null;
    revokedAtMs: number | null;
    scopes: Array<"devices:read" | "images:write" | "images:read" | "commands:write">;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    orgId?: string;
    subscriptionTier: "free" | "pro";
    familyGroupId: string | null;
    status: "active" | "suspended" | "banned";
    createdAtMs: number;
    lastSeenAtMs: number | null;
    /** scrypt-derived password (optional until user registers via app). */
    passwordSalt?: string;
    passwordHash?: string;
    /** Google account `sub` from Sign-In (optional). */
    googleSub?: string;
    /** WeChat Open Platform openid. */
    wechatOpenId?: string;
    /** WeChat UnionID (shared across apps). */
    wechatUnionId?: string;
    /** Apple Sign-In `sub` (user identifier). */
    appleSub?: string;
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
    orgId?: string;
    wifiSsid: string | null;
    wifiStatus: "online" | "offline" | "never_provisioned";
    firmwareVersion: string;
    lastSeenAtMs: number | null;
    uptimeMs: number;
    pendingQueue: string[];
    nextDeliveryAtMs: number | null;
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
    previewFilename?: string;
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
      currentIndex: number;
      nextPlayAtMs: number;
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
  /** Visitor “notify me” signups from the marketing site (no CRM integration). */
  notifySubscribers: Array<{
    id: string;
    name: string;
    email: string;
    sku: string;
    productName: string;
    language: string;
    createdAtMs: number;
  }>;
  /** Marketing/CMS content for GET /api/public/site (edited via /managemyframe admin routes). */
  marketingSite?: MarketingSiteStored;

  marketingCms?: MarketingCmsState;

  /** E‑commerce orders (marketing checkout — flat file; not a payments processor). */
  orders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    email: string;
    phone: string;
    address: string;
    cityCountry?: string;
    note?: string;
    isGift: boolean;
    gateway: string;
    currency: string;
    subtotal: number;
    shipping: number;
    total: number;
    status: "pending" | "shipped" | "delivered";
    paymentStatus: string;
    language?: string;
    items: Array<{ sku: string; name?: string; quantity: number; unitPrice: number; lineTotal: number }>;
    createdAtMs: number;
    updatedAtMs: number;
  }>;
};

const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "myframe-db.json");

function createInitialDb(): MyframeDb {
  const now = Date.now();
  const defaultOrgId = "org_default";
  return {
    organizations: [
      {
        id: defaultOrgId,
        name: "Default Organization",
        status: "active",
        createdAtMs: now,
      },
    ],
    enterpriseApiKeys: [],
    users: [
      {
        id: "usr_1",
        email: "owner@example.com",
        name: "Owner",
        orgId: defaultOrgId,
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
        orgId: defaultOrgId,
        wifiSsid: null,
        wifiStatus: "never_provisioned",
        firmwareVersion: "1.2.0",
        lastSeenAtMs: null,
        uptimeMs: 0,
        pendingQueue: [],
        nextDeliveryAtMs: null,
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
    notifySubscribers: [],
    orders: [],
    marketingSite: marketingSiteSeed(),
    marketingCms: marketingCmsSeed(),
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
  if (!Array.isArray(parsed.organizations)) {
    parsed.organizations = [{ id: "org_default", name: "Default Organization", status: "active", createdAtMs: Date.now() }];
  }
  if (!Array.isArray(parsed.enterpriseApiKeys)) {
    parsed.enterpriseApiKeys = [];
  }
  if (Array.isArray(parsed.frames)) {
    const fallbackOrgId = parsed.organizations[0]?.id ?? "org_default";
    parsed.frames = parsed.frames.map((f) => (f.orgId ? f : { ...f, orgId: fallbackOrgId }));
  }
  if (Array.isArray(parsed.users)) {
    const fallbackOrgId = parsed.organizations[0]?.id ?? "org_default";
    parsed.users = parsed.users.map((u) => (u.orgId ? u : { ...u, orgId: fallbackOrgId }));
  }
  if (!Array.isArray(parsed.commerceEvents)) {
    parsed.commerceEvents = [];
  }
  if (!Array.isArray(parsed.notifySubscribers)) {
    parsed.notifySubscribers = [];
  }
  if (!Array.isArray(parsed.orders)) {
    parsed.orders = [];
  }
  if (!parsed.marketingSite || typeof parsed.marketingSite !== "object") {
    parsed.marketingSite = marketingSiteSeed();
  }
  if (!parsed.marketingCms || typeof parsed.marketingCms !== "object") {
    parsed.marketingCms = marketingCmsSeed();
  }
  hydrateManageRowIds(parsed);
  if (!parsed.slideshowsByBleMac || typeof parsed.slideshowsByBleMac !== "object") {
    parsed.slideshowsByBleMac = {};
  }
  return parsed;
}

/** Assign numeric [id]s to menus/socials/footerLinks so CRUD in manage.html works. */
function hydrateManageRowIds(parsed: MyframeDb) {
  const ms = parsed.marketingSite;
  if (!ms) return;
  const menusArr = ms.menus as unknown as Array<Record<string, unknown>>;
  let nextMenu = menusArr.reduce((m, row) => Math.max(m, typeof row.id === "number" ? (row.id as number) : 0), 0) + 1;
  ms.menus = menusArr.map((row) =>
    typeof row.id === "number"
      ? (row as unknown as (typeof ms.menus)[number])
      : ({ ...row, id: nextMenu++ } as unknown as (typeof ms.menus)[number]),
  );
  const socialArr = ms.socials as unknown as Array<Record<string, unknown>>;
  let nextSoc = socialArr.reduce((m, row) => Math.max(m, typeof row.id === "number" ? (row.id as number) : 0), 0) + 1;
  ms.socials = socialArr.map((row) =>
    typeof row.id === "number"
      ? (row as unknown as (typeof ms.socials)[number])
      : ({ ...row, id: nextSoc++ } as unknown as (typeof ms.socials)[number]),
  );
  const flArr = ms.footerLinks as unknown as Array<Record<string, unknown>>;
  let nextFl = flArr.reduce((m, row) => Math.max(m, typeof row.id === "number" ? (row.id as number) : 0), 0) + 1;
  ms.footerLinks = flArr.map((row) =>
    typeof row.id === "number"
      ? (row as unknown as (typeof ms.footerLinks)[number])
      : ({ ...row, id: nextFl++ } as unknown as (typeof ms.footerLinks)[number]),
  );
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

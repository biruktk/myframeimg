"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.marketingCmsSeed = marketingCmsSeed;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const blog_defaults_1 = require("../data/blog_defaults");
const marketing_defaults_1 = require("../data/marketing_defaults");
function marketingCmsSeed() {
    return {
        sitemaps: [],
        shippingMethods: [],
        productCategories: [],
        blogs: blog_defaults_1.defaultBlogPosts.map((post) => ({ ...post })),
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
const dbDir = path_1.default.join(process.cwd(), "data");
const dbPath = path_1.default.join(dbDir, "myframe-db.json");
function createInitialDb() {
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
                sharedToUserIds: [],
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
        emailVerifications: [],
        passwordResets: [],
        auditLog: [],
        sleepConfigs: {},
        slideshowsByBleMac: {},
        commerceEvents: [],
        notifySubscribers: [],
        orders: [],
        marketingSite: (0, marketing_defaults_1.marketingSiteSeed)(),
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
    if (!fs_1.default.existsSync(dbDir))
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    if (!fs_1.default.existsSync(dbPath)) {
        fs_1.default.writeFileSync(dbPath, JSON.stringify(createInitialDb(), null, 2), "utf8");
    }
}
function readDbRaw() {
    ensureDbFile();
    const raw = fs_1.default.readFileSync(dbPath, "utf8");
    const parsed = JSON.parse(raw);
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
    if (!parsed.sleepConfigs || typeof parsed.sleepConfigs !== "object") {
        parsed.sleepConfigs = {};
    }
    if (!Array.isArray(parsed.syncTransitPackages)) {
        parsed.syncTransitPackages = [];
    }
    if (!Array.isArray(parsed.orders)) {
        parsed.orders = [];
    }
    if (!Array.isArray(parsed.emailVerifications)) {
        parsed.emailVerifications = [];
    }
    if (!Array.isArray(parsed.passwordResets)) {
        parsed.passwordResets = [];
    }
    if (!parsed.marketingSite || typeof parsed.marketingSite !== "object") {
        parsed.marketingSite = (0, marketing_defaults_1.marketingSiteSeed)();
    }
    if (!parsed.marketingCms || typeof parsed.marketingCms !== "object") {
        parsed.marketingCms = marketingCmsSeed();
    }
    hydrateManageRowIds(parsed);
    if (!Array.isArray(parsed.frameGuestInvites)) {
        parsed.frameGuestInvites = [];
    }
    if (!parsed.slideshowsByBleMac || typeof parsed.slideshowsByBleMac !== "object") {
        parsed.slideshowsByBleMac = {};
    }
    return parsed;
}
/** Assign numeric [id]s to menus/socials/footerLinks so CRUD in manage.html works. */
function hydrateManageRowIds(parsed) {
    const ms = parsed.marketingSite;
    if (!ms)
        return;
    const menusArr = ms.menus;
    let nextMenu = menusArr.reduce((m, row) => Math.max(m, typeof row.id === "number" ? row.id : 0), 0) + 1;
    ms.menus = menusArr.map((row) => typeof row.id === "number"
        ? row
        : { ...row, id: nextMenu++ });
    const socialArr = ms.socials;
    let nextSoc = socialArr.reduce((m, row) => Math.max(m, typeof row.id === "number" ? row.id : 0), 0) + 1;
    ms.socials = socialArr.map((row) => typeof row.id === "number"
        ? row
        : { ...row, id: nextSoc++ });
    const flArr = ms.footerLinks;
    let nextFl = flArr.reduce((m, row) => Math.max(m, typeof row.id === "number" ? row.id : 0), 0) + 1;
    ms.footerLinks = flArr.map((row) => typeof row.id === "number"
        ? row
        : { ...row, id: nextFl++ });
}
function writeDbRaw(db) {
    ensureDbFile();
    fs_1.default.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}
exports.db = {
    read() {
        return readDbRaw();
    },
    write(next) {
        writeDbRaw(next);
    },
    mutate(mutator) {
        const next = readDbRaw();
        mutator(next);
        writeDbRaw(next);
        return next;
    },
};

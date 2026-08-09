"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicSiteRouter = void 0;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importStar(require("express"));
const store_1 = require("../db/store");
const blog_defaults_1 = require("../data/blog_defaults");
const marketing_public_1 = require("../services/marketing_public");
exports.publicSiteRouter = (0, express_1.Router)();
exports.publicSiteRouter.use(express_1.default.json({ limit: "512kb" }));
function appendAudit(actor, action, target, meta) {
    store_1.db.mutate((draft) => {
        draft.auditLog.unshift({
            id: `audit_${Date.now()}_${crypto_1.default.randomBytes(3).toString("hex")}`,
            actor,
            action,
            target,
            atMs: Date.now(),
            meta,
        });
    });
}
function appendCommerceSold(orderId, sku, quantity) {
    store_1.db.mutate((draft) => {
        draft.commerceEvents.unshift({
            id: `ce_${Date.now()}_${crypto_1.default.randomBytes(3).toString("hex")}`,
            type: "items_sold",
            quantity,
            sku,
            orderId,
            atMs: Date.now(),
            meta: null,
        });
    });
}
function nextOrderNumber() {
    const t = Date.now().toString(36).toUpperCase();
    const r = crypto_1.default.randomBytes(2).toString("hex").toUpperCase();
    return `MF-${t}-${r}`;
}
/** GET /api/public/site — CMS JSON persisted in DB (`marketingSite`). */
exports.publicSiteRouter.get("/public/site", (_req, res) => {
    res.json((0, marketing_public_1.getPublicSitePayload)());
});
/** GET /api/public/blogs — published blog cards for the marketing blog. */
exports.publicSiteRouter.get("/public/blogs", (_req, res) => {
    const blogs = store_1.db.read().marketingCms?.blogs;
    res.json((0, blog_defaults_1.publishedBlogs)(blogs?.length ? blogs : blog_defaults_1.defaultBlogPosts));
});
/** GET /api/public/blogs/by-slug/:slug — published blog detail. */
exports.publicSiteRouter.get("/public/blogs/by-slug/:slug", (req, res) => {
    const slug = String(req.params.slug ?? "").trim();
    const cmsBlogs = store_1.db.read().marketingCms?.blogs;
    const blogs = (0, blog_defaults_1.publishedBlogs)(cmsBlogs?.length ? cmsBlogs : blog_defaults_1.defaultBlogPosts);
    const post = blogs.find((row) => String(row.slug ?? "") === slug);
    if (!post) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
    }
    res.json({
        ...post,
        meta_title_pub: String(post.meta_title ?? post.title ?? ""),
        meta_description_pub: String(post.meta_description ?? post.excerpt ?? ""),
    });
});
/** GET /api/public/location — static geo stub (no upstream IP database). */
exports.publicSiteRouter.get("/public/location", (req, res) => {
    const lang = String(req.header("accept-language") ?? "").toLowerCase();
    let recommendedLanguage = "en";
    if (lang.includes("zh"))
        recommendedLanguage = "zh";
    else if (lang.includes("ja"))
        recommendedLanguage = "ja";
    else if (lang.includes("es"))
        recommendedLanguage = "es";
    else if (lang.includes("fr"))
        recommendedLanguage = "fr";
    else if (lang.includes("de"))
        recommendedLanguage = "de";
    res.json({
        ok: true,
        recommendedLanguage,
        recommendedCurrency: recommendedLanguage === "zh" ? "CNY" : "USD",
        country: "",
        city: "",
    });
});
/** GET /api/public/customer-profile */
exports.publicSiteRouter.get("/public/customer-profile", (_req, res) => {
    res.json({ ok: true, customer: null });
});
/** POST /api/public/subscribers — “notify me” on coming-soon SKU */
exports.publicSiteRouter.post("/public/subscribers", (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const sku = String(req.body?.sku ?? "").trim();
    const language = String(req.body?.language ?? "en").trim() || "en";
    const productName = String(req.body?.product_name ?? req.body?.productName ?? sku).trim();
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ ok: false, error: "invalid_name_or_email" });
        return;
    }
    if (!sku) {
        res.status(400).json({ ok: false, error: "sku_required" });
        return;
    }
    const id = `sub_${Date.now()}_${crypto_1.default.randomBytes(3).toString("hex")}`;
    store_1.db.mutate((draft) => {
        draft.notifySubscribers.unshift({
            id,
            name,
            email,
            sku,
            productName: productName || sku,
            language,
            createdAtMs: Date.now(),
        });
    });
    appendAudit("marketing_site", "notify_subscribe", sku, { email, name });
    res.status(201).json({ ok: true, id });
});
/** POST /api/public/orders */
exports.publicSiteRouter.post("/public/orders", (req, res) => {
    const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!itemsIn.length) {
        res.status(400).json({ ok: false, error: "cart_empty" });
        return;
    }
    const customerName = String(req.body?.customer_name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const addressLine = String(req.body?.address ?? req.body?.address_line1 ?? "").trim();
    const city = String(req.body?.city ?? "").trim();
    const country = String(req.body?.country ?? "").trim();
    /** Checkout must include address + city + country (legacy callers may send city_country instead). */
    const cityCountryRaw = String(req.body?.city_country ?? "").trim();
    const address = addressLine;
    const cityCountry = cityCountryRaw ||
        [city, country].filter(Boolean).join(", ") ||
        undefined;
    if (!customerName || !email || !address || (!city && !country && !cityCountryRaw)) {
        res.status(400).json({ ok: false, error: "buyer_fields_required" });
        return;
    }
    const gateway = String(req.body?.gateway ?? "cash_on_delivery").trim() || "cash_on_delivery";
    const currency = String(req.body?.currency ?? "USD").trim().toUpperCase();
    const language = String(req.body?.language ?? "").trim() || undefined;
    const note = String(req.body?.note ?? "").trim() || undefined;
    const isGift = Boolean(req.body?.is_gift);
    const priceMap = (0, marketing_public_1.priceBySkuFromDb)();
    const lines = [];
    let subtotal = 0;
    for (const row of itemsIn) {
        const sku = String(row?.sku ?? "").trim();
        const quantity = Math.max(0, Math.min(99, Math.round(Number(row?.quantity ?? row?.qty) || 0)));
        if (!sku || quantity <= 0)
            continue;
        const unit = priceMap[sku];
        if (unit == null) {
            res.status(400).json({ ok: false, error: "unknown_sku", sku });
            return;
        }
        const lineTotal = unit * quantity;
        subtotal += lineTotal;
        lines.push({ sku, quantity, unitPrice: unit, lineTotal });
    }
    if (!lines.length) {
        res.status(400).json({ ok: false, error: "no_valid_lines" });
        return;
    }
    const shipping = 0;
    const total = subtotal + shipping;
    const now = Date.now();
    const orderNumber = nextOrderNumber();
    const id = `ord_${now}_${crypto_1.default.randomBytes(3).toString("hex")}`;
    store_1.db.mutate((draft) => {
        draft.orders.unshift({
            id,
            orderNumber,
            customerName,
            email,
            phone: phone || "",
            address,
            cityCountry,
            note,
            isGift,
            gateway,
            currency,
            subtotal,
            shipping,
            total,
            status: "pending",
            paymentStatus: gateway === "cash_on_delivery" ? "pending" : "pending",
            language,
            items: lines,
            createdAtMs: now,
            updatedAtMs: now,
        });
    });
    for (const line of lines) {
        appendCommerceSold(id, line.sku, line.quantity);
    }
    appendAudit("commerce", "order_created", orderNumber, { email, gateway, total, currency });
    res.status(201).json({ ok: true, orderNumber, id });
});
exports.publicSiteRouter.post("/public/payments/stripe/session", (_req, res) => {
    res.status(501).json({ ok: false, error: "stripe_not_configured", message: "Use Cash on Delivery or configure Stripe keys on the server." });
});
exports.publicSiteRouter.post("/public/payments/paypal/create-order", (_req, res) => {
    res.status(501).json({ ok: false, error: "paypal_not_configured" });
});
exports.publicSiteRouter.post("/public/payments/paypal/capture-order", (_req, res) => {
    res.status(501).json({ ok: false, error: "paypal_not_configured" });
});

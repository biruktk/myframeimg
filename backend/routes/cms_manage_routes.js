"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachCmsManageRoutes = attachCmsManageRoutes;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const marketing_defaults_1 = require("../data/marketing_defaults");
const store_1 = require("../db/store");
const marketing_public_1 = require("../services/marketing_public");
const uploadRoot = process.env.UPLOAD_DIR || path_1.default.join(process.cwd(), "uploads");
function audit(draft, actor, action, target, meta) {
    draft.auditLog.unshift({
        id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
        actor,
        action,
        target,
        atMs: Date.now(),
        meta,
    });
}
function ensureMs(draft) {
    if (!draft.marketingSite || typeof draft.marketingSite !== "object") {
        draft.marketingSite = (0, marketing_defaults_1.marketingSiteSeed)();
    }
    return draft.marketingSite;
}
function ensureCmsDraft(draft) {
    if (!draft.marketingCms || typeof draft.marketingCms !== "object") {
        draft.marketingCms = (0, store_1.marketingCmsSeed)();
    }
    return draft.marketingCms;
}
function languagesForManage(rows, apiSite) {
    if (rows?.length)
        return rows;
    return apiSite.languages.map((l, i) => ({
        id: i + 1,
        code: l.code,
        name: l.name,
        native_name: l.native_name,
        language_order: l.language_order ?? i + 1,
        is_default: l.code === "en" ? "1" : "0",
        is_active: "1",
    }));
}
function currenciesForManage(rows, apiSite) {
    if (rows?.length)
        return rows;
    return apiSite.currencies.map((c, i) => ({
        id: i + 1,
        name: c.name,
        sign: c.sign,
        value: String(c.value),
        is_default: c.is_default ? "1" : "0",
        is_active: "1",
    }));
}
function seedLangRowsFromDefaults() {
    return marketing_defaults_1.staticLanguages.map((l, i) => ({
        id: i + 1,
        code: l.code,
        name: l.name,
        native_name: l.native_name,
        language_order: l.language_order ?? i + 1,
        is_default: l.code === "en" ? "1" : "0",
        is_active: "1",
    }));
}
function seedCurrencyRowsFromDefaults() {
    return marketing_defaults_1.staticCurrencies.map((c, i) => ({
        id: i + 1,
        name: c.name,
        sign: c.sign,
        value: String(c.value),
        is_default: c.is_default ? "1" : "0",
        is_active: "1",
    }));
}
function stripAdminPasswords(admins) {
    return admins.map(({ passwordHash: _p, ...rest }) => rest);
}
function attachCmsManageRoutes(adminRouter) {
    const storage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            try {
                if (!fs_1.default.existsSync(uploadRoot))
                    fs_1.default.mkdirSync(uploadRoot, { recursive: true });
            }
            catch {
                /* ignore */
            }
            cb(null, uploadRoot);
        },
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname || "") || ".bin";
            cb(null, `cms_${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}${ext}`);
        },
    });
    const upload = (0, multer_1.default)({ storage, limits: { fileSize: 14 * 1024 * 1024 } });
    adminRouter.get("/admin/manage-state", (_req, res) => {
        const data = store_1.db.read();
        const cms = data.marketingCms ?? (0, store_1.marketingCmsSeed)();
        const site = (0, marketing_public_1.getPublicSitePayload)();
        res.json({
            sitemaps: cms.sitemaps,
            shippingMethods: cms.shippingMethods,
            categories: cms.productCategories,
            blogs: cms.blogs.map((b) => {
                const row = b;
                const created = row.created_at ?? row.createdAt ?? new Date().toISOString();
                const updated = row.updated_at ?? row.updatedAt ?? created;
                return { ...row, created_at: created, updated_at: updated };
            }),
            languages: languagesForManage(cms.languages, site),
            currencies: currenciesForManage(cms.currencies, site),
            contact: cms.contact,
            mail: cms.mail,
            documentation: cms.documentation,
            contactMessages: cms.contactMessages,
            permalinks: cms.permalinks,
            admins: stripAdminPasswords(cms.cmsAdmins),
        });
    });
    adminRouter.post("/admin/menus", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const rows = ms.menus;
            const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
            rows.push({
                id: nextId,
                label: String(body.label ?? ""),
                url: String(body.url ?? ""),
                target: String(body.target ?? "_self"),
                menu_order: Number(body.menu_order) || nextId,
                is_active: String(body.is_active ?? "1"),
            });
            ms.menus = rows;
            audit(draft, "cms", "menu_create", String(nextId));
        });
        res.status(201).json({ ok: true });
    });
    adminRouter.put("/admin/menus/:id", (req, res) => {
        const id = Number(req.params.id);
        const body = (req.body ?? {});
        let ok = false;
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const rows = ms.menus;
            ms.menus = rows.map((r) => {
                if (Number(r.id) !== id)
                    return r;
                ok = true;
                return {
                    ...r,
                    label: String(body.label ?? r.label ?? ""),
                    url: String(body.url ?? r.url ?? ""),
                    target: String(body.target ?? r.target ?? "_self"),
                    menu_order: Number(body.menu_order) || Number(r.menu_order) || 0,
                    is_active: String(body.is_active ?? r.is_active ?? "1"),
                    id,
                };
            });
            audit(draft, "cms", "menu_update", String(id));
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.delete("/admin/menus/:id", (req, res) => {
        const id = Number(req.params.id);
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const rows = ms.menus;
            ms.menus = rows.filter((r) => Number(r.id) !== id);
            audit(draft, "cms", "menu_delete", String(id));
        });
        res.json({ ok: true });
    });
    adminRouter.post("/admin/social_links", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const rows = ms.socials;
            const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
            rows.push({
                id: nextId,
                icon: String(body.icon ?? ""),
                url: String(body.url ?? ""),
                link_order: Number(body.link_order) || nextId,
                is_active: String(body.is_active ?? "1"),
            });
            ms.socials = rows;
        });
        res.status(201).json({ ok: true });
    });
    adminRouter.put("/admin/social_links/:id", (req, res) => {
        const id = Number(req.params.id);
        const body = (req.body ?? {});
        let ok = false;
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            ms.socials = ms.socials.map((r) => {
                if (Number(r.id) !== id)
                    return r;
                ok = true;
                return {
                    ...r,
                    icon: String(body.icon ?? r.icon ?? ""),
                    url: String(body.url ?? r.url ?? ""),
                    link_order: Number(body.link_order) || Number(r.link_order) || 0,
                    is_active: String(body.is_active ?? r.is_active ?? "1"),
                    id,
                };
            });
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.delete("/admin/social_links/:id", (req, res) => {
        const id = Number(req.params.id);
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            ms.socials = ms.socials.filter((r) => Number(r.id) !== id);
        });
        res.json({ ok: true });
    });
    adminRouter.post("/admin/footer_links", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const rows = ms.footerLinks;
            const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
            rows.push({
                id: nextId,
                group_name: String(body.group_name ?? "Product"),
                name: String(body.name ?? ""),
                url: String(body.url ?? ""),
                link_order: Number(body.link_order) || nextId,
                is_active: String(body.is_active ?? "1"),
            });
            ms.footerLinks = rows;
        });
        res.status(201).json({ ok: true });
    });
    adminRouter.put("/admin/footer_links/:id", (req, res) => {
        const id = Number(req.params.id);
        const body = (req.body ?? {});
        let ok = false;
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            ms.footerLinks = ms.footerLinks.map((r) => {
                if (Number(r.id) !== id)
                    return r;
                ok = true;
                return {
                    ...r,
                    group_name: String(body.group_name ?? r.group_name ?? ""),
                    name: String(body.name ?? r.name ?? ""),
                    url: String(body.url ?? r.url ?? ""),
                    link_order: Number(body.link_order) || Number(r.link_order) || 0,
                    is_active: String(body.is_active ?? r.is_active ?? "1"),
                    id,
                };
            });
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.delete("/admin/footer_links/:id", (req, res) => {
        const id = Number(req.params.id);
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            ms.footerLinks = ms.footerLinks.filter((r) => Number(r.id) !== id);
        });
        res.json({ ok: true });
    });
    const crudCmsList = (pathSeg, pick, place) => {
        adminRouter.post(`/admin/${pathSeg}`, (req, res) => {
            store_1.db.mutate((draft) => {
                const c = ensureCmsDraft(draft);
                const rows = [...pick(c)];
                const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
                rows.push({ ...req.body, id: nextId });
                place(c, rows);
                audit(draft, "cms", `${pathSeg}_create`, String(nextId));
            });
            res.status(201).json({ ok: true });
        });
        adminRouter.put(`/admin/${pathSeg}/:id`, (req, res) => {
            const id = Number(req.params.id);
            let ok = false;
            store_1.db.mutate((draft) => {
                const c = ensureCmsDraft(draft);
                const rows = pick(c).map((r) => {
                    if (Number(r.id) !== id)
                        return r;
                    ok = true;
                    return { ...r, ...req.body, id };
                });
                place(c, rows);
            });
            if (!ok)
                return res.status(404).json({ ok: false, error: "not_found" });
            res.json({ ok: true });
        });
        adminRouter.delete(`/admin/${pathSeg}/:id`, (req, res) => {
            const id = Number(req.params.id);
            store_1.db.mutate((draft) => {
                const c = ensureCmsDraft(draft);
                const rows = pick(c).filter((r) => Number(r.id) !== id);
                place(c, rows);
            });
            res.json({ ok: true });
        });
    };
    crudCmsList("sitemaps", (c) => c.sitemaps, (c, rows) => {
        c.sitemaps = rows;
    });
    crudCmsList("shipping_methods", (c) => c.shippingMethods, (c, rows) => {
        c.shippingMethods = rows;
    });
    crudCmsList("product_categories", (c) => c.productCategories, (c, rows) => {
        c.productCategories = rows;
    });
    adminRouter.post("/admin/languages", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (!c.languages)
                c.languages = seedLangRowsFromDefaults();
            const rows = c.languages;
            const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
            rows.push({
                id: nextId,
                code: String(body.code ?? ""),
                name: String(body.name ?? ""),
                native_name: String(body.native_name ?? ""),
                language_order: Number(body.language_order) || nextId,
                is_default: String(body.is_default ?? "0"),
                is_active: String(body.is_active ?? "1"),
            });
        });
        res.status(201).json({ ok: true });
    });
    adminRouter.put("/admin/languages/:id", (req, res) => {
        const id = Number(req.params.id);
        const body = (req.body ?? {});
        let ok = false;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (!c.languages)
                c.languages = seedLangRowsFromDefaults();
            c.languages = c.languages.map((r) => {
                if (Number(r.id) !== id)
                    return r;
                ok = true;
                return {
                    ...r,
                    code: String(body.code ?? r.code),
                    name: String(body.name ?? r.name),
                    native_name: String(body.native_name ?? r.native_name),
                    language_order: Number(body.language_order) || r.language_order,
                    is_default: String(body.is_default ?? r.is_default),
                    is_active: String(body.is_active ?? r.is_active),
                    id,
                };
            });
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.delete("/admin/languages/:id", (req, res) => {
        const id = Number(req.params.id);
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (!c.languages)
                c.languages = seedLangRowsFromDefaults();
            c.languages = c.languages.filter((r) => Number(r.id) !== id);
            if (!c.languages.length)
                c.languages = null;
        });
        res.json({ ok: true });
    });
    adminRouter.post("/admin/currencies", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (!c.currencies)
                c.currencies = seedCurrencyRowsFromDefaults();
            const rows = c.currencies;
            const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
            rows.push({
                id: nextId,
                name: String(body.name ?? ""),
                sign: String(body.sign ?? ""),
                value: String(body.value ?? "1"),
                is_default: String(body.is_default ?? "0"),
                is_active: String(body.is_active ?? "1"),
            });
        });
        res.status(201).json({ ok: true });
    });
    adminRouter.put("/admin/currencies/:id", (req, res) => {
        const id = Number(req.params.id);
        const body = (req.body ?? {});
        let ok = false;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (!c.currencies)
                c.currencies = seedCurrencyRowsFromDefaults();
            c.currencies = c.currencies.map((r) => {
                if (Number(r.id) !== id)
                    return r;
                ok = true;
                return {
                    ...r,
                    name: String(body.name ?? r.name),
                    sign: String(body.sign ?? r.sign),
                    value: String(body.value ?? r.value),
                    is_default: String(body.is_default ?? r.is_default),
                    is_active: String(body.is_active ?? r.is_active),
                    id,
                };
            });
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.delete("/admin/currencies/:id", (req, res) => {
        const id = Number(req.params.id);
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (!c.currencies)
                c.currencies = seedCurrencyRowsFromDefaults();
            c.currencies = c.currencies.filter((r) => Number(r.id) !== id);
            if (!c.currencies.length)
                c.currencies = null;
        });
        res.json({ ok: true });
    });
    adminRouter.post("/admin/blogs", (req, res) => {
        const body = (req.body ?? {});
        const now = new Date().toISOString();
        let idOut = 0;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            const rows = c.blogs;
            const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
            idOut = nextId;
            rows.unshift({
                id: nextId,
                title: String(body.title ?? ""),
                slug: String(body.slug ?? `post-${nextId}`),
                status: String(body.status ?? "draft"),
                featured_image: String(body.featured_image ?? ""),
                meta_title: String(body.meta_title ?? ""),
                meta_description: String(body.meta_description ?? ""),
                excerpt: String(body.excerpt ?? ""),
                body: String(body.body ?? ""),
                created_at: now,
                updated_at: now,
            });
        });
        res.status(201).json({ ok: true, id: idOut });
    });
    adminRouter.put("/admin/blogs/:id", (req, res) => {
        const id = Number(req.params.id);
        const body = (req.body ?? {});
        const now = new Date().toISOString();
        let ok = false;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.blogs = c.blogs.map((row) => {
                const rid = Number(row.id);
                if (rid !== id)
                    return row;
                ok = true;
                return {
                    ...row,
                    title: String(body.title ?? row.title ?? ""),
                    slug: String(body.slug ?? row.slug ?? ""),
                    status: String(body.status ?? row.status ?? "draft"),
                    featured_image: String(body.featured_image ?? row.featured_image ?? ""),
                    meta_title: String(body.meta_title ?? row.meta_title ?? ""),
                    meta_description: String(body.meta_description ?? row.meta_description ?? ""),
                    excerpt: String(body.excerpt ?? row.excerpt ?? ""),
                    body: String(body.body ?? row.body ?? ""),
                    updated_at: now,
                };
            });
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.delete("/admin/blogs/:id", (req, res) => {
        const id = Number(req.params.id);
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.blogs = c.blogs.filter((row) => Number(row.id) !== id);
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/seo/:pageKey", (req, res) => {
        const pageKey = String(req.params.pageKey);
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const metaTitle = String(body.meta_title ?? "").trim();
            const metaDesc = String(body.meta_description ?? "").trim();
            const metaKw = String(body.meta_keywords ?? metaTitle).trim();
            ms.seo = ms.seo.map((row) => row.page_key === pageKey
                ? { ...row, meta_title: metaTitle, meta_description: metaDesc, meta_keywords: metaKw || metaTitle }
                : row);
            audit(draft, "cms", "seo_update", pageKey);
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/permalinks/:pageKey", (req, res) => {
        const pageKey = String(req.params.pageKey);
        const slug = String(req.body?.slug ?? "").trim();
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.permalinks = c.permalinks.map((p) => p.page_key === pageKey ? { ...p, slug } : p);
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/payment-gateways/:code", (req, res) => {
        const code = String(req.params.code);
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            ms.gateways = ms.gateways.map((g) => {
                if (g.code !== code)
                    return g;
                const nextConfig = body.config != null && typeof body.config === "object"
                    ? { ...g.config, ...body.config }
                    : g.config;
                return {
                    ...g,
                    title: body.title != null ? String(body.title) : g.title,
                    ...(body.status != null ? { status: String(body.status) } : {}),
                    config: nextConfig,
                };
            });
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/maintenance", (req, res) => {
        const patch = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            ms.maintenance = { ...ms.maintenance, ...patch };
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/footer", (req, res) => {
        const patch = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            ms.footer = { ...ms.footer, ...patch };
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/mail", (req, res) => {
        const patch = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.mail = { ...c.mail, ...patch };
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/documentation", (req, res) => {
        const patch = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (patch.pdfUrl != null)
                c.documentation.pdfUrl = String(patch.pdfUrl);
            if (patch.pdfButtonLabel != null)
                c.documentation.pdfButtonLabel = String(patch.pdfButtonLabel);
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/contact", (req, res) => {
        const patch = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.contact = { ...c.contact, ...patch };
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/translations", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const tr = { ...ms.translations };
            for (const [lang, piece] of Object.entries(body)) {
                if (!piece || typeof piece !== "object")
                    continue;
                tr[lang] = { ...(tr[lang] ?? {}), ...piece };
            }
            ms.translations = tr;
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/translated_features", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const tf = { ...ms.translatedFeatures };
            for (const [lang, rows] of Object.entries(body)) {
                if (!Array.isArray(rows))
                    continue;
                tf[lang] = rows.map((item) => ({
                    title: String(item.title ?? ""),
                    description: String(item.description ?? ""),
                }));
            }
            ms.translatedFeatures = tf;
        });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/settings/content_pages", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const ms = ensureMs(draft);
            const cp = { ...ms.contentPages };
            for (const [lang, slugMap] of Object.entries(body)) {
                if (!slugMap || typeof slugMap !== "object")
                    continue;
                const cur = { ...(cp[lang] ?? {}) };
                for (const [slug, fields] of Object.entries(slugMap)) {
                    cur[slug] = { ...(cur[slug] ?? {}), ...fields };
                }
                cp[lang] = cur;
            }
            ms.contentPages = cp;
        });
        res.json({ ok: true });
    });
    adminRouter.post("/admin/contact/broadcast", (_req, res) => {
        const n = store_1.db.read().notifySubscribers.length;
        store_1.db.mutate((draft) => {
            audit(draft, "cms", "contact_broadcast_skipped", "notify_subscribers", { note: "no_smtp", count: n });
        });
        res.json({ ok: true, recipients: n, message: "Logged only — configure SMTP in mail settings to send." });
    });
    adminRouter.put("/admin/contact-messages/:id", (req, res) => {
        const id = String(req.params.id);
        const status = String(req.body?.status ?? "read");
        let ok = false;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.contactMessages = c.contactMessages.map((m) => {
                if (m.id !== id)
                    return m;
                ok = true;
                return { ...m, status };
            });
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.put("/admin/admins/me", (req, res) => {
        const body = (req.body ?? {});
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            if (!c.cmsAdmins.length)
                c.cmsAdmins.push({ id: 1, name: "Administrator", email: "admin", username: "admin", role: "super_admin" });
            const primary = { ...c.cmsAdmins[0] };
            if (body.name != null)
                primary.name = body.name.trim();
            if (body.email != null)
                primary.email = body.email.trim();
            if (body.username != null)
                primary.username = body.username.trim();
            if (body.newPassword?.trim()) {
                primary.passwordHash = `stored:${crypto_1.default.createHash("sha256").update(body.newPassword.trim()).digest("hex")}`;
            }
            c.cmsAdmins[0] = primary;
        });
        const fresh = store_1.db.read();
        const row = fresh.marketingCms?.cmsAdmins[0];
        const adminOut = row ? stripAdminPasswords([row])[0] : { id: 1, name: "Administrator", email: "admin@local", username: "admin", role: "super_admin" };
        res.json({ ok: true, admin: { ...adminOut, id: Number(adminOut.id ?? 1) } });
    });
    adminRouter.post("/admin/admins", (req, res) => {
        const body = (req.body ?? {});
        if (!body.password?.trim())
            return res.status(400).json({ ok: false, error: "password_required" });
        let idOut = 0;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            const nextId = c.cmsAdmins.reduce((m, a) => Math.max(m, a.id), 0) + 1;
            idOut = nextId;
            c.cmsAdmins.push({
                id: nextId,
                name: body.name.trim(),
                email: body.email.trim(),
                username: (body.username ?? "").trim(),
                role: body.role === "super_admin" ? "super_admin" : "admin",
                passwordHash: `stored:${crypto_1.default.createHash("sha256").update(body.password.trim()).digest("hex")}`,
            });
        });
        res.status(201).json({ ok: true, id: idOut });
    });
    adminRouter.put("/admin/admins/:id", (req, res) => {
        const id = Number(req.params.id);
        const body = (req.body ?? {});
        let ok = false;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.cmsAdmins = c.cmsAdmins.map((a) => {
                if (a.id !== id)
                    return a;
                ok = true;
                const next = { ...a, name: body.name ?? a.name, email: body.email ?? a.email, username: body.username ?? a.username };
                if (body.role === "super_admin" || body.role === "admin")
                    next.role = body.role;
                if (body.newPassword?.trim())
                    next.passwordHash = `stored:${crypto_1.default.createHash("sha256").update(body.newPassword.trim()).digest("hex")}`;
                return next;
            });
        });
        if (!ok)
            return res.status(404).json({ ok: false, error: "not_found" });
        res.json({ ok: true });
    });
    adminRouter.delete("/admin/admins/:id", (req, res) => {
        const id = Number(req.params.id);
        const data = store_1.db.read();
        if (data.marketingCms?.cmsAdmins.length === 1) {
            return res.status(400).json({ ok: false, error: "cannot_remove_last_admin" });
        }
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.cmsAdmins = c.cmsAdmins.filter((a) => a.id !== id);
        });
        res.json({ ok: true });
    });
    adminRouter.post("/admin/upload", upload.single("image"), (req, res) => {
        if (!req.file?.filename)
            return res.status(400).json({ error: "file_required" });
        res.json({ url: `/uploads/${req.file.filename}` });
    });
    adminRouter.post("/admin/upload/pdf", upload.single("pdf"), (req, res) => {
        if (!req.file?.filename)
            return res.status(400).json({ error: "file_required" });
        const url = `/uploads/${req.file.filename}`;
        store_1.db.mutate((draft) => {
            const c = ensureCmsDraft(draft);
            c.documentation.pdfUrl = url;
        });
        res.json({ ok: true, url });
    });
}

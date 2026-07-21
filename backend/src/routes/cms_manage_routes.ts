import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Router } from "express";
import multer from "multer";

import type { MarketingSiteStored } from "../data/marketing_defaults";
import { marketingSiteSeed, staticCurrencies, staticLanguages } from "../data/marketing_defaults";
import { db, marketingCmsSeed, type MarketingCmsState, type MyframeDb } from "../db/store";
import { getPublicSitePayload } from "../services/marketing_public";

const uploadRoot = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

function audit(draft: MyframeDb, actor: string, action: string, target: string, meta?: Record<string, unknown>) {
  draft.auditLog.unshift({
    id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
    actor,
    action,
    target,
    atMs: Date.now(),
    meta,
  });
}

function ensureMs(draft: MyframeDb): MarketingSiteStored {
  if (!draft.marketingSite || typeof draft.marketingSite !== "object") {
    draft.marketingSite = marketingSiteSeed();
  }
  return draft.marketingSite as MarketingSiteStored;
}

function ensureCmsDraft(draft: MyframeDb): MarketingCmsState {
  if (!draft.marketingCms || typeof draft.marketingCms !== "object") {
    draft.marketingCms = marketingCmsSeed();
  }
  return draft.marketingCms;
}

function languagesForManage(rows: MarketingCmsState["languages"], apiSite: ReturnType<typeof getPublicSitePayload>) {
  if (rows?.length) return rows;
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

function currenciesForManage(rows: MarketingCmsState["currencies"], apiSite: ReturnType<typeof getPublicSitePayload>) {
  if (rows?.length) return rows as NonNullable<MarketingCmsState["currencies"]>;
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
  return staticLanguages.map((l, i) => ({
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
  return staticCurrencies.map((c, i) => ({
    id: i + 1,
    name: c.name,
    sign: c.sign,
    value: String(c.value),
    is_default: c.is_default ? "1" : "0",
    is_active: "1",
  }));
}

function stripAdminPasswords(admins: MarketingCmsState["cmsAdmins"]) {
  return admins.map(({ passwordHash: _p, ...rest }) => rest);
}

export function attachCmsManageRoutes(adminRouter: Router): void {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
      } catch {
        /* ignore */
      }
      cb(null, uploadRoot);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || ".bin";
      cb(null, `cms_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 14 * 1024 * 1024 } });

  adminRouter.get("/admin/manage-state", (_req, res) => {
    const data = db.read();
    const cms = data.marketingCms ?? marketingCmsSeed();
    const site = getPublicSitePayload();
    res.json({
      sitemaps: cms.sitemaps,
      shippingMethods: cms.shippingMethods,
      categories: cms.productCategories,
      blogs: cms.blogs.map((b) => {
        const row = b as Record<string, unknown>;
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const rows = ms.menus as unknown as Array<Record<string, unknown>>;
      const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
      rows.push({
        id: nextId,
        label: String(body.label ?? ""),
        url: String(body.url ?? ""),
        target: String(body.target ?? "_self"),
        menu_order: Number(body.menu_order) || nextId,
        is_active: String(body.is_active ?? "1"),
      });
      ms.menus = rows as typeof ms.menus;
      audit(draft, "cms", "menu_create", String(nextId));
    });
    res.status(201).json({ ok: true });
  });

  adminRouter.put("/admin/menus/:id", (req, res) => {
    const id = Number(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    let ok = false;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const rows = ms.menus as unknown as Array<Record<string, unknown>>;
      ms.menus = rows.map((r) => {
        if (Number(r.id) !== id) return r as (typeof ms.menus)[number];
        ok = true;
        return {
          ...r,
          label: String(body.label ?? r.label ?? ""),
          url: String(body.url ?? r.url ?? ""),
          target: String(body.target ?? r.target ?? "_self"),
          menu_order: Number(body.menu_order) || Number(r.menu_order) || 0,
          is_active: String(body.is_active ?? r.is_active ?? "1"),
          id,
        } as (typeof ms.menus)[number];
      });
      audit(draft, "cms", "menu_update", String(id));
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.delete("/admin/menus/:id", (req, res) => {
    const id = Number(req.params.id);
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const rows = ms.menus as unknown as Array<Record<string, unknown>>;
      ms.menus = rows.filter((r) => Number(r.id) !== id) as typeof ms.menus;
      audit(draft, "cms", "menu_delete", String(id));
    });
    res.json({ ok: true });
  });

  adminRouter.post("/admin/social_links", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const rows = ms.socials as unknown as Array<Record<string, unknown>>;
      const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
      rows.push({
        id: nextId,
        icon: String(body.icon ?? ""),
        url: String(body.url ?? ""),
        link_order: Number(body.link_order) || nextId,
        is_active: String(body.is_active ?? "1"),
      });
      ms.socials = rows as typeof ms.socials;
    });
    res.status(201).json({ ok: true });
  });

  adminRouter.put("/admin/social_links/:id", (req, res) => {
    const id = Number(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    let ok = false;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      ms.socials = (ms.socials as unknown as Array<Record<string, unknown>>).map((r) => {
        if (Number(r.id) !== id) return r as (typeof ms.socials)[number];
        ok = true;
        return {
          ...r,
          icon: String(body.icon ?? r.icon ?? ""),
          url: String(body.url ?? r.url ?? ""),
          link_order: Number(body.link_order) || Number(r.link_order) || 0,
          is_active: String(body.is_active ?? r.is_active ?? "1"),
          id,
        } as (typeof ms.socials)[number];
      });
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.delete("/admin/social_links/:id", (req, res) => {
    const id = Number(req.params.id);
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      ms.socials = (ms.socials as unknown as Array<Record<string, unknown>>).filter((r) => Number(r.id) !== id) as typeof ms.socials;
    });
    res.json({ ok: true });
  });

  adminRouter.post("/admin/footer_links", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const rows = ms.footerLinks as unknown as Array<Record<string, unknown>>;
      const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
      rows.push({
        id: nextId,
        group_name: String(body.group_name ?? "Product"),
        name: String(body.name ?? ""),
        url: String(body.url ?? ""),
        link_order: Number(body.link_order) || nextId,
        is_active: String(body.is_active ?? "1"),
      });
      ms.footerLinks = rows as typeof ms.footerLinks;
    });
    res.status(201).json({ ok: true });
  });

  adminRouter.put("/admin/footer_links/:id", (req, res) => {
    const id = Number(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    let ok = false;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      ms.footerLinks = (ms.footerLinks as unknown as Array<Record<string, unknown>>).map((r) => {
        if (Number(r.id) !== id) return r as (typeof ms.footerLinks)[number];
        ok = true;
        return {
          ...r,
          group_name: String(body.group_name ?? r.group_name ?? ""),
          name: String(body.name ?? r.name ?? ""),
          url: String(body.url ?? r.url ?? ""),
          link_order: Number(body.link_order) || Number(r.link_order) || 0,
          is_active: String(body.is_active ?? r.is_active ?? "1"),
          id,
        } as (typeof ms.footerLinks)[number];
      });
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.delete("/admin/footer_links/:id", (req, res) => {
    const id = Number(req.params.id);
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      ms.footerLinks = (ms.footerLinks as unknown as Array<Record<string, unknown>>).filter((r) => Number(r.id) !== id) as typeof ms.footerLinks;
    });
    res.json({ ok: true });
  });

  const crudCmsList = (
    pathSeg: string,
    pick: (c: MarketingCmsState) => Array<Record<string, unknown> & { id?: number }>,
    place: (c: MarketingCmsState, rows: Array<Record<string, unknown> & { id?: number }>) => void,
  ) => {
    adminRouter.post(`/admin/${pathSeg}`, (req, res) => {
      db.mutate((draft) => {
        const c = ensureCmsDraft(draft);
        const rows = [...pick(c)];
        const nextId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
        rows.push({ ...(req.body as Record<string, unknown>), id: nextId });
        place(c, rows);
        audit(draft, "cms", `${pathSeg}_create`, String(nextId));
      });
      res.status(201).json({ ok: true });
    });
    adminRouter.put(`/admin/${pathSeg}/:id`, (req, res) => {
      const id = Number(req.params.id);
      let ok = false;
      db.mutate((draft) => {
        const c = ensureCmsDraft(draft);
        const rows = pick(c).map((r) => {
          if (Number(r.id) !== id) return r;
          ok = true;
          return { ...r, ...(req.body as Record<string, unknown>), id };
        });
        place(c, rows);
      });
      if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true });
    });
    adminRouter.delete(`/admin/${pathSeg}/:id`, (req, res) => {
      const id = Number(req.params.id);
      db.mutate((draft) => {
        const c = ensureCmsDraft(draft);
        const rows = pick(c).filter((r) => Number(r.id) !== id);
        place(c, rows);
      });
      res.json({ ok: true });
    });
  };

  crudCmsList(
    "sitemaps",
    (c) => c.sitemaps as unknown as Array<Record<string, unknown> & { id?: number }>,
    (c, rows) => {
      c.sitemaps = rows as MarketingCmsState["sitemaps"];
    },
  );
  crudCmsList(
    "shipping_methods",
    (c) => c.shippingMethods as unknown as Array<Record<string, unknown> & { id?: number }>,
    (c, rows) => {
      c.shippingMethods = rows as MarketingCmsState["shippingMethods"];
    },
  );
  crudCmsList(
    "product_categories",
    (c) => c.productCategories as unknown as Array<Record<string, unknown> & { id?: number }>,
    (c, rows) => {
      c.productCategories = rows as MarketingCmsState["productCategories"];
    },
  );

  adminRouter.post("/admin/languages", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (!c.languages) c.languages = seedLangRowsFromDefaults();
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    let ok = false;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (!c.languages) c.languages = seedLangRowsFromDefaults();
      c.languages = c.languages.map((r) => {
        if (Number(r.id) !== id) return r;
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
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.delete("/admin/languages/:id", (req, res) => {
    const id = Number(req.params.id);
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (!c.languages) c.languages = seedLangRowsFromDefaults();
      c.languages = c.languages.filter((r) => Number(r.id) !== id);
      if (!c.languages.length) c.languages = null;
    });
    res.json({ ok: true });
  });

  adminRouter.post("/admin/currencies", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (!c.currencies) c.currencies = seedCurrencyRowsFromDefaults();
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    let ok = false;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (!c.currencies) c.currencies = seedCurrencyRowsFromDefaults();
      c.currencies = c.currencies.map((r) => {
        if (Number(r.id) !== id) return r;
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
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.delete("/admin/currencies/:id", (req, res) => {
    const id = Number(req.params.id);
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (!c.currencies) c.currencies = seedCurrencyRowsFromDefaults();
      c.currencies = c.currencies.filter((r) => Number(r.id) !== id);
      if (!c.currencies.length) c.currencies = null;
    });
    res.json({ ok: true });
  });

  adminRouter.post("/admin/blogs", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    let idOut = 0;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      const rows = c.blogs;
      const nextId =
        rows.reduce((m, r) => Math.max(m, Number((r as { id?: unknown }).id) || 0), 0) + 1;
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    let ok = false;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.blogs = c.blogs.map((row) => {
        const rid = Number((row as { id?: unknown }).id);
        if (rid !== id) return row;
        ok = true;
        return {
          ...row,
          title: String(body.title ?? (row as { title?: string }).title ?? ""),
          slug: String(body.slug ?? (row as { slug?: string }).slug ?? ""),
          status: String(body.status ?? (row as { status?: string }).status ?? "draft"),
          featured_image: String(body.featured_image ?? (row as { featured_image?: string }).featured_image ?? ""),
          meta_title: String(body.meta_title ?? (row as { meta_title?: string }).meta_title ?? ""),
          meta_description: String(body.meta_description ?? (row as { meta_description?: string }).meta_description ?? ""),
          excerpt: String(body.excerpt ?? (row as { excerpt?: string }).excerpt ?? ""),
          body: String(body.body ?? (row as { body?: string }).body ?? ""),
          updated_at: now,
        };
      });
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.delete("/admin/blogs/:id", (req, res) => {
    const id = Number(req.params.id);
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.blogs = c.blogs.filter((row) => Number((row as { id?: unknown }).id) !== id);
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/seo/:pageKey", (req, res) => {
    const pageKey = String(req.params.pageKey);
    const body = (req.body ?? {}) as Record<string, string>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const metaTitle = String(body.meta_title ?? "").trim();
      const metaDesc = String(body.meta_description ?? "").trim();
      const metaKw = String(body.meta_keywords ?? metaTitle).trim();
      ms.seo = ms.seo.map((row: { page_key?: string } & Record<string, unknown>) =>
        row.page_key === pageKey
          ? { ...row, meta_title: metaTitle, meta_description: metaDesc, meta_keywords: metaKw || metaTitle }
          : row,
      ) as typeof ms.seo;
      audit(draft, "cms", "seo_update", pageKey);
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/permalinks/:pageKey", (req, res) => {
    const pageKey = String(req.params.pageKey);
    const slug = String((req.body as { slug?: string })?.slug ?? "").trim();
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.permalinks = c.permalinks.map((p) =>
        p.page_key === pageKey ? { ...p, slug } : p,
      );
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/payment-gateways/:code", (req, res) => {
    const code = String(req.params.code);
    const body = (req.body ?? {}) as { title?: string; status?: string; config?: Record<string, unknown> };
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      ms.gateways = ms.gateways.map((g) => {
        if (g.code !== code) return g;
        const nextConfig =
          body.config != null && typeof body.config === "object"
            ? { ...(g.config as object), ...(body.config as object) }
            : g.config;
        return {
          ...(g as object),
          title: body.title != null ? String(body.title) : g.title,
          ...(body.status != null ? { status: String(body.status) } : {}),
          config: nextConfig,
        } as (typeof ms.gateways)[number];
      });
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/maintenance", (req, res) => {
    const patch = (req.body ?? {}) as Record<string, unknown>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      ms.maintenance = { ...(ms.maintenance as object), ...patch } as typeof ms.maintenance;
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/footer", (req, res) => {
    const patch = (req.body ?? {}) as Record<string, unknown>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      ms.footer = { ...(ms.footer as object), ...patch } as typeof ms.footer;
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/mail", (req, res) => {
    const patch = (req.body ?? {}) as Record<string, string>;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.mail = { ...c.mail, ...patch };
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/documentation", (req, res) => {
    const patch = (req.body ?? {}) as { pdfUrl?: string; pdfButtonLabel?: string };
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (patch.pdfUrl != null) c.documentation.pdfUrl = String(patch.pdfUrl);
      if (patch.pdfButtonLabel != null) c.documentation.pdfButtonLabel = String(patch.pdfButtonLabel);
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/contact", (req, res) => {
    const patch = (req.body ?? {}) as Record<string, string>;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.contact = { ...c.contact, ...patch };
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/translations", (req, res) => {
    const body = (req.body ?? {}) as Record<string, Record<string, string>>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const tr = { ...(ms.translations as Record<string, Record<string, string>>) };
      for (const [lang, piece] of Object.entries(body)) {
        if (!piece || typeof piece !== "object") continue;
        tr[lang] = { ...(tr[lang] ?? {}), ...piece };
      }
      ms.translations = tr as typeof ms.translations;
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/translated_features", (req, res) => {
    const body = (req.body ?? {}) as Record<string, Array<Record<string, string>>>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const tf = { ...(ms.translatedFeatures as Record<string, unknown>) };
      for (const [lang, rows] of Object.entries(body)) {
        if (!Array.isArray(rows)) continue;
        tf[lang] = rows.map((item) => ({
          title: String(item.title ?? ""),
          description: String(item.description ?? ""),
        }));
      }
      ms.translatedFeatures = tf as typeof ms.translatedFeatures;
    });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/settings/content_pages", (req, res) => {
    const body = (req.body ?? {}) as Record<string, Record<string, Record<string, string>>>;
    db.mutate((draft) => {
      const ms = ensureMs(draft);
      const cp = { ...(ms.contentPages as Record<string, Record<string, Record<string, string>>>) };
      for (const [lang, slugMap] of Object.entries(body)) {
        if (!slugMap || typeof slugMap !== "object") continue;
        const cur = { ...(cp[lang] ?? {}) };
        for (const [slug, fields] of Object.entries(slugMap)) {
          cur[slug] = { ...(cur[slug] ?? {}), ...fields };
        }
        cp[lang] = cur;
      }
      ms.contentPages = cp as typeof ms.contentPages;
    });
    res.json({ ok: true });
  });

  adminRouter.post("/admin/contact/broadcast", (_req, res) => {
    const n = db.read().notifySubscribers.length;
    db.mutate((draft) => {
      audit(draft, "cms", "contact_broadcast_skipped", "notify_subscribers", { note: "no_smtp", count: n });
    });
    res.json({ ok: true, recipients: n, message: "Logged only — configure SMTP in mail settings to send." });
  });

  adminRouter.put("/admin/contact-messages/:id", (req, res) => {
    const id = String(req.params.id);
    const status = String((req.body as { status?: string })?.status ?? "read");
    let ok = false;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.contactMessages = c.contactMessages.map((m) => {
        if (m.id !== id) return m;
        ok = true;
        return { ...m, status };
      });
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.put("/admin/admins/me", (req, res) => {
    const body = (req.body ?? {}) as Record<string, string>;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      if (!c.cmsAdmins.length) c.cmsAdmins.push({ id: 1, name: "Administrator", email: "admin", username: "admin", role: "super_admin" });
      const primary = { ...c.cmsAdmins[0] };
      if (body.name != null) primary.name = body.name.trim();
      if (body.email != null) primary.email = body.email.trim();
      if (body.username != null) primary.username = body.username.trim();
      if (body.newPassword?.trim()) {
        primary.passwordHash = `stored:${crypto.createHash("sha256").update(body.newPassword.trim()).digest("hex")}`;
      }
      c.cmsAdmins[0] = primary;
    });
    const fresh = db.read();
    const row = fresh.marketingCms?.cmsAdmins[0];
    const adminOut = row ? stripAdminPasswords([row])[0] : { id: 1, name: "Administrator", email: "admin@local", username: "admin", role: "super_admin" };
    res.json({ ok: true, admin: { ...adminOut, id: Number(adminOut.id ?? 1) } });
  });

  adminRouter.post("/admin/admins", (req, res) => {
    const body = (req.body ?? {}) as Record<string, string>;
    if (!body.password?.trim()) return res.status(400).json({ ok: false, error: "password_required" });
    let idOut = 0;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      const nextId = c.cmsAdmins.reduce((m, a) => Math.max(m, a.id), 0) + 1;
      idOut = nextId;
      c.cmsAdmins.push({
        id: nextId,
        name: body.name.trim(),
        email: body.email.trim(),
        username: (body.username ?? "").trim(),
        role: body.role === "super_admin" ? "super_admin" : "admin",
        passwordHash: `stored:${crypto.createHash("sha256").update(body.password.trim()).digest("hex")}`,
      });
    });
    res.status(201).json({ ok: true, id: idOut });
  });

  adminRouter.put("/admin/admins/:id", (req, res) => {
    const id = Number(req.params.id);
    const body = (req.body ?? {}) as Record<string, string>;
    let ok = false;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.cmsAdmins = c.cmsAdmins.map((a) => {
        if (a.id !== id) return a;
        ok = true;
        const next = { ...a, name: body.name ?? a.name, email: body.email ?? a.email, username: body.username ?? a.username };
        if (body.role === "super_admin" || body.role === "admin") next.role = body.role;
        if (body.newPassword?.trim()) next.passwordHash = `stored:${crypto.createHash("sha256").update(body.newPassword.trim()).digest("hex")}`;
        return next;
      });
    });
    if (!ok) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true });
  });

  adminRouter.delete("/admin/admins/:id", (req, res) => {
    const id = Number(req.params.id);
    const data = db.read();
    if (data.marketingCms?.cmsAdmins.length === 1) {
      return res.status(400).json({ ok: false, error: "cannot_remove_last_admin" });
    }
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.cmsAdmins = c.cmsAdmins.filter((a) => a.id !== id);
    });
    res.json({ ok: true });
  });

  adminRouter.post("/admin/upload", upload.single("image"), (req, res) => {
    if (!req.file?.filename) return res.status(400).json({ error: "file_required" });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  adminRouter.post("/admin/upload/pdf", upload.single("pdf"), (req, res) => {
    if (!req.file?.filename) return res.status(400).json({ error: "file_required" });
    const url = `/uploads/${req.file.filename}`;
    db.mutate((draft) => {
      const c = ensureCmsDraft(draft);
      c.documentation.pdfUrl = url;
    });
    res.json({ ok: true, url });
  });
}

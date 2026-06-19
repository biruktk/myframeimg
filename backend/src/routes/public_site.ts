import crypto from "crypto";
import express, { Request, Response, Router } from "express";

import {
  currencyForCountry,
  normalizeCountryCode,
} from "../../../lib/geo-language";
import { lookupGeoByIp } from "../../../lib/geo-lookup";
import { db, marketingCmsSeed } from "../db/store";
import { defaultBlogPosts, publishedBlogs } from "../data/blog_defaults";
import { getPublicSitePayload, priceBySkuFromDb } from "../services/marketing_public";

export const publicSiteRouter = Router();
publicSiteRouter.use(express.json({ limit: "512kb" }));

function appendAudit(actor: string, action: string, target: string, meta?: Record<string, unknown>) {
  db.mutate((draft) => {
    draft.auditLog.unshift({
      id: `audit_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      actor,
      action,
      target,
      atMs: Date.now(),
      meta,
    });
  });
}

function appendCommerceSold(orderId: string, sku: string, quantity: number) {
  db.mutate((draft) => {
    draft.commerceEvents.unshift({
      id: `ce_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      type: "items_sold",
      quantity,
      sku,
      orderId,
      atMs: Date.now(),
      meta: null,
    });
  });
}

function nextOrderNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `MF-${t}-${r}`;
}

function getClientIp(req: Request) {
  const forwarded = String(req.header("x-forwarded-for") ?? "").split(",")[0]?.trim();
  const realIp = String(req.header("x-real-ip") ?? "").trim();
  const ip = forwarded || realIp || req.ip || "";
  return ip.replace(/^::ffff:/, "");
}

function shippingEstimateForCountry(countryCodeRaw: string) {
  const countryCode = normalizeCountryCode(countryCodeRaw);
  if (["HK", "MO"].includes(countryCode)) {
    return { price: 8, currency: "USD", minDays: 1, maxDays: 2, service: "Hong Kong local courier" };
  }
  if (["CN", "TW"].includes(countryCode)) {
    return { price: 12, currency: "USD", minDays: 3, maxDays: 5, service: "Regional express from Hong Kong" };
  }
  if (["JP", "KR", "SG", "MY", "TH", "VN", "PH", "ID"].includes(countryCode)) {
    return { price: 18, currency: "USD", minDays: 4, maxDays: 7, service: "Asia express from Hong Kong" };
  }
  if (["US", "CA", "MX"].includes(countryCode)) {
    return { price: 26, currency: "USD", minDays: 6, maxDays: 10, service: "International express from Hong Kong" };
  }
  if (["GB", "FR", "DE", "ES", "IT", "NL", "BE", "SE", "DK", "NO", "FI", "IE", "AT", "CH", "PT", "PL"].includes(countryCode)) {
    return { price: 28, currency: "USD", minDays: 7, maxDays: 12, service: "International express from Hong Kong" };
  }
  return { price: 35, currency: "USD", minDays: 8, maxDays: 15, service: "International tracked shipping from Hong Kong" };
}

/** GET /api/public/site — CMS JSON persisted in DB (`marketingSite`). */
publicSiteRouter.get("/public/site", (_req: Request, res: Response) => {
  res.json(getPublicSitePayload());
});

/** GET /api/public/blogs — published blog cards for the marketing blog. */
publicSiteRouter.get("/public/blogs", (_req: Request, res: Response) => {
  const blogs = db.read().marketingCms?.blogs;
  res.json(publishedBlogs(blogs?.length ? blogs : defaultBlogPosts));
});

/** GET /api/public/blogs/by-slug/:slug — published blog detail. */
publicSiteRouter.get("/public/blogs/by-slug/:slug", (req: Request, res: Response) => {
  const slug = String(req.params.slug ?? "").trim();
  const cmsBlogs = db.read().marketingCms?.blogs;
  const blogs = publishedBlogs(cmsBlogs?.length ? cmsBlogs : defaultBlogPosts);
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

/** GET /api/public/location — live IP geo → language + currency suggestion. */
publicSiteRouter.get("/public/location", async (req: Request, res: Response) => {
  const acceptLanguage = String(req.header("accept-language") ?? "");
  const ip = getClientIp(req);
  const geo = await lookupGeoByIp(ip, acceptLanguage);
  const shipping = shippingEstimateForCountry(geo.countryCode || "US");
  res.json({
    ...geo,
    shipping,
  });
});

/** GET /api/public/shipping-estimate?country=US — automatic estimate from Hong Kong. */
publicSiteRouter.get("/public/shipping-estimate", (req: Request, res: Response) => {
  const country = String(req.query.country ?? req.query.countryCode ?? "").trim().toUpperCase();
  const fallback = String(req.query.fallbackCountry ?? "").trim().toUpperCase();
  const estimate = shippingEstimateForCountry(country || fallback || "US");
  res.json({ ok: true, origin: "HK", countryCode: country || fallback || "US", ...estimate });
});

/** GET /api/public/customer-profile */
publicSiteRouter.get("/public/customer-profile", (_req: Request, res: Response) => {
  res.json({ ok: true, customer: null });
});

/** POST /api/public/subscribers — “notify me” on coming-soon SKU */
publicSiteRouter.post("/public/subscribers", (req: Request, res: Response) => {
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
  const id = `sub_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  db.mutate((draft) => {
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

/** POST /api/public/contact-messages — website contact form inbox. */
publicSiteRouter.post("/public/contact-messages", (req: Request, res: Response) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const subject = String(req.body?.subject ?? "").trim();
  const message = String(req.body?.message ?? "").trim();
  if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_contact_message" });
    return;
  }
  const id = `msg_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  db.mutate((draft) => {
    if (!draft.marketingCms) draft.marketingCms = marketingCmsSeed();
    draft.marketingCms.contactMessages.unshift({
      id,
      name: name.slice(0, 120),
      email: email.slice(0, 190),
      subject: subject.slice(0, 240),
      message: message.slice(0, 8000),
      status: "new",
      created_at: new Date().toISOString(),
    });
  });
  appendAudit("marketing_site", "contact_message_created", id, { email, subject });
  res.status(201).json({ ok: true, id });
});

/** POST /api/public/orders */
publicSiteRouter.post("/public/orders", (req: Request, res: Response) => {
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
  const cityCountry =
    cityCountryRaw ||
    [city, country].filter(Boolean).join(", ") ||
    undefined;
  if (!customerName || !email || !address || (!city && !country && !cityCountryRaw)) {
    res.status(400).json({ ok: false, error: "buyer_fields_required" });
    return;
  }
  const gatewayIn = String(req.body?.gateway ?? "stripe").trim().toLowerCase();
  const gateway = gatewayIn === "paypal" ? "paypal" : "stripe";
  const currency = String(req.body?.currency ?? "USD").trim().toUpperCase();
  const language = String(req.body?.language ?? "").trim() || undefined;
  const note = String(req.body?.note ?? "").trim() || undefined;
  const isGift = Boolean(req.body?.is_gift);

  const priceMap = priceBySkuFromDb();
  const lines: Array<{ sku: string; name?: string; quantity: number; unitPrice: number; lineTotal: number }> = [];
  let subtotal = 0;
  for (const row of itemsIn) {
    const sku = String(row?.sku ?? "").trim();
    const quantity = Math.max(0, Math.min(99, Math.round(Number(row?.quantity ?? row?.qty) || 0)));
    if (!sku || quantity <= 0) continue;
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
  const shipping = Math.max(0, Number(req.body?.shipping ?? shippingEstimateForCountry(String(country || "")).price) || 0);
  const total = subtotal + shipping;
  const now = Date.now();
  const orderNumber = nextOrderNumber();
  const id = `ord_${now}_${crypto.randomBytes(3).toString("hex")}`;

  db.mutate((draft) => {
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
      paymentStatus: "pending",
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

publicSiteRouter.post("/public/payments/stripe/session", (_req: Request, res: Response) => {
  res.status(501).json({ ok: false, error: "stripe_not_configured", message: "Configure Stripe keys on the server." });
});

publicSiteRouter.post("/public/payments/paypal/create-order", (_req: Request, res: Response) => {
  res.status(501).json({ ok: false, error: "paypal_not_configured" });
});

publicSiteRouter.post("/public/payments/paypal/capture-order", (_req: Request, res: Response) => {
  res.status(501).json({ ok: false, error: "paypal_not_configured" });
});

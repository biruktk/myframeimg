import express from "express";
import crypto from "crypto";
import { db } from "../db/store";
import { requireWechatMiniSecret } from "../middleware/security";

/**
 * Endpoints intended for WeChat Mini Program backend (trusted server → MyFrame API).
 * Auth: Bearer token OR `x-wechat-mini-secret` matching env `WECHAT_MINI_API_SECRET`.
 */

export const miniProgramRouter = express.Router();

miniProgramRouter.use(express.json({ limit: "256kb" }));

miniProgramRouter.post("/mini-program/items-sold", requireWechatMiniSecret, (req, res) => {
  const qty = Number(req.body?.quantity ?? req.body?.items_sold ?? req.body?.sold);
  if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000) {
    res.status(400).json({ ok: false, error: "invalid_quantity", hint: "0 <= quantity <= 1000000" });
    return;
  }
  if (!Number.isInteger(qty)) {
    res.status(400).json({ ok: false, error: "quantity_must_be_integer" });
    return;
  }

  const skuRaw = req.body?.sku;
  const orderRaw = req.body?.order_id ?? req.body?.orderId;
  const sku = skuRaw === null || skuRaw === undefined ? null : String(skuRaw).trim().slice(0, 128) || null;
  const orderId =
    orderRaw === null || orderRaw === undefined ? null : String(orderRaw).trim().slice(0, 128) || null;
  let atMs = Number(req.body?.reported_at_ms ?? req.body?.atMs ?? Date.now());
  if (!Number.isFinite(atMs)) atMs = Date.now();

  let meta: Record<string, unknown> | null = null;
  const m = req.body?.meta;
  if (m !== null && m !== undefined && typeof m === "object" && !Array.isArray(m)) {
    meta = m as Record<string, unknown>;
  }

  const id = `sale_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

  db.mutate((draft) => {
    draft.commerceEvents.unshift({
      id,
      type: "items_sold",
      quantity: qty,
      sku,
      orderId,
      atMs,
      meta,
    });
    if (draft.commerceEvents.length > 50_000) {
      draft.commerceEvents = draft.commerceEvents.slice(0, 50_000);
    }
  });

  res.status(201).json({ ok: true, id, quantity: qty, recorded_at_ms: atMs });
});

miniProgramRouter.get("/mini-program/items-sold/summary", requireWechatMiniSecret, (_req, res) => {
  const data = db.read();
  const sold = data.commerceEvents.filter((e) => e.type === "items_sold");
  const totalQuantity = sold.reduce((a, e) => a + e.quantity, 0);
  const last = sold.length ? sold[0] : null;
  res.json({
    ok: true,
    total_quantity: totalQuantity,
    events_count: sold.length,
    last_event: last
      ? { id: last.id, quantity: last.quantity, sku: last.sku, orderId: last.orderId, atMs: last.atMs }
      : null,
  });
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.miniProgramRouter = void 0;
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const store_1 = require("../db/store");
const security_1 = require("../middleware/security");
/**
 * Endpoints intended for WeChat Mini Program backend (trusted server → MyFrame API).
 * Auth: Bearer token OR `x-wechat-mini-secret` matching env `WECHAT_MINI_API_SECRET`.
 */
exports.miniProgramRouter = express_1.default.Router();
exports.miniProgramRouter.use(express_1.default.json({ limit: "256kb" }));
exports.miniProgramRouter.post("/mini-program/items-sold", security_1.requireWechatMiniSecret, (req, res) => {
    const qty = Number(req.body?.quantity ?? req.body?.items_sold ?? req.body?.sold);
    if (!Number.isFinite(qty) || qty < 0 || qty > 1000000) {
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
    const orderId = orderRaw === null || orderRaw === undefined ? null : String(orderRaw).trim().slice(0, 128) || null;
    let atMs = Number(req.body?.reported_at_ms ?? req.body?.atMs ?? Date.now());
    if (!Number.isFinite(atMs))
        atMs = Date.now();
    let meta = null;
    const m = req.body?.meta;
    if (m !== null && m !== undefined && typeof m === "object" && !Array.isArray(m)) {
        meta = m;
    }
    const id = `sale_${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}`;
    store_1.db.mutate((draft) => {
        draft.commerceEvents.unshift({
            id,
            type: "items_sold",
            quantity: qty,
            sku,
            orderId,
            atMs,
            meta,
        });
        if (draft.commerceEvents.length > 50000) {
            draft.commerceEvents = draft.commerceEvents.slice(0, 50000);
        }
    });
    res.status(201).json({ ok: true, id, quantity: qty, recorded_at_ms: atMs });
});
exports.miniProgramRouter.get("/mini-program/items-sold/summary", security_1.requireWechatMiniSecret, (_req, res) => {
    const data = store_1.db.read();
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

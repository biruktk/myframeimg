import { Router } from "express";
import { db } from "../db/store";
import { requireAdminToken } from "../middleware/security";

export const adminRouter = Router();
adminRouter.use(requireAdminToken);

function serialFromDeviceId(id: string): string {
  const m = id.match(/(\d+)(?!.*\d)/);
  return m ? m[1] : "--";
}

adminRouter.get("/admin/overview", (_req, res) => {
  const data = db.read();
  res.json({
    totalUploads: data.uploads.length,
    totalFaqs: data.faqs.length,
    photoCount: data.device.photoCount,
    lastPhotoAtMs: data.device.lastPhotoAtMs,
    connected: data.device.connected,
    deviceId: data.device.id,
    deviceSn: serialFromDeviceId(data.device.id),
    usedBytes: data.device.usedBytes,
    capacityBytes: data.device.capacityBytes,
  });
});

adminRouter.get("/admin/faqs", (_req, res) => {
  const data = db.read();
  res.json(data.faqs);
});

adminRouter.post("/admin/faqs", (req, res) => {
  const q = String(req.body?.question ?? "").trim();
  const a = String(req.body?.answer ?? "").trim();
  if (!q || !a) {
    res.status(400).json({ ok: false, error: "question_and_answer_required" });
    return;
  }
  const now = Date.now();
  const id = `faq_${now}_${Math.random().toString(16).slice(2, 8)}`;
  const next = db.mutate((draft) => {
    draft.faqs.unshift({ id, question: q, answer: a, updatedAtMs: now });
  });
  res.status(201).json(next.faqs[0]);
});

adminRouter.put("/admin/faqs/:id", (req, res) => {
  const id = String(req.params.id);
  const q = String(req.body?.question ?? "").trim();
  const a = String(req.body?.answer ?? "").trim();
  if (!q || !a) {
    res.status(400).json({ ok: false, error: "question_and_answer_required" });
    return;
  }
  let updated = false;
  const now = Date.now();
  const next = db.mutate((draft) => {
    draft.faqs = draft.faqs.map((f) => {
      if (f.id !== id) return f;
      updated = true;
      return { ...f, question: q, answer: a, updatedAtMs: now };
    });
  });
  if (!updated) {
    res.status(404).json({ ok: false, error: "faq_not_found" });
    return;
  }
  res.json(next.faqs.find((f) => f.id === id));
});

adminRouter.delete("/admin/faqs/:id", (req, res) => {
  const id = String(req.params.id);
  let deleted = false;
  db.mutate((draft) => {
    const before = draft.faqs.length;
    draft.faqs = draft.faqs.filter((f) => f.id !== id);
    deleted = draft.faqs.length < before;
  });
  if (!deleted) {
    res.status(404).json({ ok: false, error: "faq_not_found" });
    return;
  }
  res.json({ ok: true });
});

import { Router } from "express";
import { db } from "../db/store";

export const faqRouter = Router();

faqRouter.get("/faqs", (_req, res) => {
  const data = db.read();
  res.json(
    data.faqs.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      updatedAtMs: f.updatedAtMs,
    })),
  );
});

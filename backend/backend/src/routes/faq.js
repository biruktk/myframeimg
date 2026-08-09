"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.faqRouter = void 0;
const express_1 = require("express");
const store_1 = require("../db/store");
exports.faqRouter = (0, express_1.Router)();
exports.faqRouter.get("/faqs", (_req, res) => {
    const data = store_1.db.read();
    res.json(data.faqs.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        updatedAtMs: f.updatedAtMs,
    })));
});

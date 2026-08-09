"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
const express_1 = require("express");
const store_1 = require("../db/store");
const security_1 = require("../middleware/security");
exports.settingsRouter = (0, express_1.Router)();
exports.settingsRouter.get("/settings", (_req, res) => {
    const data = store_1.db.read();
    res.json(data.settings);
});
exports.settingsRouter.put("/settings", security_1.requireAdminToken, (req, res) => {
    const body = req.body;
    const next = store_1.db.mutate((draft) => {
        if (body.account) {
            if (typeof body.account.name === "string")
                draft.settings.account.name = body.account.name.trim();
            if (typeof body.account.email === "string")
                draft.settings.account.email = body.account.email.trim();
            if (body.account.birthday === null || typeof body.account.birthday === "string") {
                draft.settings.account.birthday = body.account.birthday;
            }
        }
        if (body.notifications) {
            if (typeof body.notifications.birthdayReminders === "boolean") {
                draft.settings.notifications.birthdayReminders = body.notifications.birthdayReminders;
            }
            if (typeof body.notifications.uploadAlerts === "boolean")
                draft.settings.notifications.uploadAlerts = body.notifications.uploadAlerts;
            if (typeof body.notifications.offlineAlerts === "boolean")
                draft.settings.notifications.offlineAlerts = body.notifications.offlineAlerts;
        }
        if (body.preferences) {
            if (body.preferences.theme === "light" || body.preferences.theme === "dark" || body.preferences.theme === "system") {
                draft.settings.preferences.theme = body.preferences.theme;
            }
            if (typeof body.preferences.autoRotateMinutes === "number" && Number.isFinite(body.preferences.autoRotateMinutes)) {
                draft.settings.preferences.autoRotateMinutes = Math.max(1, Math.min(240, Math.round(body.preferences.autoRotateMinutes)));
            }
            if (typeof body.preferences.autoSync === "boolean")
                draft.settings.preferences.autoSync = body.preferences.autoSync;
        }
        if (body.integrations) {
            if (typeof body.integrations.googlePhotosConnected === "boolean") {
                draft.settings.integrations.googlePhotosConnected = body.integrations.googlePhotosConnected;
            }
            if (typeof body.integrations.icloudConnected === "boolean")
                draft.settings.integrations.icloudConnected = body.integrations.icloudConnected;
            if (typeof body.integrations.wechatConnected === "boolean")
                draft.settings.integrations.wechatConnected = body.integrations.wechatConnected;
        }
    });
    res.json(next.settings);
});
exports.settingsRouter.put("/settings/account", security_1.requireAdminToken, (req, res) => {
    const body = req.body;
    const next = store_1.db.mutate((draft) => {
        if (typeof body.name === "string")
            draft.settings.account.name = body.name.trim();
        if (typeof body.email === "string")
            draft.settings.account.email = body.email.trim();
        if (body.birthday === null || typeof body.birthday === "string")
            draft.settings.account.birthday = body.birthday;
    });
    res.json(next.settings.account);
});
exports.settingsRouter.put("/settings/notifications", security_1.requireAdminToken, (req, res) => {
    const body = req.body;
    const next = store_1.db.mutate((draft) => {
        if (typeof body.birthdayReminders === "boolean")
            draft.settings.notifications.birthdayReminders = body.birthdayReminders;
        if (typeof body.uploadAlerts === "boolean")
            draft.settings.notifications.uploadAlerts = body.uploadAlerts;
        if (typeof body.offlineAlerts === "boolean")
            draft.settings.notifications.offlineAlerts = body.offlineAlerts;
    });
    res.json(next.settings.notifications);
});
exports.settingsRouter.put("/settings/preferences", security_1.requireAdminToken, (req, res) => {
    const body = req.body;
    const next = store_1.db.mutate((draft) => {
        if (body.theme === "light" || body.theme === "dark" || body.theme === "system") {
            draft.settings.preferences.theme = body.theme;
        }
        if (typeof body.autoRotateMinutes === "number" && Number.isFinite(body.autoRotateMinutes)) {
            draft.settings.preferences.autoRotateMinutes = Math.max(1, Math.min(240, Math.round(body.autoRotateMinutes)));
        }
        if (typeof body.autoSync === "boolean")
            draft.settings.preferences.autoSync = body.autoSync;
    });
    res.json(next.settings.preferences);
});
exports.settingsRouter.put("/settings/integrations", security_1.requireAdminToken, (req, res) => {
    const body = req.body;
    const next = store_1.db.mutate((draft) => {
        if (typeof body.googlePhotosConnected === "boolean") {
            draft.settings.integrations.googlePhotosConnected = body.googlePhotosConnected;
        }
        if (typeof body.icloudConnected === "boolean") {
            draft.settings.integrations.icloudConnected = body.icloudConnected;
        }
        if (typeof body.wechatConnected === "boolean") {
            draft.settings.integrations.wechatConnected = body.wechatConnected;
        }
    });
    res.json(next.settings.integrations);
});

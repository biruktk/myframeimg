#!/usr/bin/env bash
# Surgical firmware OTA patch for VPS — does not replace frame_mqtt or admin wholesale.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

FW_RELEASES="${ROOT}/backend/src/data/firmware_releases.ts"
FW_OTA="${ROOT}/backend/src/services/firmware_ota.ts"
INDEX="${ROOT}/backend/src/index.ts"
USER_PORTAL="${ROOT}/backend/src/routes/user_portal.ts"
MQTT="${ROOT}/backend/src/services/frame_mqtt.ts"

test -f "${FW_RELEASES}" && test -f "${FW_OTA}"

# --- index.ts: firmware dir + /firmware static ---
if ! grep -q 'firmwareDir' "${INDEX}"; then
  python3 <<'PY'
from pathlib import Path
p = Path("backend/src/index.ts")
text = p.read_text()
needle = "if (!fs.existsSync(uploadDir)) {\n  fs.mkdirSync(uploadDir, { recursive: true });\n}\n"
insert = needle + "const firmwareDir = path.join(uploadDir, \"firmware\");\nif (!fs.existsSync(firmwareDir)) {\n  fs.mkdirSync(firmwareDir, { recursive: true });\n}\n"
if needle not in text:
    raise SystemExit("index.ts uploadDir block not found")
text = text.replace(needle, insert, 1)
static_needle = """app.use("/frame-media", (err: NodeJS.ErrnoException, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && ((err as NodeJS.ErrnoException & { status?: number }).status === 404 || err.code === "ENOENT")) {
    res.status(404).json({ ok: false, error: "media_not_found" });
    return;
  }
  next(err);
});

"""
static_block = static_needle + """/** Frame OTA binaries (`GET /firmware/myframe-firmware-x.y.z.bin`). */
app.use(
  "/firmware",
  express.static(firmwareDir, {
    etag: true,
    maxAge: "1d",
    fallthrough: false,
    index: false,
  }),
);

"""
if "app.use(\n  \"/firmware\"" in text:
    pass
elif static_needle in text:
    text = text.replace(static_needle, static_block, 1)
else:
    raise SystemExit("index.ts frame-media error handler not found")
p.write_text(text)
print("patched index.ts")
PY
fi

# --- user_portal.ts: firmware routes ---
if ! grep -q 'firmwareCheckForDevice' "${USER_PORTAL}"; then
  python3 <<'PY'
from pathlib import Path
p = Path("backend/src/routes/user_portal.ts")
text = p.read_text()
if "firmwareCheckForDevice" in text:
    raise SystemExit(0)
import_line = 'import { verifyUserJwtBearer } from "../services/app_user_jwt";\n'
add = 'import { firmwareCheckForDevice, triggerFirmwareUpdate } from "../services/firmware_ota";\n'
if add in text:
    pass
elif import_line in text:
    text = text.replace(import_line, import_line + add, 1)
else:
    raise SystemExit("user_portal jwt import anchor not found")
routes = '''
/** GET /api/user/firmware/check?deviceId= — compare frame firmware with latest release. */
userPortalRouter.get("/user/firmware/check", (req: Request, res: Response) => {
  const auth = authUser(req, res);
  if (!auth) return;
  const deviceId = String(req.query.deviceId ?? "").trim();
  if (!deviceId) {
    res.status(400).json({ ok: false, error: "device_id_required" });
    return;
  }
  const visible = visibleFrameIdsForUser(auth.userId);
  const result = firmwareCheckForDevice(deviceId, visible);
  if (!result.ok) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

/** POST /api/user/firmware/update — queue real OTA over MQTT for the user's frame. */
userPortalRouter.post("/user/firmware/update", async (req: Request, res: Response) => {
  const auth = authUser(req, res);
  if (!auth) return;
  const deviceId = String(req.body?.deviceId ?? req.body?.id ?? "").trim();
  if (!deviceId) {
    res.status(400).json({ ok: false, error: "device_id_required" });
    return;
  }
  const visible = visibleFrameIdsForUser(auth.userId);
  const outcome = await triggerFirmwareUpdate(deviceId, visible, auth.userId);
  if (!outcome.ok) {
    const status =
      outcome.error === "frame_not_found"
        ? 404
        : outcome.error === "already_up_to_date"
          ? 409
          : outcome.error === "frame_offline"
            ? 503
            : 502;
    res.status(status).json(outcome);
    return;
  }
  res.json(outcome);
});
'''
text = text.rstrip() + "\n" + routes + "\n"
p.write_text(text)
print("patched user_portal.ts")
PY
fi

# --- frame_mqtt.ts: publishOta ---
if ! grep -q 'export function publishOta' "${MQTT}"; then
  cat >> "${MQTT}" <<'TS'

export type PublishOtaInput = {
  mac: string;
  version: string;
  downloadUrl: string;
  host: string;
  port: number;
  firmwarePath: string;
};

/** Publish OTA command — device downloads [firmwarePath] via HTTP from [host]:[port]. */
export function publishOta(input: PublishOtaInput): Promise<void> {
  const mac = resolveMqttHardwareMac(input.mac);
  if (!mac) {
    return Promise.reject(new Error("invalid_device_id_for_mqtt_ota"));
  }
  const msgid = Date.now().toString();
  const versionTag = input.version.startsWith("v") ? input.version : `v${input.version}`;
  const payload = {
    action: "ota",
    cmd: "ota",
    msgid,
    stamac: mac,
    url: input.downloadUrl,
    version: versionTag,
    data: {
      host: input.host,
      port: input.port,
      url: input.firmwarePath,
      version: input.version.replace(/^v/i, ""),
    },
  };
  return publishFrameCommand(mac, payload, 1, "ota");
}
TS
  echo "patched frame_mqtt.ts"
fi

echo "Firmware OTA patch applied."

# --- admin.ts: real OTA push + latestFirmware in bootstrap ---
ADMIN="${ROOT}/backend/src/routes/admin.ts"
if ! grep -q 'pushFirmwareOtaToFrameById' "${ADMIN}"; then
  python3 <<'PY'
from pathlib import Path
import re
p = Path("backend/src/routes/admin.ts")
text = p.read_text()
if "pushFirmwareOtaToFrameById" in text:
    raise SystemExit(0)
anchor = 'import { attachCmsManageRoutes } from "./cms_manage_routes";\n'
add = anchor + 'import { pushFirmwareOtaToFrameById } from "../services/firmware_ota";\nimport { latestFirmwareRelease } from "../data/firmware_releases";\n'
if anchor not in text:
    raise SystemExit("admin.ts cms_manage import not found")
text = text.replace(anchor, add, 1)
old_route = re.compile(
    r'adminRouter\.post\("/admin/frames/:id/ota",[\s\S]*?res\.json\(\{ ok: true \}\);\n\}\);',
    re.M,
)
new_route = '''adminRouter.post("/admin/frames/:id/ota", async (req, res) => {
  const id = String(req.params.id);
  const version = String(req.body?.version ?? latestFirmwareRelease().version).trim();
  if (!version) {
    res.status(400).json({ ok: false, error: "version_required" });
    return;
  }
  const outcome = await pushFirmwareOtaToFrameById(id, "superadmin");
  if (!outcome.ok) {
    const status = outcome.error === "frame_not_found" ? 404 : 502;
    res.status(status).json(outcome);
    return;
  }
  res.json({ ok: true, ...outcome });
});'''
if not old_route.search(text):
    raise SystemExit("admin.ts OTA stub route not found")
text = old_route.sub(new_route, text, count=1)
if "latestFirmware: latestFirmwareRelease()" not in text:
    text = text.replace(
        "  res.json({\n    frames,\n    fleet: {",
        "  res.json({\n    frames,\n    latestFirmware: latestFirmwareRelease(),\n    fleet: {",
        1,
    )
p.write_text(text)
print("patched admin.ts")
PY
fi

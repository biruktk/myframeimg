// MyFrame Flasher — esptool-js integration.
// Single-port flow for MVP; the state machine is per-port so future multi-port
// simply calls flashOne() concurrently for each connected port.
//
// Upstream reference: https://github.com/espressif/esptool (Python) and
// https://github.com/espressif/esptool-js (JS port used here).

import { ESPLoader, Transport } from 'https://unpkg.com/esptool-js@0.6.0/bundle.js';
import * as api from './api.js';
import { decryptFirmware } from './crypto.js';
import { verifySN } from './sn.js';
import * as ui from './ui.js';
import { t } from './i18n.js';

// esptool-js writeFlash expects `data` as a Uint8Array (confirmed against the
// package's TypeScript FlashOptions definition). Passing a binary string
// silently produces zero-filled output when internal Uint8Array.set(...) is
// called on a padding path — do NOT convert.

// Format a byte array as `hex | printable` chunk preview for logs.
// `hex` shows 2-digit hex separated by spaces; non-printable bytes render as `.`
// in the printable column so binary garbage stays visible.
function hexPreview(bytes, max = 64) {
  const slice = bytes.subarray(0, Math.min(bytes.length, max));
  const hex = Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const txt = Array.from(slice).map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
  const suffix = bytes.length > max ? ` … +${bytes.length - max}B` : '';
  return `${hex}${suffix}\n  "${txt}${bytes.length > max ? '…' : ''}"`;
}

// Rewrite raw esptool-js log lines so nothing branded (ESP, ESP32, esptool,
// esp32c5 etc.) reaches the UI. Callers get either a cleaned-up MyFrame string
// or null (meaning: drop this line entirely, it's vendor noise).
function rewriteVendorStrings(s) {
  if (!s) return null;
  // Drop internal vendor noise entirely.
  if (/^\s*esptool\.js\s*$/i.test(s)) return null;
  if (/Serial port WebSerial VendorID/i.test(s)) return null;
  // Chip identity lines — collapse to a single MyFrame-branded line.
  if (/^Chip is ESP32[^\s]*/i.test(s)) {
    const rev = (s.match(/revision\s+(\S+)/i) || [])[1];
    return rev ? `MyFrame board · rev ${rev}` : `MyFrame board`;
  }
  if (/^ESP32[-\w]+$/i.test(s.trim())) return `MyFrame board`;
  if (/^Chip Revision:/i.test(s)) return null;      // duplicated by the "rev" above
  if (/^Features:/i.test(s)) return null;           // ESP-specific feature list
  if (/^Crystal is /i.test(s)) return null;         // internal
  if (/^MAC:/i.test(s)) return null;                // we log this ourselves with our own prefix
  // Everything else: strip any remaining vendor words.
  return s
    .replace(/\bESP32-?\w*/gi, 'MyFrame')
    .replace(/\besptool[-\w]*/gi, 'firmware tool')
    .replace(/\besp-rom/gi, 'ROM')
    .replace(/\besp\b/gi, 'device');
}

// ── Smoke-test checks (ordered chain, worker→app) ──
// Each check runs against the accumulated boot-log transcript. Order matters:
// if step N fails, the diagnosis for step N is what the firmware engineer
// should look at first (steps before it passed).
// Smoke-test check chain. Regex patterns MUST match the real firmware boot
// log (which contains vendor strings like "ESP-ROM:esp32c5"), but the human
// labels shown in the UI are MyFrame-branded — the operator / screenshot
// audience never sees the chip family name.
const SMOKE_CHECKS = [
  {
    id: 'bytes',
    label: '① Serial bytes received · 收到串口字节',
    match: (buf, ctx) => ctx.totalBytes > 0,
    diagnose: [
      'No bytes received — the board sent nothing after reset.',
      'Likely causes:',
      '  (a) Board did not actually reset (RTS→EN wiring / reset held low)',
      '  (b) Firmware disabled UART console output',
      '  (c) Serial port held by another process (idf monitor / Arduino Serial / stale session)',
      '  Repro: press the board RESET button and watch a serial monitor — if nothing appears, the fault is in hardware',
    ],
  },
  {
    id: 'rom_boot',
    label: '② ROM boot marker · ROM 启动行',
    match: (buf) => /ESP-ROM:esp32c5/i.test(buf),
    diagnose: [
      'Received bytes but did not see the ROM boot signature.',
      'Likely causes:',
      '  (a) UART print control fuse is blown (DIS_USB_JTAG / UART_PRINT_CONTROL)',
      '  (b) Baud mismatch between port and ROM print rate',
      '  (c) Line noise on a long / poorly-shielded USB cable',
    ],
  },
  {
    id: 'bootloader',
    label: '③ 2nd-stage bootloader · 二级 bootloader',
    match: (buf) => /boot:\s|2nd stage bootloader|SPIWP:/.test(buf),
    diagnose: [
      'ROM ran but did not hand off to the 2nd-stage bootloader.',
      'Likely causes:',
      '  (a) Bootloader image at 0x2000 is corrupt (magic byte should be E9)',
      '  (b) sdkconfig CONFIG_BOOTLOADER_LOG_LEVEL_NONE — bootloader silent',
      '  (c) Secure Boot v2 enabled but bootloader signature check failed',
      '  (d) Flash Encryption enabled but bootloader itself was not encrypted',
    ],
  },
  {
    id: 'app_start',
    label: '④ Application entry · 应用启动',
    match: (buf) => /cpu_start|app_main|main_task|entry 0x[0-9a-f]/i.test(buf),
    diagnose: [
      'Bootloader ran but the application did not start.',
      'Likely causes:',
      '  (a) Partition table (0x8000) points to an app slot but the slot (0x10000) is empty or corrupt',
      '  (b) App image magic byte failed the bootloader check',
      '  (c) app_desc.secure_version < the anti-rollback fuse counter',
      '  (d) App panics immediately after start (stack overflow / init crash) — boot loops',
      '  (e) App has UART console disabled — running but silent',
    ],
  },
];

// Run the ordered smoke-test checks against a transcript. Returns per-step
// results so the caller can log each in turn. Stops passing at first failure
// so it's clear where the boot chain broke.
function runSmokeChecks(transcript, totalBytes) {
  const results = [];
  let firstFailIdx = -1;
  for (let i = 0; i < SMOKE_CHECKS.length; i++) {
    const c = SMOKE_CHECKS[i];
    const ok = c.match(transcript, { totalBytes });
    results.push({ ...c, ok });
    if (!ok && firstFailIdx === -1) firstFailIdx = i;
  }
  return { results, firstFailIdx, allOk: firstFailIdx === -1 };
}

// Read boot log after hard reset.
//
// Baud gotcha: esptool-js escalates the transport to `transferBaud` (921600)
// during the flash phase, but the chip's own UART console after reboot runs at
// the firmware's `CONFIG_ESP_CONSOLE_UART_BAUDRATE` — 115200 for most projects.
// Reading 115200 bytes on a port set to 921600 yields garbage, so we have to
// close the port and reopen it at the console baud before reading boot output.
//
// We use the raw Web Serial API here (port.readable.getReader()) rather than
// esptool-js internals, so this function is decoupled from esptool-js version
// changes. The caller must guarantee transport.disconnect() was called first
// (so the port is not locked by esptool-js's background readLoop).
async function readSerialFor(port, consoleBaud, timeoutMs, patterns, boardLog) {
  const bl = boardLog || ((m, k) => ui.log(m, k));
  bl(`[smoke] opening port @ ${consoleBaud} baud`);
  const openStart = Date.now();
  await port.open({ baudRate: consoleBaud });
  bl(`[smoke] port opened in ${Date.now() - openStart} ms`);

  // esptool-js's after('hard_reset') fired the reset while we were still at
  // 921600 baud — boot log went out through a stream we then closed. So we
  // re-do the reset here, at the console baud, with our reader ready. This
  // matches esptool-js ClassicReset polarity: assert RTS (drives EN low via
  // the board's transistor circuit → chip resets), hold, release.
  try {
    bl('[smoke] forcing hardware reset (RTS→EN) at console baud');
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await new Promise((r) => setTimeout(r, 50));
    await port.setSignals({ dataTerminalReady: false, requestToSend: true });   // EN low → reset
    await new Promise((r) => setTimeout(r, 150));
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });  // EN high → run
    bl('[smoke] RTS released, chip should be booting now');
  } catch (e) {
    bl(`[smoke] RTS toggle failed: ${e.message} (board may not wire RTS→EN)`, 'err');
  }

  bl(`[smoke] waiting up to ${timeoutMs} ms for boot log`);
  // Note: we intentionally do not log the raw pattern strings here — they
  // contain vendor identifiers, and the SMOKE TEST RESULT block below prints
  // MyFrame-branded labels for the operator anyway.

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  let buf = '';
  let totalBytes = 0;
  let chunkNum = 0;
  const reader = port.readable.getReader();

  // Emit a "still waiting" heartbeat every 1s during the timeout window so it's
  // clear the flasher is alive vs. genuinely stuck.
  const heartbeat = setInterval(() => {
    bl(`[smoke] +${((Date.now() - startedAt) / 1000).toFixed(1)}s · received ${totalBytes} B, ${chunkNum} chunk(s), buf.len=${buf.length}`);
  }, 1000);

  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ done: true, timedOut: true }), remaining);
      });
      const result = await Promise.race([reader.read(), timeout]);
      clearTimeout(timer);

      if (result.timedOut) {
        ui.log('[smoke] deadline reached');
        break;
      }
      if (result.done) {
        ui.log('[smoke] stream closed by device');
        break;
      }
      if (result.value && result.value.length) {
        chunkNum += 1;
        totalBytes += result.value.length;
        bl(`[smoke] chunk #${chunkNum} · +${result.value.length}B (total ${totalBytes}B) @ +${Date.now() - startedAt}ms\n  ${hexPreview(result.value, 64)}`);
        buf += decoder.decode(result.value, { stream: true });
        // Log which patterns are currently matched so it's clear how close we are.
        const hits = patterns.filter((p) => buf.includes(p));
        if (hits.length > 0) {
          bl(`[smoke] matched so far: ${hits.map((h) => JSON.stringify(h)).join(', ')} (${hits.length}/${patterns.length})`);
        }
        if (patterns.every((p) => buf.includes(p))) {
          bl(`[smoke] all patterns matched — success`, 'ok');
          return { ok: true, transcript: buf, totalBytes };
        }
      }
    }
  } finally {
    clearInterval(heartbeat);
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
    try { await port.close(); } catch {}
    bl(`[smoke] port closed · totalBytes=${totalBytes} chunks=${chunkNum} elapsed=${Date.now() - startedAt}ms`);
  }
  buf += decoder.decode();
  const missing = patterns.filter((p) => !buf.includes(p));
  if (missing.length > 0) {
    bl(`[smoke] missing patterns: ${missing.map((m) => JSON.stringify(m)).join(', ')}`, 'err');
  }
  return {
    ok: patterns.every((p) => buf.includes(p)),
    transcript: buf,
    totalBytes,
  };
}

// Perform a full flash-and-verify cycle on one port.
// slotId is a stable UI key (we start with portLabel and switch to MAC once known).
export async function flashOne(port, cfg, wo) {
  const portInfo = port.getInfo?.() || {};
  // Monotonic slotId — never collides even if two ports plug in the same ms.
  const slotId = `slot-${++_slotCounter}-${portInfo.usbVendorId ?? 'x'}${portInfo.usbProductId ?? 'y'}`;
  _portToSlot.set(port, slotId);
  const boardIdx = _slotCounter;
  const started = Date.now();
  // Register with the log filter so the operator can zoom to this board's
  // events only. We'll enrich the label with MAC once chip detection returns.
  ui.registerBoardForLog(slotId, `Board ${boardIdx}`);
  // Per-slot logger; every subsequent log line from this flash is scoped so
  // debug-mode filtering can isolate it.
  const slog = (msg, kind = '') => ui.log(msg, kind, slotId);
  slog(`--- Flash session started · port ${portLabel(port)} ---`);

  // Only touch the DOM if the port is still tracked (didn't get yanked mid-op).
  // Otherwise ui.addOrUpdateSlot would resurrect a slot after disconnect
  // already removed it.
  const setStage = (stage, extra = {}) => {
    if (!_portToSlot.has(port)) return;
    ui.addOrUpdateSlot(slotId, { stage, elapsed: Date.now() - started, ...extra });
  };
  const setState = (label, kind) => {
    if (!_portToSlot.has(port)) return;
    ui.addOrUpdateSlot(slotId, { state: { label, kind } });
  };

  setState(t('state.working'), 'working');
  setStage(t('stage.connect'));

  const transport = new Transport(port, /* enableTracing */ false);
  // Baud handling in esptool-js@0.6:
  //   - `baudrate` in options is the TARGET transfer baud.
  //   - `romBaudrate` is HARDCODED to 115200 inside the ctor (options.romBaudrate
  //     is silently ignored); this is also what user spec calls for (BAUD=115200).
  //   - Initial ROM sync always uses 115200; `main()` then compares baud vs
  //     romBaudrate and, if different, auto-issues ESP_CHANGE_BAUDRATE so the
  //     flash phase runs at the higher rate.
  //   - Manually calling `esploader.changeBaud(x)` does NOT accept a parameter —
  //     that method reads `this.baudrate` set in the ctor and ignores its arg.
  const esploader = new ESPLoader({
    transport,
    baudrate: cfg.manifest.transferBaud,
    terminal: {
      clean() {},
      // Rewrite esptool-js verbose output so the UI only shows MyFrame-branded
      // strings — engineers still get the substance, just without any ESP /
      // esptool / chip-family names leaking to the operator or screenshots.
      writeLine(s) {
        const clean = rewriteVendorStrings(s);
        if (clean) slog(`[fw] ${clean}`);
      },
      write(_s) { /* per-char stream, ignore */ },
    },
  });

  let ticket = null;
  let sn = null;
  let mac = null;
  let transportOwned = true;

  try {
    // 1. detect chip
    setStage(t('stage.detect'));
    const chip = await esploader.main();
    if (!/ESP32-?C5/i.test(chip)) {
      // Keep the real chip name in the thrown error so R&D can still see it
      // in the console, but the slot displays a MyFrame-branded label only.
      throw new Error(t('err.wrong_chip', { chip: 'unsupported' }));
    }
    // UI shows only the MyFrame brand — the exact chip family is R&D
    // information, not something the operator (or a screenshot) should see.
    ui.addOrUpdateSlot(slotId, { chip: 'MyFrame board' });

    // 2. read MAC. main() already reads it internally and prints via the
    //    terminal callback; we re-read here just to get the value directly.
    setStage(t('stage.readmac'));
    mac = (await esploader.chip.readMac(esploader)).toLowerCase();
    ui.addOrUpdateSlot(slotId, { mac });
    // Enrich the log filter label with MAC so the operator can identify which
    // physical board a filter option represents.
    ui.registerBoardForLog(slotId, `Board ${boardIdx} · ${mac}`);
    slog(`Chip detected: ${chip} · MAC ${mac}`);

    // 2.5. Fail EARLY if no .myfw is uploaded — before we spend an SN slot
    //     on this MAC. This mirrors getFirmwareBytes()'s throw but at a
    //     stage where nothing on the server has been touched yet, so the
    //     sequence counter and audit list stay clean.
    const currentFw = api.getSelectedFirmware();
    if (!currentFw?.file) {
      throw new Error(t('err.no_myfw'));
    }

    // 3. reserve SN from server (or dev mock).
    setStage(t('stage.reserve_sn'));
    slog(`Requesting next SN from server (rule ${wo.snRule?.id || wo.snRules?.[0]?.id})…`);
    const reservation = await api.reserveSN(mac);
    ticket = reservation.ticket;
    sn = reservation.sn;
    ui.addOrUpdateSlot(slotId, { sn });
    slog(`SN reserved: ${sn} · ticket ${ticket.slice(0, 24)}…`, 'ok');
    ui.registerBoardForLog(slotId, `Board ${boardIdx} · ${mac} · ${sn}`);

    // (baud escalation happened inside main() — nothing to do here.)

    // 4. fetch firmware (single-flight cached — N concurrent boards share
    //    one HTTP fetch + one 3DES decrypt; subsequent boards hit the cache).
    setStage(t('stage.download'));
    const encBytes = await fetchFirmwareOnce((rcv, total) => {
      const p = total ? rcv / total : 0;
      if (_portToSlot.has(port)) ui.addOrUpdateSlot(slotId, { progress: p * 0.1 });
    });
    if (!encBytes || !encBytes.length) {
      throw new Error(`Firmware fetch returned empty bytes (got ${encBytes === undefined ? 'undefined' : encBytes && encBytes.length})`);
    }

    // 5. decrypt. Real crypto now: AES-256-GCM per-chunk with a per-build
    //    key that the server only releases after a challenge-response
    //    handshake (see api.openSession). If the package is a MYFA envelope
    //    we run the handshake first; raw .bin (dev only) skips this.
    setStage(t('stage.decrypt'));
    const { looksLikePackage } = await import('./crypto.js');
    let plain, license;
    if (looksLikePackage(encBytes)) {
      const { parseHeader } = await import('./crypto.js');
      const preview = parseHeader(encBytes);
      slog(`MYFA package · license=${preview.license.licenseId} · ${preview.license.chunkCount} chunks × ${preview.license.chunkSize}B · AES-256-GCM`);
      slog(`Opening session (challenge-response HMAC-SHA256)…`);
      const session = await api.openSession(wo.id, preview.license.licenseId);
      slog(`Session ${session.sessionId.slice(0, 12)}… granted · keyId ${session.keyId} · expires in ${session.expiresIn}s`, 'ok');
      const res = await decryptFirmware(encBytes, session.packageKey, (i, n, wrote, total) => {
        // Progress inside decrypt = 0-10% of overall bar (before flash starts).
        if (_portToSlot.has(port)) {
          ui.addOrUpdateSlot(slotId, { progress: (wrote / total) * 0.1 });
        }
        if (i % 100 === 0 || i === n) slog(`Decrypted chunk ${i}/${n} · ${wrote.toLocaleString()} B`);
      });
      plain = res.plain;
      license = res.license;
      slog(`Decrypted ${plain.length.toLocaleString()} B · SHA-256 verified against license claim`, 'ok');
    } else {
      // Non-MYFA payload — treat as raw firmware ONLY in dev mode. In prod
      // this indicates the operator uploaded the wrong file (an old .bin
      // or random data), and flashing raw bytes to production hardware
      // would brick the board with no crypto or SHA verification. Refuse.
      if (!cfg.isDev) {
        throw new Error(t('err.wrong_file_type'));
      }
      // Dev-only fallback.
      plain = encBytes;
      license = null;
      slog(`No MYFA envelope — treating as raw firmware (${encBytes.length.toLocaleString()} B)`);
    }
    slog(t('log.fw_bytes', { n: plain.length.toLocaleString() }));

    // 6. flash. `plain` is a Uint8Array — pass through as-is.
    setStage(t('stage.flashing'));
    slog(`Writing ${plain.length.toLocaleString()} B to flash @0x${cfg.manifest.flashOffset.toString(16).padStart(4, '0')} · baud=${cfg.manifest.transferBaud}, compress=on`);
    const flashStart = Date.now();
    let lastLoggedPct = -10;
    await esploader.writeFlash({
      fileArray: [{ data: plain, address: cfg.manifest.flashOffset }],
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (_i, written, total) => {
        const p = 0.1 + (written / total) * 0.85;
        ui.addOrUpdateSlot(slotId, {
          progress: p,
          elapsed: Date.now() - started,
        });
        const pct = Math.floor((written / total) * 100);
        if (pct >= lastLoggedPct + 10) {
          const elapsed = ((Date.now() - flashStart) / 1000).toFixed(1);
          slog(`Flash progress ${pct}% · ${written.toLocaleString()}/${total.toLocaleString()} B · ${elapsed}s elapsed`);
          lastLoggedPct = pct;
        }
      },
    });
    slog(`Flash complete · ${((Date.now() - flashStart) / 1000).toFixed(1)}s wall time`, 'ok');

    // Defense in depth: overwrite the plaintext buffer as soon as
    // writeFlash returns. JS can't guarantee zero copies (esptool-js
    // may retain fragments), but zeroing our reference means a heap
    // snapshot from this point on shows all-zero bytes instead of the
    // raw firmware image. GC reclaims the buffer on the next major cycle.
    if (plain && plain.fill && plain !== encBytes) {
      plain.fill(0);
    }
    plain = null;

    // 7. hard reset + smoke test.
    setStage(t('stage.reset_smoke'));
    ui.addOrUpdateSlot(slotId, { progress: 0.95 });
    await esploader.after('hard_reset'); // toggles DTR/RTS via resetConstructors

    // The port must be released by esptool-js before we can reopen it at the
    // firmware's console baud (115200) to read boot log. See readSerialFor()
    // for the full baud rationale.
    await transport.disconnect();
    transportOwned = false;

    const smoke = await readSerialFor(
      port,
      cfg.manifest.consoleBaud,
      cfg.manifest.smokeTestTimeoutMs,
      cfg.manifest.smokeTestPatterns,
      slog,
    );

    // Structured smoke-test result — the firmware engineer can jump straight
    // to the first failing step and its diagnosis.
    const smokeResult = runSmokeChecks(smoke.transcript, smoke.totalBytes);
    slog('===== SMOKE TEST RESULT =====');
    for (const r of smokeResult.results) {
      slog(`  ${r.ok ? '✓' : '✕'} ${r.label}`, r.ok ? 'ok' : 'err');
    }
    slog(`  received ${smoke.totalBytes} B · transcript ${smoke.transcript.length} chars`);

    if (!smokeResult.allOk) {
      const first = smokeResult.results[smokeResult.firstFailIdx];
      slog(`\n===== FIRST FAILING STEP: ${first.label} =====`, 'err');
      for (const line of first.diagnose) slog(line, 'err');
      const rawTail = smoke.transcript.slice(-2048);
      slog(`\n===== FULL TRANSCRIPT (last 2 KB of ${smoke.transcript.length}) =====\n${rawTail || '(empty)'}`);
      throw new Error(`smoke test failed at step: ${first.label}`);
    }
    slog(t('log.smoke_ok', { n: smoke.totalBytes }), 'ok');

    // 8. verify SN readback if the firmware prints "[SN] xxx" on boot
    //    (P1: fw side needs to print SN read from NVS).
    const snMatch = smoke.transcript.match(/\[SN\]\s*(\S+)/);
    if (snMatch) {
      const v = verifySN(wo.snRule || wo.snRules?.[0], snMatch[1]);
      if (!v.ok) slog(t('log.sn_bad', { reason: v.reason }), 'err');
      else slog(t('log.sn_ok', { sn: snMatch[1] }), 'ok');
    }

    // 9. consume ticket — quota decrements only on success.
    setStage(t('stage.consume'));
    const consumeRes = await api.consumeTicket({ sn, ticket, chipMac: mac, smokeOk: true });
    slog(`Consume acknowledged · license ${consumeRes.licenseId} · ${consumeRes.used}/${consumeRes.quota} used · ${consumeRes.remaining} remaining`, 'ok');

    // Refresh the workorder card so the license quota display drops by 1
    // without requiring a page reload. Fire-and-forget — a failure here
    // doesn't affect the burn's success state.
    api.getWorkorder().then((freshWo) => ui.renderWorkorder(freshWo)).catch(() => {});

    ui.addOrUpdateSlot(slotId, {
      progress: 1,
      elapsed: Date.now() - started,
    });
    setState(t('state.done'), 'ok');
    setStage(t('stage.done'));
    return { ok: true, sn, mac };
  } catch (err) {
    // Friendlier message for a common category: the operator physically
    // pulls the board mid-flash, esptool-js throws raw "port closed" /
    // "NetworkError" text that isn't useful on the factory floor. Detect
    // those and swap to a directional prompt.
    const raw = String(err?.message || err);
    const isDisconnect = /port (has been )?closed|Failed to execute 'write'|NetworkError|The device has been lost/i.test(raw);
    const shownMsg = isDisconnect ? t('err.disconnect_mid') : raw;
    slog(t('log.flash_fail', { msg: shownMsg }), 'err');
    setState(t('state.failed'), 'error');
    setStage(t('stage.failed', { reason: shownMsg.slice(0, 60) }));
    // Report failure so server audit records it (but no quota is consumed).
    if (ticket) {
      try {
        await api.reportFailure({ sn, ticket, chipMac: mac, stage: 'flash', error: err });
        slog(`Reported failure to server (ticket kept for audit, quota NOT consumed)`);
      } catch (e2) {
        slog(t('log.report_fail', { msg: e2.message }), 'err');
      }
    }
    return { ok: false, error: err };
  } finally {
    // If we already handed the port off to readSerialFor (which does its own
    // port.close()), don't double-close via transport.disconnect().
    if (transportOwned) {
      try { await transport.disconnect(); } catch {}
    }
  }
}

// ── Multi-device auto-flash ─────────────────────────────────────────
// Concurrency model:
//   - Each connect event → one flashOne promise → one Web Serial port.
//   - Web Serial ports are independent readers/writers at the browser layer
//     (no bytes cross between ports).
//   - Each flashOne creates its OWN Transport + ESPLoader instance — no
//     shared esptool state.
//   - Server-side atomic reservations (LOCK inside mock-server) guarantee
//     SN sequences and license quota can't be double-spent.
//   - _inFlight is keyed by the port object so a duplicate connect event
//     (rare, but observed on some Chrome versions after suspend/resume)
//     joins the existing promise instead of starting a second flash.
const _inFlight = new Map();
// port → slotId, so serial.ondisconnect can find the slot to remove.
const _portToSlot = new Map();
// Monotonic slot counter — avoids the Date.now() collision that could happen
// when two ports plug in within the same millisecond.
let _slotCounter = 0;
// Firmware bytes single-flight cache. When N boards plug in simultaneously,
// only ONE HTTP fetch happens; all others await the same promise. Cleared on
// workorder change (which currently only happens on page reload).
let _firmwareCache = null;      // { promise, bytes }
export function clearFirmwareCache() { _firmwareCache = null; }
async function fetchFirmwareOnce(onProgress) {
  if (_firmwareCache?.bytes) {
    if (onProgress) onProgress(_firmwareCache.bytes.length, _firmwareCache.bytes.length);
    return _firmwareCache.bytes;
  }
  if (!_firmwareCache?.promise) {
    _firmwareCache = { promise: null, bytes: null };
    _firmwareCache.promise = api.getFirmwareBytes(onProgress).then((b) => {
      _firmwareCache.bytes = b;
      return b;
    }).catch((e) => {
      _firmwareCache = null; // let next caller retry
      throw e;
    });
  }
  return _firmwareCache.promise;
}

// Human-readable label for a port (vendor/product IDs, since USB serial
// numbers aren't exposed by Web Serial).
function portLabel(port) {
  const info = port.getInfo?.() || {};
  const vid = info.usbVendorId  != null ? '0x' + info.usbVendorId.toString(16).padStart(4, '0') : '?';
  const pid = info.usbProductId != null ? '0x' + info.usbProductId.toString(16).padStart(4, '0') : '?';
  return `${vid}:${pid}`;
}

async function tryFlash(port, cfg, wo) {
  if (_inFlight.has(port)) {
    ui.log(`[auto] port ${portLabel(port)} already flashing — skip duplicate trigger`);
    return _inFlight.get(port);
  }
  ui.log(`[auto] starting flash for port ${portLabel(port)}`);
  const promise = flashOne(port, cfg, wo)
    .catch((e) => {
      // flashOne already logged internally; return failure marker so callers can
      // filter without unhandled rejections.
      return { ok: false, error: e };
    })
    .finally(() => {
      _inFlight.delete(port);
    });
  _inFlight.set(port, promise);
  return promise;
}

// Boot the auto-flash pipeline. Called once on page load.
//   1. Immediately flash any already-authorized-and-plugged-in ports.
//   2. Register serial.onconnect so any *later* plug-in triggers a flash.
//   3. Register serial.ondisconnect for logging.
// The workorder is fetched once and reused across boards.
export async function startAutoFlash() {
  if (!('serial' in navigator)) throw new Error('Web Serial not available');
  const cfg = api.getConfig();
  const wo = await api.getWorkorder();
  ui.log(t('log.wo_status', { id: wo.id, remain: wo.quota - (wo.used || 0), total: wo.quota }));
  ui.renderWorkorder(wo);

  // Strict rule: one physical plug-in → one card. Nothing else.
  //
  // Chrome's behavior on page load: it can synthesise `connect` events for
  // every previously-authorized port, whether or not the physical adapter is
  // present, and `SerialPort.connected` ships stale on some hubs. If we
  // blindly tryFlash all of those, we get the observed 9-fail-cards mess.
  //
  // Defence: snapshot the set of ports that ALREADY exist at page-load time.
  // Any `connect` event for a port in that snapshot is ignored ONCE — it's
  // just the browser telling us "here's a port we remember", not a fresh
  // physical connection. After a snapshot port fires once, we drop it from
  // the set, so a genuine unplug+replug later WILL fire a real connect that
  // creates a card.
  const preloadedPorts = new Set(await navigator.serial.getPorts());
  ui.log(`[auto] listening for plug-ins · ${preloadedPorts.size} pre-existing port(s) muted until unplug+replug`);

  // Chrome has been observed to fire multiple `connect` events for a single
  // physical plug (same tick, sometimes with fresh SerialPort objects for
  // each event). The _inFlight Map alone can't dedupe those because it keys
  // on port identity and the "new" objects don't match. Add a
  // synchronous debounce keyed by VID:PID within a short window so any burst
  // collapses to one flash.
  const _lastConnectByVidPid = new Map();     // "0xVVVV:0xPPPP" → ms timestamp
  const CONNECT_DEBOUNCE_MS = 800;

  navigator.serial.addEventListener('connect', (e) => {
    const port = e.target;
    if (preloadedPorts.has(port)) {
      preloadedPorts.delete(port);
      ui.log(`[hotplug] muted pre-existing port ${portLabel(port)} — unplug+replug it to flash`);
      return;
    }
    // Gate hot-plug flashing behind a user-picked .myfw. Without this,
    // plugging a board while the fw picker is still empty would kick
    // off flashOne, which fails at the getFirmwareBytes check but only
    // AFTER burning an SN reservation and confusing the audit trail.
    // See getSelectedFirmware()'s null return — that's the source of truth.
    if (!api.getSelectedFirmware()?.file) {
      ui.log(`[hotplug] ignoring ${portLabel(port)} — upload a .myfw first`);
      return;
    }
    const vidPid = portLabel(port);
    const now = Date.now();
    const last = _lastConnectByVidPid.get(vidPid) || 0;
    if (now - last < CONNECT_DEBOUNCE_MS) {
      ui.log(`[hotplug] debounce · ignoring duplicate connect for ${vidPid} (+${now - last}ms)`);
      return;
    }
    _lastConnectByVidPid.set(vidPid, now);
    ui.log(`[hotplug] connect: ${vidPid}`);
    tryFlash(port, cfg, wo);
  });

  navigator.serial.addEventListener('disconnect', (e) => {
    const port = e.target;
    ui.log(`[hotplug] disconnect: ${portLabel(port)}`);
    // Remove the slot when the physical device goes away — the UI should
    // reflect "currently connected devices" only. If a flash was mid-flight,
    // its serial ops error and flashOne's catch block already marked the
    // slot failed; the disconnect handler then tears it down for good.
    const slotId = _portToSlot.get(port);
    if (slotId) {
      ui.removeSlot(slotId);
      _portToSlot.delete(port);
    }
    _inFlight.delete(port);
  });
}

// Rescan manually — used ONLY when a device was already plugged in at page
// load (so no `connect` event fired). Uses the strict Chrome 128+ property
// `SerialPort.connected === true` — anything else (`false` OR undefined) is
// treated as a phantom to avoid flooding the grid with fake cards.
//
// If your Chrome is < 128 and connected is undefined for everything, the
// simplest workaround is: unplug + replug the device, which fires a real
// `connect` event and creates exactly one card.
export async function rescanAuthorized() {
  const cfg = api.getConfig();
  const wo = await api.getWorkorder();
  const ports = await navigator.serial.getPorts();
  const alive = ports.filter((p) => p.connected === true);
  const phantoms = ports.length - alive.length;
  ui.log(`[rescan] ${ports.length} authorized · ${alive.length} currently connected · ${phantoms} phantom(s) skipped`);
  if (alive.length === 0 && phantoms > 0) {
    ui.log('[rescan] no confirmed-live ports; if a device IS plugged, try unplug+replug (fires a real connect event)');
  }
  for (const port of alive) tryFlash(port, cfg, wo);
}

// Prompt Chrome's Web Serial picker to authorize a new device. Immediately
// flashes it — future hot-plugs of the same USB serial adapter will then
// auto-trigger via serial.onconnect without a second permission prompt.
export async function authorizeAndFlash() {
  const cfg = api.getConfig();
  const wo = await api.getWorkorder();
  const port = await navigator.serial.requestPort({});
  ui.log(t('log.port_picked'));
  return tryFlash(port, cfg, wo);
}

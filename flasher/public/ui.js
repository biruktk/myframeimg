// MyFrame Flasher — UI rendering.
// Owns the DOM; other modules call these mutators. All state lives in the DOM
// (we intentionally do not use a framework for a single-file dev tool).

import { t, applyDom, toggleLang, getLang } from './i18n.js';
import { previewSN } from './sn.js';
import {
  getSelectedRule, setSelectedRuleId,
  getFirmwares, getSelectedFirmware, setSelectedFirmwareId, setUserPickedFirmware,
  refreshFirmwares,
} from './api.js';
import { isDebug, toggleDebug } from './debug.js';
import { clearFirmwareCache } from './flasher.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const LOG_MAX_LINES = 200;

// ── Environment check ────────────────────────────────────────────────
// UX rule: when all checks pass, hide the panel entirely — nothing here is
// news to the operator. Surface only when something is wrong, and only the
// failing rows so the user can fix the specific problem. The browser-gate
// screen already handles the fully-unsupported-browser case; this panel
// covers the partial-failure edge cases (e.g. Web Serial disabled by flag,
// insecure context after moving to production without HTTPS).
export function renderEnvCheck() {
  const rows = [
    { ok: 'serial' in navigator, ok_key: 'env.serial.ok', fail_key: 'env.serial.fail' },
    { ok: 'crypto' in window && !!crypto.subtle, ok_key: 'env.crypto.ok', fail_key: 'env.crypto.fail' },
    { ok: window.isSecureContext, ok_key: 'env.secure.ok', fail_key: 'env.secure.fail' },
  ];
  const failed = rows.filter((r) => !r.ok);
  const box = $('#envCheck');
  box.innerHTML = '';

  if (failed.length === 0) {
    // All green — hide the panel entirely.
    box.classList.add('hidden');
    box.classList.remove('error');
    return true;
  }

  // Something failed — show only the offending rows, in error style, so the
  // operator can fix that specific thing.
  box.classList.remove('hidden');
  box.classList.add('error');
  for (const r of failed) {
    const row = el('div', 'env-check__row');
    row.appendChild(el('span', 'badge err', '✕'));
    row.appendChild(el('span', null, t(r.fail_key)));
    box.appendChild(row);
  }
  return false;
}

// ── Workorder card ───────────────────────────────────────────────────
let _lastWo = null;
export function renderWorkorder(wo) {
  _lastWo = wo;
  const box = $('#woCard');
  box.classList.remove('hidden');
  box.innerHTML = '';

  const woItem = (label, value, cls = '') => {
    const c = el('div', 'wo-card__item');
    c.appendChild(el('div', 'wo-card__label', label));
    c.appendChild(el('div', `wo-card__value ${cls}`.trim(), value));
    return c;
  };

  const lic = wo.license || { quota: wo.quota, used: wo.used, remaining: (wo.quota || 0) - (wo.used || 0) };
  const remaining = lic.remaining != null ? lic.remaining : Math.max(0, (lic.quota || 0) - (lic.used || 0));
  const exhausted = remaining <= 0;

  box.appendChild(woItem(t('wo.id'), wo.id));
  // Show actual firmware name (e.g. "myframe-fw-0.9.bin") — falls back to
  // legacy fwSha for backwards compat.
  box.appendChild(woItem(t('wo.firmware'), wo.fwName || wo.fwSha || t('slot.dash')));
  box.appendChild(woItem(
    t('wo.license'),
    t('wo.license_status', { used: lic.used || 0, quota: lic.quota || 0, remaining }),
    exhausted ? 'error' : 'vermillion',
  ));

  if (lic.expiresAt) {
    const date = new Date(lic.expiresAt).toISOString().slice(0, 10);
    box.appendChild(woItem(lic.id || 'License ID', t('wo.license_expires', { date })));
  }

  if (exhausted) {
    const warn = el('div', 'wo-card__banner wo-card__banner--error', t('wo.license_exhausted'));
    warn.style.gridColumn = '1 / -1';
    box.appendChild(warn);
  } else if (getSelectedFirmware()?.file) {
    // Ready state — workorder loaded from a real uploaded .myfw and quota
    // remains. Show a prominent green banner so first-time operators
    // know the next step is "plug a board", not "look for another button".
    const ready = el('div', 'wo-card__banner wo-card__banner--ready', t('guide.ready_to_flash'));
    ready.style.gridColumn = '1 / -1';
    box.appendChild(ready);
  }

  // ── SN rule + live preview ─────────────────────────────────────────
  // Single-rule design: workorder carries one SN template, we just show its
  // template + a live preview. If a future workorder needs multiple rules,
  // swap this back to a <select> — see git history.
  const rules = wo.snRules || (wo.snRule ? [wo.snRule] : []);
  if (rules.length > 0) {
    const rule = getSelectedRule();
    const ruleCell = el('div', 'wo-card__item wo-card__item--wide');
    ruleCell.appendChild(el('div', 'wo-card__label', t('wo.sn_rule')));
    ruleCell.appendChild(el('div', 'wo-card__value mono', rule.template));
    const preview = el('div', 'wo-card__preview');
    try {
      preview.textContent = `${t('wo.sn_preview')}: ${previewSN(rule, { wo: wo.shortCode || 'WO' })}`;
    } catch (e) {
      preview.textContent = `${t('wo.sn_preview')}: (${e.message})`;
    }
    ruleCell.appendChild(preview);
    box.appendChild(ruleCell);
  }
}

// ── Board grid ───────────────────────────────────────────────────────
// slotId is a stable key (chip MAC once known, or a temp portKey before that).
export function addOrUpdateSlot(slotId, patch) {
  const grid = $('#grid');
  let slot = grid.querySelector(`[data-slot="${slotId}"]`);
  if (!slot) {
    slot = el('div', 'slot');
    slot.dataset.slot = slotId;
    const idx = grid.querySelectorAll('.slot').length + 1;
    slot.innerHTML = `
      <div class="slot__hdr">
        <div class="slot__title" data-slot-title>${t('slot.board', { idx })}</div>
        <div class="slot__state">${t('slot.dash')}</div>
      </div>
      <div class="slot__banner"></div>
      <div class="slot__body">
        <div class="slot__row slot__row--debug"><span class="k" data-i18n="slot.chip">${t('slot.chip')}</span><span class="v slot__chip">${t('slot.dash')}</span></div>
        <div class="slot__row slot__row--debug"><span class="k" data-i18n="slot.mac">${t('slot.mac')}</span><span class="v mono slot__mac">${t('slot.dash')}</span></div>
        <div class="slot__row"><span class="k" data-i18n="slot.sn">${t('slot.sn')}</span><span class="v slot__sn">${t('slot.dash')}</span></div>
        <div class="slot__row"><span class="k" data-i18n="slot.stage">${t('slot.stage')}</span><span class="v slot__stage">${t('slot.dash')}</span></div>
        <div class="progress"><div class="progress__bar"></div></div>
        <div class="slot__row slot__row--debug"><span class="k" data-i18n="slot.elapsed">${t('slot.elapsed')}</span><span class="v slot__elapsed">${t('slot.dash')}</span></div>
      </div>
    `;
    grid.appendChild(slot);
    updateEmptyHint();
  }

  if (patch.chip)    slot.querySelector('.slot__chip').textContent = patch.chip;
  if (patch.mac)     slot.querySelector('.slot__mac').textContent = patch.mac;
  if (patch.sn)      slot.querySelector('.slot__sn').textContent = patch.sn;
  if (patch.stage)   slot.querySelector('.slot__stage').textContent = patch.stage;
  if (patch.elapsed != null) slot.querySelector('.slot__elapsed').textContent = `${(patch.elapsed / 1000).toFixed(1)} s`;
  if (patch.progress != null) slot.querySelector('.progress__bar').style.width = `${Math.round(patch.progress * 100)}%`;
  if (patch.state) {
    const s = slot.querySelector('.slot__state');
    s.textContent = patch.state.label;
    s.className = `slot__state ${patch.state.kind || ''}`;

    // Non-debug big banner — worker-facing.
    const banner = slot.querySelector('.slot__banner');
    slot.classList.remove('slot--pass', 'slot--fail');
    if (patch.state.kind === 'ok') {
      slot.classList.add('slot--pass');
      banner.innerHTML = `<span class="slot__banner-icon">✓</span><span class="slot__banner-text">${t('big.pass')}</span>`;
    } else if (patch.state.kind === 'error') {
      slot.classList.add('slot--fail');
      banner.innerHTML = `<span class="slot__banner-icon">✕</span><span class="slot__banner-text">${t('big.fail')}</span>`;
    } else {
      banner.innerHTML = '';
    }
  }
}

export function removeSlot(slotId) {
  const grid = $('#grid');
  const slot = grid.querySelector(`[data-slot="${slotId}"]`);
  if (slot) slot.remove();
  updateEmptyHint();
}

// Ensure the "please plug in a device" hint is visible ONLY when there are no
// slots. Called on every slot add/remove so state stays consistent.
function updateEmptyHint() {
  const grid = $('#grid');
  const hint = $('#gridEmpty');
  if (!grid || !hint) return;
  const anySlots = grid.querySelector('.slot') !== null;
  hint.classList.toggle('hidden', anySlots);
  hint.textContent = t('grid.empty');
}

export function renderEmpty() {
  const grid = $('#grid');
  if (grid) grid.innerHTML = '';
  updateEmptyHint();
}

// ── Log tail ─────────────────────────────────────────────────────────
// Every log line optionally carries a boardId so the operator can filter the
// console to a single board when N devices are flashing concurrently.
// Without a boardId, the line is treated as a global event (visible under
// every filter).
let _logLines = [];
const _knownBoards = new Map(); // boardId → display label (e.g. "板 1 · MAC")

function _renderLog() {
  const box = $('#log');
  if (!box) return;
  const filter = box.dataset.filter || 'all';
  box.innerHTML = '';
  for (const l of _logLines) {
    if (filter !== 'all' && l.boardId && l.boardId !== filter) continue;
    if (filter !== 'all' && !l.boardId) {
      // Global lines still show under a board filter — they're context.
    }
    const div = el('div', `log__line ${l.kind}`);
    if (l.boardId) div.dataset.board = l.boardId;
    div.textContent = l.line;
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

export function log(msg, kind = '', boardId = null) {
  const time = new Date().toISOString().slice(11, 19);
  const prefix = boardId ? `[${_knownBoards.get(boardId) || boardId}]` : '';
  const line = `[${time}]${prefix ? ' ' + prefix : ''} ${msg}`;
  _logLines.push({ line, kind, boardId });
  if (_logLines.length > LOG_MAX_LINES) _logLines = _logLines.slice(-LOG_MAX_LINES);
  _renderLog();
  if (kind === 'err') console.error(msg);
  else console.log(msg);
}

// Register a board so the filter dropdown gains an option for it.
export function registerBoardForLog(boardId, label) {
  if (_knownBoards.has(boardId)) {
    // Update label (e.g. once MAC is known, we get a richer label).
    _knownBoards.set(boardId, label);
    const opt = document.querySelector(`#logFilter option[value="${boardId}"]`);
    if (opt) opt.textContent = label;
    return;
  }
  _knownBoards.set(boardId, label);
  const sel = $('#logFilter');
  if (!sel) return;
  const opt = document.createElement('option');
  opt.value = boardId;
  opt.textContent = label;
  sel.appendChild(opt);
}

export function unregisterBoardForLog(boardId) {
  _knownBoards.delete(boardId);
  const opt = document.querySelector(`#logFilter option[value="${boardId}"]`);
  if (opt) opt.remove();
  // If the currently-selected filter was this board, fall back to "all".
  const sel = $('#logFilter');
  if (sel && sel.value === boardId) sel.value = 'all';
  const box = $('#log');
  if (box && box.dataset.filter === boardId) {
    box.dataset.filter = 'all';
    _renderLog();
  }
}

export function initLogFilter() {
  const sel = $('#logFilter');
  const clearBtn = $('#logClearBtn');
  if (sel) {
    sel.addEventListener('change', () => {
      $('#log').dataset.filter = sel.value;
      _renderLog();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _logLines = [];
      _renderLog();
    });
  }
}

// ── Actions ──────────────────────────────────────────────────────────
export function setConnectEnabled(enabled) {
  const btn = $('#connectBtn');
  if (btn) btn.disabled = !enabled;
}

// Show a dismissible banner error.
export function showError(msg) {
  log(msg, 'err');
  const banner = $('#topError');
  if (banner) {
    banner.textContent = msg;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 8000);
  }
}

// ── Firmware picker (debug only) ────────────────────────────────────
// Single .myfw file picker. Directory scanning / .bin fallback was removed —
// admins hand out a single encrypted .myfw per workorder and the operator
// just needs to point the tool at it.
export async function renderFirmwarePicker() {
  const box = $('#fwPicker');
  if (!box) return;
  box.innerHTML = '';

  box.appendChild(el('div', 'wo-card__label', t('fw.section')));
  box.appendChild(el('div', 'fw-hint', t('fw.myfw_hint')));

  const row = el('div', 'fw-row');
  const fileLabel = el('label', 'btn btn--primary btn--small');
  fileLabel.textContent = t('fw.pick_myfw');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  // Narrowed from '.myfw,application/octet-stream' — the octet-stream
  // fallback let users pick raw .bin files by accident, which then failed
  // the MYFA-header check with a confusing error. Now the picker only
  // shows .myfw files (users can still drop other files at their own
  // risk; the header check remains as the ultimate guard).
  fileInput.accept = '.myfw';
  fileInput.style.display = 'none';
  fileLabel.appendChild(fileInput);
  row.appendChild(fileLabel);
  box.appendChild(row);

  // Dedicated live-status line that shows the multi-stage upload progress
  // (read → parse header → sync workorder → ready OR reject). Distinct
  // from `.fw-selected` so the "current file" summary stays stable while
  // a new pick is being validated.
  const statusEl = el('div', 'fw-status');
  statusEl.style.cssText = 'margin-top:6px; font-size:14px; min-height:20px; color:var(--ink-500);';
  const setStatus = (msg, tone) => {
    statusEl.textContent = msg || '';
    if (tone === 'busy')  { statusEl.style.color = 'var(--ink-700)'; statusEl.style.fontWeight = '500'; }
    else if (tone === 'ok')   { statusEl.style.color = 'var(--success)'; statusEl.style.fontWeight = '600'; }
    else if (tone === 'err')  { statusEl.style.color = 'var(--error)';   statusEl.style.fontWeight = '600'; }
    else                      { statusEl.style.color = 'var(--ink-500)'; statusEl.style.fontWeight = '400'; }
  };

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    // Disable the pick button while validating to prevent double-fire.
    fileLabel.setAttribute('aria-disabled', 'true');
    fileLabel.style.opacity = '0.5';
    fileLabel.style.pointerEvents = 'none';
    const sizeMB = (f.size / 1024 / 1024).toFixed(2);
    setStatus(t('fw.status.reading', { name: f.name, size: sizeMB }), 'busy');
    // Peek the license header FIRST — if the file's workorderId doesn't
    // match the URL's, or the file isn't a valid MYFA package at all, we
    // reject it before caching anything. That prevents the "URL says A,
    // file is B → burns land on A / SN sequence corrupted" class of bug.
    const accepted = await autoloadWorkorderFromFile(f, setStatus);
    fileLabel.removeAttribute('aria-disabled');
    fileLabel.style.opacity = '';
    fileLabel.style.pointerEvents = '';
    if (!accepted) {
      // Stay on whatever the previous state was — do not adopt the bad
      // file. The user has to click "选择 .myfw 文件" again. The setStatus
      // call inside autoloadWorkorderFromFile already showed the reason.
      fileInput.value = '';
      return;
    }
    clearFirmwareCache();
    setUserPickedFirmware(f);
    log(`Loaded ${f.name} (${sizeMB} MB) · previous package released`, 'ok');
    setStatus(t('fw.status.ready', { name: f.name, size: sizeMB }), 'ok');
    // Re-render so the "current file" summary line refreshes; the new
    // renderFirmwarePicker will construct its own statusEl (empty).
    renderFirmwarePicker();
  });

  const current = getSelectedFirmware();
  const selected = el('div', 'fw-selected');
  if (current?.file) {
    selected.textContent = `${t('fw.selected')}${current.label}`;
  } else {
    // No file picked — flashing is blocked until the operator uploads.
    // getFirmwareBytes() enforces the same rule at the API layer.
    selected.textContent = t('fw.none');
    selected.style.color = 'var(--error, #b91c1c)';
    selected.style.fontWeight = '600';
  }
  box.appendChild(selected);
  box.appendChild(statusEl);
}

// After the operator picks a .myfw file the workorder card must reflect the
// AUTHORITATIVE state:
//   1. Decrypt the file's license header (client-side, fast — small blob)
//    → gives us the workorderId this package claims.
//   2. Ask the server for that workorder's live state
//    → gives us the up-to-date used/remaining count (a batch that already
//      burned 3 units will not appear as fresh).
//   3. Render the server-view. Fall back to the file's view only if the
//      server is unreachable.
async function autoloadWorkorderFromFile(file, setStatus) {
  const setUiStatus = typeof setStatus === 'function' ? setStatus : () => {};
  try {
    const { parseLicenseOnly, looksLikePackage } = await import('./crypto.js');
    // Only the license header needs to be inspected here, NOT the chunk
    // table. parseHeader() walks every chunk offset which would need the
    // whole 15 MB blob and throws "Truncated at chunk N body" on a small
    // slice. parseLicenseOnly() reads just the license JSON, which is all
    // we need for the workorder-card preview. Full parseHeader (with
    // chunk validation) still runs at flash time.
    setUiStatus(t('fw.status.parsing_hdr'), 'busy');
    const HEADER_PROBE = 64 * 1024;
    const prefix = new Uint8Array(await file.slice(0, HEADER_PROBE).arrayBuffer());
    if (!looksLikePackage(prefix)) {
      log(`rejected: not a valid .myfw (MYFA magic missing)`, 'err');
      setUiStatus(t('fw.status.not_myfa'), 'err');
      return false;
    }
    setUiStatus(t('fw.status.parsing_lic'), 'busy');
    // parseLicenseOnly reads the plaintext license — no session needed
    // just to preview quota / SN rule / expiry.
    const { license: fileLicense } = parseLicenseOnly(prefix);
    log(`Parsed license from ${file.name} · workorder ${fileLicense.workorderId} · license ${fileLicense.licenseId} · keyId ${fileLicense.keyId}`, 'ok');

    // Workorder mismatch check — only enforced when the URL EXPLICITLY
    // named a workorder (?workorder=…). If the operator opened a bare `/`
    // URL, the .myfw they picked is the source of truth; we adopt its
    // workorder id and continue. This preserves the "URL says A, file
    // says B → refuse" data-integrity guard from L2 while still letting
    // the ad-hoc "open the flasher, upload whatever" flow work.
    const { getConfig, setActiveWorkorderId, setActiveToken } = await import('./api.js');
    const cfg2 = getConfig() || {};
    const urlWo = cfg2.workorderId;
    // Adopt the per-workorder bearer embedded in the license. Without
    // this the flasher would hit /challenge with the dev "demo" token
    // which the server rejects with DEMO_BEARER_REJECTED. build-package
    // guarantees new .myfw files carry a bearer; older ones (pre-migration)
    // will lack it — those need a rebuild anyway (KEK migration too).
    if (fileLicense.bearer) {
      setActiveToken(fileLicense.bearer);
    } else {
      log(`legacy .myfw · missing bearer field · rebuild required`, 'err');
      const statusEl = document.querySelector('#fwPicker .fw-status');
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--error);font-weight:600;">${t('fw.status.no_bearer')}</span> <a href="/firmware/admin" target="_blank" style="color:var(--vermillion);text-decoration:underline;margin-left:8px;">${t('guide.legacy_myfw')}</a>`;
      } else {
        setUiStatus(t('fw.status.no_bearer'), 'err');
      }
      return false;
    }
    if (cfg2.workorderExplicit && urlWo && fileLicense.workorderId && urlWo !== fileLicense.workorderId) {
      log(
        `workorder mismatch · URL=${urlWo} · file=${fileLicense.workorderId} — open the URL for ${fileLicense.workorderId} to burn this package`,
        'err',
      );
      // Render mismatch as a clickable link so the operator has a one-
      // click path out instead of having to hand-edit the URL.
      const correctUrl = `${window.location.origin}/?workorder=${encodeURIComponent(fileLicense.workorderId)}`;
      const statusEl = document.querySelector('#fwPicker .fw-status');
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--error);font-weight:600;">${
          t('fw.status.wo_mismatch', { url: urlWo, file: fileLicense.workorderId })
        }</span> <a href="${correctUrl}" style="color:var(--vermillion);text-decoration:underline;margin-left:8px;">${
          t('guide.wo_mismatch_link', { file: fileLicense.workorderId })
        }</a>`;
      } else {
        setUiStatus(t('fw.status.wo_mismatch', { url: urlWo, file: fileLicense.workorderId }), 'err');
      }
      return false;
    }
    if (!cfg2.workorderExplicit && fileLicense.workorderId && fileLicense.workorderId !== urlWo) {
      // Bare `/` URL — the uploaded file decides which workorder we burn.
      setActiveWorkorderId(fileLicense.workorderId);
    }

    // Ask the server for the up-to-date view of this workorder.
    setUiStatus(t('fw.status.syncing'), 'busy');
    let serverWo = null;
    try {
      const { getWorkorderById } = await import('./api.js');
      serverWo = await getWorkorderById(fileLicense.workorderId);
    } catch (e) {
      log(`Server lookup for ${fileLicense.workorderId} failed (offline?): ${e.message}. Using license-file view.`, 'err');
    }

    if (serverWo) {
      // Sanity check: does the server's current license match the file's?
      // If it doesn't, the file is stale (a newer batch has been built) —
      // warn but still display the server view since that's authoritative.
      const serverLicId = serverWo.license?.id || serverWo.license?.licenseId;
      if (serverLicId && fileLicense.licenseId && serverLicId !== fileLicense.licenseId) {
        log(`⚠ License mismatch · file=${fileLicense.licenseId} · server=${serverLicId} — file is out of date`, 'err');
      }
      renderWorkorder(serverWo);
      const lic = serverWo.license || {};
      log(`Loaded from server · used ${lic.used || 0}/${lic.quota || 0} · remaining ${lic.remaining ?? 0} · fw ${serverWo.fwName || lic.fwName} · expires ${(lic.expiresAt || '').slice(0, 10)}`, 'ok');
      return true;
    }

    // Offline fallback — render whatever the file said, though `used` is
    // frozen at build time so quota display may lag.
    const quota     = fileLicense.quota || 0;
    const used      = fileLicense.used || 0;
    const remaining = Math.max(0, quota - used);
    renderWorkorder({
      id:      fileLicense.workorderId,
      fwName:  fileLicense.fwName,
      snRules: fileLicense.snRule ? [fileLicense.snRule] : [],
      snRule:  fileLicense.snRule,
      license: { ...fileLicense, remaining },
    });
    return true;
  } catch (e) {
    log(`Failed to load workorder from .myfw: ${e.message}`, 'err');
    setUiStatus(t('fw.status.load_fail', { msg: e.message }), 'err');
    return false;
  }
}

// ── Language + debug switching ──────────────────────────────────────
// Wire the toggle buttons and re-render everything when either changes.
export async function initSwitches() {
  applyDom();
  initLogFilter();
  const langBtn = $('#langBtn');
  if (langBtn) {
    langBtn.textContent = t('lang.switch');
    langBtn.addEventListener('click', () => toggleLang());
  }
  const debugBtn = $('#debugBtn');
  if (debugBtn) {
    debugBtn.textContent = isDebug() ? `● ${t('debug.on')}` : `○ ${t('debug.on')}`;
    debugBtn.addEventListener('click', () => toggleDebug());
  }
  renderFirmwarePicker();
  window.addEventListener('mff:lang-change', () => {
    applyDom();
    if (langBtn) langBtn.textContent = t('lang.switch');
    if (debugBtn) debugBtn.textContent = isDebug() ? `● ${t('debug.on')}` : `○ ${t('debug.on')}`;
    if (_lastWo) renderWorkorder(_lastWo);
    renderEnvCheck();
    renderFirmwarePicker();
    const emptySlot = $('#grid .slot--empty p');
    if (emptySlot) emptySlot.textContent = t('grid.empty');
  });
  window.addEventListener('mff:debug-change', () => {
    if (debugBtn) debugBtn.textContent = isDebug() ? `● ${t('debug.on')}` : `○ ${t('debug.on')}`;
    // Re-render slots so their banners reflect current translations.
    if (_lastWo) renderWorkorder(_lastWo);
  });
}
// Legacy alias for older HTML wiring.
export const initLangSwitch = initSwitches;

export { t } from './i18n.js';

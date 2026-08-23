// MyFrame Flasher — Serial Number rule engine.
// Rules are edited on the admin page (future) and consumed here.
// A rule template: "MYF-{wo}-{seq:5}-{check:1}"
// Tokens supported:
//   {yy}, {yyyy}, {mm}, {dd}     — date parts (UTC)
//   {wo}                          — workorder short code (from workorder context)
//   {seq:N}                       — zero-padded sequence, N digits (needs server)
//   {mac}                         — full MAC without colons, uppercase (12 hex)
//   {mac12}                       — same as {mac}
//   {mac6}                        — last 3 bytes (6 hex), uppercase, chip-local
//   {check:1}                     — one check digit computed by `check` algorithm
// Static text passes through as-is.
//
// Model:
//   - SN is generated from the workorder's rule (with server-issued seq).
//     From the SN alone you can visually see the workorder mapping.
//   - MAC is read from the ESP chip and stored alongside SN in the burn audit.
//     Server keeps a (SN <-> MAC <-> workorder) mapping for later traceability.
//   - USB device serial numbers are NOT supported: Web Serial does not expose
//     them (privacy), and the chip MAC is stronger anyway — it stays constant
//     even if the USB-serial adapter is swapped.

export const CHECK_ALGOS = {
  // Luhn mod-10 over the digits-only portion of the pre-check string.
  // Non-digit characters are ignored during the sum, but the digit is
  // appended to the end of the original template placeholder.
  'luhn-mod10': (preCheck) => {
    const digits = preCheck.replace(/\D/g, '').split('').map(Number);
    let sum = 0;
    let alt = true; // rightmost digit that would be next gets doubled
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits[i];
      if (alt) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      alt = !alt;
    }
    return String((10 - (sum % 10)) % 10);
  },

  // Simple mod-10 (sum of digits mod 10).
  'mod10': (preCheck) => {
    const sum = preCheck.replace(/\D/g, '').split('').reduce((a, c) => a + Number(c), 0);
    return String(sum % 10);
  },
};

// Formatters for date tokens (UTC to keep factories in different TZ aligned).
function dateParts(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return {
    yyyy: String(yyyy),
    yy: String(yyyy).slice(-2),
    mm,
    dd,
  };
}

// Normalize a MAC into uppercase hex without separators (e.g. "d0:cf:13:f0:15:f4"
// → "D0CF13F015F4"). Accepts already-clean hex too.
function normalizeMac(mac) {
  if (!mac) return '';
  return String(mac).replace(/[^0-9a-f]/gi, '').toUpperCase();
}

// Detect whether a template needs a server-issued seq (i.e. contains {seq:N}).
export function ruleNeedsSeq(rule) {
  return /\{seq:\d+\}/.test(rule?.template || '');
}

// Render a SN from rule + seq + date + workorder + chip MAC.
// rule: { template, check?: 'luhn-mod10'|'mod10' }
// seq:  integer (unused if template has no {seq:N})
// ctx:  { date?: Date, mac?: string, wo?: string (workorder short code) }
export function formatSN(rule, seq, ctx = {}) {
  if (!rule || !rule.template) throw new Error('SN rule missing template');
  const date = ctx.date || new Date();
  const parts = dateParts(date);
  const macHex = normalizeMac(ctx.mac);
  const wo = ctx.wo || '';

  // First pass: fill date + wo + seq + mac tokens; skip check placeholder.
  let body = rule.template.replace(/\{(yy|yyyy|mm|dd|wo|seq:\d+|mac|mac6|mac12)\}/g, (_, tok) => {
    if (tok === 'yy' || tok === 'yyyy' || tok === 'mm' || tok === 'dd') return parts[tok];
    if (tok === 'wo') {
      if (!wo) throw new Error('Template needs {wo} but no workorder short code supplied');
      return wo;
    }
    if (tok === 'mac' || tok === 'mac12') {
      if (!macHex) throw new Error(`Template needs MAC but none supplied (token ${tok})`);
      return macHex;
    }
    if (tok === 'mac6') {
      if (!macHex) throw new Error('Template needs MAC but none supplied (token mac6)');
      return macHex.slice(-6);
    }
    if (tok.startsWith('seq:')) {
      const n = Number(tok.slice(4));
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Bad seq width: ${tok}`);
      return String(seq).padStart(n, '0');
    }
    return _;
  });

  // Second pass: compute the check digit over the body-without-placeholder,
  // and substitute the placeholder.
  const checkMatch = body.match(/\{check:(\d+)\}/);
  if (checkMatch) {
    const width = Number(checkMatch[1]);
    if (width !== 1) throw new Error(`Only 1-digit check supported (got ${width})`);
    const algo = rule.check || 'luhn-mod10';
    if (!CHECK_ALGOS[algo]) throw new Error(`Unknown check algo: ${algo}`);
    const preCheck = body.replace(/\{check:\d+\}/, '');
    body = body.replace(/\{check:\d+\}/, CHECK_ALGOS[algo](preCheck));
  }

  return body;
}

// Preview helper for admin page and UI dropdown (shows an example SN).
// Uses a sample workorder + MAC so all tokens render.
export function previewSN(rule, opts = {}) {
  const seq = opts.seq ?? 42;
  return formatSN(rule, seq, {
    date: opts.date || new Date(),
    mac:  opts.mac  || 'de:ad:be:ef:ca:fe',
    wo:   opts.wo   || 'DEMO01',
  });
}

// Validate a SN against a rule (used for smoke-test readback verification).
// Rebuilds the SN with the same seq (parsed out of the observed SN) and compares.
// Returns { ok: boolean, expected?: string, reason?: string }.
export function verifySN(rule, observed, ctx = {}) {
  const date = ctx.date || new Date();
  const macHex = normalizeMac(ctx.mac);
  const wo = ctx.wo || '';

  // Extract seq width from template.
  const seqMatch = rule.template.match(/\{seq:(\d+)\}/);
  if (!seqMatch) return { ok: false, reason: 'rule has no seq token' };
  const seqWidth = Number(seqMatch[1]);

  // Build a regex from the template that captures seq and check. Non-seq
  // tokens are substituted with concrete values so the regex only has to
  // capture the parts we don't already know.
  const parts = dateParts(date);
  let pattern = rule.template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\\{yyyy\\}', parts.yyyy)
    .replace('\\{yy\\}', parts.yy)
    .replace('\\{mm\\}', parts.mm)
    .replace('\\{dd\\}', parts.dd)
    .replace('\\{wo\\}', wo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .replace('\\{mac\\}', macHex)
    .replace('\\{mac12\\}', macHex)
    .replace('\\{mac6\\}', macHex.slice(-6))
    .replace(/\\{seq:\d+\\}/, `(?<seq>\\d{${seqWidth}})`)
    .replace(/\\{check:\d+\\}/, '(?<check>\\d)');
  const re = new RegExp(`^${pattern}$`);
  const m = observed.match(re);
  if (!m) return { ok: false, reason: 'observed SN does not match rule' };

  const expected = formatSN(rule, Number(m.groups.seq), { date, mac: macHex, wo });
  return {
    ok: expected === observed,
    expected,
    reason: expected === observed ? undefined : 'check digit mismatch',
  };
}

// If loaded as a script (not module), expose to window for quick testing.
if (typeof window !== 'undefined') {
  window.MyframeSN = { formatSN, previewSN, verifySN, CHECK_ALGOS };
}

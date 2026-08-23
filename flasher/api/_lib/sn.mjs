// SN template engine (server-side mirror of the client sn.js). Kept in sync
// so that server-issued SN and client verification match byte-for-byte.

function luhnMod10(pre) {
  const digits = pre.replace(/\D/g, '').split('').map(Number);
  let sum = 0, alt = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return String((10 - (sum % 10)) % 10);
}
function mod10(pre) {
  return String(pre.replace(/\D/g, '').split('').reduce((a, c) => a + Number(c), 0) % 10);
}
const CHECK_ALGOS = { 'luhn-mod10': luhnMod10, 'mod10': mod10 };

export function formatSN(rule, seq, ctx = {}) {
  if (!rule?.template) throw new Error('SN rule missing template');
  const d = ctx.date || new Date();
  const parts = {
    yyyy: String(d.getUTCFullYear()),
    yy:   String(d.getUTCFullYear() % 100).padStart(2, '0'),
    mm:   String(d.getUTCMonth() + 1).padStart(2, '0'),
    dd:   String(d.getUTCDate()).padStart(2, '0'),
  };
  const wo = ctx.wo || '';
  const macHex = (ctx.mac || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  let body = rule.template.replace(/\{(yy|yyyy|mm|dd|wo|seq:\d+|mac|mac6|mac12)\}/g, (_, tok) => {
    if (tok in parts) return parts[tok];
    if (tok === 'wo') return wo;
    if (tok === 'mac' || tok === 'mac12') return macHex;
    if (tok === 'mac6') return macHex.slice(-6);
    if (tok.startsWith('seq:')) return String(seq).padStart(Number(tok.slice(4)), '0');
    return _;
  });
  const m = body.match(/\{check:(\d+)\}/);
  if (m) {
    const algo = rule.check || 'luhn-mod10';
    const pre = body.replace(/\{check:\d+\}/, '');
    body = body.replace(/\{check:\d+\}/, CHECK_ALGOS[algo](pre));
  }
  return body;
}

export function looksLikeRealMac(mac) {
  if (!mac || typeof mac !== 'string') return false;
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return false;
  const blacklist = new Set(['AABBCCDDEE01', 'AABBCCDDEE02', 'AABBCCDDEE03', '000000000000', 'FFFFFFFFFFFF']);
  return !blacklist.has(hex);
}

// MyFrame Flasher — debug mode toggle.
// Resolution order: URL `?debug=1|0` → localStorage → default off.
// State is reflected on <body class="debug-on"|"debug-off"> so CSS can switch
// visibility without JS on every element.

const STORAGE_KEY = 'myframe-flasher-debug';

function detect() {
  const url = new URL(window.location.href);
  const q = url.searchParams.get('debug');
  if (q === '1' || q === 'true') return true;
  if (q === '0' || q === 'false') return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return false; // factory default: OFF (worker-facing UI)
}

let _debug = detect();

function apply() {
  document.body.classList.toggle('debug-on', _debug);
  document.body.classList.toggle('debug-off', !_debug);
}

export function isDebug() { return _debug; }

export function setDebug(on) {
  _debug = !!on;
  localStorage.setItem(STORAGE_KEY, _debug ? '1' : '0');
  apply();
  window.dispatchEvent(new CustomEvent('mff:debug-change', { detail: { debug: _debug } }));
}

export function toggleDebug() { setDebug(!_debug); }

// Apply the initial class on script load so the very first paint reflects the
// resolved mode with no flicker.
if (typeof document !== 'undefined') {
  if (document.body) {
    apply();
  } else {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  }
}

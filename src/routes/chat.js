const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { bot } = require('../services/telegramService');
const { logger } = require('../utils/logger');

const OWNER_ID = parseInt(process.env.OWNER_ID || '5914076434');
const CHAT_FILE   = path.join(__dirname, '../services/data/chat_sessions.json');
const PUBLIC_FILE = path.join(__dirname, '../services/data/public_chat.json');
const UPLOAD_DIR  = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s/g,'_')}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });
// BASE_URL — set di environment variable Replit: BASE_URL=https://URL-KAMU.replit.app
// Kalau tidak di-set, otomatis pakai URL dari request (paling reliable)
const BASE_URL = process.env.BASE_URL || '';

function loadChats() {
  try { return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); } catch { return []; }
}
function saveChats(data) {
  try { fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2)); } catch {}
}
function loadPublic() {
  try {
    if (!fs.existsSync(PUBLIC_FILE)) fs.writeFileSync(PUBLIC_FILE, '[]');
    return JSON.parse(fs.readFileSync(PUBLIC_FILE, 'utf8'));
  } catch { return []; }
}
function savePublic(data) {
  try { fs.writeFileSync(PUBLIC_FILE, JSON.stringify(data, null, 2)); } catch {}
}
function getMsgs(username) {
  const chats = loadChats();
  return chats.filter(c => c.username === username).slice(-50);
}
function formatTime(date) {
  return date.toTimeString().substring(0, 5);
}

// ══════════════════════════════════════════════
//  PUBLIC CHAT — semua user bisa chat satu sama lain
// ══════════════════════════════════════════════

// POST /api/chat/send — kirim pesan (public atau ke owner)
router.post('/send', (req, res) => {
  const { username, message, key } = req.body;
  if (!username || !message) return res.json({ success: false, message: 'Data kurang' });

  const now = new Date();
  const msg = {
    id: Date.now(),
    username,
    message,
    from: 'user',
    time: formatTime(now),
    timestamp: now.toISOString(),
    read: false
  };

  // Simpan ke public chat
  const publicMsgs = loadPublic();
  publicMsgs.push(msg);
  // Batasi 200 pesan terakhir
  if (publicMsgs.length > 200) publicMsgs.splice(0, publicMsgs.length - 200);
  savePublic(publicMsgs);

  // Kirim notif ke owner via Telegram (tidak wajib)
  try {
    if (bot && OWNER_ID) {
      bot.sendMessage(OWNER_ID,
        `[PUBLIC CHAT] ${username}: ${message}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  } catch (_) {}

  logger.info(`[CHAT] ${username}: ${message}`);
  res.json({ success: true, message: 'Pesan terkirim' });
});

// GET /api/chat/messages — ambil semua public chat (username=PUBLIC) atau chat user-owner
router.get('/messages', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ success: false, messages: [] });

  // Kalau username=PUBLIC atau tidak spesifik → kembalikan public chat
  if (username === 'PUBLIC' || username === 'public') {
    const msgs = loadPublic().slice(-100);
    return res.json({ success: true, messages: msgs });
  }

  // Kalau username spesifik → ambil semua public chat (semua orang bisa lihat)
  // Ini yang dipakai Flutter: username = login user tapi mau lihat public
  const msgs = loadPublic().slice(-100);
  res.json({ success: true, messages: msgs });
});

// GET /api/chat/unread?username=xxx — cek ada pesan baru dari owner
router.get('/unread', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ count: 0 });
  const chats = loadChats();
  const unread = chats.filter(c => c.username === username && c.from === 'owner' && !c.read).length;
  res.json({ count: unread });
});

// POST /api/chat/owner-reply — dipakai telegram bot untuk simpan balasan owner
router.post('/owner-reply', (req, res) => {
  const { secret, username, message } = req.body;
  if (secret !== 'azrilstravas2024') return res.json({ success: false });

  const now = new Date();
  const msg = {
    id: Date.now(),
    username,
    message,
    from: 'owner',
    time: formatTime(now),
    timestamp: now.toISOString(),
    read: false
  };

  // Kalau balas ke PUBLIC, masuk ke public chat
  if (username === 'PUBLIC' || username === 'public') {
    const publicMsgs = loadPublic();
    publicMsgs.push({ ...msg, username: 'OWNER' });
    savePublic(publicMsgs);
  } else {
    const chats = loadChats();
    chats.push(msg);
    saveChats(chats);
  }

  res.json({ success: true });
});

// POST /api/chat/upload — upload gambar atau voice note
router.post('/upload', upload.single('file'), (req, res) => {
  const { username, type, key, duration } = req.body;
  if (!req.file || !username) return res.json({ success: false, message: 'File atau username kosong' });

  // Bangun URL file — pakai origin dari request sebagai fallback
  const origin = `${req.protocol}://${req.get('host')}`;
  // Prioritas: BASE_URL env → origin dari request
  const base   = BASE_URL ? BASE_URL : origin;
  const fileUrl = `${base}/uploads/${req.file.filename}`;

  const now = new Date();
  const msg = {
    id: Date.now(),
    username,
    message: '',
    type: type || 'image',
    fileUrl,
    from: 'user',
    time: now.toTimeString().substring(0, 5),
    timestamp: now.toISOString(),
    read: false,
  };

  // Simpan durasi untuk voice note
  if (type === 'voice' && duration) {
    msg.duration = duration;
  }

  // Simpan ke public chat jika key === 'public_chat'
  const publicMsgs = loadPublic();
  publicMsgs.push(msg);
  if (publicMsgs.length > 200) publicMsgs.splice(0, publicMsgs.length - 200);
  savePublic(publicMsgs);

  logger.info(`[CHAT UPLOAD] ${username}: ${type} → ${fileUrl}`);
  res.json({ success: true, url: fileUrl, message: 'Upload berhasil', duration: msg.duration });
});

// GET /api/chat/public — khusus public chat feed
router.get('/public', (req, res) => {
  const msgs = loadPublic().slice(-100);
  res.json({ success: true, messages: msgs });
});

// POST /api/chat/public — kirim ke public chat
router.post('/public', (req, res) => {
  const { username, message } = req.body;
  if (!username || !message) return res.json({ success: false, message: 'Data kurang' });
  const now = new Date();
  const msg = {
    id: Date.now(), username, message,
    from: 'user', type: 'text',
    time: formatTime(now),
    timestamp: now.toISOString(), read: false,
  };
  const msgs = loadPublic();
  msgs.push(msg);
  if (msgs.length > 200) msgs.splice(0, msgs.length - 200);
  savePublic(msgs);
  logger.info(`[PUBLIC] ${username}: ${message}`);
  res.json({ success: true, message: 'Pesan terkirim' });
});

module.exports = router;

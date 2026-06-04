const express = require('express');
const router = express.Router();
const musikController = require('../controllers/musikController');

// Search lagu dari YouTube Music
// GET /api/musik/search?q=nama+lagu
router.get('/search', musikController.search);

// Get stream URL lagu by videoId
// GET /api/musik/stream?id=VIDEO_ID
router.get('/stream', musikController.stream);

module.exports = router;

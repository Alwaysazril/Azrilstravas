const express = require('express');
const router = express.Router();
const animeController = require('../controllers/animeController');

// Search anime
// GET /api/anime/search?q=nama+anime
router.get('/search', animeController.search);

// Get episode list by anime ID
// GET /api/anime/episodes?id=ANIME_ID
router.get('/episodes', animeController.episodes);

// Get stream URL episode
// GET /api/anime/stream?id=EPISODE_ID
router.get('/stream', animeController.stream);

// Search drama china
// GET /api/anime/drama?q=nama+drama
router.get('/drama', animeController.searchDrama);

module.exports = router;

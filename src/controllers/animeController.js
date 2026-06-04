const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'Referer': 'https://aniwatch.to/',
};

// ── Search Anime (Aniwatch/Zoro) ─────────────
exports.search = async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ success: false, message: 'Parameter q diperlukan' });

  try {
    const response = await axios.get(
      `https://aniwatch-api-dusky.vercel.app/anime/search?q=${encodeURIComponent(q)}`,
      { timeout: 10000 }
    );
    const data = response.data;
    const animes = (data?.animes || []).map(a => ({
      id:     a.id,
      title:  a.name,
      cover:  a.poster,
      type:   a.type,
      episodes: a.episodes?.sub || 0,
      rating: a.rating || '',
    }));
    res.json({ success: true, animes });
  } catch (err) {
    console.error('Anime search error:', err.message);
    res.json({ success: false, message: 'Gagal cari anime', error: err.message });
  }
};

// ── Get Episode List ─────────────────────────
exports.episodes = async (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ success: false, message: 'Parameter id diperlukan' });

  try {
    const response = await axios.get(
      `https://aniwatch-api-dusky.vercel.app/anime/episodes/${id}`,
      { timeout: 10000 }
    );
    const data = response.data;
    const episodes = (data?.episodes || []).map(e => ({
      id:     e.episodeId,
      number: e.number,
      title:  e.title || `Episode ${e.number}`,
      isFiller: e.isFiller || false,
    }));
    res.json({ success: true, episodes, totalEpisodes: data?.totalEpisodes || 0 });
  } catch (err) {
    console.error('Anime episodes error:', err.message);
    res.json({ success: false, message: 'Gagal ambil episode', error: err.message });
  }
};

// ── Get Stream URL Episode ───────────────────
exports.stream = async (req, res) => {
  const id  = req.query.id;   // episodeId, contoh: "one-piece-100?ep=1234"
  const sub = req.query.sub !== 'false'; // default sub=true
  if (!id) return res.json({ success: false, message: 'Parameter id diperlukan' });

  try {
    const category = sub ? 'sub' : 'dub';
    const response = await axios.get(
      `https://aniwatch-api-dusky.vercel.app/anime/episode-srcs?id=${encodeURIComponent(id)}&category=${category}`,
      { timeout: 15000 }
    );
    const data = response.data;

    // Ambil sumber terbaik
    const sources = data?.sources || [];
    const m3u8    = sources.find(s => s.type === 'hls') || sources[0];

    // Subtitle
    const subtitles = (data?.tracks || [])
      .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
      .map(t => ({ label: t.label || 'Unknown', url: t.file, lang: t.label }));

    if (!m3u8?.url) {
      return res.json({ success: false, message: 'Stream tidak tersedia' });
    }

    res.json({
      success:   true,
      streamUrl: m3u8.url,
      subtitles,
      headers:   data?.headers || {},
    });
  } catch (err) {
    console.error('Anime stream error:', err.message);
    res.json({ success: false, message: 'Gagal ambil stream', error: err.message });
  }
};

// ── Search Drama China (Dramacool) ───────────
exports.searchDrama = async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ success: false, message: 'Parameter q diperlukan' });

  try {
    // Scrape Dramacool via consumet API
    const response = await axios.get(
      `https://consumet-api-two.vercel.app/movies/dramacool/${encodeURIComponent(q)}`,
      { timeout: 10000 }
    );
    const data = response.data;
    const dramas = (data?.results || []).map(d => ({
      id:       d.id,
      title:    d.title,
      cover:    d.image,
      type:     d.type || 'Drama',
      releaseDate: d.releaseDate || '',
      url:      d.url,
    }));
    res.json({ success: true, dramas });
  } catch (err) {
    console.error('Drama search error:', err.message);
    res.json({ success: false, message: 'Gagal cari drama', error: err.message });
  }
};

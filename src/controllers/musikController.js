const axios = require('axios');

// ── Innertube API (YouTube Music internal API) ──
// Tidak butuh API key, pakai endpoint internal YouTube Music
const YTM_BASE = 'https://music.youtube.com/youtubei/v1';
const YTM_KEY  = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-KLET5YdCE';
const YTM_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20231101.01.00',
    hl: 'id',
    gl: 'ID',
  }
};

// ── Search lagu ──────────────────────────────
exports.search = async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ success: false, message: 'Parameter q diperlukan' });

  try {
    const response = await axios.post(
      `${YTM_BASE}/search?key=${YTM_KEY}`,
      {
        context: YTM_CONTEXT,
        query: q,
        params: 'EgWKAQIIAWoKEAoQAxAEEAkQBQ%3D%3D', // filter: songs only
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://music.youtube.com',
          'Referer': 'https://music.youtube.com/',
          'X-Youtube-Client-Name': '67',
          'X-Youtube-Client-Version': '1.20231101.01.00',
        },
        timeout: 10000,
      }
    );

    const data = response.data;
    const tracks = [];

    // Parse YouTube Music search response
    const contents = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const items = section?.musicShelfRenderer?.contents || [];
      for (const item of items) {
        try {
          const r = item?.musicResponsiveListItemRenderer;
          if (!r) continue;

          const videoId = r?.playlistItemData?.videoId
            || r?.overlay?.musicItemThumbnailOverlayRenderer
               ?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
               ?.watchEndpoint?.videoId;

          if (!videoId) continue;

          // Title
          const title = r?.flexColumns?.[0]
            ?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs?.[0]?.text || 'Unknown';

          // Artist & album & duration dari column kedua
          const col2runs = r?.flexColumns?.[1]
            ?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs || [];

          const artist   = col2runs[0]?.text || 'Unknown';
          const album    = col2runs[2]?.text || '';
          const duration = col2runs[col2runs.length - 1]?.text || '';

          // Cover
          const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const cover  = thumbs[thumbs.length - 1]?.url || '';

          // Duration in seconds
          let durationSec = 0;
          if (duration && duration.includes(':')) {
            const parts = duration.split(':').map(Number);
            if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
            if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }

          tracks.push({ videoId, title, artist, album, cover, duration, durationSec });
        } catch (_) {}
      }
    }

    res.json({ success: true, tracks });
  } catch (err) {
    console.error('Musik search error:', err.message);
    res.json({ success: false, message: 'Gagal cari lagu', error: err.message });
  }
};

// ── Get stream URL ───────────────────────────
exports.stream = async (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ success: false, message: 'Parameter id diperlukan' });

  try {
    // Ambil player response dari YouTube
    const response = await axios.post(
      `https://www.youtube.com/youtubei/v1/player?key=${YTM_KEY}`,
      {
        context: {
          client: {
            clientName: 'ANDROID_MUSIC',
            clientVersion: '6.42.52',
            androidSdkVersion: 30,
            hl: 'id',
            gl: 'ID',
          }
        },
        videoId: id,
        contentCheckOk: true,
        racyCheckOk: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 11) gzip',
          'X-Youtube-Client-Name': '21',
          'X-Youtube-Client-Version': '6.42.52',
        },
        timeout: 15000,
      }
    );

    const playerData = response.data;

    // Cek apakah video bisa diputar
    const status = playerData?.playabilityStatus?.status;
    if (status !== 'OK') {
      return res.json({ success: false, message: `Video tidak bisa diputar: ${status}` });
    }

    // Ambil audio-only stream (format terbaik)
    const formats = [
      ...(playerData?.streamingData?.adaptiveFormats || []),
      ...(playerData?.streamingData?.formats || []),
    ];

    // Filter audio only, sort by bitrate tertinggi
    const audioFormats = formats
      .filter(f => f.mimeType?.startsWith('audio/') && f.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    if (audioFormats.length === 0) {
      return res.json({ success: false, message: 'Tidak ada audio stream tersedia' });
    }

    const best = audioFormats[0];

    // Info video
    const details   = playerData?.videoDetails || {};
    const durationSec = parseInt(details?.lengthSeconds || '0');

    res.json({
      success:     true,
      streamUrl:   best.url,
      mimeType:    best.mimeType,
      bitrate:     best.bitrate,
      durationSec,
      title:       details?.title || '',
      author:      details?.author || '',
      thumbnail:   details?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || '',
    });

  } catch (err) {
    console.error('Musik stream error:', err.message);
    res.json({ success: false, message: 'Gagal ambil stream', error: err.message });
  }
};

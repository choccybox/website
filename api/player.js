const express = require('express');
const axios = require('axios');
const player = express();
const path = require('path');
const dotenv = require('dotenv');
const NodeCache = require('node-cache');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20001;
const artworkCache = new NodeCache({ stdTTL: 30 * 24 * 60 * 60 });
const defaultLastFmImageId = '2a96cbd8b46e442fc41c2b86b821562f';
let nextMusicBrainzRequestAt = 0;

player.get('/player', async (req, res) => {
  try {
    const nowPlayingResponse = await getNowPlaying();
    res.json(nowPlayingResponse);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).send('Error occurred while fetching currently playing track.');
  }
});

function getLastFmArtwork(track) {
  const images = track.image || [];
  const high = images[3]?.['#text'];
  if (!high || high.includes(defaultLastFmImageId)) {
    return null;
  }

  return {
    low: images[2]?.['#text'] || high,
    high,
  };
}

async function waitForMusicBrainzSlot() {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextMusicBrainzRequestAt);
  nextMusicBrainzRequestAt = scheduledAt + 1100;
  if (scheduledAt > now) {
    await new Promise(resolve => setTimeout(resolve, scheduledAt - now));
  }
}

async function getMusicBrainzArtwork(name, artist) {
  if (!name || !artist) {
    return null;
  }

  const cacheKey = `${artist}\u0000${name}`.toLowerCase();
  if (artworkCache.has(cacheKey)) {
    return artworkCache.get(cacheKey);
  }

  try {
    await waitForMusicBrainzSlot();
    const response = await axios.get('https://musicbrainz.org/ws/2/recording/', {
      params: {
        query: `recording:"${name.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`,
        fmt: 'json',
        limit: 1,
        inc: 'releases',
      },
      headers: {
        'User-Agent': process.env.MUSICBRAINZ_USER_AGENT || 'choccynton/1.0 (artwork lookup)',
      },
      timeout: 10000,
    });

    const releaseId = response.data.recordings?.[0]?.releases?.[0]?.id;
    const artwork = releaseId ? {
      low: `https://coverartarchive.org/release/${releaseId}/front-250`,
      high: `https://coverartarchive.org/release/${releaseId}/front-500`,
    } : null;
    artworkCache.set(cacheKey, artwork);
    return artwork;
  } catch (error) {
    console.warn(`MusicBrainz artwork lookup failed (HTTP ${error.response?.status || 500}).`);
    artworkCache.set(cacheKey, null);
    return null;
  }
}

async function getNowPlaying() {
  const lastfmResponse = await axios.get('https://ws.audioscrobbler.com/2.0/', {
    params: {
      method: 'user.getrecenttracks',
      user: process.env.LASTFM_USERNAME,
      api_key: process.env.LASTFM_API_KEY,
      format: 'json',
      limit: 2,
    },
  });
  const tracks = lastfmResponse.data.recenttracks?.track || [];
  const currentTrack = tracks[0];
  if (!currentTrack) {
    throw new Error('Last.fm did not return any recent tracks.');
  }

  const isPlaying = currentTrack['@attr']?.nowplaying === 'true';
  const track = isPlaying ? currentTrack : tracks[1] || currentTrack;
  const name = track.name;
  const artist = track.artist?.['#text'];
  const image = getLastFmArtwork(track) || await getMusicBrainzArtwork(name, artist);

  return {
    isPlaying,
    name,
    artist,
    art: image ? 'album' : null,
    image,
  };
}

player.listen(PORT, async () => {
  console.log(`player running: ${PORT}`);
});

module.exports = player;
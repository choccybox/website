const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const stats = express();

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = 20003;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_DIRECTORY = path.resolve(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIRECTORY, 'stats.json');
const MUSICBRAINZ_USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT?.trim()
  || 'choccynton-stats/1.0 (contact: admin@localhost)';
const DEFAULT_LASTFM_IMAGE = '2a96cbd8b46e442fc41c2b86b821562f';

let cacheState = loadCache();
let refreshPromise = null;
let artworkPromises = new Map();
let musicBrainzQueue = Promise.resolve();
let lastMusicBrainzRequestAt = 0;

stats.get('/stats', async (req, res) => {
  if (hasFreshStats()) {
    return res.json(cacheState.stats.data);
  }

  if (!refreshPromise) {
    refreshPromise = refreshStats().finally(() => {
      refreshPromise = null;
    });
  }

  try {
    return res.json(await refreshPromise);
  } catch (error) {
    if (cacheState.stats && cacheState.stats.data) {
      return res.json(cacheState.stats.data);
    }

    console.error('Unable to refresh stats data.');
    return res.status(500).send('Error during data fetch.');
  }
});

async function refreshStats() {
  try {
    const [lastFMAlbums, lastFMArtists, lastFMTracks, lastFMInfo, lastFMRecent] = await Promise.all([
      getLastFm('user.gettopalbums', { period: 'overall' }),
      getLastFm('user.gettopartists', { period: 'overall' }),
      getLastFm('user.gettoptracks', { period: 'overall' }),
      getLastFm('user.getinfo'),
      getLastFm('user.getrecenttracks', { limit: 1 }),
    ]);

    let totalPlaytime = 0;
    let totalTracks = 0;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await getLastFm('user.gettoptracks', { page, limit: 1000 });

      if (page === 1) {
        totalPages = Math.ceil(response.data.toptracks['@attr'].total / 1000);
      }

      for (const track of response.data.toptracks.track) {
        totalTracks++;
        if (parseInt(track.duration, 10) !== 0) {
          totalPlaytime += parseInt(track.duration, 10) * parseInt(track.playcount, 10);
        }
      }

      page++;
    }

    const limit = 20;
    const lastFMOrganized = {
      topAlbums: await Promise.all(
        lastFMAlbums.data.topalbums.album.slice(0, limit).map(async (album) => {
          const images = await resolveArtwork('album', album.artist.name, album.name, album.image);
          return {
            name: album.name,
            artist: album.artist.name,
            imageHigh: images.high,
            imageLow: images.low,
            url: album.url,
            playcount: album.playcount,
            rank: album['@attr'].rank,
          };
        }),
      ),

      topArtists: await Promise.all(
        lastFMArtists.data.topartists.artist.slice(0, limit).map(async (artist) => {
          const images = await resolveArtwork('artist', artist.name, null, artist.image);
          return {
            name: artist.name,
            imageHigh: images.high,
            imageLow: images.low,
            url: artist.url,
            playcount: artist.playcount,
            rank: artist['@attr'].rank,
          };
        }),
      ),

      topTracks: await Promise.all(
        lastFMTracks.data.toptracks.track.slice(0, limit).map(async (track) => {
          const cleanedName = track.name.replace(/\s*[\(\[].*?[\)\]]\s*/g, '').trim();
          const images = await resolveArtwork('track', track.artist.name, cleanedName, track.image);
          return {
            name: cleanedName,
            artist: track.artist.name,
            imageHigh: images.high,
            imageLow: images.low,
            url: track.url,
            playcount: track.playcount,
            rank: track['@attr'].rank,
          };
        }),
      ),

      userInfo: {
        total_plays: lastFMInfo.data.user.playcount,
        total_tracks: lastFMInfo.data.user.track_count,
        total_albums: lastFMInfo.data.user.album_count,
        total_artists: lastFMInfo.data.user.artist_count,
        total_playtime: convertToHuman(totalPlaytime),
      },
    };

    lastFMOrganized.firstTrack = {
      updateTime: new Date().toISOString(),
      name: lastFMRecent.data.recenttracks.track[0].name,
      artist: lastFMRecent.data.recenttracks.track[0].artist['#text'],
    };
    lastFMOrganized.totalPlaytime = convertToHuman(totalPlaytime);

    cacheState.stats = {
      cachedAt: Date.now(),
      data: lastFMOrganized,
    };
    saveCache();

    return lastFMOrganized;
  } catch (error) {
    saveCache();
    throw error;
  }
}

function getLastFm(method, params = {}) {
  return axios.get('https://ws.audioscrobbler.com/2.0/', {
    params: {
      method,
      user: process.env.LASTFM_USERNAME,
      api_key: process.env.LASTFM_API_KEY,
      format: 'json',
      ...params,
    },
  });
}

async function resolveArtwork(type, artist, track, lastFmImages) {
  const originalHigh = getImageAtSize(lastFmImages, 3);
  const originalLow = getImageAtSize(lastFmImages, 2);
  const high = isUsableLastFmImage(originalHigh) ? originalHigh : null;
  const low = isUsableLastFmImage(originalLow) ? originalLow : null;

  if (high && low) {
    return { high, low };
  }

  const fallback = await getCachedArtwork(type, artist, track);
  return {
    high: high || fallback || originalHigh,
    low: low || fallback || originalLow,
  };
}

function getImageAtSize(images, index) {
  const image = Array.isArray(images) ? images[index] : null;
  return image && typeof image['#text'] === 'string' ? image['#text'].trim() : '';
}

function isUsableLastFmImage(image) {
  return Boolean(image) && !image.toLowerCase().includes(DEFAULT_LASTFM_IMAGE);
}

async function getCachedArtwork(type, artist, track) {
  const key = artworkCacheKey(type, artist, track);
  if (Object.prototype.hasOwnProperty.call(cacheState.artwork, key)) {
    return cacheState.artwork[key];
  }

  if (artworkPromises.has(key)) {
    return artworkPromises.get(key);
  }

  const artworkPromise = findCoverArt(type, artist, track)
    .then((artwork) => {
      cacheState.artwork[key] = artwork;
      return artwork;
    })
    .finally(() => {
      artworkPromises.delete(key);
    });
  artworkPromises.set(key, artworkPromise);
  return artworkPromise;
}

function artworkCacheKey(type, artist, track) {
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase();
  if (type === 'track') {
    return `track:${normalize(artist)}\u0000${normalize(track)}`;
  }
  if (type === 'album') {
    return `album:${normalize(artist)}\u0000${normalize(track)}`;
  }
  return `artist:${normalize(artist)}`;
}

async function findCoverArt(type, artist, track) {
  const query = type === 'track'
    ? `recording:${musicBrainzQueryValue(track)} AND artist:${musicBrainzQueryValue(artist)}`
    : type === 'album'
      ? `release:${musicBrainzQueryValue(track)} AND artist:${musicBrainzQueryValue(artist)}`
      : `artist:${musicBrainzQueryValue(artist)}`;

  try {
    const response = await requestMusicBrainz('https://musicbrainz.org/ws/2/release/', {
      params: { query, fmt: 'json', limit: 5 },
      headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT },
    });
    const releases = Array.isArray(response.data.releases) ? response.data.releases : [];

    for (const release of releases) {
      const cover = await fetchCoverArt(release.id);
      if (cover) {
        return cover;
      }
    }
  } catch (error) {
    // A missing or temporarily unavailable fallback must not fail the stats response.
  }

  return null;
}

function musicBrainzQueryValue(value) {
  return `"${String(value || '').replace(/(["\\])/g, '\\$1')}"`;
}

function requestMusicBrainz(url, config) {
  const request = musicBrainzQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastMusicBrainzRequestAt));
    if (wait > 0) {
      await delay(wait);
    }

    lastMusicBrainzRequestAt = Date.now();
    return axios.get(url, config);
  });

  musicBrainzQueue = request.catch(() => undefined);
  return request;
}

async function fetchCoverArt(releaseId) {
  const url = `https://coverartarchive.org/release/${encodeURIComponent(releaseId)}/front`;

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT },
      maxRedirects: 0,
      responseType: 'stream',
      validateStatus: (status) => status === 200 || (status >= 300 && status < 400),
    });

    if (response.data && typeof response.data.destroy === 'function') {
      response.data.destroy();
    }
    return url;
  } catch (error) {
    return null;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasFreshStats() {
  return Boolean(
    cacheState.stats
    && cacheState.stats.data
    && Number.isFinite(cacheState.stats.cachedAt)
    && Date.now() - cacheState.stats.cachedAt < CACHE_TTL,
  );
}

function loadCache() {
  const emptyCache = { stats: null, artwork: {} };

  try {
    ensureCacheDirectory();
    if (!fs.existsSync(CACHE_FILE)) {
      return emptyCache;
    }

    fs.chmodSync(CACHE_FILE, 0o600);
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return {
      stats: parsed && parsed.stats && parsed.stats.data ? parsed.stats : null,
      artwork: parsed && parsed.artwork && typeof parsed.artwork === 'object' ? parsed.artwork : {},
    };
  } catch (error) {
    console.error('Unable to read the persistent stats cache.');
    return emptyCache;
  }
}

function saveCache() {
  let temporaryFile;

  try {
    ensureCacheDirectory();
    temporaryFile = path.join(CACHE_DIRECTORY, `stats-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(temporaryFile, JSON.stringify(cacheState), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(temporaryFile, 0o600);
    fs.renameSync(temporaryFile, CACHE_FILE);
    fs.chmodSync(CACHE_FILE, 0o600);
  } catch (error) {
    console.error('Unable to write the persistent stats cache.');
    if (temporaryFile) {
      try {
        fs.unlinkSync(temporaryFile);
      } catch (unlinkError) {
        // The temporary file may already have been renamed or removed.
      }
    }
  }
}

function ensureCacheDirectory() {
  fs.mkdirSync(CACHE_DIRECTORY, { recursive: true, mode: 0o700 });
  fs.chmodSync(CACHE_DIRECTORY, 0o700);
}

function convertToHuman(total_seconds) {
  const years = Math.floor(total_seconds / 31536000);
  const months = Math.floor((total_seconds % 31536000) / 2592000);
  const days = Math.floor((total_seconds % 2592000) / 86400);
  const hours = Math.floor((total_seconds % 86400) / 3600);
  const minutes = Math.floor((total_seconds % 3600) / 60);

  if (years > 0 && months > 0) {
    return `${years}y ${months}mo`;
  } else if (years > 0 && days > 0) {
    return `${years}y ${days}d`;
  } else if (years > 0 && hours > 0) {
    return `${years}y ${hours}h`;
  } else if (months > 0 && days > 0) {
    return `${months}mo ${days}d`;
  } else if (months > 0 && hours > 0) {
    return `${months}mo ${hours}h`;
  } else if (days > 0 && hours > 0) {
    return `${days}d ${hours}h`;
  } else if (years > 0) {
    return `${years}y`;
  } else if (months > 0) {
    return `${months}mo`;
  } else if (days > 0) {
    return `${days}d`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${total_seconds}s`;
}

stats.listen(PORT, async () => {
  console.log(`stats running: ${PORT}`);
});

module.exports = stats;

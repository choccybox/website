const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const dotenv = require('dotenv');

const stats = express();

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = 20003;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_FILE = path.resolve(process.env.STATS_CACHE_FILE || path.join(__dirname, 'cache', 'stats.json'));
const CACHE_DIRECTORY = path.dirname(CACHE_FILE);
const LIBRARY_FILE = path.join(CACHE_DIRECTORY, `${path.basename(CACHE_FILE, path.extname(CACHE_FILE))}-library.json`);
const LIBRARY_VERSION = 1;
const IMAGE_DIRECTORY = path.join(CACHE_DIRECTORY, 'images');
const IMAGE_ROUTE = '/stats/images';
const IMAGE_EXTENSIONS = ['jpg', 'png', 'webp'];
const USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT?.trim()
  || 'choccynton-stats/1.0 (contact: admin@localhost)';

const LISTENBRAINZ_API = 'https://api.listenbrainz.org';
const LISTENBRAINZ_MIN_INTERVAL = 1000;
const LISTEN_PAGE_SIZE = 1000;
// ListenBrainz asks clients to use the listens endpoint for roughly ten pages or fewer.
const MAX_INCREMENTAL_PAGES = 10;
const EXPORT_POLL_START = 30 * 1000;
const EXPORT_POLL_MAX = 120 * 1000;
const EXPORT_TIMEOUT = 2 * 60 * 60 * 1000;

// The newest 24 hours of loaded listens are remembered so that the next reload can find
// the exact point where the old data stops and only fetch what is newer than that.
const ANCHOR_WINDOW = 24 * 60 * 60;
const ANCHOR_MAX = 1000;

const RESPONSE_WAIT = 25 * 1000;
const RETRY_COOLDOWN = 5 * 60 * 1000;
const TOP_LIMIT = 20;

let cacheState = loadCache();
let library = loadLibrary();
let refreshPromise = null;
let lastFailure = null;
let listenBrainzUser = null;
let artworkPromises = new Map();
let imageDownloads = new Map();
let deezerQueue = Promise.resolve();
let lastDeezerRequestAt = 0;
let listenBrainzQueue = Promise.resolve();
let lastListenBrainzRequestAt = 0;
let listenBrainzBlockedUntil = 0;

stats.get('/stats', async (req, res) => {
  if (hasFreshStats()) {
    return res.json(cacheState.stats.data);
  }

  let timer;
  const outcome = await Promise.race([
    triggerRefresh().then((data) => ({ data }), (error) => ({ error })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timeout: true }), RESPONSE_WAIT);
    }),
  ]);
  clearTimeout(timer);

  if (outcome.data) {
    return res.json(outcome.data);
  }

  if (cacheState.stats && cacheState.stats.data) {
    return res.json(cacheState.stats.data);
  }

  if (outcome.timeout) {
    // The very first import can take minutes; it keeps running in the background.
    res.set('Retry-After', '60');
    return res.status(503).send('Stats are still being prepared, try again shortly.');
  }

  console.error(`Unable to refresh stats data: ${outcome.error && outcome.error.message}`);
  return res.status(500).send('Error during data fetch.');
});

function triggerRefresh() {
  if (refreshPromise) {
    return refreshPromise;
  }

  if (lastFailure && Date.now() - lastFailure.at < RETRY_COOLDOWN) {
    return Promise.reject(lastFailure.error);
  }

  refreshPromise = refreshStats()
    .then((data) => {
      lastFailure = null;
      return data;
    })
    .catch((error) => {
      lastFailure = { at: Date.now(), error };
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function refreshStats() {
  const username = await getListenBrainzUser();
  let current = library;
  let changed = false;

  if (current) {
    const synced = await syncLibrary(username, current);
    if (synced) {
      current = synced.library;
      changed = synced.changed;
    } else {
      current = null;
    }
  }

  if (!current) {
    // First run, or the cached data is too far behind to be caught up with the listens endpoint.
    current = await importFullHistory();
    const synced = await syncLibrary(username, current);
    if (!synced) {
      throw new Error('Unable to catch the imported listening history up to the present.');
    }
    current = synced.library;
    changed = true;
  }

  if (!changed && cacheState.stats && cacheState.stats.data) {
    // Nothing new was listened to, so every statistic is still correct.
    cacheState.stats.cachedAt = Date.now();
    cacheState.stats.data.firstTrack.updateTime = new Date().toISOString();
    saveCache();
    return cacheState.stats.data;
  }

  library = current;
  saveLibrary();

  const organized = buildStats(current, username);
  cacheState.stats = {
    cachedAt: Date.now(),
    data: organized,
  };
  saveCache();

  return organized;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function buildStats(source, username) {
  const profileUrl = `https://listenbrainz.org/user/${encodeURIComponent(username)}/`;

  let totalPlaytime = 0;
  for (const track of source.tracks.values()) {
    if (track.durationMs > 0) {
      totalPlaytime += Math.floor(track.durationMs / 1000) * track.plays;
    }
  }

  const organized = {
    topAlbums: rankItems(source.albums, TOP_LIMIT).map((album, index) => {
      const item = {
        name: album.name,
        artist: album.artist,
        imageHigh: null,
        imageLow: null,
        url: album.releaseMbid ? `https://musicbrainz.org/release/${album.releaseMbid}` : profileUrl,
        playcount: album.plays,
        rank: index + 1,
      };
      return attachArtwork(item, 'album', album.artist, album.name);
    }),

    topArtists: rankItems(source.artists, TOP_LIMIT).map((artist, index) => {
      const item = {
        name: artist.name,
        imageHigh: null,
        imageLow: null,
        url: artist.mbid ? `https://listenbrainz.org/artist/${artist.mbid}` : profileUrl,
        playcount: artist.plays,
        rank: index + 1,
      };
      return attachArtwork(item, 'artist', artist.name, null);
    }),

    topTracks: rankItems(source.tracks, TOP_LIMIT).map((track, index) => {
      const cleanedName = track.name.replace(/\s*[\(\[].*?[\)\]]\s*/g, '').trim() || track.name;
      const item = {
        name: cleanedName,
        artist: track.artist,
        imageHigh: null,
        imageLow: null,
        url: track.recordingMbid ? `https://musicbrainz.org/recording/${track.recordingMbid}` : profileUrl,
        playcount: track.plays,
        rank: index + 1,
      };
      return attachArtwork(item, 'track', track.artist, cleanedName);
    }),

    userInfo: {
      total_plays: source.totalPlays,
      total_tracks: source.tracks.size,
      total_albums: source.albums.size,
      total_artists: source.artists.size,
      total_playtime: convertToHuman(totalPlaytime),
    },
  };

  organized.firstTrack = {
    updateTime: new Date().toISOString(),
    name: source.latest ? source.latest.name : null,
    artist: source.latest ? source.latest.artist : null,
  };
  organized.totalPlaytime = convertToHuman(totalPlaytime);

  return organized;
}

function rankItems(map, limit) {
  return [...map.values()]
    .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function attachArtwork(item, type, artist, name) {
  const images = resolveArtwork(type, artist, name, (resolvedImages) => {
    item.imageHigh = resolvedImages.high;
    item.imageLow = resolvedImages.low;
  });
  item.imageHigh = images.high;
  item.imageLow = images.low;
  return item;
}

// ---------------------------------------------------------------------------
// Listening library (aggregated listens + the last 24 hours of loaded listens)
// ---------------------------------------------------------------------------

function createLibrary() {
  return {
    artists: new Map(),
    albums: new Map(),
    tracks: new Map(),
    totalPlays: 0,
    latestAt: 0,
    latest: null,
    anchor: [],
  };
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseListen(raw) {
  const meta = raw && raw.track_metadata;
  const listenedAt = Number(raw && raw.listened_at);
  if (!meta || !Number.isFinite(listenedAt)) {
    return null;
  }

  const artist = text(meta.artist_name);
  const name = text(meta.track_name);
  if (!artist || !name) {
    return null;
  }

  const info = meta.additional_info || {};
  const mapping = meta.mbid_mapping || {};
  const firstOf = (...values) => values.find((value) => typeof value === 'string' && value) || '';

  let durationMs = Number(info.duration_ms);
  if (!(durationMs > 0)) {
    durationMs = Number(info.duration) * 1000;
  }

  const release = text(meta.release_name);
  const artistKey = normalize(artist);
  const trackKey = `${artistKey}\u0000${normalize(name)}`;

  return {
    id: `${listenedAt}|${trackKey}`,
    listenedAt,
    artist,
    artistKey,
    artistMbid: firstOf(
      Array.isArray(mapping.artist_mbids) ? mapping.artist_mbids[0] : '',
      Array.isArray(info.artist_mbids) ? info.artist_mbids[0] : '',
    ),
    release,
    albumKey: release ? `${artistKey}\u0000${normalize(release)}` : '',
    releaseMbid: firstOf(mapping.release_mbid, info.release_mbid),
    name,
    trackKey,
    recordingMbid: firstOf(mapping.recording_mbid, info.recording_mbid),
    durationMs: durationMs > 0 ? Math.round(durationMs) : 0,
  };
}

function touch(map, key, create) {
  let record = map.get(key);
  if (!record) {
    record = create();
    map.set(key, record);
  }
  return record;
}

function addListen(target, listen) {
  target.totalPlays++;

  if (listen.listenedAt > target.latestAt) {
    target.latestAt = listen.listenedAt;
    target.latest = { name: listen.name, artist: listen.artist };
  }

  if (listen.listenedAt >= target.latestAt - ANCHOR_WINDOW) {
    target.anchor.push({ t: listen.listenedAt, id: listen.id });
    if (target.anchor.length > ANCHOR_MAX * 4) {
      pruneAnchor(target);
    }
  }

  const artist = touch(target.artists, listen.artistKey, () => ({
    name: listen.artist,
    mbid: '',
    plays: 0,
  }));
  artist.plays++;
  artist.mbid = artist.mbid || listen.artistMbid;

  if (listen.albumKey) {
    const album = touch(target.albums, listen.albumKey, () => ({
      name: listen.release,
      artist: listen.artist,
      releaseMbid: '',
      plays: 0,
    }));
    album.plays++;
    album.releaseMbid = album.releaseMbid || listen.releaseMbid;
  }

  const track = touch(target.tracks, listen.trackKey, () => ({
    name: listen.name,
    artist: listen.artist,
    recordingMbid: '',
    durationMs: 0,
    plays: 0,
  }));
  track.plays++;
  track.recordingMbid = track.recordingMbid || listen.recordingMbid;
  track.durationMs = track.durationMs || listen.durationMs;
}

function pruneAnchor(target) {
  const oldest = target.latestAt - ANCHOR_WINDOW;
  const seen = new Set();
  target.anchor = target.anchor
    .filter((entry) => entry.t >= oldest)
    .sort((a, b) => b.t - a.t)
    .filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    })
    .slice(0, ANCHOR_MAX);
}

function applyListens(target, listens) {
  for (const listen of listens) {
    addListen(target, listen);
  }
  pruneAnchor(target);
}

function buildLibrary(listens) {
  const created = createLibrary();
  applyListens(created, listens);
  return created;
}

// ---------------------------------------------------------------------------
// Incremental reload
// ---------------------------------------------------------------------------

// Reads listens newest-first until reaching a listen that is already part of the stored
// last-24-hours window. Everything read before that point is what the old data is missing.
async function fetchNewListens(username, anchor) {
  const anchorIds = new Set(anchor.map((entry) => entry.id));
  const seen = new Set();
  const listens = [];
  let read = 0;
  let maxTs = null;

  for (let page = 0; page < MAX_INCREMENTAL_PAGES; page++) {
    const params = { count: LISTEN_PAGE_SIZE };
    if (maxTs !== null) {
      params.max_ts = maxTs;
    }

    const response = await requestListenBrainz('get', `/1/user/${encodeURIComponent(username)}/listens`, { params });
    const rawListens = response.data && response.data.payload && response.data.payload.listens;
    if (!Array.isArray(rawListens) || rawListens.length === 0) {
      return { listens, read, reachedAnchor: false, exhausted: true };
    }

    let added = 0;
    for (const rawListen of rawListens) {
      read++;
      const listen = parseListen(rawListen);
      if (!listen) {
        continue;
      }
      if (anchorIds.has(listen.id)) {
        return { listens, read, reachedAnchor: true, exhausted: false };
      }
      if (!seen.has(listen.id)) {
        seen.add(listen.id);
        listens.push(listen);
        added++;
      }
    }

    // A short page means the end of the history was reached.
    if (rawListens.length < LISTEN_PAGE_SIZE) {
      return { listens, read, reachedAnchor: false, exhausted: true };
    }

    // max_ts is exclusive; +1 keeps listens sharing the boundary timestamp (deduplicated above).
    maxTs = Number(rawListens[rawListens.length - 1].listened_at) + 1;
    if (added === 0) {
      break;
    }
  }

  return { listens, read, reachedAnchor: false, exhausted: false };
}

// Brings a library up to date. Returns null when the library is too far behind (or its
// window no longer matches ListenBrainz) and has to be rebuilt from a full export.
async function syncLibrary(username, current) {
  const result = await fetchNewListens(username, current.anchor);

  if (result.reachedAnchor) {
    if (result.listens.length === 0) {
      return { library: current, changed: false };
    }
    // Work on a copy so a failure part-way can never leave the live library half-updated.
    const updated = cloneLibrary(current);
    applyListens(updated, result.listens);
    return { library: updated, changed: true };
  }

  if (result.exhausted) {
    // Replacing the library is destructive, so first confirm the pages read really are the
    // whole history rather than a truncated response.
    const counted = await requestListenBrainz('get', `/1/user/${encodeURIComponent(username)}/listen-count`);
    const total = Number(counted.data && counted.data.payload && counted.data.payload.count);
    if (Number.isFinite(total) && total > result.read) {
      return null;
    }

    // The whole history fit into the pages just read, so it can simply replace the old data.
    return { library: buildLibrary(result.listens), changed: true };
  }

  return null;
}

function cloneLibrary(source) {
  return {
    artists: new Map([...source.artists].map(([key, value]) => [key, { ...value }])),
    albums: new Map([...source.albums].map(([key, value]) => [key, { ...value }])),
    tracks: new Map([...source.tracks].map(([key, value]) => [key, { ...value }])),
    totalPlays: source.totalPlays,
    latestAt: source.latestAt,
    latest: source.latest ? { ...source.latest } : null,
    anchor: source.anchor.map((entry) => ({ ...entry })),
  };
}

// ---------------------------------------------------------------------------
// Full history import (ListenBrainz export API)
// ---------------------------------------------------------------------------

async function importFullHistory() {
  const job = await findOrCreateExport();
  await waitForExport(job.export_id);

  const archive = path.join(CACHE_DIRECTORY, `export-${process.pid}-${Date.now()}.zip`);
  try {
    await downloadExport(job.export_id, archive);
    return await buildLibraryFromArchive(archive);
  } finally {
    try {
      fs.unlinkSync(archive);
    } catch (error) {
      // The archive may never have been created.
    }
  }
}

async function findOrCreateExport() {
  const response = await requestListenBrainz('get', '/1/export/list');
  const exports = Array.isArray(response.data) ? response.data : [];
  const now = Date.now();

  const reusable = exports.find((item) => {
    const fullHistory = item.start_time == null && item.end_time == null;
    if (!fullHistory) {
      return false;
    }
    if (item.status === 'waiting' || item.status === 'in_progress') {
      return true;
    }
    return item.status === 'completed'
      && now - Date.parse(item.created) < CACHE_TTL
      && (!item.available_until || Date.parse(item.available_until) > now);
  });
  if (reusable) {
    return reusable;
  }

  const created = await requestListenBrainz('post', '/1/export/');
  return created.data;
}

async function waitForExport(exportId) {
  const deadline = Date.now() + EXPORT_TIMEOUT;
  let wait = EXPORT_POLL_START;

  for (;;) {
    const response = await requestListenBrainz('get', `/1/export/${encodeURIComponent(exportId)}`);
    const status = response.data && response.data.status;

    if (status === 'completed') {
      return response.data;
    }
    if (status === 'failed') {
      throw new Error('The ListenBrainz export failed.');
    }
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the ListenBrainz export.');
    }

    await delay(wait * (0.8 + Math.random() * 0.4));
    wait = Math.min(wait * 1.5, EXPORT_POLL_MAX);
  }
}

async function downloadExport(exportId, file) {
  ensureCacheDirectory();
  const response = await requestListenBrainz('get', `/1/export/${encodeURIComponent(exportId)}/download`, {
    responseType: 'stream',
  });
  await pipeline(response.data, fs.createWriteStream(file, { mode: 0o600 }));
}

async function buildLibraryFromArchive(file) {
  const created = createLibrary();

  for await (const content of readArchiveListenFiles(file)) {
    for (const line of content.split('\n')) {
      if (!line.trim()) {
        continue;
      }

      let listen;
      try {
        listen = parseListen(JSON.parse(line));
      } catch (error) {
        listen = null;
      }
      if (listen) {
        addListen(created, listen);
      }
    }

    // Keep the server responsive while a large history is processed.
    await new Promise((resolve) => setImmediate(resolve));
  }

  pruneAnchor(created);
  return created;
}

// Minimal ZIP reader: yields the contents of every listens/<year>/<month>.jsonl entry.
async function* readArchiveListenFiles(file) {
  const handle = await fs.promises.open(file, 'r');

  try {
    const { size } = await handle.stat();
    const tailSize = Math.min(size, 65557);
    const tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, size - tailSize);

    let end = -1;
    for (let i = tailSize - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) {
      throw new Error('The ListenBrainz export is not a valid ZIP archive.');
    }

    const entryCount = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
      throw new Error('ZIP64 export archives are not supported.');
    }

    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, directoryOffset);

    let position = 0;
    for (let i = 0; i < entryCount; i++) {
      if (directory.readUInt32LE(position) !== 0x02014b50) {
        throw new Error('The ListenBrainz export has a corrupt ZIP directory.');
      }

      const method = directory.readUInt16LE(position + 10);
      const compressedSize = directory.readUInt32LE(position + 20);
      const nameLength = directory.readUInt16LE(position + 28);
      const extraLength = directory.readUInt16LE(position + 30);
      const commentLength = directory.readUInt16LE(position + 32);
      const localOffset = directory.readUInt32LE(position + 42);
      const name = directory.toString('utf8', position + 46, position + 46 + nameLength);
      position += 46 + nameLength + extraLength + commentLength;

      if (!/^listens\/.+\.jsonl$/.test(name)) {
        continue;
      }

      const local = Buffer.alloc(30);
      await handle.read(local, 0, 30, localOffset);
      if (local.readUInt32LE(0) !== 0x04034b50) {
        throw new Error('The ListenBrainz export has a corrupt ZIP entry.');
      }

      const dataOffset = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const compressed = Buffer.alloc(compressedSize);
      await handle.read(compressed, 0, compressedSize, dataOffset);

      if (method === 0) {
        yield compressed.toString('utf8');
      } else if (method === 8) {
        yield zlib.inflateRawSync(compressed).toString('utf8');
      } else {
        throw new Error(`Unsupported ZIP compression method ${method}.`);
      }
    }
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------
// ListenBrainz HTTP client
// ---------------------------------------------------------------------------

async function getListenBrainzUser() {
  if (!listenBrainzUser) {
    const response = await requestListenBrainz('get', '/1/validate-token');
    if (!response.data || !response.data.valid || !response.data.user_name) {
      throw new Error('LISTENBRAINZ_USER_TOKEN is not a valid ListenBrainz token.');
    }
    listenBrainzUser = response.data.user_name;
  }
  return listenBrainzUser;
}

// Every call is authenticated with LISTENBRAINZ_USER_TOKEN and goes through one queue so the
// one-request-per-second guideline and the server's rate limit headers are always respected.
function requestListenBrainz(method, url, config = {}) {
  const request = listenBrainzQueue.then(() => sendListenBrainzRequest(method, url, config));
  listenBrainzQueue = request.catch(() => undefined);
  return request;
}

async function sendListenBrainzRequest(method, url, config) {
  const token = process.env.LISTENBRAINZ_USER_TOKEN?.trim();
  if (!token) {
    throw new Error('LISTENBRAINZ_USER_TOKEN is not set.');
  }

  const maxAttempts = 4;
  for (let attempt = 1; ; attempt++) {
    const wait = Math.max(listenBrainzBlockedUntil, lastListenBrainzRequestAt + LISTENBRAINZ_MIN_INTERVAL) - Date.now();
    if (wait > 0) {
      await delay(wait);
    }
    lastListenBrainzRequestAt = Date.now();

    try {
      const response = await axios({
        method,
        url: `${LISTENBRAINZ_API}${url}`,
        ...config,
        headers: {
          Authorization: `Token ${token}`,
          'User-Agent': USER_AGENT,
        },
      });
      noteRateLimit(response.headers);
      return response;
    } catch (error) {
      const status = error.response && error.response.status;
      if (error.response) {
        noteRateLimit(error.response.headers, status === 429);
        if (error.response.data && typeof error.response.data.destroy === 'function') {
          error.response.data.destroy();
        }
      }

      const retryable = !error.response || status === 429 || status >= 500;
      if (!retryable || attempt >= maxAttempts) {
        throw new Error(`ListenBrainz request ${method.toUpperCase()} ${url} failed${status ? ` with status ${status}` : `: ${error.message}`}.`);
      }

      if (status !== 429) {
        listenBrainzBlockedUntil = Math.max(listenBrainzBlockedUntil, Date.now() + 2000 * 2 ** (attempt - 1));
      }
    }
  }
}

function noteRateLimit(headers = {}, limited = false) {
  const remaining = Number(headers['x-ratelimit-remaining']);
  const resetIn = Number(headers['x-ratelimit-reset-in']);

  if ((limited || remaining <= 0) && Number.isFinite(resetIn)) {
    listenBrainzBlockedUntil = Math.max(listenBrainzBlockedUntil, Date.now() + (resetIn + 1) * 1000);
  } else if (limited) {
    listenBrainzBlockedUntil = Math.max(listenBrainzBlockedUntil, Date.now() + 10 * 1000);
  }
}

// ---------------------------------------------------------------------------
// Artwork (found through Deezer, downloaded once and then served from this server)
// ---------------------------------------------------------------------------

function resolveArtwork(type, artist, name, onResolved) {
  const key = artworkCacheKey(type, artist, name);
  const applyArtwork = (image) => ({
    high: image || null,
    low: image || null,
  });

  if (Object.prototype.hasOwnProperty.call(cacheState.artwork, key)) {
    const cached = cacheState.artwork[key];
    // A cached "no image" is kept; a cached image is only trusted while its file still exists.
    if (!cached || imageFileExists(cached)) {
      return applyArtwork(cached);
    }
  }

  // Artwork lookups are rate-limited; never make the stats endpoint wait for them.
  void getCachedArtwork(type, artist, name)
    .then((image) => {
      onResolved(applyArtwork(image));
      saveCache();
    })
    .catch(() => undefined);

  return applyArtwork(null);
}

function getCachedArtwork(type, artist, name) {
  const key = artworkCacheKey(type, artist, name);

  if (artworkPromises.has(key)) {
    return artworkPromises.get(key);
  }

  const artworkPromise = findCoverArt(type, artist, name)
    .then((image) => {
      cacheState.artwork[key] = image;
      return image;
    })
    .finally(() => {
      artworkPromises.delete(key);
    });
  artworkPromises.set(key, artworkPromise);
  return artworkPromise;
}

function artworkCacheKey(type, artist, name) {
  // The prefix versions the cache so entries from earlier artwork sources are never reused.
  if (type === 'artist') {
    return `deezer:artist:${normalize(artist)}`;
  }
  return `deezer:${type}:${normalize(artist)}\u0000${normalize(name)}`;
}

// Resolves to a local image path, or null when Deezer has nothing. Network failures throw so
// that they are retried later instead of being cached as "no image".
async function findCoverArt(type, artist, name) {
  const remote = type === 'artist'
    ? await findDeezerArtistImage(artist)
    : await findDeezerReleaseImage(type, artist, name);

  return remote ? cacheImage(remote) : null;
}

async function findDeezerArtistImage(artist) {
  const image = await searchDeezerArtistImage(artist);
  if (image) {
    return image;
  }

  // Collaboration credits ("A & B", "A feat. B") have no page of their own; use the lead artist.
  const lead = artist.split(/\s+(?:&|x|feat\.?|ft\.?|with)\s+|\s*,\s*/i)[0].trim();
  return lead && normalize(lead) !== normalize(artist) ? searchDeezerArtistImage(lead) : null;
}

async function searchDeezerArtistImage(artist) {
  const results = await searchDeezer('artist', { q: artist });

  // Only trust an exact name match; a loosely related artist would show the wrong person.
  const match = results.find((result) => normalize(result.name) === normalize(artist));
  return usableDeezerImage(match && (match.picture_big || match.picture_xl));
}

async function findDeezerReleaseImage(type, artist, name) {
  const field = type === 'album' ? 'album' : 'track';
  const quote = (value) => String(value).replace(/"/g, ' ').trim();
  const queries = [
    `artist:"${quote(artist)}" ${field}:"${quote(name)}"`,
    `${quote(artist)} ${quote(name)}`,
  ];

  for (const q of queries) {
    const results = await searchDeezer(field, { q });
    const candidates = results.filter((result) => sameArtist(result.artist && result.artist.name, artist));
    const title = (result) => normalize(type === 'album' ? result.title : result.title_short || result.title);
    const wanted = normalize(name);

    const match = candidates.find((result) => title(result) === wanted)
      || candidates.find((result) => title(result).startsWith(wanted) || wanted.startsWith(title(result)));
    const cover = type === 'album' ? match : match && match.album;
    const image = usableDeezerImage(cover && (cover.cover_big || cover.cover_xl));
    if (image) {
      return image;
    }
  }

  return null;
}

function sameArtist(candidate, artist) {
  const a = normalize(candidate);
  const b = normalize(artist);
  return Boolean(a) && Boolean(b) && (a === b || a.includes(b) || b.includes(a));
}

async function searchDeezer(kind, params) {
  const response = await requestDeezer(`https://api.deezer.com/search/${kind}`, {
    params: { limit: 10, ...params },
  });
  return Array.isArray(response.data && response.data.data) ? response.data.data : [];
}

// Deezer serves a generic placeholder (empty image hash) for entries without artwork.
function usableDeezerImage(url) {
  return url && !/\/images\/[^/]+\/\//.test(url) ? url : null;
}

function requestDeezer(url, config) {
  const request = deezerQueue.then(async () => {
    const wait = Math.max(0, 250 - (Date.now() - lastDeezerRequestAt));
    if (wait > 0) {
      await delay(wait);
    }

    lastDeezerRequestAt = Date.now();
    return axios.get(url, { timeout: 10000, headers: { 'User-Agent': USER_AGENT }, ...config });
  });

  deezerQueue = request.catch(() => undefined);
  return request;
}

// ---------------------------------------------------------------------------
// Image cache
// ---------------------------------------------------------------------------

function imageFileExists(localPath) {
  return fs.existsSync(path.join(IMAGE_DIRECTORY, path.basename(localPath)));
}

// Downloads an image once and returns the local path it is served from. The file name is a
// hash of the source URL, so every item sharing a cover (several tracks of one album) ends
// up with the same file and the cover is only ever downloaded a single time.
async function cacheImage(url) {
  const id = crypto.createHash('sha1').update(url).digest('hex');

  for (const extension of IMAGE_EXTENSIONS) {
    if (fs.existsSync(path.join(IMAGE_DIRECTORY, `${id}.${extension}`))) {
      return `${IMAGE_ROUTE}/${id}.${extension}`;
    }
  }

  if (imageDownloads.has(id)) {
    return imageDownloads.get(id);
  }

  const download = (async () => {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024,
      headers: { 'User-Agent': USER_AGENT },
    });

    const type = String(response.headers['content-type'] || '').toLowerCase();
    const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : null;
    if (!extension) {
      throw new Error('The artwork URL did not return an image.');
    }

    fs.mkdirSync(IMAGE_DIRECTORY, { recursive: true, mode: 0o700 });
    const file = path.join(IMAGE_DIRECTORY, `${id}.${extension}`);
    const temporaryFile = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryFile, response.data, { mode: 0o600 });
    fs.renameSync(temporaryFile, file);
    return `${IMAGE_ROUTE}/${id}.${extension}`;
  })().finally(() => {
    imageDownloads.delete(id);
  });

  imageDownloads.set(id, download);
  return download;
}

stats.get(`${IMAGE_ROUTE}/:file`, (req, res) => {
  if (!/^[a-f0-9]{40}\.(?:jpg|png|webp)$/.test(req.params.file)) {
    return res.sendStatus(404);
  }

  // The file name is a hash of the source URL, so the content behind it never changes.
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  return res.sendFile(req.params.file, { root: IMAGE_DIRECTORY, cacheControl: false }, (error) => {
    if (error && !res.headersSent) {
      res.sendStatus(404);
    }
  });
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// ---------------------------------------------------------------------------
// Persistent cache
// ---------------------------------------------------------------------------

function hasFreshStats() {
  return Boolean(
    library
    && cacheState.stats
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
  writeJsonAtomically(CACHE_FILE, cacheState, 'stats cache');
}

function loadLibrary() {
  try {
    ensureCacheDirectory();
    if (!fs.existsSync(LIBRARY_FILE)) {
      return null;
    }

    fs.chmodSync(LIBRARY_FILE, 0o600);
    const parsed = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    if (!parsed || parsed.version !== LIBRARY_VERSION) {
      return null;
    }

    return {
      artists: new Map(parsed.artists),
      albums: new Map(parsed.albums),
      tracks: new Map(parsed.tracks),
      totalPlays: parsed.totalPlays,
      latestAt: parsed.latestAt,
      latest: parsed.latest,
      anchor: parsed.anchor,
    };
  } catch (error) {
    console.error('Unable to read the persistent listening library.');
    return null;
  }
}

function saveLibrary() {
  if (!library) {
    return;
  }

  writeJsonAtomically(LIBRARY_FILE, {
    version: LIBRARY_VERSION,
    totalPlays: library.totalPlays,
    latestAt: library.latestAt,
    latest: library.latest,
    anchor: library.anchor,
    artists: [...library.artists],
    albums: [...library.albums],
    tracks: [...library.tracks],
  }, 'listening library');
}

function writeJsonAtomically(file, value, label) {
  let temporaryFile;

  try {
    ensureCacheDirectory();
    temporaryFile = path.join(CACHE_DIRECTORY, `${path.basename(file)}-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(temporaryFile, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(temporaryFile, 0o600);
    fs.renameSync(temporaryFile, file);
    fs.chmodSync(file, 0o600);
  } catch (error) {
    console.error(`Unable to write the persistent ${label}.`);
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

// Cached stats can outlive the artwork lookups that were pending when they were built.
function resolveMissingArtwork() {
  const data = cacheState.stats && cacheState.stats.data;
  if (!data) {
    return;
  }

  const lists = [['topAlbums', 'album'], ['topArtists', 'artist'], ['topTracks', 'track']];
  for (const [listName, type] of lists) {
    for (const item of data[listName] || []) {
      const apply = (images) => {
        item.imageHigh = images.high;
        item.imageLow = images.low;
      };
      // Anything not already served from the local image cache (including entries stored by
      // older versions) is looked up again; the old image stays in place until then.
      if (!item.imageHigh || !item.imageHigh.startsWith(IMAGE_ROUTE + '/')) {
        const images = resolveArtwork(type, type === 'artist' ? item.name : item.artist, item.name, apply);
        if (images.high) {
          apply(images);
        }
      }
    }
  }
}

stats.listen(PORT, async () => {
  console.log(`stats running: ${PORT}`);
  resolveMissingArtwork();

  // Start the first import right away instead of waiting for a visitor to trigger it.
  if (!hasFreshStats()) {
    triggerRefresh().catch((error) => {
      console.error(`Unable to refresh stats data: ${error.message}`);
    });
  }
});

module.exports = stats;

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { USER_AGENT } = require('./listenbrainz');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Artwork is found through Deezer, downloaded once, and then served from this server.
const IMAGE_ROUTE = '/stats/images';
const IMAGE_EXTENSIONS = ['jpg', 'png', 'webp'];
const CACHE_DIRECTORY = path.dirname(path.resolve(process.env.STATS_CACHE_FILE || path.join(__dirname, 'cache', 'stats.json')));
const IMAGE_DIRECTORY = path.join(CACHE_DIRECTORY, 'images');
const ARTWORK_FILE = path.join(CACHE_DIRECTORY, 'artwork.json');

const router = express.Router();
const artwork = loadArtwork();
const artworkPromises = new Map();
const imageDownloads = new Map();
let deezerQueue = Promise.resolve();
let lastDeezerRequestAt = 0;

router.get(`${IMAGE_ROUTE}/:file`, (req, res) => {
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

// Returns the local image path straight away when it is already cached; otherwise returns
// nulls and calls onResolved once the lookup finishes. Never makes the caller wait.
function resolveArtwork(type, artist, name, onResolved) {
  const applyArtwork = (image) => ({
    high: image || null,
    low: image || null,
  });

  const cached = getCachedPath(artworkCacheKey(type, artist, name));
  if (cached.found) {
    return applyArtwork(cached.image);
  }

  void getArtwork(type, artist, name)
    .then((image) => onResolved(applyArtwork(image)))
    .catch(() => undefined);

  return applyArtwork(null);
}

// Resolves to a local image path, or null when there is no artwork.
function getArtwork(type, artist, name) {
  const key = artworkCacheKey(type, artist, name);
  const cached = getCachedPath(key);
  if (cached.found) {
    return Promise.resolve(cached.image);
  }

  if (artworkPromises.has(key)) {
    return artworkPromises.get(key);
  }

  const artworkPromise = findCoverArt(type, artist, name)
    .then((image) => {
      artwork[key] = image;
      saveArtwork();
      return image;
    })
    .finally(() => {
      artworkPromises.delete(key);
    });
  artworkPromises.set(key, artworkPromise);
  return artworkPromise;
}

// A cached "no image" is kept; a cached image is only trusted while its file still exists.
function getCachedPath(key) {
  if (!Object.prototype.hasOwnProperty.call(artwork, key)) {
    return { found: false };
  }

  const image = artwork[key];
  if (image && !fs.existsSync(path.join(IMAGE_DIRECTORY, path.basename(image)))) {
    return { found: false };
  }
  return { found: true, image };
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function artworkCacheKey(type, artist, name) {
  // The prefix versions the cache so entries from earlier artwork sources are never reused.
  if (type === 'artist') {
    return `deezer:artist:${normalize(artist)}`;
  }
  return `deezer:${type}:${normalize(artist)}\u0000${normalize(name)}`;
}

// Network failures throw so that they are retried later instead of being cached as "no image".
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

function loadArtwork() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ARTWORK_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    // The artwork lookups used to live inside the stats cache file; carry them over once.
    try {
      const legacy = JSON.parse(fs.readFileSync(path.resolve(process.env.STATS_CACHE_FILE || path.join(__dirname, 'cache', 'stats.json')), 'utf8'));
      return legacy && legacy.artwork && typeof legacy.artwork === 'object' ? { ...legacy.artwork } : {};
    } catch (legacyError) {
      return {};
    }
  }
}

function saveArtwork() {
  let temporaryFile;

  try {
    fs.mkdirSync(CACHE_DIRECTORY, { recursive: true, mode: 0o700 });
    temporaryFile = `${ARTWORK_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(artwork), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryFile, ARTWORK_FILE);
  } catch (error) {
    console.error('Unable to write the persistent artwork cache.');
    if (temporaryFile) {
      try {
        fs.unlinkSync(temporaryFile);
      } catch (unlinkError) {
        // The temporary file may already have been renamed or removed.
      }
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = { router, resolveArtwork, getArtwork, IMAGE_ROUTE, IMAGE_DIRECTORY };

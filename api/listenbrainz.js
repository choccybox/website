const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API = 'https://api.listenbrainz.org';
const MIN_INTERVAL = 1000;
const MAX_ATTEMPTS = 4;
const USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT?.trim()
  || 'choccynton-stats/1.0 (contact: admin@localhost)';

let queue = Promise.resolve();
let lastRequestAt = 0;
let blockedUntil = 0;
let userName = null;

// The name of the account that owns LISTENBRAINZ_USER_TOKEN.
async function getListenBrainzUser() {
  if (!userName) {
    const response = await requestListenBrainz('get', '/1/validate-token');
    if (!response.data || !response.data.valid || !response.data.user_name) {
      throw new Error('LISTENBRAINZ_USER_TOKEN is not a valid ListenBrainz token.');
    }
    userName = response.data.user_name;
  }
  return userName;
}

// Every ListenBrainz call in the project is authenticated with LISTENBRAINZ_USER_TOKEN and goes
// through this one queue, so the one-request-per-second guideline and the server's rate limit
// headers are respected no matter which part of the site is asking.
function requestListenBrainz(method, url, config = {}) {
  const request = queue.then(() => send(method, url, config));
  queue = request.catch(() => undefined);
  return request;
}

async function send(method, url, config) {
  const token = process.env.LISTENBRAINZ_USER_TOKEN?.trim();
  if (!token) {
    throw new Error('LISTENBRAINZ_USER_TOKEN is not set.');
  }

  for (let attempt = 1; ; attempt++) {
    const wait = Math.max(blockedUntil, lastRequestAt + MIN_INTERVAL) - Date.now();
    if (wait > 0) {
      await delay(wait);
    }
    lastRequestAt = Date.now();

    try {
      const response = await axios({
        method,
        url: `${API}${url}`,
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
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new Error(`ListenBrainz request ${method.toUpperCase()} ${url} failed${status ? ` with status ${status}` : `: ${error.message}`}.`);
      }

      if (status !== 429) {
        blockedUntil = Math.max(blockedUntil, Date.now() + 2000 * 2 ** (attempt - 1));
      }
    }
  }
}

function noteRateLimit(headers = {}, limited = false) {
  const remaining = Number(headers['x-ratelimit-remaining']);
  const resetIn = Number(headers['x-ratelimit-reset-in']);

  if ((limited || remaining <= 0) && Number.isFinite(resetIn)) {
    blockedUntil = Math.max(blockedUntil, Date.now() + (resetIn + 1) * 1000);
  } else if (limited) {
    blockedUntil = Math.max(blockedUntil, Date.now() + 10 * 1000);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = { requestListenBrainz, getListenBrainzUser, USER_AGENT };

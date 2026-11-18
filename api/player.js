const express = require('express');
const player = express();
const path = require('path');
const dotenv = require('dotenv');
const { requestListenBrainz, getListenBrainzUser } = require('./listenbrainz');
const { getArtwork } = require('./artwork');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20001;
// Every visitor polls /player; a short cache keeps that from turning into ListenBrainz traffic.
const RESULT_TTL = 15 * 1000;
// Finding artwork for a brand new track can be slow; show the track without it rather than wait.
const ARTWORK_WAIT = 5 * 1000;

let latest = null;
let inFlight = null;

player.get('/player', async (req, res) => {
  try {
    res.json(await getNowPlaying());
  } catch (error) {
    console.error('Error:', error.message);
    if (latest) {
      return res.json(latest.data);
    }
    res.status(500).send('Error occurred while fetching currently playing track.');
  }
});

function getNowPlaying() {
  if (latest && Date.now() - latest.at < RESULT_TTL) {
    return Promise.resolve(latest.data);
  }

  if (!inFlight) {
    inFlight = fetchNowPlaying()
      .then((data) => {
        latest = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

async function fetchNowPlaying() {
  const username = await getListenBrainzUser();
  const user = encodeURIComponent(username);

  const playingNow = await requestListenBrainz('get', `/1/user/${user}/playing-now`);
  let listen = playingNow.data?.payload?.listens?.[0];
  const isPlaying = Boolean(listen);

  if (!listen) {
    const recent = await requestListenBrainz('get', `/1/user/${user}/listens`, { params: { count: 1 } });
    listen = recent.data?.payload?.listens?.[0];
  }
  if (!listen) {
    throw new Error('ListenBrainz did not return any listens.');
  }

  const name = listen.track_metadata?.track_name;
  const artist = listen.track_metadata?.artist_name;
  const url = await findArtwork(artist, name);
  const image = url ? { low: url, high: url } : null;

  return {
    isPlaying,
    name,
    artist,
    art: image ? 'album' : null,
    image,
  };
}

async function findArtwork(artist, name) {
  if (!name || !artist) {
    return null;
  }

  let timer;
  try {
    return await Promise.race([
      getArtwork('track', artist, name),
      new Promise((resolve) => {
        // The lookup keeps running in the background and is cached for the next poll.
        timer = setTimeout(() => resolve(null), ARTWORK_WAIT);
      }),
    ]);
  } catch (error) {
    console.warn(`Artwork lookup failed: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

player.listen(PORT, async () => {
  console.log(`player running: ${PORT}`);
});

module.exports = player;

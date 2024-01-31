const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const player = express();
const fs = require('fs');

const PORT = 20002;

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyRedirectUri = `http://localhost:3000/playercallback`;
const spotifyScopes = 'user-read-currently-playing user-library-read user-read-recently-played user-top-read user-read-playback-state';
const spotifyTokenFile = 'spotify.json';
const TOKEN_FILE = 'soundcloud.json';


// spotify tokens
try {
  const tokensData = fs.readFileSync(spotifyTokenFile, 'utf8');
  const tokens = JSON.parse(tokensData);

  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;

  console.log('spotify token loaded');
} catch (err) {
  console.error('error loading spotify token', err.message);
}

// spotify saving token logic
function saveSpotifyTokensToFile() {
  const tokens = {
    accessToken: accessToken,
    refreshToken: refreshToken,
  };

  try {
    fs.writeFileSync(spotifyTokenFile, JSON.stringify(tokens), 'utf8');
    console.log('spotify token saved');
  } catch (err) {
    console.error('error saving spotify token:', err.message);
  }
}

async function saveSoundcloudToken(soundAccessToken, soundRefreshToken) {
  try {
    await fs.writeFile(TOKEN_FILE, JSON.stringify({ access_token: soundAccessToken, refresh_token: soundRefreshToken }));
    console.log('SoundCloud tokens saved successfully.');
    console.log({ soundAccessToken, soundRefreshToken });
    console.log(await fs.readFile(TOKEN_FILE, 'utf8'));
  } catch (error) {
    console.error('Error saving SoundCloud tokens:', error);
  }
}

// Function to load the access token and refresh token from a JSON file
async function loadSoundcloudToken() {
  try {
    const data = await fs.readFile(TOKEN_FILE);
    const { access_token: soundAccessToken, refresh_token: soundRefreshToken } = JSON.parse(data);
    console.log('SoundCloud tokens loaded successfully.');
    // log what was loaded from the file
    console.log({ soundAccessToken, soundRefreshToken });
    // log how the file looks like
    console.log(await fs.readFile(TOKEN_FILE, 'utf8'));
    return { soundAccessToken, soundRefreshToken };
  } catch (error) {
    console.error('Error loading SoundCloud tokens:', error);
    return null;
  }
}

// COMMENT OUT AFTER LOGGING. (so some random doesnt log in)
/* player.get('/playerauth', (req, res) => {
  const authorizeUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: spotifyClientId,
    scope: spotifyScopes,
    redirect_uri: spotifyRedirectUri,
  })}`;
  res.redirect(authorizeUrl);
});

player.get('/playercallback', async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri,
      client_id: spotifyClientId,
      client_secret: spotifyClientSecret,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token } = response.data;
    accessToken = access_token;
    refreshToken = refresh_token;

    res.redirect('/player');
    saveSpotifyTokensToFile();
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);

    // Redirect to /error after a delay
    setTimeout(() => {
      return res.redirect('/error');
    }, 2000);
  }
}); */

player.get('/soundauth', (req, res) => {
  // Redirect the user to the SoundCloud authorization URL
  const authorizeUrl = `https://soundcloud.com/connect?client_id=${process.env.SOUNDCLOUD_CLIENT_ID}&redirect_uri=${process.env.SOUNDCLOUD_REDIRECT_URI}&response_type=code&scope=non-expiring`;
  res.redirect(authorizeUrl);
});

player.get('/soundcallback', async (req, res) => {
  // Handle the callback after the user grants/denies authorization
  const { code } = req.query;

  // Exchange the authorization code for an access token
  const tokenUrl = 'https://api.soundcloud.com/oauth2/token';
  const params = new URLSearchParams({
    client_id: process.env.SOUNDCLOUD_CLIENT_ID,
    client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET,
    redirect_uri: process.env.SOUNDCLOUD_REDIRECT_URI,
    grant_type: 'authorization_code',
    code,
  });

  try {
    const response = await axios.post(tokenUrl, params);
    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    // Store the access token and refresh token in sound_token.json
    await saveSoundcloudToken(accessToken, refreshToken);

    // log what is saved
    console.log({ accessToken, refreshToken });
    // log how the file looks like
    console.log(await fs.readFile(TOKEN_FILE, 'utf8'));

    // Display user data in JSON format
    res.json('success');
  } catch (error) {
    console.error('Error exchanging code for token:', error.message);
    res.status(500).send('Error during authentication');
  }
});
// COMMENT OUT AFTER LOGGING. (so some random doesnt log in)

player.get('/player', async (req, res) => {
  try {
    const nowPlayingResponse = await getNowPlaying();
    res.json(nowPlayingResponse);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).send('Error occurred while fetching currently playing track.');
  }
});

player.get('/sound-search/:trackname/:artistname?', async (req, res) => {
  try {
    // Read the stored access token and refresh token from sound_token.json
    const tokens = await loadSoundcloudToken();

    if (!tokens || !tokens.accessToken) {
      return res.status(401).send('Access token not found. Please authorize.');
    }

    const accessToken = tokens.accessToken;

    // Extract parameters from the request URL
    const { trackname, artistname } = req.params;

    // Construct the search URL using the provided trackname and artistname if available
    let searchUrl;
    if (artistname) {
      searchUrl = `https://api.soundcloud.com/tracks?q=${trackname} ${artistname}&limit=1&linked_partitioning=true`;
    } else {
      searchUrl = `https://api.soundcloud.com/tracks?q=${trackname}&limit=1&linked_partitioning=true`;
    }

    // Make a request to the search endpoint
    const searchResponse = await axios.get(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Check if the response contains a 'collection' property
    if (searchResponse.data.collection) {
      // simplify the data
      const tracks = searchResponse.data.collection.map(track => {
        return {
          name: track.title,
          artist: track.user.username,
          url: track.permalink_url,
          // replace the default artwork with a larger image and jpg
          art: track.artwork_url ? track.artwork_url.replace('-large', '-t300x300') : null,
        };
      });

      // Display search results in JSON format
      res.json(tracks);
    } else {
      // Handle the case where the response format is unexpected
      console.error('Unexpected response format:', searchResponse.data);
      res.status(500).send('Unexpected response format');
    }
  } catch (error) {
    console.error('Error searching tracks:', error.message);
    res.status(500).send('Error searching tracks');
  }
});

async function getNowPlaying() {
  if (!accessToken) {
    throw new Error('Access token not available.');
  }

  try {
    const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (spotifyResponse.data && spotifyResponse.data.is_playing) {
      console.log('playing');

      // if not local, use spotify api to get art and url
      if (!spotifyResponse.data.item.is_local) {
      return {
        isPlaying: true,
        isLocal: spotifyResponse.data.item.is_local,
        name: spotifyResponse.data.item.name,
        artist: spotifyResponse.data.item.artists[0].name,
        art: spotifyResponse.data.item.is_local ? null : spotifyResponse.data.item.album.images[1].url,
        url: spotifyResponse.data.item.is_local ? null : spotifyResponse.data.item.external_urls.spotify,
        progress: spotifyResponse.data.progress_ms,
        duration: spotifyResponse.data.item.duration_ms,
        message: 'player is playing',
      };
    } else {
      // if local, use last.fm api to get art and url
      console.log('playing a local file');
      return {
        isPlaying: true,
        isLocal: spotifyResponse.data.item.is_local,
        name: spotifyResponse.data.item.name,
        artist: spotifyResponse.data.item.artists[0].name,
        art: null,
        url: null,
        progress: spotifyResponse.data.progress_ms,
        duration: spotifyResponse.data.item.duration_ms,
        message: 'playing a local file',
      };
    }

    } else if (spotifyResponse.data && !spotifyResponse.data.is_playing || !spotifyResponse.data) {

      const lastFmResponse = await axios.get(`http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);

      // use spotify api to replace art and url from last.fm
      const spotifySearchResponse = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].name)}%20artist:${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].artist['#text'])}&type=track&limit=1`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      // if found, return spotify data, if not, return null
      if (spotifySearchResponse.data.tracks.items[0]) {
        console.log('not playing / empty response, found spotify result');

        return {
          isPlaying: false,
          isLocal: false,
          name: spotifySearchResponse.data.tracks.items[0].name,
          artist: spotifySearchResponse.data.tracks.items[0].artists[0].name,
          art: spotifySearchResponse.data.tracks.items[0].album.images[0].url,
          url: spotifySearchResponse.data.tracks.items[0].external_urls.spotify,
          progress: null,
          duration: null,
          message: 'not playing / empty response, found spotify result',
        };
      } else {
        console.log('not playing / empty response, no spotify result');

        return {
          isPlaying: false,
          isLocal: false,
          name: lastFmResponse.data.recenttracks.track[0].name,
          artist: lastFmResponse.data.recenttracks.track[0].artist['#text'],
          art: null,
          url: null,
          progress: null,
          duration: null,
          message: 'not playing / empty response, no spotify result',
        };
      }
    } 

  } catch (error) {
    if (error.response && error.response.status === 401) {
      await refreshSpotifyAccessToken();
      return getNowPlaying();
    } else {
      console.error('Error:', error);
      return {
        isPlaying: false,
        isLocal: null,
        name: null,
        artist: null,
        art: null,
        url: null,
        progress: null,
        duration: null,
        message: 'man we fucked up again goddamit',
      };
    }
  }
}

async function refreshSpotifyAccessToken() {
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: spotifyClientId,
      client_secret: spotifyClientSecret,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    accessToken = response.data.access_token;

    // Update the file with the new tokens
    fs.writeFileSync(spotifyTokenFile, JSON.stringify({
      accessToken: accessToken,
      refreshToken: refreshToken,
    }));
  } catch (error) {
    console.error('Error refreshing token:', error.response ? error.response.data : error.message);
    throw new Error('Error refreshing access token.');
  }
}

player.listen(PORT, async () => {
  console.log(`player running: ${PORT}`);
});

module.exports = player;
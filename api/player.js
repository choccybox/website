const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const player = express();
const fs = require('fs');

const PORT = 20002;

const TOKEN_FILE = 'soundcloud.json';

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = `${process.env.BASE_URL}/spotifycallback`;
const scopes = 'user-read-currently-playing user-library-read user-read-recently-played user-top-read user-read-playback-state';

try {
  const tokensData = fs.readFileSync('spotify.json', 'utf8');
  const tokens = JSON.parse(tokensData);

  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;

  console.log('Tokens loaded from file');
} catch (err) {
  console.error('Error loading tokens from file:', err.message);
}

function saveTokensToFile() {
  const tokens = {
    accessToken: accessToken,
    refreshToken: refreshToken,
  };

  try {
    fs.writeFileSync('spotify.json', JSON.stringify(tokens), 'utf8');
    console.log('Tokens saved to file');
  } catch (err) {
    console.error('Error saving tokens to file:', err.message);
  }
}

// Function to save the access token and refresh token to a JSON file
async function saveSoundcloudToken(accessToken, refreshToken) {
  try {
    await fs.writeFile(TOKEN_FILE, JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }));
    console.log('SoundCloud tokens saved successfully.');
  } catch (error) {
    console.error('Error saving SoundCloud tokens:', error);
  }
}

// Function to load the access token and refresh token from a JSON file
async function loadSoundcloudToken() {
  try {
    const data = await fs.readFile(TOKEN_FILE);
    const { access_token: accessToken, refresh_token: refreshToken } = JSON.parse(data);
    console.log('SoundCloud tokens loaded successfully.');
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('Error loading SoundCloud tokens:', error);
    return null;
  }
}

player.get('/spotifyauth', (req, res) => {
  const authorizeUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
  })}`;
  res.redirect(authorizeUrl);
});

player.get('/playercallback', async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token } = response.data;
    accessToken = access_token;
    refreshToken = refresh_token;

    res.redirect('/spotifyplayer');
    saveTokensToFile();
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);

    // Redirect to /error after a delay
    setTimeout(() => {
      return res.redirect('/error');
    }, 5000);
  }
});

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
    
  } catch (error) {
    console.error('Error exchanging code for token:', error.message);
    res.status(500).send('Error during authentication');
  }
});

player.get('/player', async (req, res) => {
  try {
    const nowPlayingResponse = await getNowPlaying();
    res.json(nowPlayingResponse);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).send('Error occurred while fetching currently playing track.');
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

    if (spotifyResponse.data && spotifyResponse.data.item && spotifyResponse.data.is_playing) {
      const trackName = encodeURIComponent(spotifyResponse.data.item.name);
      const artistName = encodeURIComponent(spotifyResponse.data.item.artists[0]?.name || '');
      const { album, duration_ms } = spotifyResponse.data.item;
      const isPlaying = true;
      const progress = spotifyResponse.data.progress_ms || 0;

      const simplifiedResponse = {
        isPlaying,
        isLocal: spotifyResponse.data.item.is_local,
        name: trackName,
        artist: artistName,
        art: album.images.length > 0 ? album.images[0].url : null,
        url: spotifyResponse.data.item.external_urls.spotify,
        progress,
        duration: duration_ms,
      };

      if (simplifiedResponse.isLocal === true) {
        try {
          const artistNameModified = simplifiedResponse.artist.replace(/\s*\([^)]*\)\s*/g, '').trim();

          // Use the SoundCloud API to search for the song
          const soundcloudSearchResponse = await axios (`https://api.soundcloud.com/tracks?q=${encodeURIComponent(simplifiedResponse.name)} ${encodeURIComponent(artistNameModified)}&limit=1&offset=0&linked_partitioning=true` ,{
            headers: {
              'Authorization': `OAuth ${accessToken}`,
            },
          });

         console.log(soundcloudSearchResponse);
/* 
          simplifiedResponse.url = soundcloudSearchResponse.url;
          simplifiedResponse.art = soundcloudSearchResponse.art; */
        } catch (soundcloudError) {
          console.error('Error fetching data from SoundCloud:', soundcloudError.message);
        }
      }

      return simplifiedResponse;
    } else if (spotifyResponse.data && spotifyResponse.data.item && !spotifyResponse.data.is_playing) {
      const lastFmResponse = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USER}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);
      const lastPlayedTrack = lastFmResponse.data.recenttracks.track[0];

      try {
        const trackName = encodeURIComponent(lastPlayedTrack.name);
        const artistName = encodeURIComponent(lastPlayedTrack.artist['#text']);

        // Use the SoundCloud API to search for the song
        const soundcloudSearchResponse = await axios (`https://api.soundcloud.com/tracks?q=${encodeURIComponent(trackName)} ${encodeURIComponent(artistName)}&limit=1&offset=0&linked_partitioning=true` ,{
          headers: {
            'Authorization': `OAuth ${accessToken}`,
          },
        });

        const simplifiedResponse = {
          isPlaying: false,
          isLocal: null,
          name: soundcloudSearchResponse.name,
          artist: soundcloudSearchResponse.artist,
          art: soundcloudSearchResponse.art,
          url: soundcloudSearchResponse.url,
          progress: null,
          duration: null,
        };

        return simplifiedResponse;
      } catch (soundcloudError) {
        console.error('Error fetching data from SoundCloud:', soundcloudError.message);
        return null;
      }
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      await refreshAccessToken();
      return getNowPlaying();
    }
    throw error;
  }
}

async function refreshAccessToken() {
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    accessToken = response.data.access_token;

    // Update the file with the new tokens
    fs.writeFileSync('tokens.json', JSON.stringify({
      accessToken: accessToken,
      refreshToken: refreshToken,
    }));
  } catch (error) {
    console.error('Error refreshing token:', error.response ? error.response.data : error.message);
    throw new Error('Error refreshing access token.');
  }
}

player.listen(PORT, async () => {
  console.log(`spotify running: ${PORT}`);
});

module.exports = player;
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const player = express();
const fs = require('fs');
const NodeCache = require('node-cache');
const cache = new NodeCache();


const PORT = 20002;

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

player.get('/player', async (req, res) => {
  try {
    const nowPlayingResponse = await getNowPlaying();
    res.json(nowPlayingResponse);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).send('Error occurred while fetching currently playing track.');
  }
});

player.get('/spotify-search/:trackname/:artistname?', async (req, res) => {
  const { trackname, artistname } = req.params;

  try {
    const spotifySearch = await getSearchResults(trackname, artistname);
    res.json(spotifySearch);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).send('Error occurred while searching for track.');
  }
});


async function getSearchResults(trackname, artistname) {
  if (!accessToken) {
    throw new Error('Access token not available.');
  }

  try {
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      params: {
        q: `track:${trackname} ${artistname ? `artist:${artistname}` : ''}`,
        type: 'track',
        limit: 5,
      },
    });

    // Extract relevant information for each search result
    const simplifiedSearchResults = response.data.tracks.items.map((item) => {
      return {
        name: item.name,
        artist: item.artists.map(artist => artist.name).join(', '),
        image: item.album.images.length > 0 ? item.album.images[0].url : null,
        url: item.external_urls.spotify,
        duration: item.duration_ms,
      };
    });

    return simplifiedSearchResults;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Access token expired, refresh the token and retry the request
      await refreshAccessToken();
      return getSearchResults(trackname, artistname);
    }
    throw error;
  }
}

async function getNowPlaying() {
  if (!accessToken) {
    throw new Error('Access token not available.');
  }

  try {
    // Make a request to Last.fm for the last played song
    const lastFmResponse = await axios.get(`http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);
    const lastPlayed = lastFmResponse.data.recenttracks.track[0];

    // Extract relevant information for the last played track
    const simplifiedLastPlayed = {
      name: lastPlayed.name,
      artist: lastPlayed.artist['#text'],
    };

    // Search for the last played track on Spotify
    const spotifySearchResponse = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      params: {
        q: `${simplifiedLastPlayed.name} ${simplifiedLastPlayed.artist}`,
        type: 'track',
        limit: 1,
      },
    });

    const spotifySearchResults = spotifySearchResponse.data.tracks.items;

    // Check if there are search results on Spotify
    if (spotifySearchResults.length > 0) {
      const spotifyResult = spotifySearchResults[0];

      // Extract relevant information for the corresponding Spotify track
      const simplifiedSpotifyResult = {
        name: spotifyResult.name,
        artist: spotifyResult.artists[0].name,
        imageUrl: spotifyResult.album.images.length > 0 ? spotifyResult.album.images[0].url : null,
        url: spotifyResult.external_urls.spotify,
        duration_ms: spotifyResult.duration_ms,
      };

      return { isPlaying: false, nowPlaying: simplifiedSpotifyResult };
    } else {
      // If no corresponding track found on Spotify, return null
      return { isPlaying: false, nowPlaying: null };
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Access token expired, refresh the token and retry the request
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
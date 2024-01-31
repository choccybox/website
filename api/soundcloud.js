const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
require('dotenv').config();

const soundcloud = express();
const PORT = 20003;
const TOKEN_FILE = 'soundcloud.json';

// Function to save the access token, refresh token, and expiration time to a JSON file
async function saveSoundcloudToken(accessToken, refreshToken, expiresIn) {
  try {
    const expirationTime = Date.now() + expiresIn * 1000; // Convert expiresIn to milliseconds
    await fs.writeFile(TOKEN_FILE, JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_in: expirationTime }));
    console.log('SoundCloud tokens saved successfully.');
    console.log({ accessToken, refreshToken, expiresIn });
    console.log(await fs.readFile(TOKEN_FILE, 'utf8'));
  } catch (error) {
    console.error('Error saving SoundCloud tokens:', error);
  }
}

// Function to load the access token, refresh token, and expiration time from a JSON file
async function loadSoundcloudToken() {
  try {
    const data = await fs.readFile(TOKEN_FILE);
    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = JSON.parse(data);
    console.log('SoundCloud tokens loaded successfully.');
    console.log({ accessToken, refreshToken, expiresIn });
    console.log(await fs.readFile(TOKEN_FILE, 'utf8'));
    return { accessToken, refreshToken, expiresIn };
  } catch (error) {
    console.error('Error loading SoundCloud tokens:', error);
    return null;
  }
}

// Function to refresh the access token using the refresh token
async function refreshAccessToken(refreshToken) {
  const tokenUrl = 'https://secure.soundcloud.com/oauth/token';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.SOUNDCLOUD_CLIENT_ID,
    client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  try {
    const response = await axios.post(tokenUrl, params);
    const refreshedAccessToken = response.data.access_token;
    const refreshedRefreshToken = response.data.refresh_token;
    const expiresIn = response.data.expires_in;

    return { accessToken: refreshedAccessToken, refreshToken: refreshedRefreshToken, expiresIn };
  } catch (error) {
    console.error('Error refreshing access token:', error.message);
    throw error; // Propagate the error to handle it where needed
  }
}

soundcloud.get('/soundauth', (req, res) => {
  // Redirect the user to the SoundCloud authorization URL
  const authorizeUrl = `https://soundcloud.com/connect?client_id=${process.env.SOUNDCLOUD_CLIENT_ID}&redirect_uri=${process.env.SOUNDCLOUD_REDIRECT_URI}&response_type=code&scope=non-expiring`;
  res.redirect(authorizeUrl);
});

soundcloud.get('/soundcallback', async (req, res) => {
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
    const expiresIn = response.data.expires_in;

    // Store the access token, refresh token, and expiration time in sound_token.json
    await saveSoundcloudToken(accessToken, refreshToken, expiresIn);

    // log what is saved
    console.log({ accessToken, refreshToken, expiresIn });
    // log how the file looks like
    console.log(await fs.readFile(TOKEN_FILE, 'utf8'));

    // Display user data in JSON format
    res.json('success');
  } catch (error) {
    console.error('Error exchanging code for token:', error.message);
    res.status(500).send('Error during authentication');
  }
});

soundcloud.get('/sound-search/:trackname/:artistname?', async (req, res) => {
  try {
    // Read the stored access token, refresh token, and expiration time from sound_token.json
    const tokens = await loadSoundcloudToken();

    if (!tokens || !tokens.accessToken) {
      return res.status(401).send('Access token not found. Please authorize.');
    }

    const { accessToken, refreshToken, expiresIn } = tokens;

    // Pseudo-code to refresh token when needed
    if (Date.now() > expiresIn) {
      try {
        const refreshedTokens = await refreshAccessToken(refreshToken);
        saveSoundcloudToken(refreshedTokens.accessToken, refreshedTokens.refreshToken, refreshedTokens.expiresIn);
        // Use refreshed access token for making requests
        accessToken = refreshedTokens.accessToken;
      } catch (error) {
        // Handle the error, e.g., prompt user to re-authenticate
        res.status(500).send('Error refreshing access token');
        return;
      }
    }

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
          // replace the default artwork with a larger image
          art: track.artwork_url ? track.artwork_url.replace('-large', '-t500x500') : null,
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

soundcloud.listen(PORT, () => {
  console.log(`soundcloud running: ${PORT}`);
});

module.exports = soundcloud;
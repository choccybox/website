const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');
const user = express();
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const port = 20001;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
  ]
});

// Discord Bot Token
const token = process.env.DISCORD_BOT_TOKEN;
// Redirect URI for OAuth2
const redirectUri = `http://localhost:3000/usercallback`;

// Scopes for OAuth2
const scopes = ['identify', 'connections'];

function saveAccessTokenToEnv(accessToken, expiresIn, refreshToken) {
  try {
    // Update the environment variables
    process.env.DISCORD_ACCESS_TOKEN = accessToken;
    process.env.DISCORD_EXPIRES_IN = expiresIn;
    process.env.DISCORD_REFRESH_TOKEN = refreshToken;

    // Update the .env file
    const envPath = path.resolve(__dirname, '../.env');
    let envContents = fs.readFileSync(envPath, 'utf8');
    envContents += `\nDISCORD_ACCESS_TOKEN=${accessToken}\nDISCORD_EXPIRES_IN=${expiresIn}\nDISCORD_REFRESH_TOKEN=${refreshToken}`;
    fs.writeFileSync(envPath, envContents, 'utf8');
  } catch (error) {
    console.error('Error saving Discord tokens:', error);
  }
}

// Function to load the access token and its expiration time from a JSON file
function loadAccessToken() {
  try {
    // Read tokens from environment variables
    const accessToken = process.env.DISCORD_ACCESS_TOKEN;
    const expiresIn = process.env.DISCORD_EXPIRES_IN;
    const refreshToken = process.env.DISCORD_REFRESH_TOKEN;

    // Check if the token has expired
    const expirationTimestamp = Number(process.env.DISCORD_TOKEN_TIMESTAMP) + expiresIn * 1000; // convert expiresIn to milliseconds
    if (expirationTimestamp < Date.now()) {
      console.log('Access token has expired.');
      return null; // Token has expired
    }

    return accessToken;
  } catch (error) {
    console.error('Error loading access token:', error);
    return null;
  }
}

async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: client.user.id,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: scopes.join(' '),
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const newAccessToken = response.data.access_token;
    const newRefreshToken = response.data.refresh_token;
    const expiresIn = response.data.expires_in;

    // Save the new access token and refresh token to the JSON file
    saveAccessTokenToEnv(newAccessToken, expiresIn, newRefreshToken);

    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

// OAuth2 endpoint
user.get('/userauth', (req, res) => {
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}`);
});

// Discord
user.get('/usercallback', async (req, res) => {
  const code = req.query.code;

  if (code) {
    try {
      const response = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: client.user.id,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          scope: scopes.join(' '),
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in;

      // Save the access token, refresh token, and expiration info to .env
      saveAccessTokenToEnv(accessToken, expiresIn, refreshToken);

      client.token = accessToken;

      res.redirect('/userinfo');
    } catch (error) {
      console.error('Error during authorization:', error);
      res.status(500).send('Error during authorization.');
    }
  } else {
    res.status(400).send('Authorization code not provided.');
  }
});


user.get('/user', async (req, res) => {
  try {
    // Load the access token from the JSON file
    let savedAccessToken = loadAccessToken();

    if (!savedAccessToken) {
      return res.status(401).send('Access token not found. Please authorize.');
    }

    client.token = savedAccessToken;

    // Fetch the user's data from Discord API
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${client.token}`,
      },
    });

    // Check if the access token needs to be refreshed
    if (userResponse.status === 401) {
      savedAccessToken = await refreshAccessToken(savedAccessToken);
      client.token = savedAccessToken;
    }

    const connectionsResponse = await axios.get('https://discord.com/api/users/@me/connections', {
      headers: {
        Authorization: `Bearer ${client.token}`,
      },
    });

    // Check if the access token needs to be refreshed
    if (connectionsResponse.status === 401) {
      savedAccessToken = await refreshAccessToken(savedAccessToken);
      client.token = savedAccessToken;
    }

    // Filter connections with visibility 0, keep spotify
    const filteredConnections = connectionsResponse.data.filter(connection => connection.visibility === 1 || connection.type === 'spotify');

    // Mock Last.fm connection data
    const mockLastfmConnection = {
      type: 'lastfm',
      url: `https://last.fm/user/${process.env.LASTFM_USERNAME}`,
    };

    // Insert the mock last.fm
    const hasLastfmConnection = filteredConnections.some(connection => connection.type === 'lastfm');
    // Simplify connections to id, name, type, and visibility with added "url" field
    const simplifiedConnections = filteredConnections.map(connection => {
      let url;
      const baseHTTPS = "https://";
      
      switch (connection.type) {
        case 'domain':
          url = `${baseHTTPS}${connection.name}`;
          break;
        case 'spotify':
          url = `${baseHTTPS}open.spotify.com/user/${connection.id}`;
          break;
        case 'steam':
          url = `${baseHTTPS}steamcommunity.com/profiles/${connection.id}`;
          break;
        case 'youtube':
          url = `${baseHTTPS}youtube.com/channel/${connection.id}`;
          break;  
        case 'tiktok':
          url = `${baseHTTPS}tiktok.com/@${connection.name}`;
          break;
        case 'riotgames':
          break;
        default:
          url = `${baseHTTPS}${connection.type}.com/${connection.name}`;
          break;
      }

      return {
        type: connection.type,
        url: url,
      };
    });

    // Construct the user information object
    const userInfo = {
      // check if image has a_, if so, use .gif, otherwise use .png
      avatar: userResponse.data.avatar ? {
        high: `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar.startsWith('a_') ? `${userResponse.data.avatar}.gif?size=300` : `${userResponse.data.avatar}.webp?size=300`} `,
        low: `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar.startsWith('a_') ? `${userResponse.data.avatar}.gif?size=64` : `${userResponse.data.avatar}.webp?size=64`}`,
      } : null,
      avatarCredit: process.env.AVATAR_CREDIT,
      userUrl: `https://discord.com/users/${userResponse.data.id}`,
      connections: hasLastfmConnection ? simplifiedConnections : [...simplifiedConnections, mockLastfmConnection],
    };

    res.json(userInfo);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching user information.');
  }
});

client.login(token);

user.listen(port, () => {
  console.log(`user running: ${port}`);
});

module.exports = user;
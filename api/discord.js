const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');
const discord = express();

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
// use process.env.BASE_URL
const redirectUri = `${process.env.BASE_URL}/discordcallback`;

// Scopes for OAuth2
const scopes = ['identify', 'connections'];

const tokenFilePath = 'discord.json';

function saveAccessToken(accessToken, expiresIn) {
  try {
    const timestamp = Date.now();
    const data = JSON.stringify({ accessToken, expiresIn, timestamp });
    fs.writeFileSync(tokenFilePath, data);
    console.log('Access token saved successfully.');
  } catch (error) {
    console.error('Error saving access token:', error);
  }
}

// Function to load the access token and its expiration time from a JSON file
function loadAccessToken() {
  try {
    const data = fs.readFileSync(tokenFilePath);
    const { accessToken, expiresIn, timestamp } = JSON.parse(data);

    // Check if the token has expired
    const expirationTimestamp = timestamp + expiresIn * 1000; // convert expiresIn to milliseconds
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
    saveAccessToken(newAccessToken, expiresIn);
    // Optionally save the new refresh token if Discord provides a new one

    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

/* // OAuth2 endpoint
discord.get('/discordauth', (req, res) => {
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}`);
});

// Discord
discord.get('/discordcallback', async (req, res) => {
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

      // Fetch the user's data from Discord API
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userId = userResponse.data.id;

      // Check if the user's ID matches the allowed ID
      if (userId !== process.env.DISCORD_ID) {
        return res.status(403).send('Access denied. Invalid user ID.');
      }

      // Save the access token and refresh token to the JSON file
      saveAccessToken(accessToken, expiresIn);

      client.token = accessToken;

      res.redirect('/discorduser');
    } catch (error) {
      console.error('Error during authorization:', error);
      res.status(500).send('Error during authorization.');
    }
  } else {
    res.status(400).send('Authorization code not provided.');
  }
});
 */

discord.get('/discorduser', async (req, res) => {
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

    // Filter connections with visibility 0, keep spotify, dont filter it
    const filteredConnections = connectionsResponse.data.filter(connection => connection.visibility === 1 || connection.type === 'spotify');

    // Mock Last.fm connection data
    const mockLastfmConnection = {
      name: process.env.LASTFM_USER,
      type: 'lastfm',
      url: `https://last.fm/user/${process.env.LASTFM_USER}`,
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
        name: connection.name,
        type: connection.type,
        url: url,
      };
    });

    // Construct the user information object
    const userInfo = {
      // check if image has a_, if so, use .gif, otherwise use .png
      avatar: userResponse.data.avatar ? `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar.startsWith('a_') ? userResponse.data.avatar : `${userResponse.data.avatar}.png?size=512`}` : null,
      avatarCredit: "made by " + process.env.AVATAR_CREDIT,
      connections: hasLastfmConnection ? simplifiedConnections : [...simplifiedConnections, mockLastfmConnection],
    };

    res.json(userInfo);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching user information.');
  }
});


// Event when the bot is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

});

// Log in to Discord
client.login(token);

discord.listen(port, () => {
  console.log(`discord running: ${port}`);
});

module.exports = discord;
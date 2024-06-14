const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, Guild } = require('discord.js');
const userinfo = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const sharp = require('sharp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
  ]
});

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20003;

const discordScopes = ['identify', 'connections'];

function saveDiscordToken(discordAccessToken, expiresIn, savedAt, discordRefreshToken) {
  const tokens = {
    accessToken: discordAccessToken,
    expiresIn: expiresIn,
    savedAt: savedAt,
    refreshToken: discordRefreshToken,
  };

  fs.writeFileSync(path.resolve(__dirname, './tokens/discord.json'), JSON.stringify(tokens, null, 2), 'utf8');
}

// COMMENT OUT AFTER LOGGING.
userinfo.get('/userauth', (req, res) => {
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(discordScopes.join(' '))}`);
});

userinfo.get('/usercallback', async (req, res) => {
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
          redirect_uri: process.env.DISCORD_REDIRECT_URI,
          scope: discordScopes.join(' '),
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // get new tokens, save to .json
      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in;
      const savedAt = Math.floor(Date.now() / 1000);

      saveDiscordToken(accessToken, expiresIn, savedAt, refreshToken);

      client.token = accessToken;

      res.redirect('/user');
    } catch (error) {
      console.error('Error during authorization:', error);
      res.status(500).send('Error during authorization.');
    }
  } else {
    res.status(400).send('Authorization code not provided.');
  }
});
// COMMENT OUT AFTER LOGGING.

client.once('ready', () => {
  console.log('Discord client is ready.');
  checkTokenExpiration(client);
  
  setInterval(() => {
    checkTokenExpiration(client);
  }, 300000);
});

client.login(process.env.DISCORD_BOT_TOKEN);

userinfo.get('/user', async (req, res) => {
  // check if client is ready
  if (!client.readyAt) {
    res.status(500).send('Discord client is not ready.');
  } else {
    try {
      // load tokens from .json
      const discordToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/discord.json'), 'utf8'));
      const discordAccessToken = discordToken.accessToken;
  
      client.token = discordAccessToken;

      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${discordAccessToken}`,
        },
      });
  
      const connectionsResponse = await axios.get('https://discord.com/api/users/@me/connections', {
        headers: {
          Authorization: `Bearer ${discordAccessToken}`,
        },
      });

      // check channel id 1229488636408627200 for any messages
      const messagesResponse = await axios.get('https://discord.com/api/channels/1229488636408627200/messages', {
         headers: {
           Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      });
/*       
      const presences = client.guilds.cache.map(guild => guild.members.cache.filter(member => !member.user.bot).map(member => member.presence));
      presences.forEach(guildPresences => {
        guildPresences.forEach(presence => {
          if (!presence || presence.status === 'offline') {
            console.log('offline');
          } else {
            console.log(presence.activities.filter(activity => activity.name !== 'Spotify' && activity.name !== 'Custom Status'));

            // make a custom map to only get name and type
            const activities = presence.activities.filter(activity => activity.name !== 'Spotify' && activity.name !== 'Custom Status').map(activity => {
              return {
                name: activity.name,
                type: activity.type,
              };
            });
        });
      }); */
      
      const avatarCredit = messagesResponse.data[0].content;
  
      // Filter connections with visibility 0, keep spotify, ignore domain type, keep spotify, ignore domain type
      const filteredConnections = connectionsResponse.data.filter(connection => connection.visibility === 1 && connection.type !== 'domain');
  
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
  
      const originalavatarimg = `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar}.webp?size=1024`;
  
      try {
        const response = await axios({
          method: 'get',
          url: originalavatarimg,
          responseType: 'arraybuffer',
        });
      
        const highresizedavatarimg = await sharp(response.data).resize(300, 300).toBuffer();
        const lowresizedavatarimg = await sharp(response.data).resize(128, 128).toBuffer();
      
        const userInfo = {
          avatar: {
            high: `data:image/webp;base64,${highresizedavatarimg.toString('base64')}`,
            low: `data:image/webp;base64,${lowresizedavatarimg.toString('base64')}`,
            original: originalavatarimg,
          },
          avatarCredit: `https://twitter.com/${avatarCredit}`,
          avatarCreditText: avatarCredit,
          userUrl: `https://discord.com/users/${userResponse.data.id}`,
          connections: hasLastfmConnection ? simplifiedConnections : [...simplifiedConnections, mockLastfmConnection],
        };
        // Send the response inside the try block
        res.json(userInfo);
      } catch (error) {
        console.error('Error downloading or resizing image:', error);
        // Handle errors and send an appropriate response
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Error fetching user information.');
    }
  }
});

async function refreshDiscordAccessToken(client, discordRefreshToken) {
  try {
    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: client.user.id,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: discordRefreshToken,
        scope: discordScopes.join(' '),
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
    const savedAt = Math.floor(Date.now() / 1000);

    // Save the new access token and refresh token to the JSON file
    saveDiscordToken(newAccessToken, expiresIn, savedAt, newRefreshToken);

    console.log('Refreshed access token:', newAccessToken);

    return newAccessToken;
  } catch (error) {
    // Check if the error is due to a 404 or 500 status code
    if (error.response && (error.response.status === 404 || error.response.status === 500)) {
      console.log('Token refresh needed due to status:', error.response.status);
      // Attempt to refresh the token
      return refreshDiscordAccessToken(client, discordRefreshToken);
    } else {
      console.error('Error refreshing access token:', error);
    }
  }
}
// run function that checks if the token is expired every 5 minutes
async function checkTokenExpiration(client) {
  const discordToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/discord.json'), 'utf8'));
  const savedAt = discordToken.savedAt;
  const expiresIn = discordToken.expiresIn;
  const discordRefreshToken = discordToken.refreshToken;

  const tokenExpirationTime = savedAt + expiresIn;
  const currentTime = Math.floor(Date.now() / 1000);

  // Check if the token has expired
  if (currentTime >= tokenExpirationTime) {
    console.log('Access token has expired, refreshing...');
    const newAccessToken = await refreshDiscordAccessToken(client, discordRefreshToken);
    client.token = newAccessToken;
  } else {
    console.log('Access token is still valid.');
  }
}

userinfo.listen(PORT, async () => {
  console.log(`userinfo running: ${PORT}`);
});

module.exports = userinfo;
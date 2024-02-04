const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const { Client, GatewayIntentBits } = require('discord.js');
const player = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
  ]
});

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20002;

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyRedirectUri = `http://localhost:3000/playercallback`;
const spotifyScopes = 'user-read-currently-playing user-library-read user-read-recently-played user-top-read user-read-playback-state';

// Discord Bot Token
const token = process.env.DISCORD_BOT_TOKEN;
// Redirect URI for OAuth2
const redirectUri = `http://localhost:3000/usercallback`;

// Scopes for OAuth2
const scopes = ['identify', 'connections'];

function saveSpotifyTokens(spotifyAccessToken, spotifyRefreshToken) {
  const tokens = {
    accessToken: spotifyAccessToken,
    refreshToken: spotifyRefreshToken,
  };

  fs.writeFileSync(path.resolve(__dirname, '../tokens/spotify.json'), JSON.stringify(tokens, null, 2), 'utf8');
}

function saveSoundcloudToken(soundcloudAccessToken, soundcloudRefreshToken) {
  
  const tokens = {
    accessToken: soundcloudAccessToken,
    refreshToken: soundcloudRefreshToken,
  };

  fs.writeFileSync(path.resolve(__dirname, '../tokens/soundcloud.json'), JSON.stringify(tokens, null, 2), 'utf8');
}

function saveDiscordToken(accessToken, expiresIn, refreshToken) {
  
  const tokens = {
    accessToken,
    expiresIn,
    refreshToken,
  };

  fs.writeFileSync(path.resolve(__dirname, '../tokens/discord.json'), JSON.stringify(tokens, null, 2), 'utf8');
}

// COMMENT OUT AFTER LOGGING.
player.get('/playerauth', (req, res) => {
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

    // save to spotify.json
    saveSpotifyTokens(access_token, refresh_token);

    res.redirect('/player');
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    setTimeout(() => {
      return res.redirect('/error');
    }, 2000);
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

   // save into soundcloud.json
    saveSoundcloudToken(accessToken, refreshToken);

    res.redirect('/player');
  } catch (error) {
    console.error('Error exchanging code for token:', error.message);
    res.status(500).send('Error during authentication');
  }
});

player.get('/userauth', (req, res) => {
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}`);
});

player.get('/usercallback', async (req, res) => {
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

      // get new tokens, save to .json
      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in;

      saveDiscordToken(accessToken, expiresIn, refreshToken);

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

player.get('/player', async (req, res) => {
  try {
    const nowPlayingResponse = await getNowPlaying();
    res.json(nowPlayingResponse);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).send('Error occurred while fetching currently playing track.');
  }
});

player.get('/user', async (req, res) => {
  try {
    // load tokens from .json
    const discordToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tokens/discord.json'), 'utf8'));
    const discordAccessToken = discordToken.accessToken;

    client.token = discordAccessToken;

    // Fetch the user's data from Discord API
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${client.token}`,
      },
    });

    // Check if the access token needs to be refreshed
    if (userResponse.status === 401) {
      discordAccessToken = await refreshDiscordAccessToken(discordAccessToken);
      client.token = discordAccessToken;
    }

    const connectionsResponse = await axios.get('https://discord.com/api/users/@me/connections', {
      headers: {
        Authorization: `Bearer ${client.token}`,
      },
    });

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

async function getNowPlaying() {

  try {
    const spotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tokens/spotify.json'), 'utf8'));
    const spotifyAccessToken = spotifyToken.accessToken;

    const soundcloudToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tokens/soundcloud.json'), 'utf8'));
    const soundcloudAccessToken = soundcloudToken.accessToken;

    // check if spotify token is expired by using it /me endpoint
    const spotifyMeResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${spotifyAccessToken}`,
      },
    });
    if (spotifyMeResponse.status === 401) {
      await refreshSpotifyAccessToken();
    }

    const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${spotifyAccessToken}`,
      },
    });

    if (spotifyResponse.data && spotifyResponse.data.is_playing) {
      // if not local, use spotify api to get art and url
      if (!spotifyResponse.data.item.is_local) {
      console.log('playing from spotify');
      return {
        isPlaying: true,
        isLocal: spotifyResponse.data.item.is_local,
        name: spotifyResponse.data.item.name,
        artist: spotifyResponse.data.item.artists[0].name,
        art: {
          high: spotifyResponse.data.item.album.images[1].url,
          low: spotifyResponse.data.item.album.images[2].url,
        },
        url: spotifyResponse.data.item.external_urls.spotify,
        progress: spotifyResponse.data.progress_ms,
        duration: spotifyResponse.data.item.duration_ms,
        message: 'player is playing from spotify',
        source: 'spotify',
      };
    } else if (spotifyResponse.data.item.is_local) {
      
      const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(spotifyResponse.data.item.name)} ${encodeURIComponent(spotifyResponse.data.item.artists[0].name)}&limit=3&linked_partitioning=true`, {
        headers: {
          'Authorization': `Bearer ${soundcloudAccessToken}`,
        },
      });

      if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
        const track = soundCloudResponse.data.collection[0]; // Assuming you want the first track
        console.log('playing local file, found result on soundcloud');
      
        return {
          isPlaying: true,
          isLocal: true,
          name: spotifyResponse.data.item.name,
          // removes (@artist) from artist name, leaving only the artist name
          artist: spotifyResponse.data.item.artists[0].name.replace(/\s*\(.*?\)\s*/g, ''),
          art: {
            // replaces default soundcloud image with set size and webp format
            high: track.artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp'),
            low: track.artwork_url.replace('-large', '-t64x64').replace('jpg', 'webp'),
          },
          url: track.permalink_url,
          progress: spotifyResponse.data.progress_ms,
          duration: spotifyResponse.data.item.duration_ms,
          message: 'player is playing a local file, found result on SoundCloud with artist',
          source: 'soundcloud',
        };
        // if no result, search for track name only
      } else {
        const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(spotifyResponse.data.item.name)}&limit=3&linked_partitioning=true`, {
          headers: {
            'Authorization': `Bearer ${soundcloudAccessToken}`,
          },
        });

        if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
          const track = soundCloudResponse.data.collection[0]; // Assuming you want the first track
          console.log('playing local file, found result on soundcloud');
        
          return {
            isPlaying: true,
            isLocal: true,
            name: spotifyResponse.data.item.name,
            artist: spotifyResponse.data.item.artists[0].name.replace(/\s*\(.*?\)\s*/g, ''),
            art: {
              high: track.artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp'),
              low: track.artwork_url.replace('-large', '-t64x64').replace('jpg', 'webp'),
            },
            url: track.permalink_url,
            progress: spotifyResponse.data.progress_ms,
            duration: spotifyResponse.data.item.duration_ms,
            message: 'player is playing a local file, found result on SoundCloud without artist',
            source: 'soundcloud',
          };
        } else {
          console.log('playing local file, no result found on soundcloud');
          return {
            isPlaying: true,
            isLocal: true,
            name: spotifyResponse.data.item.name,
            artist: spotifyResponse.data.item.artists[0].name.replace(/\s*\(.*?\)\s*/g, ''),
            art: {
              high: null,
              low: null,
            },
            url: null,
            progress: spotifyResponse.data.progress_ms,
            duration: spotifyResponse.data.item.duration_ms,
            message: 'player is playing a local file, no result found on SoundCloud',
            source: 'soundcloud',
          };
        
        }
      }
    }
    
    } else if (spotifyResponse.data && !spotifyResponse.data.is_playing || !spotifyResponse.data) {

      const lastFmResponse = await axios.get(`http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);
      // use spotify api to replace art and url from last.fm
      const spotifySearchResponse = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].name)}%20artist:${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].artist['#text'])}&type=track&limit=1`, {
        headers: {
          'Authorization': `Bearer ${spotifyAccessToken}`,
        },
      });
      
      // if found, return spotify data, if not, return null
      if (spotifySearchResponse.data.tracks.items[0]) {
        console.log('not playing, found spotify result');
        return {
          isPlaying: false,
          isLocal: null,
          name: spotifySearchResponse.data.tracks.items[0].name,
          artist: spotifySearchResponse.data.tracks.items[0].artists[0].name,
          art: {
            high: spotifySearchResponse.data.tracks.items[0].album.images[1].url,
            low: spotifySearchResponse.data.tracks.items[0].album.images[2].url,
          },
          url: spotifySearchResponse.data.tracks.items[0].external_urls.spotify,
          progress: null,
          duration: null,
          message: 'not playing, found spotify result',
          source: 'spotify',
        };
      } else {
  
        const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].name)} ${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].artist['#text'])}&limit=3&linked_partitioning=true`, {
          headers: {
            'Authorization': `Bearer ${soundcloudAccessToken}`,
          },
        });
        if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
          const track = soundCloudResponse.data.collection[0];
          console.log('not playing, found soundcloud result with artist');
          return {
            isPlaying: false,
            isLocal: null,
            name: track.title,
            artist: track.user.username,
            art: {
              high: track.artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp'),
              low: track.artwork_url.replace('-large', '-t64x64').replace('jpg', 'webp'),
            },
            url: track.permalink_url,
            progress: null,
            duration: null,
            message: 'not playing, found soundcloud result with artist',
            source: 'soundcloud',
          };
        } else {
          const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].name)}&limit=3&linked_partitioning=true`, {
            headers: {
              'Authorization': `Bearer ${soundcloudAccessToken}`,
            },
          });

          if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
            const track = soundCloudResponse.data.collection[0];
            console.log('not playing, found soundcloud result without artist');
            return {
              isPlaying: false,
              isLocal: null,
              name: track.title,
              artist: track.user.username,
              art: {
                high: track.artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp'),
                low: track.artwork_url.replace('-large', '-t64x64').replace('jpg', 'webp'),
              },
              url: track.permalink_url,
              progress: null,
              duration: null,
              message: 'not playing, found soundcloud result without artist',
              source: 'soundcloud',
            };
          } else {
            console.log('not playing, no result found');
            return {
              isPlaying: false,
              isLocal: null,
              name: lastFmResponse.data.recenttracks.track[0].name,
              artist: lastFmResponse.data.recenttracks.track[0].artist['#text'],
              art: {
                high: null,
                low: null,
              },
              url: null,
              progress: null,
              duration: null,
              message: 'not playing, no result found',
              source: 'idk mars maybe',
            };
          }
          }
      }
    }

  } catch (error) {
    if (error.response && error.response.status === 401) {
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
        message: 'it broke :(',
        source: 'idk mars maybe',
      };
    }
  }
}

async function refreshSpotifyAccessToken() {
  try {
    // read from .json
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
    
    // get new tokens
    const newAccessToken = response.data.access_token;

    // save to spotify.json
    saveSpotifyTokens(newAccessToken, refreshToken);

    console.log('Spotify access token refreshed.');
  } catch (error) {
    console.error('Error refreshing Spotify access token:', error.response ? error.response.data : error.message);
    throw new Error('Error refreshing Spotify access token.');
  }
}

async function refreshDiscordAccessToken(refreshToken) {
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
    saveSpotifyTokens(newAccessToken, expiresIn, newRefreshToken);

    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

client.login(token);

player.listen(PORT, async () => {
  console.log(`player running: ${PORT}`);
});

module.exports = player;
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const player = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file


const PORT = 20002;

const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyRedirectUri = `http://localhost:3000/playercallback`;
const spotifyScopes = 'user-read-currently-playing user-library-read user-read-recently-played user-top-read user-read-playback-state';

// Load Spotify tokens from environment variables
let accessToken = process.env.SPOTIFY_ACCESS_TOKEN;
let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

function saveSpotifyTokensToEnv(spotifyAccessToken, spotifyRefreshToken) {
  const envPath = path.resolve(__dirname, '../.env');
  let envContents = fs.readFileSync(envPath, 'utf8');
  envContents += `\nSPOTIFY_ACCESS_TOKEN=${spotifyAccessToken}\nSPOTIFY_REFRESH_TOKEN=${spotifyRefreshToken}`;
  fs.writeFileSync(envPath, envContents, 'utf8');
  console.log('Spotify tokens saved to .env');
}

// Function to save the access token and refresh token to a JSON file
async function saveSoundcloudToken(soundcloudAccessToken, soundcloudRefreshToken) {
  try {
    // Update the environment variables
    process.env.SOUNDCLOUD_ACCESS_TOKEN = soundcloudAccessToken;
    process.env.SOUNDCLOUD_REFRESH_TOKEN = soundcloudRefreshToken;

    // Update the .env file
    const envPath = path.resolve(__dirname, '../.env');
    let envContents = fs.readFileSync(envPath, 'utf8');
    envContents += `\nSOUNDCLOUD_ACCESS_TOKEN=${soundcloudAccessToken}\nSOUNDCLOUD_REFRESH_TOKEN=${soundcloudRefreshToken}`;
    fs.writeFileSync(envPath, envContents, 'utf8');

    console.log('SoundCloud tokens saved to .env');
  } catch (error) {
    console.error('Error saving SoundCloud tokens:', error);
  }
}

// Function to load the access token and refresh token from a JSON file
async function loadSoundcloudToken() {
  try {
    // Read tokens from environment variables
    const accessToken = process.env.SOUNDCLOUD_ACCESS_TOKEN;
    const refreshToken = process.env.SOUNDCLOUD_REFRESH_TOKEN;

    // Return tokens
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('Error loading SoundCloud tokens:', error);
    return null;
  }
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

    saveSpotifyTokensToEnv(access_token, refresh_token);

    // Reload environment variables from .env
    dotenv.config({ path: path.resolve(__dirname, '../.env') });

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

   // save to .env
    saveSoundcloudToken(accessToken, refreshToken);

    // Reload environment variables from .env
    dotenv.config({ path: path.resolve(__dirname, '../.env') });

    res.redirect('/player');
  } catch (error) {
    console.error('Error exchanging code for token:', error.message);
    res.status(500).send('Error during authentication');
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
      const tokens = await loadSoundcloudToken();

      // if no soundcloud token, run refreshSoundCloudAccessToken
      if (!tokens || !tokens.accessToken) {
        await refreshSoundCloudAccessToken();
        console.log('refreshed soundcloud token');
      }
  
      const accessToken = tokens.accessToken;

      const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(spotifyResponse.data.item.name)} ${encodeURIComponent(spotifyResponse.data.item.artists[0].name)}&limit=1&linked_partitioning=true`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
        const track = soundCloudResponse.data.collection[0]; // Assuming you want the first track
        console.log('playing local file, found result on soundcloud');
      
        return {
          isPlaying: true,
          isLocal: spotifyResponse.data.item.is_local,
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
      } else {
        console.log('playing local file, no result on soundcloud') 
        return {
          isPlaying: true,
          isLocal: spotifyResponse.data.item.is_local,
          name: spotifyResponse.data.item.name,
          artist: spotifyResponse.data.item.artists[0].name.replace(/\s*\(.*?\)\s*/g, ''),
          art: {
            high: null,
            low: null
          },
          url: null,
          progress: spotifyResponse.data.progress_ms,
          duration: spotifyResponse.data.item.duration_ms,
          message: 'playing local file, no result on soundcloud',
          source: 'spotify',
        };
      }
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
        console.log('not playing, found spotify result');
        return {
          isPlaying: false,
          isLocal: false,
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
        const tokens = await loadSoundcloudToken();
        if (!tokens || !tokens.accessToken) {
          await refreshSoundCloudAccessToken();
          console.log('refreshed soundcloud token');
        }
    
        const accessToken = tokens.accessToken;
  
        const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(spotifyResponse.data.item.name)}&limit=3&linked_partitioning=true`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
  
        if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
          const track = soundCloudResponse.data.collection[0];
          console.log('not playing, found result on soundcloud');
        
          return {
            isPlaying: true,
            isLocal: spotifyResponse.data.item.is_local,
            name: spotifyResponse.data.item.name,
            // removes (@artist) from artist name, leaving only the artist name
            artist: spotifyResponse.data.item.artists[0].name.replace(/\s*\(.*?\)\s*/g, ''),
            art: {
              // replaces default soundcloud image with set size and webp format
              high: track.artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp'),
              low: track.artwork_url.replace('-large', '-t64x64').replace('jpg', 'webp'),
            },
            url: track.permalink_url,
            progress: null,
            duration: null,
            message: 'not playing, found result on soundcloud',
            source: 'soundcloud',
          };
        } else {
          console.log('not playing, no soundcloud result');
          return {
            isPlaying: false,
            isLocal: false,
            name: lastFmResponse.data.recenttracks.track[0].name,
            artist: lastFmResponse.data.recenttracks.track[0].artist['#text'].replace(/\s*\(.*?\)\s*/g, ''),
            art: {
              // ignores default last.fm image
              high: lastFmResponse.data.recenttracks.track[0].image[3]['#text'] === 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png' ? null : lastFmResponse.data.recenttracks.track[0].image[3]['#text'],
              low: lastFmResponse.data.recenttracks.track[0].image[0]['#text'] === 'https://lastfm.freetls.fastly.net/i/u/34s/2a96cbd8b46e442fc41c2b86b821562f.png' ? null : lastFmResponse.data.recenttracks.track[0].image[0]['#text'],
            },
            url: lastFmResponse.data.recenttracks.track[0].url,
            progress: null,
            duration: null,
            message: 'not playing, no soundcloud result',
            source: 'last.fm',
          };
          
        }    
    } 
  }

  } catch (error) {
    if (error.response && error.response.status === 401) {
      await refreshSpotifyAccessToken();
      await refreshSoundCloudAccessToken();
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

    const newAccessToken = response.data.access_token;

    // Load existing .env file
    const envPath = path.resolve(__dirname, '../.env');
    let envContents = fs.readFileSync(envPath, 'utf8');

    // Replace existing token lines or add new ones if not present
    envContents = envContents.replace(/SPOTIFY_ACCESS_TOKEN=.*/, `SPOTIFY_ACCESS_TOKEN=${newAccessToken}`);
    
    // Write the updated content back to the .env file
    fs.writeFileSync(envPath, envContents, 'utf8');

    // Update the environment variables
    process.env.SPOTIFY_ACCESS_TOKEN = newAccessToken;

    console.log('Spotify tokens refreshed and saved.');
  } catch (error) {
    console.error('Error refreshing token:', error.response ? error.response.data : error.message);
    throw new Error('Error refreshing access token.');
  }
}

async function refreshSoundCloudAccessToken() {
  try {
    const response = await axios.post('https://api.soundcloud.com/oauth/token', querystring.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.SOUNDCLOUD_CLIENT_ID,
      client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET,
      refresh_token: process.env.SOUNDCLOUD_REFRESH_TOKEN,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `OAuth ${process.env.SOUNDCLOUD_ACCESS_TOKEN}`,
      },
    });
    
    const newAccessToken = response.data.access_token;

    // Load existing .env file
    const envPath = path.resolve(__dirname, '../.env');
    let envContents = fs.readFileSync(envPath, 'utf8');

    // Replace existing token lines or add new ones if not present
    envContents = envContents.replace(/SOUNDCLOUD_ACCESS_TOKEN=.*/, `SOUNDCLOUD_ACCESS_TOKEN=${newAccessToken}`);
    
    // Write the updated content back to the .env file
    fs.writeFileSync(envPath, envContents, 'utf8');

    // Update the environment variables
    process.env.SOUNDCLOUD_ACCESS_TOKEN = newAccessToken;

    console.log('SoundCloud tokens refreshed and saved.');
  } catch (error) {
    console.error('Error refreshing token:', error.response ? error.response.data : error.message);
    throw new Error('Error refreshing access token.');
  }
}


player.listen(PORT, async () => {
  console.log(`player running: ${PORT}`);
});

module.exports = player;
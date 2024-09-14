const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const player = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const sharp = require('sharp');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20002;

const spotifyScopes = 'user-read-currently-playing user-library-read user-read-recently-played user-top-read user-read-playback-state';
const discordScopes = ['identify', 'connections'];

function saveSpotifyTokens(spotifyAccessToken, spotifyRefreshToken) {
  const tokens = {
    accessToken: spotifyAccessToken,
    refreshToken: spotifyRefreshToken,
  };

  fs.writeFileSync(path.resolve(__dirname, './tokens/spotify.json'), JSON.stringify(tokens, null, 2), 'utf8');
}

function saveSoundcloudToken(soundcloudAccessToken, soundcloudRefreshToken) {
  const tokens = {
    accessToken: soundcloudAccessToken,
    refreshToken: soundcloudRefreshToken,
  };

  fs.writeFileSync(path.resolve(__dirname, './tokens/soundcloud.json'), JSON.stringify(tokens, null, 2), 'utf8');
}

player.get('/playerauth', (req, res) => {
  const authorizeUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: spotifyScopes,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  })}`;
  res.redirect(authorizeUrl);
});

player.get('/playercallback', async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token } = response.data;

    fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })
    .then(response => response.json())
    .then(data => {
      const spotifyURL = data.uri;
      const approvedID = process.env.SPOTIFY_APPROVED_ID;

      if (spotifyURL !== approvedID) {
        res.json({ youre_not_choccy: 'what are you trying to do?? stop it' });
        console.log('Unauthorized user tried to access userinfo.');
        return;
      } else {
        res.redirect('/player');
        console.log('Authorized user accessed userinfo.');
        saveSpotifyTokens(access_token, refresh_token);
      }
    });

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

    fetch('https://api.soundcloud.com/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    .then(response => response.json())
    .then(data => {
      console.log(data);
      const soundcloudURL = data.id
      const approvedID = process.env.SOUNDCLOUD_APPROVED_ID;

      if (soundcloudURL !== approvedID) {
        res.json({ youre_not_choccy: 'what are you trying to do?? stop it' });
        console.log('Unauthorized user tried to access userinfo.');
        return;
      } else {
        res.redirect('/player');
        console.log('Authorized user accessed userinfo.');
        saveSoundcloudToken(accessToken, refreshToken);
      }
    });

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
  try {
    const lastfmResponse = await axios.get(`http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=2`);
    const lastfmData = lastfmResponse.data;
    const lastfmTrack = lastfmData.recenttracks.track[0];
    const lastfmPrevTrack = lastfmData.recenttracks.track[0];
    const lastfmNowPlaying = lastfmTrack['@attr'] && lastfmTrack['@attr'].nowplaying === 'true' ? true : false;
    const name = lastfmTrack.name;
    const artist = lastfmTrack.artist['#text'];
    const namePrev = lastfmPrevTrack.name;
    const artistPrev = lastfmPrevTrack.artist['#text'];
    const spotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/spotify.json'), 'utf8'));

    // if playing and image is not available by lastfm
    if (lastfmNowPlaying && lastfmData.recenttracks.track[0].image[3]['#text'] === 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      const spotifyResponse = await axios.get(`https://api.spotify.com/v1/search?q=track:${name} artist:${artist}&type=track`, {
        headers: {
          Authorization: `Bearer ${spotifyToken.accessToken}`,
        },
      });

      const spotifyData = spotifyResponse.data.tracks.items[0];
      const spotifyName = spotifyData.name;
      const spotifyArtist = spotifyData.artists[0].name;
      const spotifyArtHigh = spotifyData.album.images[0].url;
      const spotifyArtLow = spotifyData.album.images[1].url;

      return {
        isPlaying: true,
        name: spotifyName ? spotifyName : null,
        artist: spotifyArtist ? spotifyArtist : null,
        art: {
          high: spotifyArtHigh ? spotifyArtHigh : null,
          low: spotifyArtLow ? spotifyArtLow : null,
        }
      };
      // if playing and image is available by lastfm
    } else if (lastfmNowPlaying && lastfmData.recenttracks.track[0].image[3]['#text'] !== 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      const lowQualityArt = lastfmData.recenttracks.track[0].image[2]['#text'];
      const highQualityArt = lastfmData.recenttracks.track[0].image[3]['#text'];
      
      return {
        isPlaying: true,
        name: name ? name : null,
        artist: artist ? artist : null,
        art: {
          high: highQualityArt ? highQualityArt : null,
          low: lowQualityArt ? lowQualityArt : null,
        }
      };
      // if not playing and image is not available by lastfm
    } else if (!lastfmNowPlaying && lastfmData.recenttracks.track[0].image[3]['#text'] === 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      const spotifyResponse = await axios.get(`https://api.spotify.com/v1/search?q=track:${namePrev} artist:${artistPrev}&type=track`, {
        headers: {
          Authorization: `Bearer ${spotifyToken.accessToken}`,
        },
      });

      const spotifyData = spotifyResponse.data.tracks.items[0];
      const spotifyName = spotifyData.name;
      const spotifyArtist = spotifyData.artists[0].name;
      const spotifyArtHigh = spotifyData.album.images[0].url;
      const spotifyArtLow = spotifyData.album.images[1].url;

      return {
        isPlaying: false,
        name: spotifyName ? spotifyName : null,
        artist: spotifyArtist ? spotifyArtist : null,
        art: {
          high: spotifyArtHigh ? spotifyArtHigh : null,
          low: spotifyArtLow ? spotifyArtLow : null,
        }
      };
      // if not playing and image is available by lastfm
    } else if (!lastfmNowPlaying && lastfmData.recenttracks.track[0].image[3]['#text'] !== 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      const lowQualityArt = lastfmData.recenttracks.track[0].image[3]['#text'];
      const highQualityArt = lastfmData.recenttracks.track[0].image[3]['#text'];

      return {
        isPlaying: false,
        name: namePrev ? namePrev : null,
        artist: artistPrev ? artistPrev : null,
        art: {
          high: highQualityArt ? highQualityArt : null,
          low: lowQualityArt ? lowQualityArt : null,
        }
      };
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      refreshSpotifyAccessToken();
      return getNowPlaying();
    } else {
      console.error('Error:', error);
      return {
        isPlaying: false,
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
    const spotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/spotify.json'), 'utf8'));
    const spotifyRefreshToken = spotifyToken.refreshToken;
    // read from .json
    const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: spotifyRefreshToken,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    // get new tokens
    const newAccessToken = response.data.access_token;

    // write to .json
    saveSpotifyTokens(newAccessToken, spotifyRefreshToken);

  } catch (error) {
    console.error('Error refreshing Spotify access token:', error.response ? error.response.data : error.message);
    throw new Error('Error refreshing Spotify access token.');
  }
}

player.listen(PORT, async () => {
  console.log(`player running: ${PORT}`);
});

module.exports = player;
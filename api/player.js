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
        source: 'spotify',
      };
    } else {
      // if local, use last.fm api to get art and url
      console.log('playing a local file');

      const soundCloudResponse = await axios.get(`https://api.choccymilk.uk/sound-search/${encodeURIComponent(spotifyResponse.data.item.name)}/${encodeURIComponent(spotifyResponse.data.item.artists[0].name)}`);
            
      if (soundCloudResponse.data && soundCloudResponse.data.length > 0) {
        return {
          isPlaying: true,
          isLocal: spotifyResponse.data.item.is_local,
          name: spotifyResponse.data.item.name,
          artist: spotifyResponse.data.item.artists[0].name,
          art: soundCloudResponse.data[0].art,  // Corrected access to 'art' property
          url: soundCloudResponse.data[0].url,  // Corrected access to 'url' property
          progress: spotifyResponse.data.progress_ms,
          duration: spotifyResponse.data.item.duration_ms,
          message: 'player is playing a local file, found result on soundcloud',
          source: 'soundcloud',
        };
      } else {
        return {
          isPlaying: true,
          isLocal: spotifyResponse.data.item.is_local,
          name: spotifyResponse.data.item.name,
          artist: spotifyResponse.data.item.artists[0].name,
          art: null,
          url: null,
          progress: spotifyResponse.data.progress_ms,
          duration: spotifyResponse.data.item.duration_ms,
          message: 'player is playing a local file, no result found on soundcloud',
          source: 'soundcloud',
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
        console.log('not playing / empty response, found spotify result');

        return {
          isPlaying: false,
          isLocal: false,
          name: spotifySearchResponse.data.tracks.items[0].name,
          artist: spotifySearchResponse.data.tracks.items[0].artists[0].name,
          art: spotifySearchResponse.data.tracks.items[0].album.images[1].url,
          url: spotifySearchResponse.data.tracks.items[0].external_urls.spotify,
          progress: null,
          duration: null,
          message: 'not playing / empty response, found spotify result',
          source: 'spotify',
        };
      } else {
        console.log('not playing / empty response, no spotify result, trying soundcloud');

        const soundCloudResponse = await axios.get(`https://api.choccymilk.uk/sound-search/${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].name)}/${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].artist['#text'])}`);

        if (soundCloudResponse.data && soundCloudResponse.data.length > 0) {
          return {
            isPlaying: false,
            isLocal: false,
            name: soundCloudResponse.data[0].name,
            artist: soundCloudResponse.data[0].artist,
            art: soundCloudResponse.data[0].art,
            url: soundCloudResponse.data[0].url,
            progress: null,
            duration: null,
            message: 'not playing / empty response, found soundcloud result',
            source: 'soundcloud',
          };
        } else {
          return {
            isPlaying: false,
            isLocal: false,
            name: lastFmResponse.data.recenttracks.track[0].name,
            artist: lastFmResponse.data.recenttracks.track[0].artist['#text'],
            art: lastFmResponse.data.recenttracks.track[0].image[3]['#text'],
            url: lastFmResponse.data.recenttracks.track[0].url,
            progress: null,
            duration: null,
            message: 'not playing / empty response, no results',
            source: 'last.fm',
          };
        }
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
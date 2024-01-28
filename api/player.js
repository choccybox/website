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

const soundcloudClientId = process.env.SOUNDCLOUD_CLIENT_ID;
const soundcloudClientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;
const soundcloudRedirectUri = `http://localhost:3000/soundcallback`;
const soundcloudScopes = 'non-expiring';
const soundcloudTokenFile = 'soundcloud.json';

// Spotify tokens
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

// soundcloud tokens
try {
  const tokensData = fs.readFileSync(soundcloudTokenFile, 'utf8');
  const tokens = JSON.parse(tokensData);

  soundcloudAccessToken = tokens.accessToken;
  soundcloudRefreshToken = tokens.refreshToken;

  console.log('soundcloud token loaded');
} catch (err) {
  console.error('error loading soundcloud token', err.message);
}

// soundcloud saving token logic
function saveSoundcloudTokensToFile() {
  const tokens = {
    accessToken: soundcloudAccessToken,
    refreshToken: soundcloudRefreshToken,
  };

  try {
    fs.writeFileSync(soundcloudTokenFile, JSON.stringify(tokens), 'utf8');
    console.log('soundcloud token saved');
  } catch (err) {
    console.error('error saving soundcloud token:', err.message);
  }
}

// COMMENT OUT AFTER LOGGING. (so some random doesnt log in)
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
});
// COMMENT OUT AFTER LOGGING. (so some random doesnt log in)

player.get('/soundauth', (req, res) => {
  const authorizeUrl = `https://soundcloud.com/connect?${querystring.stringify({
    response_type: 'code',
    client_id: soundcloudClientId,
    scope: soundcloudScopes,
    redirect_uri: soundcloudRedirectUri,
  })}`;
  res.redirect(authorizeUrl);
});

player.get('/soundcallback', async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post('https://api.soundcloud.com/oauth2/token', querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: soundcloudRedirectUri,
      client_id: soundcloudClientId,
      client_secret: soundcloudClientSecret,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token } = response.data;
    soundcloudAccessToken = access_token;
    soundcloudRefreshToken = refresh_token;

    res.json('success');
    saveSoundcloudTokensToFile();
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
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

  // song is playing
  // fetch api url
  try {
    const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    // if is playing, fetch data
    if (spotifyResponse.data && spotifyResponse.data.item && spotifyResponse.data.is_playing) {
      console.log(`playing, using spotify`);
      const { name, artists, album, duration_ms } = spotifyResponse.data.item;
      const isPlaying = true;
      const progress = spotifyResponse.data.progress_ms || 0;

      const simplifiedResponse = {
        isPlaying,
        isLocal: spotifyResponse.data.item.is_local,
        name,
        artist: artists.splice && artists.splice(0, 1).map(artist => artist.name).join(', '),
        art: album.images.length > 0 ? album.images[0].url : null,
        url: spotifyResponse.data.item.external_urls.spotify,
        progress,
        duration: duration_ms,
      };

      // if track is local, its not on spotify, use soundcloud api to get data
      if (simplifiedResponse.isLocal === true) {
        try {
          console.log(`playing, but using soundcloud`);
          const artistNameModified =  simplifiedResponse.artist.replace(/\s*\([^)]*\)\s*/g, '').trim();
          const soundcloudSearchResponse = await axios.get(`https://api.choccymilk.uk/sound-search/${encodeURIComponent(name)}/${encodeURIComponent(artistNameModified)}`);
      
          simplifiedResponse.url = soundcloudSearchResponse.data[0].url;
          simplifiedResponse.art = soundcloudSearchResponse.data[0].art;
        
        } catch (soundcloudError) {
          console.error('something fucked up when using soundcloud, fuck:', soundcloudError.message);
        }
      }
      
      return simplifiedResponse;

    // spotify is not playing
    // last.fm api to fetch last played track
  } else if (
    // defining all kinds of ways to tell this dumbass code "hey no music is playing"
    (spotifyResponse.data && spotifyResponse.data.item && !spotifyResponse.data.is_playing) ||
    (spotifyResponse.data === "EMPTY_RESPONSE" || spotifyResponse.data === "")) {
    const lastFmResponse = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USER}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);
    const lastPlayedTrack = lastFmResponse.data.recenttracks.track[0];

    console.log("not playing, using spotify first");

    try {
      // defining stuff
      const trackName = encodeURIComponent(lastPlayedTrack.name);
      const artistName = encodeURIComponent(lastPlayedTrack.artist['#text']);
      const searchUrl = `https://api.spotify.com/v1/search?q=track:${trackName} artist:${artistName}&type=track&limit=1`;
      const spotifySearchResponse = await axios.get(searchUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      // if there are no matches on spotify, use soundcloud
      // uses soundcloud first, please dont ask why
      if (spotifySearchResponse.data.tracks.total === 0) {
        try {
          console.log("it wasnt on spotify, using soundcloud");

          // remove (@) from artist name (if it exists)
          const artistNameModified =  artistName.replace(/\s*\([^)]*\)\s*/g, '').trim();
          const soundcloudSearchResponse = await axios.get(`https://api.choccymilk.uk/sound-search/${trackName}/${artistNameModified}`);
      
          const simplifiedResponse = {
            isPlaying: false,
            isLocal: null,
            name: soundcloudSearchResponse.data[0].name,
            artist: soundcloudSearchResponse.data[0].artist,
            art: soundcloudSearchResponse.data[0].art,
            url: soundcloudSearchResponse.data[0].url,
            progress: null,
            duration: null
          };
        
          return simplifiedResponse;
        }
        catch (soundcloudError) {
          // Handle error if SoundCloud API call fails
          console.error('soundcloud fucked up again:', soundcloudError.message);
          return null;
        }
      } else {
        // Process Spotify results as before if there are matches
        const spotifyTrack = spotifySearchResponse.data.tracks.items[0];

        const simplifiedResponse = {
          isPlaying: false,
          isLocal: null,
          name: spotifyTrack.name,
          artist: spotifyTrack.artists.splice && spotifyTrack.artists.splice(0, 1).map(artist => artist.name).join(', '),
          art: spotifyTrack.album.images.length > 0 ? spotifyTrack.album.images[0].url : null,
          url: spotifyTrack.external_urls.spotify,
          progress: null,
          duration: null
        };

        return simplifiedResponse;
      }
    } catch (spotifyError) {
      console.error('spotify fucked up, again.:', spotifyError.message);
      return null;
    } 
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
  console.log(`spotify running: ${PORT}`);
});

module.exports = player;
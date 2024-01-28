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
const redirectUri = `http://localhost:3000/playercallback`;
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

player.get('/playerauth', (req, res) => {
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

    res.redirect('/player');
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

  // song is playing, use spotify currently playing
  try {
    const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (spotifyResponse.data && spotifyResponse.data.item && spotifyResponse.data.is_playing) {
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

      if (simplifiedResponse.isLocal === true) {
        try {
          console.log('Local track detected, fetching data from SoundCloud API...');

          const artistNameModified =  simplifiedResponse.artist.replace(/\s*\([^)]*\)\s*/g, '').trim();

          console.log('Modified Artist Name:', artistNameModified);


          const soundcloudSearchResponse = await axios.get(`https://api.choccymilk.uk/sound-search/${encodeURIComponent(name)}/${encodeURIComponent(artistNameModified)}`);
      
          console.log(`https://api.choccymilk.uk/sound-search/${encodeURIComponent(name)}/${encodeURIComponent(artistNameModified)}`)

          simplifiedResponse.url = soundcloudSearchResponse.data[0].url;
          simplifiedResponse.art = soundcloudSearchResponse.data[0].art;
        
        } catch (soundcloudError) {
          console.error('Error fetching data from SoundCloud:', soundcloudError.message);
          console.log('man what the fuck');
        }
      }
      

      return simplifiedResponse;
    // spotify is not playing, use lastfm, fetch data with either spotify or soundcloud
  } else if (spotifyResponse.data && spotifyResponse.data.item && !spotifyResponse.data.is_playing) {
/*     console.log('not playing'); */
    console.log(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USER}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);
    const lastFmResponse = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USER}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);
    // Last.fm has a recently played track
    const lastPlayedTrack = lastFmResponse.data.recenttracks.track[0];

    // Use Last.fm data to search for a matching track on the Spotify API
    try {
      // Sanitize and simplify the search parameters
      const trackName = encodeURIComponent(lastPlayedTrack.name);
      const artistName = encodeURIComponent(lastPlayedTrack.artist['#text']);
      const searchUrl = `https://api.spotify.com/v1/search?q=track:${trackName} artist:${artistName}&type=track&limit=1`;
      const spotifySearchResponse = await axios.get(searchUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (spotifySearchResponse.data.tracks.total === 0) {
/*         console.log('No matches found on Spotify.'); */
        try {
          // remove (@) from artist name (if it exists)
          const artistNameModified =  artistName.replace(/\s*\([^)]*\)\s*/g, '').trim();

          // If no matches are found on Spotify, use SoundCloud API to search for the song and get its data
          const soundcloudSearchResponse = await axios.get(`https://api.choccymilk.uk/sound-search/${trackName}/${artistNameModified}`);
      
          console.log(`https://api.choccymilk.uk/sound-search/${trackName}/${artistNameModified}`)
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
          console.error('Error fetching data from SoundCloud:', soundcloudError.message);
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
      console.error('Error searching on Spotify:', spotifyError.message);
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
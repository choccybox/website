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
    const spotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/spotify.json'), 'utf8'));
    const spotifyAccessToken = spotifyToken.accessToken;

    const soundcloudToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/soundcloud.json'), 'utf8'));
    const soundcloudAccessToken = soundcloudToken.accessToken;

    const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${spotifyAccessToken}`,
      },
    });

    if (spotifyResponse.data && spotifyResponse.data.is_playing) {
      if (!spotifyResponse.data.item.is_local) {
      // console.log('playing from spotify');
      const originalspotifyimg = spotifyResponse.data.item.album.images[1].url;

      try {
        const response = await axios({
          method: 'get',
          url: originalspotifyimg,
          responseType: 'arraybuffer',
        });
      
        const highresizedspotifyimg = await sharp(response.data).resize(280, 280).toBuffer();
        const lowresizedspotifyimg = await sharp(response.data).resize(128, 128).toBuffer();
            
        return {
          isPlaying: true,
          name: spotifyResponse.data.item.name,
          artist: spotifyResponse.data.item.artists[0].name,
          art: {
            high: `data:image/webp;base64,${highresizedspotifyimg.toString('base64')}`,
            low: `data:image/webp;base64,${lowresizedspotifyimg.toString('base64')}`,
          },
          url: spotifyResponse.data.item.external_urls.spotify,
          progress: spotifyResponse.data.progress_ms,
          duration: spotifyResponse.data.item.duration_ms,
          message: 'playing from spotify',
          source: 'spotify',
        };
      } catch (error) {
        console.error('Error downloading or resizing image:', error);
      }
      // check if there are images, if not, use soundcloud api to get art and url
    } else if (spotifyResponse.data.item.album.images.length === 0) {
      
      const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(spotifyResponse.data.item.name)} ${encodeURIComponent(spotifyResponse.data.item.artists[0].name)}&limit=3&linked_partitioning=true`, {
        headers: {
          'Authorization': `Bearer ${soundcloudAccessToken}`,
        },
      });

      if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
        const track = soundCloudResponse.data.collection[0];
        // console.log('playing local file, found result on soundcloud with artist');

        // check if track.artwork_url is null, if so, use user.avatar_url
        const originalsoundcloudimg = track.artwork_url ? 
          track.artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp') : 
          track.user.avatar_url.replace('-large', '-t300x300').replace('jpg', 'webp');


        try {
          const response = await axios({
            method: 'get',
            url: originalsoundcloudimg,
            responseType: 'arraybuffer',
          });
        
          const highresizedsoundcloudimg = await sharp(response.data).resize(280, 280).toBuffer();
          const lowresizedsoundcloudimg = await sharp(response.data).resize(128, 128).toBuffer();
                
          return {
            isPlaying: true,
            name: spotifyResponse.data.item.name,
            artist: spotifyResponse.data.item.artists[0].name,
            art: {
              high: `data:image/webp;base64,${highresizedsoundcloudimg.toString('base64')}`,
              low: `data:image/webp;base64,${lowresizedsoundcloudimg.toString('base64')}`,
            },
            url: soundCloudResponse.data.collection[0].permalink_url,
            progress: spotifyResponse.data.progress_ms,
            duration: spotifyResponse.data.item.duration_ms,
            message: 'playing local file, found result on soundcloud with artist',
            source: 'soundcloud',
          };
        } catch (error) {
          console.error('Error downloading or resizing image:', error);
        }
      } else {
        const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(spotifyResponse.data.item.name)}&limit=3&linked_partitioning=true`, {
          headers: {
            'Authorization': `Bearer ${soundcloudAccessToken}`,
          },
        });

        if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
          const track = soundCloudResponse.data.collection[0];
          // console.log('playing local file, found result on soundcloud without artist');
        
          const originalsoundcloudimg = track.artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp');
          try {
            const response = await axios({
              method: 'get',
              url: originalsoundcloudimg,
              responseType: 'arraybuffer',
            });
        
            const highresizedsoundcloudimg = await sharp(response.data).resize(280, 280).toBuffer();
            const lowresizedsoundcloudimg = await sharp(response.data).resize(128, 128).toBuffer();
                
            return {
              isPlaying: true,
              name: spotifyResponse.data.item.name,
              artist: spotifyResponse.data.item.artists[0].name,
              art: {
                high: `data:image/webp;base64,${highresizedsoundcloudimg.toString('base64')}`,
                low: `data:image/webp;base64,${lowresizedsoundcloudimg.toString('base64')}`,
              },
              url: soundCloudResponse.data.collection[0].permalink_url,
              progress: spotifyResponse.data.progress_ms,
              duration: spotifyResponse.data.item.duration_ms,
              message: 'playing local file, found result on soundcloud without artist',
              source: 'soundcloud',
            };
          } catch (error) {
            console.error('Error downloading or resizing image:', error);
          }
        } else {
          // console.log('playing local file, no result found on soundcloud');
          return {
            isPlaying: true,
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
      
      // if found, return spotify data, if not, use soundcould, only then return last.fm data
      if (spotifySearchResponse.data.tracks.items[0]) {
        // console.log('not playing, found spotify result');
        const originalspotifyimg = spotifySearchResponse.data.tracks.items[0].album.images[1].url;

        try {
          const response = await axios({
            method: 'get',
            url: originalspotifyimg,
            responseType: 'arraybuffer',
          });
        
          const highresizedspotifyimg = await sharp(response.data).resize(280, 280).toBuffer();
          const lowresizedspotifyimg = await sharp(response.data).resize(128, 128).toBuffer();

          return {
            isPlaying: false,
            name: spotifySearchResponse.data.tracks.items[0].name,
            artist: spotifySearchResponse.data.tracks.items[0].artists[0].name,
            art: {
              high: `data:image/webp;base64,${highresizedspotifyimg.toString('base64')}`,
              low: `data:image/webp;base64,${lowresizedspotifyimg.toString('base64')}`,
            },
            url: spotifySearchResponse.data.tracks.items[0].external_urls.spotify,
            progress: null,
            duration: null,
            message: 'not playing, found spotify result',
            source: 'spotify',
          };
        } catch (error) {
          console.error('Error downloading or resizing image:', error);
        }
      } else {
  
        const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].name)} ${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].artist['#text'])}&limit=3&linked_partitioning=true`, {
          headers: {
            'Authorization': `Bearer ${soundcloudAccessToken}`,
          },
        });
        if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
          const originalsoundcloudimg = soundCloudResponse.data.collection[0].artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp');
          const track = soundCloudResponse.data.collection[0];
          // console.log('not playing, found soundcloud result with artist');

          try {
            const response = await axios({
              method: 'get',
              url: originalsoundcloudimg,
              responseType: 'arraybuffer',
            });
          
            const highresizedsoundcloudimg = await sharp(response.data).resize(280, 280).toBuffer();
            const lowresizedsoundcloudimg = await sharp(response.data).resize(128, 128).toBuffer();
  
            return {
              isPlaying: false,
              name: track.title,
              artist: track.user.username,
              art: {
                high: `data:image/webp;base64,${highresizedsoundcloudimg.toString('base64')}`,
                low: `data:image/webp;base64,${lowresizedsoundcloudimg.toString('base64')}`,
              },
              url: track.permalink_url,
              progress: null,
              duration: null,
              message: 'not playing, found soundcloud result with artist',
              source: 'soundcloud',
            };
          } catch (error) {
            console.error('Error downloading or resizing image:', error);
          }
        } else {
          const soundCloudResponse = await axios.get(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(lastFmResponse.data.recenttracks.track[0].name)}&limit=3&linked_partitioning=true`, {
            headers: {
              'Authorization': `Bearer ${soundcloudAccessToken}`,
            },
          });

          if (soundCloudResponse.data.collection && soundCloudResponse.data.collection.length > 0) {
            const originalsoundcloudimg = soundCloudResponse.data.collection[0].artwork_url.replace('-large', '-t300x300').replace('jpg', 'webp');
            const track = soundCloudResponse.data.collection[0];
            // console.log('not playing, found soundcloud result without artist');

            try {
              const response = await axios({
                method: 'get',
                url: originalsoundcloudimg,
                responseType: 'arraybuffer',
              });
            
              const highresizedsoundcloudimg = await sharp(response.data).resize(280, 280).toBuffer();
              const lowresizedsoundcloudimg = await sharp(response.data).resize(128, 128).toBuffer();
    
              return {
                isPlaying: false,
                name: track.title,
                artist: track.user.username,
                art: {
                  high: `data:image/webp;base64,${highresizedsoundcloudimg.toString('base64')}`,
                  low: `data:image/webp;base64,${lowresizedsoundcloudimg.toString('base64')}`,
                },
                url: track.permalink_url,
                progress: null,
                duration: null,
                message: 'not playing, found soundcloud result without artist',
                source: 'soundcloud',
              };
            } catch (error) {
              console.error('Error downloading or resizing image:', error);
            }
          } else {
            const originallasfmimg = lastFmResponse.data.recenttracks.track[0].image[3]['#text'];
            // console.log('not playing, no result found');
            try {
              const response = await axios({
                method: 'get',
                url: originallasfmimg,
                responseType: 'arraybuffer',
              });
            
              const highresizedlastfmimg = await sharp(response.data).resize(280, 280).toBuffer();
              const lowresizedlastfmimg = await sharp(response.data).resize(128, 128).toBuffer();
    
              return {
                isPlaying: false,
                name: lastFmResponse.data.recenttracks.track[0].name,
                artist: lastFmResponse.data.recenttracks.track[0].artist['#text'],
                art: {
                  high: `data:image/webp;base64,${highresizedlastfmimg.toString('base64')}`,
                  low: `data:image/webp;base64,${lowresizedlastfmimg.toString('base64')}`,
                },
                url: lastFmResponse.data.recenttracks.track[0].url,
                progress: null,
                duration: null,
                message: 'not playing, no result found',
                source: 'last.fm',
              };
            } catch (error) {
              console.error('Error downloading or resizing image:', error);
            }
          }
          }
      }
    }

  } catch (error) {
    if (error.response && error.response.status === 401) {
      refreshSpotifyAccessToken();
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
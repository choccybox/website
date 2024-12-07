const express = require('express');
const axios = require('axios');
const stats = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const NodeCache = require('node-cache');
const querystring = require('querystring');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file
const PORT = 20004;

const cache = new NodeCache({ stdTTL: 24 * 60 * 60 }); // Cache with 24 hours TTL

stats.get('/stats', async (req, res) => {
  const cachedData = cache.get('statsData');
  if (cachedData) {
    return res.json(cachedData);
  }

  try {
    const lastFMAlbums = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&period=overall&format=json`);

    const lastFMArtists = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&period=overall&format=json`);

    const lastFMTracks = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&period=overall&format=json`);

    const lastFMInfo = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json`);

    const lastFMRecent = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=1`);

    let totalPlaytime = 0;
    let totalTracks = 0;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json&page=${page}&limit=1000`);

      if (page === 1) {
        totalPages = Math.ceil(response.data.toptracks['@attr'].total / 1000);
      }

      const tracks = response.data.toptracks.track;
      for (const track of tracks) {
        totalTracks++;
        if (parseInt(track.duration, 10) !== 0) {
          totalPlaytime += parseInt(track.duration, 10) * parseInt(track.playcount, 10);
        }
      }
      
      page++;
    }

    const limit = 20;

    const lastFMOrganized = {
      topAlbums: lastFMAlbums.data.topalbums.album.slice(0, limit).map(album => ({
        name: album.name,
        artist: album.artist.name,
        imageHigh: album.image[3]['#text'],
        imageLow: album.image[2]['#text'],
        url: album.url,
        playcount: album.playcount,
        rank: album['@attr'].rank,
      })),

      topArtists: await Promise.all(
        lastFMArtists.data.topartists.artist.slice(0, limit).map(async artist => {
          const combName = encodeURIComponent(`${artist.name.split('&')[0].trim()}`);
          const artistImages = await searchAlternative(combName, 'artist');
          return {
            name: artist.name,
            imageHigh: artistImages ? artistImages.high : artist.image[3]['#text'],
            imageLow: artistImages ? artistImages.low : artist.image[2]['#text'],
            url: artist.url,
            playcount: artist.playcount,
            rank: artist['@attr'].rank,
          };
        })
      ),

      topTracks: await Promise.all(
        lastFMTracks.data.toptracks.track.slice(0, limit).map(async track => {
          const combName = encodeURIComponent(`track:${track.name} artist:${track.artist.name}`);
          const albumImages = await searchAlternative(combName, 'track');
          return {
            name: track.name,
            artist: track.artist.name,
            imageHigh: albumImages ? albumImages.high : track.image[3]['#text'],
            imageLow: albumImages ? albumImages.low : track.image[2]['#text'],
            url: track.url,
            playcount: track.playcount,
            rank: track['@attr'].rank,
          };
        })
      ),

      userInfo: {
        total_plays: lastFMInfo.data.user.playcount,
        total_tracks: lastFMInfo.data.user.track_count,
        total_albums: lastFMInfo.data.user.album_count,
        total_artists: lastFMInfo.data.user.artist_count,
        total_playtime: convertToHuman(totalPlaytime),
      },
    };

    console.log('first track:', lastFMRecent.data.recenttracks.track[0].name, 'by', lastFMRecent.data.recenttracks.track[0].artist['#text']);
    console.log('total playtime', totalPlaytime);

    lastFMOrganized.firstTrack = {
      updateTime: new Date().toISOString(),
      name: lastFMRecent.data.recenttracks.track[0].name,
      artist: lastFMRecent.data.recenttracks.track[0].artist['#text'],
    };

    lastFMOrganized.totalPlaytime = convertToHuman(totalPlaytime);

    cache.set('statsData', lastFMOrganized);
    console.log('Data cached.');

    res.json(lastFMOrganized);
  } catch (error) {
    console.error('Error during data fetch:', error);
    res.status(500).send('Error during data fetch.');
  }
});

async function searchAlternative(combName, type) {
  const spotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/spotify.json'), 'utf8'));
  let spotifyAccessToken = spotifyToken.accessToken;
  console.log(type);

  // Only search Spotify if LastFM couldn't find a valid image
  const spotifyUrl = `https://api.spotify.com/v1/search?q=${combName}&type=${type}&limit=1`;
  try {
    const spotifyResponse = await axios.get(spotifyUrl, {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    });
    const items = spotifyResponse.data[`${type}s`].items;
    if (items.length > 0) {
      const item = items[0];
      let images = [];
      if (type === 'track' && item.album && item.album.images) {
      images = item.album.images;
      } else if (item.images) {
      images = item.images;
      }
      if (images.length > 0) {
      return {
        low: images[images.length - 1].url,
        high: images[0].url,
      };
      }
    }
    console.log(`No suitable image found for: ${combName} on Spotify.`);
  } catch (error) {
     if (error.response && error.response.status === 401) {
      console.log('Spotify token expired. Refreshing token...');
      try {
        await refreshSpotifyAccessToken();
        const newSpotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/spotify.json'), 'utf8'));
        spotifyAccessToken = newSpotifyToken.accessToken;

        const retryResponse = await axios.get(spotifyUrl, {
          headers: {
            Authorization: `Bearer ${spotifyAccessToken}`,
          },
        });
        const retryItems = retryResponse.data[`${type}s`].items;
        if (retryItems.length > 0) {
          const item = retryItems[0];
          let images = [];
          if (type === 'track' && item.album && item.album.images) {
          images = item.album.images;
          } else if (item.images) {
          images = item.images;
          }
          if (images.length > 0) {
          return {
            low: images[images.length - 1].url,
            high: images[0].url,
          };
          }
        }
        console.log(`No suitable image found for: ${combName} on Spotify after token refresh.`);
      } catch (retryError) {
        console.error(`Error fetching image for ${combName} from Spotify after token refresh:`, retryError);
      }
    } else {
      console.error(`Error fetching image for ${combName} from Spotify:`, error);
    }
  }

  return null;
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

function saveSpotifyTokens(spotifyAccessToken, spotifyRefreshToken) {
  const tokens = {
    accessToken: spotifyAccessToken,
    refreshToken: spotifyRefreshToken,
  };

  fs.writeFileSync(path.resolve(__dirname, './tokens/spotify.json'), JSON.stringify(tokens, null, 2), 'utf8');
}

function convertToHuman(total_seconds) {

  const years = Math.floor(total_seconds / 31536000);
  const months = Math.floor((total_seconds % 31536000) / 2592000);
  const days = Math.floor((total_seconds % 2592000) / 86400);
  const hours = Math.floor((total_seconds % 86400) / 3600);
  const minutes = Math.floor((total_seconds % 3600) / 60);

  if (years > 0 && months > 0) {
    return `${years}y ${months}mo`;
  } else if (years > 0 && days > 0) {
    return `${years}y ${days}d`;
  } else if (years > 0 && hours > 0) {
    return `${years}y ${hours}h`;
  } else if (months > 0 && days > 0) {
    return `${months}mo ${days}d`;
  } else if (months > 0 && hours > 0) {
    return `${months}mo ${hours}h`;
  } else if (days > 0 && hours > 0) {
    return `${days}d ${hours}h`;
  } else if (years > 0) {
    return `${years}y`;
  } else if (months > 0) {
    return `${months}mo`;
  } else if (days > 0) {
    return `${days}d`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${total_seconds}s`;
  }
}

stats.listen(PORT, async () => {
  console.log(`stats running: ${PORT}`);
});

module.exports = stats;

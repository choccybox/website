const express = require('express');
const axios = require('axios');
const stats = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file
const PORT = 20004;

let cachedData = null;
let cacheExpiration = null;

stats.get('/stats', async (req, res) => {
  try {
    if (cachedData && cacheExpiration && Date.now() < cacheExpiration) {
      // Return cached data if it exists and has not expired
      res.json(cachedData);
    } else {
      const lastFMAlbums = await axios.get('https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums', {
        params: {
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          period: 'overall',
          format: 'json',
        },
      });

      const lastFMArtists = await axios.get('https://ws.audioscrobbler.com/2.0/?method=user.gettopartists', {
        params: {
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          period: 'overall',
          format: 'json',
        },
      });

      const lastFMTracks = await axios.get('https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks', {
        params: {
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          period: 'overall',
          format: 'json',
        },
      });

      const lastFMInfo = await axios.get('https://ws.audioscrobbler.com/2.0/?method=user.getinfo', {
        params: {
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          format: 'json',
        },
      });

      let totalPlaytime = 0;
      let totalTracks = 0;
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const response = await axios.get('https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks', {
          params: {
        user: process.env.LASTFM_USERNAME,
        api_key: process.env.LASTFM_API_KEY,
        format: 'json',
        page: page,
        limit: 1000,
          },
        });

        // once we get @attr, get total and remove 1000 from it to get the next limits, divide into max of 1000
        if (page === 1) {
          totalPages = Math.ceil(response.data.toptracks['@attr'].total / 1000);
        }

        const tracks = response.data.toptracks.track;
        for (const track of tracks) {
          totalTracks++;
          if (parseInt(track.duration, 10) !== 0) {
            totalPlaytime += parseInt(track.duration, 10) * parseInt(track.playcount, 10);
            // console.log(`Duration of ${track.name}: ${parseInt(track.duration, 10)} seconds, totalling to ${parseInt(track.duration, 10) * parseInt(track.playcount, 10)} seconds`);
          }
        }

        // this all totals to the total playtime
        // console.log(`Total playtime: ${totalPlaytime} seconds`);

        page++;
      }

      function spotifySearchSong(track) {
        const spotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/spotify.json'), 'utf8'));
        const spotifyAccessToken = spotifyToken.accessToken;

        return axios.get('https://api.spotify.com/v1/search', {
          params: {
            q: 'track:' + track.name + ' artist:' + track.artist,
            type: 'track',
            limit: 1,
          },
          headers: {
            Authorization: `Bearer ${spotifyAccessToken}`,
          },
        })
          .then(response => {
            if (response.data.tracks.items.length > 0) {
              return {
                url: response.data.tracks.items[0].external_urls.spotify,
                imageHigh: response.data.tracks.items[0].album.images[0].url,  // Adjusted indices to get high and low resolution images
                imageLow: response.data.tracks.items[0].album.images[2].url,
              };
            } else {
              return null;
            }
          })
          .catch(error => {
            console.error('Error during Spotify search:', error);
            return null;
          });
      }

      function spotifySearchArtist(artist) {
        const spotifyToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/spotify.json'), 'utf8'));
        const spotifyAccessToken = spotifyToken.accessToken;

        return axios.get('https://api.spotify.com/v1/search', {
          params: {
            q: 'artist:' + artist.name,
            type: 'artist',
            limit: 1,
          },
          headers: {
            Authorization: `Bearer ${spotifyAccessToken}`,
          },
        })
          .then(response => {
            if (response.data.artists.items.length > 0) {
              return {
                url: response.data.artists.items[0].external_urls.spotify,
                imageHigh: response.data.artists.items[0].images[0].url,  // Adjusted indices to get high and low resolution images
                imageLow: response.data.artists.items[0].images[2].url,
              };
            } else {
              return null;
            }
          })
          .catch(error => {
            console.error('Error during Spotify search:', error);
            return null;
          });
      }

      const limit = 20;

      const lastFMOrganized = {

        topAlbums: lastFMAlbums.data.topalbums.album
          .map(album => ({
            name: album.name,
            artist: album.artist.name,
            imageHigh: album.image[3]['#text'],
            imageLow: album.image[2]['#text'],
            url: album.url,
            playcount: album.playcount,
            rank: album['@attr'].rank,
          }))
          .slice(0, limit),

        topArtists: lastFMArtists.data.topartists.artist
          .map(artist => ({
            name: artist.name,
            imageHigh: artist.image[3]['#text'],
            imageLow: artist.image[2]['#text'],
            url: artist.url,
            playcount: artist.playcount,
            rank: artist['@attr'].rank,
          }))
          .slice(0, limit),

        topTracks: lastFMTracks.data.toptracks.track
          .map(track => ({
            name: track.name,
            artist: track.artist.name,
            imageHigh: track.image[3]['#text'],
            imageLow: track.image[2]['#text'],
            url: track.url,
            playcount: track.playcount,
            rank: track['@attr'].rank,
          }))
          .slice(0, limit),

        userInfo: {
          total_plays: lastFMInfo.data.user.playcount,
          total_tracks: lastFMInfo.data.user.track_count,
          total_albums: lastFMInfo.data.user.album_count,
          total_artists: lastFMInfo.data.user.artist_count,
          total_playtime: convertToHuman(totalPlaytime),
        },
      };

      async function updateTopTracksWithSpotify() {
        for (const track of lastFMOrganized.topTracks) {
          const spotifyData = await spotifySearchSong(track);
          if (spotifyData) {
            track.imageHigh = spotifyData.imageHigh;
            track.imageLow = spotifyData.imageLow;
            track.url = spotifyData.url;
          }
        }
      }

      async function updateTopArtistsWithSpotify() {
        for (const artist of lastFMOrganized.topArtists) {
          const spotifyData = await spotifySearchArtist(artist);
          if (spotifyData) {
            artist.imageHigh = spotifyData.imageHigh;
            artist.imageLow = spotifyData.imageLow;
            artist.url = spotifyData.url;
          }
        }
      }

      async function updateTopAlbumsWithSpotify() {
        for (const track of lastFMOrganized.topAlbums) {
          const spotifyData = await spotifySearchSong(track);
          if (spotifyData) {
            track.imageHigh = spotifyData.imageHigh;
            track.imageLow = spotifyData.imageLow;
            track.url = spotifyData.url;
          }
        }
      }

      // Update recentTracks, topTracks, and topArtists with Spotify data
      await updateTopTracksWithSpotify();
      await updateTopArtistsWithSpotify();
      await updateTopAlbumsWithSpotify();
      // console.log('Updated track and artist information with Spotify data:', {
        // recentTracks: lastFMOrganized.recentTracks,
        // topTracks: lastFMOrganized.topTracks,
        // topArtists: lastFMOrganized.topArtists,
      // });

      // Cache the data and set the expiration time to 24 hours
      cachedData = {
        lastfm: lastFMOrganized,
        cached_at: Date.now(),
        isCached: true,
      };
      cacheExpiration = Date.now() + (24 * 60 * 60 * 1000); // 24 hours in milliseconds
      console.log('data will be refetched in 24 hours');
      res.json(cachedData);
    }
  } catch (error) {
    console.error('Error during data fetch:', error);
    res.status(500).send('Error during data fetch.');
  }
});

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

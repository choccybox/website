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
      const wakatime = await axios.get('https://api.wakatime.com/api/v1/users/current/stats/all_time', {
        headers: {
          Authorization: `Basic ${process.env.WAKATIME_API_KEY}`,
        },
      });

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

      const lastFMTotal = await axios.get('https://ws.audioscrobbler.com/2.0/?method=user.getinfo', {
        params: {
          user: process.env.LASTFM_USERNAME,
          api_key: process.env.LASTFM_API_KEY,
          format: 'json',
        },
      });

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

      const limit = 4;

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
          total_plays: lastFMTotal.data.user.playcount,
          total_tracks: lastFMTotal.data.user.track_count,
          total_albums: lastFMTotal.data.user.album_count,
          total_artists: lastFMTotal.data.user.artist_count,
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
      console.log('Updated track and artist information with Spotify data:', {
        recentTracks: lastFMOrganized.recentTracks,
        topTracks: lastFMOrganized.topTracks,
        topArtists: lastFMOrganized.topArtists,
      });

      const wakaOrganized = {
        projects: wakatime.data.data.projects
          .filter(project => project.percent >= 2)
          .slice(0, limit)
          .map(project => ({
            name: project.name,
            total_time: convertToHuman(project.total_seconds),
            percent: Math.round(project.percent) + '%',
          })),

        languages: wakatime.data.data.languages
          .filter(language => language.percent >= 2)
          .slice(0, limit)
          .map(language => ({
            name: language.name,
            total_time: convertToHuman(language.total_seconds),
            percent: Math.round(language.percent) + '%',
          })),

        best_day: {
          date: wakatime.data.data.best_day.date,
          total_time: convertToHuman(wakatime.data.data.best_day.total_seconds),
        },

        daily_average: convertToHuman(wakatime.data.data.daily_average_including_other_language),
        total_time: convertToHuman(wakatime.data.data.total_seconds_including_other_language),
      };

      // Cache the data and set the expiration time to 30 minutes from now
      cachedData = {
        lastfm: lastFMOrganized,
        waka: wakaOrganized,
        cached_at: Date.now(),
        isCached: true,
      };
      cacheExpiration = Date.now() + 30 * 60 * 1000;

      // calculate in minutes how long the cache will last
      console.log('Data will be cached for:', Math.round((cacheExpiration - Date.now()) / 1000 / 60), 'minutes.');

      res.json(cachedData);
    }
  } catch (error) {
    console.error('Error during data fetch:', error);
    res.status(500).send('Error during data fetch.');
  }
});

function convertToHuman(total_seconds) {
  const days = Math.floor(total_seconds / 86400);
  const hours = Math.floor((total_seconds % 86400) / 3600);
  const minutes = Math.floor(((total_seconds % 86400) % 3600) / 60);

  return `${days ? days + 'd ' : ''}${hours ? hours + 'h' : ''}${days && hours ? '' : minutes ? ' ' + minutes + 'm' : ''}`;
}

function convertToHowLongAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = Math.floor(seconds / 31536000);

  if (interval > 1) {
    return interval + ' years ago';
  }
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) {
    return interval + ' months ago';
  }
  interval = Math.floor(seconds / 86400);
  if (interval > 1) {
    return interval + ' days ago';
  }
  interval = Math.floor(seconds / 3600);
  if (interval > 1) {
    return interval + ' hours ago';
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    return interval + ' minutes ago';
  }
  return Math.floor(seconds) + ' seconds ago';
}

stats.listen(PORT, async () => {
  console.log(`stats running: ${PORT}`);
});

module.exports = stats;

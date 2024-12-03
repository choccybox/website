const express = require('express');
const axios = require('axios');
const stats = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const cheerio = require('cheerio');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file
const PORT = 20004;

let cacheExpiration = null;

stats.get('/stats', async (req, res) => {
  // check lastfm.json file and compare the cacheExpiration time to the current time
  if (fs.existsSync(path.resolve(__dirname, './tokens/lastfm.json'))) {
    const lastFMOrganized = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/lastfm.json')));
    console.log('cacheExpiration:', lastFMOrganized.cacheExpiration);
    console.log('current time:', parseInt(Date.now(), 10));
    if (parseInt(lastFMOrganized.cacheExpiration, 10) > Date.now()) {
      // if the cache is still valid, return the cached data
      return res.json(lastFMOrganized);
    }
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

        // once we get @attr, get total and remove 1000 from it to get the next limits, divide into max of 1000
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

          topArtists: lastFMArtists.data.topartists.artist.slice(0, limit).map(artist => ({
              name: artist.name,
              imageHigh: artist.image[3]['#text'],
              imageLow: artist.image[2]['#text'],
              url: artist.url,
              playcount: artist.playcount,
              rank: artist['@attr'].rank,
          })),

          topTracks: lastFMTracks.data.toptracks.track.slice(0, limit).map(track => ({
              name: track.name,
              artist: track.artist.name,
              imageHigh: track.image[3]['#text'],
              imageLow: track.image[2]['#text'],
              url: track.url,
              playcount: track.playcount,
              rank: track['@attr'].rank,
          })),

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
      // save all of this info (lastFMOrganized, first track, total playtime) to a file
      lastFMOrganized.cacheExpiration = cacheExpiration;
      lastFMOrganized.firstTrack = {
        updateTime: new Date().toISOString(),
        name: lastFMRecent.data.recenttracks.track[0].name,
        artist: lastFMRecent.data.recenttracks.track[0].artist['#text'],
      };

      lastFMOrganized.totalPlaytime = convertToHuman(totalPlaytime);
      fs.writeFileSync(path.resolve(__dirname, './tokens/lastfm.json'), JSON.stringify(lastFMOrganized, null, 2));

      cacheExpiration = Date.now() + (24 * 60 * 60 * 1000); // 24 hours in milliseconds
      console.log('cacheExpiration:', cacheExpiration);
      res.json(lastFMOrganized);
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

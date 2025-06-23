const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const player = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { youtubeMusicSearch } = require("@hydralerne/youtube-api");

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20001;

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
    const lastfmResponse = await axios.get(`http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=2`);
    const lastfmData = lastfmResponse.data;
    const lastfmTrack = lastfmData.recenttracks.track[0];
    const lastfmPrevTrack = lastfmData.recenttracks.track[0];
    const lastfmNowPlaying = lastfmTrack['@attr'] && lastfmTrack['@attr'].nowplaying === 'true' ? true : false;
    const name = lastfmTrack.name;
    const artist = lastfmTrack.artist['#text'];
    const namePrev = lastfmPrevTrack.name;
    const artistPrev = lastfmPrevTrack.artist['#text'];
  
    // If the track is currently playing and has an image or is not a default image, use last.fm
    if (lastfmNowPlaying && lastfmTrack.image[3]['#text'] !== '' && lastfmTrack.image[3]['#text'] !== 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      console.log('lastfm now playing and showing image');
      return {
        isPlaying: true,
        name: name,
        artist: artist,
        image: {
          low: lastfmTrack.image[2]['#text'],
          high: lastfmTrack.image[3]['#text'],
        },
      }
      // If the track is currently playing but has no image OR is a default image, use either spotify or soundcloud
    } else if (lastfmNowPlaying && lastfmTrack.image[3]['#text'] === '' || lastfmTrack.image[3]['#text'] === 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      console.log('lastfm now playing but no image, searching with album name');
      
      const youtubeSearch = async () => await youtubeMusicSearch(`${name} ${artist}`, 'songs');

      const results = await youtubeSearch();
      if (results && results.length > 0) {
        return {
          isPlaying: true,
          name: name,
          artist: artist,
          image: {
            low: results[0].poster,
            high: results[0].posterLarge,
          },
        };
      }

      // If the track is not currently playing and has an image or is not a default image, use last.fm
    } else if (!lastfmNowPlaying && lastfmPrevTrack.image[3]['#text'] !== '' && lastfmPrevTrack.image[3]['#text'] !== 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      return {
        isPlaying: false,
        name: namePrev,
        artist: artistPrev,
        image: {
          low: lastfmPrevTrack.image[2]['#text'],
          high: lastfmPrevTrack.image[3]['#text'],
        },
      }
    } else if (!lastfmNowPlaying && lastfmPrevTrack.image[3]['#text'] === '' || lastfmPrevTrack.image[3]['#text'] === 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png') {
      // combine name and artist for search query, replace spaces with %20
      const youtubeSearch = async () => await youtubeMusicSearch(`${name} ${artist}`, 'songs');

      const results = await youtubeSearch();
      if (results && results.length > 0) {
        return {
          isPlaying: true,
          name: name,
          artist: artist,
          image: {
            low: results[0].poster,
            high: results[0].posterLarge,
          },
        };
      }
    }

}

player.listen(PORT, async () => {
  console.log(`player running: ${PORT}`);
});

module.exports = player;
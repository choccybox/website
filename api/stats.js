const express = require('express');
const axios = require('axios');
const stats = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');


dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20004;

const wakatimeScopes = ['read_stats'];

// COMMENT OUT AFTER LOGGING.
stats.get('/wakaauth', (req, res) => {
  res.redirect(`https://wakatime.com/oauth/authorize?client_id=${process.env.WAKATIME_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.WAKATIME_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(wakatimeScopes.join(' '))}`);
});

stats.get('/wakacallback', async (req, res) => {
  const code = req.query.code;

  if (code) {
    try {
      const response = await axios.post(
        'https://wakatime.com/oauth/token',
        new URLSearchParams({
          client_id: process.env.WAKATIME_CLIENT_ID,
          client_secret: process.env.WAKATIME_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.WAKATIME_REDIRECT_URI,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // get the token from the response
      const wakatimeAccessToken = response.data.access_token;
      const wakatimeRefreshToken = response.data.refresh_token;

      // write both tokens to a .json file
      fs.writeFileSync(path.resolve(__dirname, './tokens/wakatime.json'), JSON.stringify({ accessToken: wakatimeAccessToken, refreshToken: wakatimeRefreshToken }, null, 2), 'utf8');
      // log the content of the .json file
      console.log(fs.readFileSync(path.resolve(__dirname, './tokens/wakatime.json'), 'utf8'));
      res.redirect('/stats');
    } catch (error) {
      console.error('Error during authorization:', error);
      res.status(500).send('Error during authorization.');
    }
  } else {
    res.status(400).send('Authorization code not provided.');
  }
});
// COMMENT OUT AFTER LOGGING.

// if access_token is invalid (404 or 401), use refresh_token to get a new access_token
if (response.status === 404 || response.status === 401) {
  const refreshToken = fs.readFileSync(path.resolve(__dirname, './tokens/wakatime.json'), 'utf8');
  const response = await axios.post(
    'https://wakatime.com/oauth/token',
    new URLSearchParams({
      client_id: process.env.WAKATIME_CLIENT_ID,
      client_secret: process.env.WAKATIME_CLIENT_SECRET,
      redirect_uri: process.env.WAKATIME_REDIRECT_URI,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  // get the token from the response
  const wakatimeAccessToken = response.data.access_token;
  const wakatimeRefreshToken = response.data.refresh_token;

  fs.writeFileSync(path.resolve(__dirname, './tokens/wakatime.json'), JSON.stringify({ accessToken: wakatimeAccessToken, refreshToken: wakatimeRefreshToken }, null, 2), 'utf8');
  console.log(fs.readFileSync(path.resolve(__dirname, './tokens/wakatime.json'), 'utf8'));
}

stats.get('/stats', async (req, res) => {
  // say hi
    res.send('hi');
});


stats.listen(PORT, async () => {
  console.log(`stats running: ${PORT}`);
});

module.exports = userinfo;
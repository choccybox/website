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
 const wakatimeAuthUrl = 'https://wakatime.com/oauth/authorize?',
    params = {
      client_id: process.env.WAKATIME_CLIENT_ID,
      response_type: code,
      scope: wakatimeScopes.join(' '),
      redirect_uri: `${process.env.WAKATIME_REDIRECT_URI}`,
    };

  res.redirect(wakatimeAuthUrl + new URLSearchParams(params));
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
          code: code,
          grant_type: 'authorization_code',
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

// refresh token if accessing /stats returns 401
stats.get('/refresh', async (req, res) => {
  const refreshToken = JSON.parse(fs.readFileSync(path.resolve(__dirname, './tokens/wakatime.json'), 'utf8')).refreshToken;

  try {
    const response = await axios.post(
      'https://wakatime.com/oauth/token',
      new URLSearchParams({
        client_id: process.env.WAKATIME_CLIENT_ID,
        client_secret: process.env.WAKATIME_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const wakatimeAccessToken = response.data.access_token;
    const wakatimeRefreshToken = response.data.refresh_token;

    fs.writeFileSync(path.resolve(__dirname, './tokens/wakatime.json'), JSON.stringify({ accessToken: wakatimeAccessToken, refreshToken: wakatimeRefreshToken }, null, 2), 'utf8');
    console.log(fs.readFileSync(path.resolve(__dirname, './tokens/wakatime.json'), 'utf8'));
    res.send('Token refreshed.');
  } catch (error) {
    console.error('Error during token refresh:', error);
    res.status(500).send('Error during token refresh.');
  }
});

stats.get('/stats', async (req, res) => {
    // if the token is expired, refresh it
    if (req.query.error === 'invalid_token') {
      res.redirect('/refresh');
      return;
    }
});


stats.listen(PORT, async () => {
  console.log(`stats running: ${PORT}`);
});

module.exports = stats;
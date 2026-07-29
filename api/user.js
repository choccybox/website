const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, Guild } = require('discord.js');
const userinfo = express();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const sharp = require('sharp');
const NodeCache = require('node-cache');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
  ]
});

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20002;

const discordScopes = ['identify', 'connections'];
const tokenFile = path.resolve(process.env.DISCORD_TOKEN_FILE || path.join(__dirname, 'tokens', 'discord-token.enc'));
const legacyTokenFile = path.resolve(__dirname, 'tokens', 'discord.json');
const encryptedTokenFileMagic = Buffer.from('DCT1');
const encryptionIvLength = 12;
const encryptionTagLength = 16;
const refreshLeewayMs = 60 * 1000;
const oauthStateCookie = 'discord_oauth_state';
const pronounsCache = new NodeCache({ stdTTL: 24 * 60 * 60 });
let refreshPromise;

function getDiscordClientId() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    throw new Error('DISCORD_CLIENT_ID must be configured before starting OAuth.');
  }
  return clientId;
}

function assertDiscordOAuthConfiguration() {
  const requiredVariables = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_REDIRECT_URI',
    'DISCORD_APPROVED_ID',
  ];
  const missingVariables = requiredVariables.filter((name) => !process.env[name]);
  if (missingVariables.length > 0) {
    throw new Error(`Missing Discord OAuth configuration: ${missingVariables.join(', ')}.`);
  }
  getTokenEncryptionKey();
}

function getTokenEncryptionKey() {
  const encodedKey = process.env.DISCORD_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error('DISCORD_TOKEN_ENCRYPTION_KEY must be configured for Discord token storage.');
  }

  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== 32) {
    throw new Error('DISCORD_TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.');
  }
  return key;
}

function normaliseDiscordTokens(tokens) {
  const expiresAt = Number(tokens.expiresAt) ||
    (Number(tokens.savedAt) + Number(tokens.expiresIn)) * 1000;

  if (!tokens.accessToken || !tokens.refreshToken || !Number.isFinite(expiresAt)) {
    throw new Error('Token data is incomplete.');
  }

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
  };
}

function decryptDiscordTokens(encryptedData) {
  const minimumLength = encryptedTokenFileMagic.length + encryptionIvLength + encryptionTagLength + 1;
  if (encryptedData.length < minimumLength || !encryptedData.subarray(0, encryptedTokenFileMagic.length).equals(encryptedTokenFileMagic)) {
    throw new Error('Encrypted token data is invalid.');
  }

  const ivStart = encryptedTokenFileMagic.length;
  const tagStart = ivStart + encryptionIvLength;
  const ciphertextStart = tagStart + encryptionTagLength;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getTokenEncryptionKey(), encryptedData.subarray(ivStart, tagStart));
  decipher.setAuthTag(encryptedData.subarray(tagStart, ciphertextStart));
  const plaintext = Buffer.concat([
    decipher.update(encryptedData.subarray(ciphertextStart)),
    decipher.final(),
  ]);
  return normaliseDiscordTokens(JSON.parse(plaintext.toString('utf8')));
}

function writeDiscordTokens(tokens) {
  const iv = crypto.randomBytes(encryptionIvLength);
  const cipher = crypto.createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  const encryptedData = Buffer.concat([
    encryptedTokenFileMagic,
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
  const directory = path.dirname(tokenFile);
  const temporaryFile = `${tokenFile}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(temporaryFile, encryptedData, { mode: 0o600 });
    fs.renameSync(temporaryFile, tokenFile);
    fs.chmodSync(tokenFile, 0o600);
  } finally {
    if (fs.existsSync(temporaryFile)) {
      fs.unlinkSync(temporaryFile);
    }
  }
}

function removeLegacyTokenFile() {
  if (tokenFile !== legacyTokenFile && fs.existsSync(legacyTokenFile)) {
    fs.rmSync(legacyTokenFile);
  }
}

function migrateLegacyTokenFile() {
  if (tokenFile === legacyTokenFile || !fs.existsSync(legacyTokenFile)) {
    return null;
  }

  const tokens = normaliseDiscordTokens(JSON.parse(fs.readFileSync(legacyTokenFile, 'utf8')));
  writeDiscordTokens(tokens);
  removeLegacyTokenFile();
  console.log('Migrated Discord OAuth tokens to encrypted storage.');
  return tokens;
}

function readDiscordTokens() {
  try {
    return decryptDiscordTokens(fs.readFileSync(tokenFile));
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        return migrateLegacyTokenFile();
      } catch (migrationError) {
        throw new Error('Discord OAuth token migration failed.');
      }
    }
    throw new Error('Discord OAuth token storage is invalid.');
  }
}

function saveDiscordTokens({ accessToken, refreshToken, expiresIn }) {
  const tokens = normaliseDiscordTokens({
    accessToken,
    refreshToken,
    expiresAt: Date.now() + Number(expiresIn) * 1000,
  });
  writeDiscordTokens(tokens);
  removeLegacyTokenFile();
  return tokens;
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const prefix = `${name}=`;
  const value = cookies.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith(prefix));
  try {
    return value ? decodeURIComponent(value.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

function statesMatch(expected, actual) {
  if (!expected || !actual) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  };
}

function oauthErrorStatus(error) {
  return error.response?.status || 500;
}

function logOAuthError(message, error) {
  const detail = error.response ? `HTTP ${oauthErrorStatus(error)}` : error.message;
  console.error(`${message}: ${detail}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function formatPronounsPageProfile(data) {
  const profile = data.profiles?.find((candidate) => candidate.locale === 'en') || data.profiles?.[0];
  if (!profile) {
    return { pronounsString: '', flagsImg: '' };
  }

  const pronounsString = (profile.pronouns || [])
    .map((pronoun) => typeof pronoun === 'string' ? pronoun : pronoun?.value)
    .filter(Boolean)
    .map((pronoun) => escapeHtml(pronoun.toLowerCase()))
    .join(', ');
  const flagsImg = (profile.flags || [])
    .filter((flag) => typeof flag === 'string' && flag.length > 0)
    .map((flag) => {
      const encodedFlag = encodeURIComponent(flag);
      return `<a id="flag_name" href="https://www.urbandictionary.com/define.php?term=${encodedFlag}" target="_blank" rel="noopener noreferrer">${escapeHtml(flag)}</a><img id="flag_icon" src="https://en.pronouns.page/flags/${encodedFlag}.png" alt="${escapeHtml(flag)}">`;
    })
    .join('');

  return { pronounsString, flagsImg };
}

userinfo.get('/userauth', (req, res) => {
  try {
    assertDiscordOAuthConfiguration();
    const state = crypto.randomBytes(32).toString('base64url');
    res.cookie(oauthStateCookie, state, oauthCookieOptions());
    res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${getDiscordClientId()}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(discordScopes.join(' '))}&state=${encodeURIComponent(state)}`);
  } catch (error) {
    logOAuthError('Unable to begin Discord authorization', error);
    res.status(503).send('Discord authorization is temporarily unavailable.');
  }
});

userinfo.get('/usercallback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const expectedState = getCookie(req, oauthStateCookie);
  res.clearCookie(oauthStateCookie, oauthCookieOptions());

  if (!code) {
    return res.status(400).send('Authorization code not provided.');
  }
  if (!statesMatch(expectedState, state)) {
    return res.status(400).send('Invalid OAuth state. Please try again.');
  }

  try {
    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: getDiscordClientId(),
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokenData = response.data;
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (userResponse.data.id !== process.env.DISCORD_APPROVED_ID) {
      console.warn('An unapproved Discord user completed the authorization flow.');
      return res.status(403).send('This Discord account is not authorized.');
    }

    saveDiscordTokens({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    });
    res.redirect('/user');
  } catch (error) {
    logOAuthError('Discord authorization failed', error);
    res.status(500).send('Error during Discord authorization.');
  }
});

client.once('ready', () => {
  console.log('Discord bot client is ready.');
  checkTokenExpiration().catch(error => logOAuthError('Discord token refresh check failed', error));

  setInterval(() => {
    checkTokenExpiration().catch(error => logOAuthError('Discord token refresh check failed', error));
  }, 60 * 1000);
});

client.on('error', error => {
  logOAuthError('Discord bot client error', error);
});

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is not configured; Discord bot features are unavailable.');
} else {
  client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    logOAuthError('Discord bot login failed', error);
  });
}

userinfo.get('/user', async (req, res) => {
  // check if client is ready
  if (!client.readyAt) {
    res.status(500).send('Discord client is not ready.');
  } else {
    try {
      const userResponse = await discordGet('https://discord.com/api/users/@me');
      const connectionsResponse = await discordGet('https://discord.com/api/users/@me/connections');

      // check channel id 1229488636408627200 for any messages
      const messagesResponse = await axios.get('https://discord.com/api/channels/1229488636408627200/messages', {
         headers: {
           Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      });

      const avatarCredit = messagesResponse.data[0].content;

      // Filter connections with visibility 0, keep spotify, ignore domain type, keep spotify, ignore domain type
      const filteredConnections = connectionsResponse.data.filter(connection => connection.visibility === 1 && connection.type !== 'domain' && connection.type !== 'spotify' && connection.type !== 'riotgames' && connection.type !== 'epicgames');

      // Mock Last.fm connection data
      const mockLastfmConnection = {
        type: 'lastfm',
        url: `https://last.fm/user/${process.env.LASTFM_USERNAME}`,
      };

      // Insert the mock last.fm
      const hasLastfmConnection = filteredConnections.some(connection => connection.type === 'lastfm');
      // Simplify connections to id, name, type, and visibility with added "url" field
      const simplifiedConnections = filteredConnections.slice(0, 10).map(connection => {
        let url;
        const baseHTTPS = "https://";

        switch (connection.type) {
          case 'domain':
            url = `${baseHTTPS}${connection.name}`;
            break;
          case 'steam':
            url = `${baseHTTPS}steamcommunity.com/profiles/${connection.id}`;
            break;
          case 'youtube':
            url = `${baseHTTPS}youtube.com/channel/${connection.id}`;
            break;
          case 'tiktok':
            url = `${baseHTTPS}tiktok.com/@${connection.name}`;
            break;
          case 'riotgames':
            break;
          case 'roblox':
            url = `${baseHTTPS}roblox.com/users/${connection.id}/profile`;
            break;
          default:
            url = `${baseHTTPS}${connection.type}.com/${connection.name}`;
            break;
          case 'bluesky':
            url = `${baseHTTPS}bsky.app/profile/${connection.name}`;
            break;
          case 'reddit':
            url = `${baseHTTPS}reddit.com/user/${connection.name}`;
            break;
        }

        return {
          type: connection.type,
          url: url,
        };
      });

      const originalavatarimg = `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar}.webp?size=1024`;
      const discordUsername = userResponse.data.username;

      // custom sort connections
      simplifiedConnections.sort((a, b) => {
        const typeOrder = ['twitter', 'reddit', 'github', 'roblox', 'steam', 'tiktok', 'youtube', 'twitch', 'bluesky'];
        return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
      });

      try {
        const response = await axios({
          method: 'get',
          url: originalavatarimg,
          responseType: 'arraybuffer',
        });

        const highresizedavatarimg = await sharp(response.data).resize(300, 300).toBuffer();
        const lowresizedavatarimg = await sharp(response.data).resize(128, 128).toBuffer();

        let pronounsString = '';
        let flagsImg = '';

        const cachedData = pronounsCache.get('pronounsFlags');
        if (cachedData) {
          pronounsString = cachedData.pronounsString;
          flagsImg = cachedData.flagsImg;
        } else {
          try {
            const response = await axios.get('https://en.pronouns.page/api/public/v3/profile/get/choccymilk?version=2&props=pronouns,flags');
            const profile = formatPronounsPageProfile(response.data);
            pronounsString = profile.pronounsString;
            flagsImg = profile.flagsImg;
            pronounsCache.set('pronounsFlags', profile);
          } catch (error) {
            console.error(`Error fetching pronouns and flags (HTTP ${error.response?.status || 500}).`);
          }
        }

        const userInfo = {
          avatar: {
          high: `data:image/webp;base64,${highresizedavatarimg.toString('base64')}`,
          low: `data:image/webp;base64,${lowresizedavatarimg.toString('base64')}`,
          original: originalavatarimg,
          },
          avatarCredit: ``,
          avatarCreditText: `discord is ${discordUsername}`,
          connections: hasLastfmConnection ? simplifiedConnections : [...simplifiedConnections, mockLastfmConnection],
          pronouns: pronounsString,
          flag: flagsImg,
        };
        // Send the response inside the try block
        res.json(userInfo);
      } catch (error) {
        console.error('Error downloading or resizing image:', error);
        // Handle errors and send an appropriate response
      }
    } catch (error) {
      logOAuthError('Error fetching user information', error);
      res.status(500).send('Error fetching user information.');
    }
  }
});

userinfo.get('/useravatar', async (req, res) => {
  try {
    const userResponse = await discordGet('https://discord.com/api/users/@me');

    const originalavatarimg = `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar}.webp?size=1024`;

    try {
      const response = await axios({
        method: 'get',
        url: originalavatarimg,
        responseType: 'arraybuffer',
      });

      const roundedCorners = Buffer.from(
        `<svg><rect x="0" y="0" width="160" height="160" rx="30" ry="30"/></svg>`
      );

      sharp(response.data)
        .resize(160, 160) // Resize to 160x160 pixels
        .composite([{ input: roundedCorners, blend: 'dest-in' }]) // Apply rounded corners
        .toBuffer()
        .then(resizedImageBuffer => {
          // Set the appropriate headers to serve the image directly
          res.set('Content-Type', 'image/webp');
          res.send(resizedImageBuffer);
        })
        .catch(error => {
          console.error('Error processing image:', error);
          res.status(500).send('Error processing image.');
        });

    } catch (error) {
      console.error('Error downloading image:', error);
      res.status(500).send('Error downloading image.');
    }
  } catch (error) {
    logOAuthError('Error fetching user information', error);
    res.status(500).send('Error fetching user information.');
  }
});

async function refreshDiscordAccessToken(failedAccessToken) {
  const storedTokens = readDiscordTokens();
  if (!storedTokens) {
    throw new Error('Discord authorization has not been completed.');
  }

  // Another request may have already refreshed the token that received a 401.
  if (failedAccessToken && storedTokens.accessToken !== failedAccessToken) {
    return storedTokens;
  }
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const response = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: getDiscordClientId(),
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: storedTokens.refreshToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return saveDiscordTokens({
      accessToken: response.data.access_token,
      // Discord normally rotates refresh tokens; retain the existing one only if omitted.
      refreshToken: response.data.refresh_token || storedTokens.refreshToken,
      expiresIn: response.data.expires_in,
    });
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = undefined;
  }
}

async function getDiscordAccessToken(failedAccessToken) {
  const tokens = readDiscordTokens();
  if (!tokens) {
    throw new Error('Discord authorization has not been completed.');
  }

  if (failedAccessToken || Date.now() >= tokens.expiresAt - refreshLeewayMs) {
    return (await refreshDiscordAccessToken(failedAccessToken)).accessToken;
  }
  return tokens.accessToken;
}

async function discordGet(url, config = {}) {
  const accessToken = await getDiscordAccessToken();
  try {
    return await axios.get(url, {
      ...config,
      headers: { ...config.headers, Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    if (error.response?.status !== 401) {
      throw error;
    }

    const refreshedAccessToken = await getDiscordAccessToken(accessToken);
    return axios.get(url, {
      ...config,
      headers: { ...config.headers, Authorization: `Bearer ${refreshedAccessToken}` },
    });
  }
}

async function checkTokenExpiration() {
  const tokens = readDiscordTokens();
  if (tokens && Date.now() >= tokens.expiresAt - refreshLeewayMs) {
    await refreshDiscordAccessToken();
  }
}

userinfo.listen(PORT, async () => {
  console.log(`userinfo running: ${PORT}`);
});

module.exports = userinfo;

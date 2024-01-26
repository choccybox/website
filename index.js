const express = require('express');
const axios = require('axios');
const fs = require('fs');
const discord = require('./api/discord');  // Import your discord module
const player = require('./api/player');  // Import your player module
const dotenv = require('dotenv');

const app = express();
const port = 3000;

// Serve static files from the same directory as index.js
app.use(express.static(__dirname));

// use discord
app.use(discord);
app.use(player);
// Define your server logic here

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

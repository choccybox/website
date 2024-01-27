const express = require('express');
const discord = require('./api/discord');  // Import your discord module
const player = require('./api/player');  // Import your player module
const soundcloud = require('./api/soundcloud.js');  // Import your soundcloud module
// cors
const cors = require('cors');


const app = express();
const port = 3000;

// use cors
app.use(cors());

// Serve static files from the same directory as index.js
app.use(express.static(__dirname));

// use discord
app.use(discord);
app.use(player);
app.use(soundcloud);

app.listen(port, () => {
  console.log(`Server is running`);
});

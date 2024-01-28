const express = require('express');
const userinfo = require('./api/userinfo.js');  // Import your discord module
const player = require('./api/player');  // Import your player module
const cors = require('cors');


const app = express();
const port = 3000;

// use cors
app.use(cors());

// Serve static files from the same directory as index.js
app.use(express.static(__dirname));

// use discord
app.use(userinfo);
app.use(player);

app.listen(port, () => {
  console.log(`Server is running ${port}`);
});

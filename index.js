// api server code
const express = require('express');
const app = express();

// import ./api/discord.js
const discord = require('./api/player.js');

// use discord
app.use(discord);

// start server
app.listen(process.env.PORT || 3000, () => {
  console.log(`Server started on port ${process.env.PORT || 3000}`);
});
const express = require('express');
const app = express();
const port = 3000;

// Allow CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// Serve index.html at root
app.get('/', (req, res) => {
    // display index without dirname
    res.sendFile('index.html', { root: __dirname });
    }
);

// Connect server.js
const discord = require('./api/discord.js');
const player = require('./api/player.js');
app.use(discord);
app.use(player);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

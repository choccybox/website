const express = require('express');
const app = express();
const port = 3000;

app.use(express.static(__dirname));

// Allow CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
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

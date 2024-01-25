const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Allow CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Connect server.js
const discord = require('./api/discord.js');
const player = require('./api/player.js');
app.use(discord);
app.use(player);

// Set up proper error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Specify host for security
app.listen(port, '0.0.0.0', () => {
    console.log(`Example app listening on port ${port}`);
});

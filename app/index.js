const express = require('express');
const app = express();
// port from env
process.env.PORT = 3000;

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

// serve player.js
app.get('/player', (req, res) => {
    res.sendFile(__dirname + '/api/player.js');
    }
);
// server discord.js
app.get('/discorduser', (req, res) => {
    res.sendFile(__dirname + '/api/discord.js');
    }
);

app.listen(process.env.PORT, () => console.log(`Listening on port ${process.env.PORT}`));

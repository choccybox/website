const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);

// use static html files
app.use(express.static('public'));

app.use('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
    }
);

// use ./api/discord.js
app.use('/api/discord', require('./api/discord'));
app,use('/api/player', require('./api/player'));

// listen to env port
app.listen(process.env.PORT || 3000, () => {
    console.log('Server started');
});
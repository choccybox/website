const express = require('express');
const app = express();

// use index.html to display the website, dont use static
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// use ./api/discord.js
app.use('/api/discord', require('./api/discord'));
app.use('/api/player', require('./api/player'));

// listen to env port
app.listen(process.env.PORT || 3000, () => {
    console.log('Server started');
});
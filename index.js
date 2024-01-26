const express = require('express');
const app = express();
const http = require('http');
// port from env
process.env.PORT = 3000;

// Allow CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// http
const server = http.createServer(app);
// display index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
server.listen(process.env.PORT, () => console.log(`Listening on port ${process.env.PORT}`));
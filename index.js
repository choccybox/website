const http = require('http');
const fs = require('fs');

// Import the Discord bot logic
require('./api/player.js');

// Your existing server code
const server = http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.readFile('index.html', function(error, data) {
        if (error) {
            res.writeHead(404);
            res.write('Error: File not found');
        } else {
            res.write(data);
        }
        res.end();
    });
});

// Start the server, use environment variable for port if available, log if player.js started
server.listen(process.env.PORT || 3000, () => console.log('Player.js started!'));
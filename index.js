const http = require('http');
const fs = require('fs');
const port = 3000;

// Import the Discord bot logic
require('./api/discord.js');

// Your existing server code
const server = http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.readFile('main.html', function(error, data) {
        if (error) {
            res.writeHead(404);
            res.write('Error: File not found');
        } else {
            res.write(data);
        }
        res.end();
    });
});

// Start the server
server.listen(port, function(error) {
    if (error) {
        console.log('An error has occurred', error);
    } else {
        console.log('Server is running on port ' + port);
    }
});
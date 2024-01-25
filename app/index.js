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
    // show hi
    res.send('hi');
    }
);



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

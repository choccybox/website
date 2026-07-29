const express = require('express');
const path = require('path');
const player = require('./api/player');
const userinfo = require('./api/user');
const stats = require('./api/stats');
const cors = require('cors');

const app = express();

const port = process.env.PORT || 3000;

app.use(cors());

app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));

app.use(player);
app.use(userinfo);
app.use(stats);

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, "0.0.0.0", function () {
    console.log('server started on port ' + port);
});
const express = require('express');
const player = require('./api/player');
const userinfo = require('./api/user');
const stats = require('./api/stats');
const cors = require('cors');

const app = express();

const port = process.env.PORT || 3000;

app.use(cors());

app.use(express.static(__dirname));

app.use(player);
app.use(userinfo);
app.use(stats);

app.listen(port, "0.0.0.0", function () {
    console.log('Server started on port ' + port);
});
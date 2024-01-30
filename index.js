const express = require('express');
const userinfo = require('./api/userinfo.js');
const player = require('./api/player');
const soundcloud = require('./api/soundcloud');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());

app.use(express.static(__dirname));

app.use(userinfo);
app.use(player);
app.use(soundcloud);

app.listen(port, () => {
  console.log(`server running ${port}`);
});
const express = require('express');
const user = require('./api/user');
const player = require('./api/player');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());

app.use(express.static(__dirname));

app.use(user);
app.use(player);

app.listen(port, () => {
  console.log(`server running ${port}`);
});
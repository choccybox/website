const express = require('express');
const player = require('./api/player');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());

app.use(express.static(__dirname));

app.use(player);

// use env
app.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${port}`);
});
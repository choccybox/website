const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const comms = express();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Load environment variables from .env file

const PORT = 20004;

comms.get('/comms', async (req, res) => {
  // show static comms.html file
  res.sendFile(path.join(__dirname, '../comms.html'));
});


comms.listen(PORT, async () => {
  console.log(`comms running: ${PORT}`);
});

module.exports = comms;
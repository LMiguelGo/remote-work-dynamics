const express = require('express');
const apiRoutes = require('./api.routes');

const router = express.Router();
router.use('/', apiRoutes);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getClusterHealthDisplayData } = require('../services/clusterHealthDisplayService');

router.get('/cluster-health', async (req, res, next) => {
  try {
    const payload = await getClusterHealthDisplayData();
    res.set('Cache-Control', 'no-store');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

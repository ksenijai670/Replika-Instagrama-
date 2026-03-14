const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const authMiddleware = require('./middleware/authMiddleware');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const services = require('./config/services');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 4000;

app.use(rateLimiter);
app.use(authMiddleware);

Object.entries(services).forEach(([serviceName, serviceUrl]) => {
  app.use(`/api/${serviceName}`, createProxyMiddleware({
    target: serviceUrl,
    changeOrigin: true,
    pathRewrite: { [`^/api/${serviceName}`]: '' },
    on: {
      error: (err, req, res) => {
        console.error(`Proxy error for ${serviceName}:`, err.message);
        res.status(502).json({ error: `Service ${serviceName} unavailable` });
      }
    }
  }));
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
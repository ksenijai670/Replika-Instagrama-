const app = require('./AuthenticationController');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Authentication service running on port ${PORT}`));
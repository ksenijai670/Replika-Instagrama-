const app = require('./FeedController');

const PORT = process.env.PORT || 3015;
app.listen(PORT, () => console.log(`Feed service running on port ${PORT}`));
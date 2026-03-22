const app = require('./ProfileController');

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => console.log(`Profile service running on port ${PORT}`));
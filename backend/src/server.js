require('dotenv').config();
const express = require('express');
const routes = require('./routes');

const app = express();
app.use(express.json());

// All administration routes live under /api/v1/admin
app.use('/api/v1/admin', routes);

// Unknown routes return a clean JSON error.
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// The app is exported so the tests can use it without starting a server.
module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

require('dotenv').config();
const { Pool } = require('pg');

// One shared connection pool for the whole app.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;

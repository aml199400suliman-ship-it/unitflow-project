const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL env var is not set');
}

const sql = neon(process.env.DATABASE_URL || '');

module.exports = { sql };



const { Pool } = require("pg");
require("dotenv").config();

// Configuration that uses a connection string if available,
// or falls back to individual variables for local development.
const poolConfig = {
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DATABASE_USER}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}`,
};

// If the app is running in production (Render), we MUST enable SSL
if (process.env.NODE_ENV === "production") {
  poolConfig.ssl = {
    rejectUnauthorized: false, // Required for most managed databases like Supabase/Render
  };
}

const pool = new Pool(poolConfig);

pool.on("connect", () => {
  console.log("🗄️  Connected to PostgreSQL Database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

module.exports = pool;
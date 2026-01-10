require("dotenv").config();
const {Pool} = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
            rejectUnauthorized: false
        },
    connectionTimeoutMillis: 10000,
    family: 4
});

// Test connection
pool.on("connect", () => {
    console.log("Database connected");
});

pool.on("error", (err) => {
    console.error("Database connection error:", err);
});

module.exports = pool;
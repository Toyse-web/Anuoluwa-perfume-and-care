require("dotenv").config();
const {Pool} = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://postgres:Jeanie1234*@localhost:5432/Anuoluwa-Store",
    ssl: false
});

// Test connection
pool.on("connect", () => {
    console.log("Database connected");
});

pool.on("error", (err) => {
    console.error("Database connection error:", err);
});

module.exports = pool;
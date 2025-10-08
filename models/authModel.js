const pool = require("../config/database");
const bcrypt = require("bcrypt");
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;

const authModel = {
    // Find user by email
    async findUserByEmail(email) {
        const result = await pool.query("SELECT * FROM users WHERE email = $1",
            [email.toLowerCase()]
        );
        return result.rows[0];
    },

    // Create new user
    async createUser(username, email, password) {
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
            [username, email.toLowerCase(), password_hash]
        );
        return result.rows[0];
    },

    // Check if email exists
    async emailExists(email) {
        const result = await pool.query(
             "SELECT id FROM users WHERE email = $1",
            [email.toLowerCase()]
        );
        return result.rows.length > 0;
    },

    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }
};

module.exports = authModel;
const pool = require("../config/database");
const bcrypt = require("bcrypt");
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;

const authModel = {
    // Find user by email
    async findUserByEmail(email) {
        const result = await pool.query("SELECT id, name, email, password_hash FROM users WHERE email = $1",
            [email.toLowerCase()]
        );
        return result.rows[0];
    },

    // Create new user
    async creatUser(name, email, password) {
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
            [name, email.toLowerCase(), password_hash]
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
    }
};

module.exports = authModel;
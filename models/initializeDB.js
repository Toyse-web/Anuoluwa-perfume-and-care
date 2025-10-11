const pool = require('../config/database');
const bcrypt = require("bcrypt");
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        console.log("Postgres pool connected");
        client.release();

        // Create tables with IF NOT EXISTS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255)
            );
            
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2) NOT NULL,
                image_url TEXT,
                category_id INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS session (
                sid VARCHAR PRIMARY KEY,
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("All tables checked/created");

        // Create index
        try {
            await pool.query(`
                CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
            `);
            console.log("Session index checked/created");
        } catch (indexErr) {
            // If index creation fails, it might already exist
            console.log("Session index already exists or couldn't be created:", indexErr.message);
        }

        // Check if we need to add data
        const categoriesCount = await pool.query("SELECT COUNT(*) FROM categories");
        if (parseInt(categoriesCount.rows[0].count) === 0) {
            console.log("Adding initial data...");
            await addExactData();
        } else {
            console.log("Database already has data");
        }

        // Check if we need to add admin users
        const adminsCount = await pool.query("SELECT COUNT(*) FROM admins");
        if (parseInt(adminsCount.rows[0].count) === 0) {
            console.log("Adding admin users...");
            await addAdminUsers();
        } else {
            console.log("Admin users already exist");
        }

    } catch (err) {
        console.error("Database initialization error:", err);
    }
}

// The exact data function
async function addExactData() {
    try {
        console.log("Adding the exact data...");

        // Add the categories
        await pool.query(`
            INSERT INTO categories (name, slug) VALUES 
            ('Perfume', 'perfume'),
            ('Body Cream', 'body-cream'),
            ('Hair Cream', 'hair-cream');
        `);

        // Add products
        await pool.query(`
            INSERT INTO products (name, description, price, image_url, category_id) VALUES 
            ('Chanel No. 5', 'Classic fragrance', 5000.00, 'perfume1.jpg', 1),
            ('Caro Clear', 'Perfect in smooth and fresh body', 3000.00, 'body1.png', 2),
            ('Body Nurture', 'Nurture the body', 2400.00, 'body2.jpg', 2),
            ('Shea Butter', 'Smooth body cream', 5800.00, 'body3.jpg', 2),
            ('Fresh', 'Freshen the body', 3500.00, 'body4.png', 2),
            ('Shea Butter', 'Oil the body for freshnes', 4000.00, 'body5.jpg', 2),
            ('Hair Cream', 'Nourishing hair treatment', 3000.00, 'hair1.jpeg', 3),
            ('Himalava', 'Protein hair cream', 4200.00, 'hair2.jpg', 3),
            ('Element', 'Fresh modern scent', 3000.00, 'perfume2.jpg', 1),
            ('Christian Dior', 'Perfect smell', 5200.00, 'perfume3.jpg', 1),
            ('Dolce & Gabbana', 'Men fragrances', 4000.00, 'perfume4.jpg', 1),
            ('Lincoln', 'Smell nice', 1800.00, 'perfume5.jpg', 1);
        `);

        console.log("Exact data added!");
    } catch (err) {
        console.error("Error adding the exact data", err);
    }
}

// The add admin users function
async function addAdminUsers() {
    try {
        console.log("Creating admin users...");

        // Hash password for admin users
        const admin1Hash = await bcrypt.hash("Anuoluwapo12", SALT_ROUNDS);
        const admin2Hash = await bcrypt.hash("secure456", SALT_ROUNDS);

        // Insert admin users
        await pool.query(`
            INSERT INTO admins (username, email, password_hash) VALUES
            ('Toysedevs', 'olayonwatoyib05@gmail.com', $1),
            ('Anuoluwa', 'anuoluwapoadejare3@gmail.com', $2)
            ON CONFLICT (username) DO NOTHING;
            `, [admin1Hash, admin2Hash]);

            console.log("Admin users created!");
            console.log("Admin Credentials:");
            console.log("  Username: Toysedevs, Password: Anuoluwapo12");
            console.log("  Username: Anuoluwa, Password: secure456");
    } catch (err) {
        console.log("Error creating admin users:", err);
    }
}

module.exports = {
    initializeDatabase,
    addExactData
};
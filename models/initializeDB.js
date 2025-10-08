const pool = require("../config/database");

// Create table for production
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        console.log("Postgres pool connected");
        client.release();

        // Create categories table (exact same structure as local)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255)
            );
        `);

        // Create products table (same structure)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            image_url TEXT,
            category_id INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Session table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS session (
            sid VARCHAR PRIMARY KEY,
            sess JSON NOT NULL,
            expire TIMESTAMP(6) NOT NULL
            );
            CREATE INDEX IDX_session_expire ON session(expire);
        `);

        // User table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
        `);
        console.log("All tables checked/created");

        // Check if we need to add data
        const categoriesCount = await pool.query("SELECT COUNT(*) FROM categories");
        if (parseInt(categoriesCount.rows[0]).count === 0) {
            console.log("Adding initial data...");
            // The exact data
            await addExactData();
        } else {
            console.log("Database already has data");
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
            ('Dolce & Gabban', 'Men fragrances', 4000.00, 'perfume4.jpg', 1),
            ('Lincoln', 'Smell nice', 1800.00, 'perfume5.jpg', 1);
        `);

        console.log("Exact data added!");
    } catch (err) {
        console.error("Error adding the exact data", err);
    }
}

module.exports = {initializeDatabase, addExactData};
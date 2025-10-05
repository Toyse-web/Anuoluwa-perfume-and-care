require("dotenv").config();
const express = require("express");
const path = require("path");
const pg = require("pg");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const PgSession = require("connect-pg-simple")(session);

const app = express();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://postgres:Jeanie1234*@localhost:5432/Anuoluwa-Store",
    ssl: false
});

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
            slug (VARCHAR(255)
            );
        `);
        console.log("Categories table ready");

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
        console.log("Products table ready");

        // Session table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS session (
            sid VARCHAR PRIMARY KEY,
            sess JSON NOT NULL,
            expire TIMESTAMP(6) NOT NULL
            );
            CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
        `);
        console.log("Session table ready");

        // The exact data
        await exactData();
    } catch (err) {
        console.error("Database initialization error:", err);
    }
}

// The exact categories and products
async function exactData() {
    try {
        // First clear any existing data (but keep the tables)
        await pool.query("DELETE FROM products");
        await pool.query("DELETE FROM categories");

        // Reset the sequence IDs to start from 1
        await pool.query("ALTER SEQUENCE categories_id_seq RESTART WITH 1");
        await pool.query("ALTER SEQUENCE products_id_seq RESTART WITH 1");
        
            console.log("Adding categories...");
            await pool.query(`
                INSERT INTO categories (id, name, slug) VALUES
                (1, 'Perfume', 'perfume'),
                (2, 'Body Cream', 'body-cream'),
                (3, 'Hair Cream', 'hair-cream')
            `);
            console.log("Categories added");

            console.log("Adding products...");
            await pool.query(`
                INSERT INTO products (id, name, description, price, image_url, category_id) VALUES
                (1, 'Chanel No. 5', 'Classic fragrance', 5000.00, 'perfume1.jpg', 1),
                (2, 'Shea Butter', 'Smooth body cream', 3500.00, 'body1.png', 2),
                (3, 'Hair Cream', 'Nourishing hair treatment', 3000.00, 'hair1.jpg', 3),
                (4, 'Element', 'Fresh modern scent', 1800.00, 'perfume2.jpg', 1)
            `);
            console.log("Products added");

        console.log("Exact database setup complete!");
    } catch(err) {
        console.error("Error adding data:", err);
    }
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());

// Session middleware
app.use(session({
    store: new PgSession({
        pool: pool,
        tableName: "session",
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "my-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        sameSite: "lax"
    }
}));

function normalizeCart(cartArray = []) {
    return cartArray.map(item => ({
        id: Number(item.id),
        name: item.name,
        price: Number(item.price) || 0,
        image_url: item.image_url || item.image || item.imageUrl || '',
        quantity: Number(item.quantity ?? item.qty ?? 1)
    }));
}

// function to get cart from session or cookies
function getCart(req) {
    if (req.session && Array.isArray(req.session.cart)) {
        return normalizeCart(req.session.cart);
    }
    
    // If no session, check cookie
    if (req.cookies && req.cookies.cart) {
        try {
            const parsed = JSON.parse(req.cookies.cart);
            const normalized = normalizeCart(parsed);
            // restore into session so subsequent request use session
            if (req.session) req.session.cart = normalized; //restore into session
            return normalized;
        } catch (e) {
            return [];
        }
    }
    return [];
}

// Save cart to both session and cookie
function saveCart(req, res, cart) {
    const normalized = normalizeCart(cart);
    if (req.session) req.session.cart = normalized;
    res.cookie("cart", JSON.stringify(normalized), {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true, //Protect from JS access
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" //default for commerce flows
    });
}

app.get("/", async(req, res) => {
    try {
        // Fetch categories
        const categoriesResult = await pool.query("SELECT * FROM categories ORDER BY id");

        // Fetch products grouped be category
        const productResult = await pool.query("SELECT * FROM products ORDER BY category_id");

        // Organize into {category_id: [products]}
        const groupedProducts = {};
        productResult.rows.forEach(p => {
            if (!groupedProducts[p.category_id]) {
                groupedProducts[p.category_id] = [];
            }
            groupedProducts[p.category_id].push(p);
        });

        res.render("index", {
            categories: categoriesResult.rows,
            productsByCategory: groupedProducts
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/product/:id", async (req, res) => {
   try {
    const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).send("Product not found");

    res.render("product", {product: rows[0]});
   } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
   }
});

app.post("/cart/add/:id", async (req, res) => {
    const productId = Number(req.params.id);
    try {
        const {rows} = await pool.query("SELECT id, name, price, image_url FROM products WHERE id = $1",
            [productId]
        );
        if (!rows[0]) return res.status(404).send("Product not found");

        const prod = rows[0];
        const product = {
            id: Number(prod.id),
            name: prod.name,
            price: Number(prod.price) || 0,
            image_url: prod.image_url
        };

        let cart = getCart(req);
        const existing = cart.find(i => i.id === product.id);

        if (existing) {
            existing.quantity = Number(existing.quantity) + 1;
        } else {
            cart.push({...product, quantity: 1});
        } 
        saveCart(req, res, cart);
        return res.redirect("/cart");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.post("/cart/update/:id", (req, res) => {
    const productId = Number(req.params.id);
    const newQty = Number(req.body.quantity) || 0;

    let cart = getCart(req);
    cart = cart.map(item => item.id === productId ? {...item, quantity: newQty} : item)
        .filter(item => item.quantity > 0); //remove if qty 0

        saveCart(req, res, cart);
        res.redirect("/cart");
});

app.post("/cart/remove/:id", (req, res) => {
    const id = Number(req.params.id);
    let cart = getCart(req);
    cart = cart.filter(i => i.id !== id);
    saveCart(req, res, cart);
    res.redirect("/cart");
});

app.post("/cart/clear", (req, res) => {
    saveCart(req, res, []); //empty cart
    res.redirect("/cart");
});

// View cart
app.get("/cart", (req, res) => {
    const cart = getCart(req);
    const total = cart.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    res.render("cart", {cart, total});
});

// View checkout
app.get("/checkout", (req, res) => {
    const cart = req.session.cart || [];
    res.render("checkout", {cart});
});

app.post("/checkout", (req, res) => {
    const cart = req.session.cart || [];
    const {
        fullName, 
        email, 
        phone, 
        address, 
        city, 
        state, 
        postalCode, 
        paymentMethod
    } = req.body;

    if (cart.length === 0) {
        return res.redirect("/cart");
    }

    // Calculate totals
    let subtotal = 0;
    cart.forEach(item => {
        subtotal += (Number(item.price) || 0) * (Number(item.quantity) || 0);
    });
    const shipping = 1000;
    const total = subtotal + shipping;

    // Save order (for now, just log or save in JSON file)
    const order = {
        customer: {fullName, email, phone, address, city, state, postalCode},
        paymentMethod,
        items: cart,
        subtotal,
        shipping,
        total,
        date: new Date()
    };

    console.log("New Order:", order);
    // TODO: save order to JSON/pool

    // Clear cart after order
    req.session.cart = [];

    res.render("order-success", { order });
});

app.get("/order-success", (req, res) => {
    res.render("order-success");
});

// 404 error
app.use((req, res) => {
    res.status(404).render("error", {
        message: "Page not found",
        error: null // pass error as null;
    })
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error("=== ERROR DETAILS ===");
    console.error("Error message:", err.message);
    console.error(err.stack);
    console.error("=== END ERROR ===");
    res.status(500).render('error', { 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'production' ? null : err
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => { // The 0.0.0.0 is for render
    console.log(`Server running on localhost${PORT}`)
});
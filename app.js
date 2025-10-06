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

        // Drop existing tables and recreate them fresh
        await pool.query(`
            DROP TABLE IF EXISTS session CASCADE;
            DROP TABLE IF EXISTS products CASCADE;
            DROP TABLE IF EXISTS categories CASCADE
        `);
        console.log("Dropped existing tables");

        // Create categories table (exact same structure as local)
        await pool.query(`
            CREATE TABLE categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255)
            );
        `);
        console.log("Categories table ready");

        // Create products table (same structure)
        await pool.query(`
            CREATE TABLE products (
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
            CREATE TABLE session (
            sid VARCHAR PRIMARY KEY,
            sess JSON NOT NULL,
            expire TIMESTAMP(6) NOT NULL
            );
            CREATE INDEX IDX_session_expire ON session(expire);
        `);
        console.log("Session table ready");

        // The exact data
        await addExactData();
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

initializeDatabase();

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
        createTableIfMissing: true,
        pruneSessionInterval: false
    }),
    secret: process.env.SESSION_SECRET || "my-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        sameSite: "lax",
        domain: process.env.NODE_ENV === "production" ? '.onrender.com' : undefined
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

// Debug cart state
app.get("/debug-cart", (req, res) => {
    const sessionCart = req.session.cart || [];
    const cookieCart = req.cookies.cart ? JSON.parse(req.cookies.cart) : [];
    const normalizedCart = getCart(req);
    
    res.json({
        session_cart: sessionCart,
        cookie_cart: cookieCart,
        normalized_cart: normalizedCart,
        session_id: req.sessionID
    });
});

app.get("/", async(req, res) => {
    try {
        console.log("Loading homepage...");
        
        const categoriesResult = await pool.query("SELECT * FROM categories ORDER BY id");
        const productResult = await pool.query("SELECT * FROM products ORDER BY category_id");
        
        console.log(`Found ${categoriesResult.rows.length} categories and ${productResult.rows.length} products`);
        
        // Debug: show what's in the database
        console.log("Categories:", categoriesResult.rows.map(c => c.name));
        console.log("Products:", productResult.rows.map(p => p.name));

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
    const cart = getCart(req);
    console.log("Checkout page - cart items:", cart.length);

    if (cart.length === 0) {
        return res.redirect("/cart");
    }
    // Calculate totals properly
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = 1000;
    const total = subtotal + shipping;
    res.render("checkout", {cart: cart, subtotal: subtotal});
});

app.post("/checkout", (req, res) => {
    try {
        console.log("=== CHECKOUT PROCESS STARTED ===");
         const cart = getCart(req);
         console.log("Cart items:", cart.length);
         console.log("cart contents:", cart);
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
        console.log("Form data received:", req.body);

        // check if form data is missing
        if (!fullName || !email || !phone) {
            console.log("Missing form data - redirecting back to checkout");
            return res.redirect("/checkout?error=missing_fields");
        }
        
        if (cart.length === 0) {
            console.log("Empty cart - redirecting to cart page");
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

    // TODO: save order to JSON/pool
    console.log("New Order:", order);

    // Clear cart after order
    saveCart(req, res, []); // Using savecart to clear both session and cookie
    console.log("Cart cleared");

    // Save session before redirecting
    req.session.save((err) => {
        if (err) {
            console.error("Error saving session:", err);
        }
        console.log("Session saved, rendering order-success");
        res.render("order-success", { order });
    });
    } catch (err) {
        console.error("Checkout error:", err);
        res.status(500).send("Checkout failed");
    }
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
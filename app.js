require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const PgSession = require("connect-pg-simple")(session);

// Import modules
const pool = require("./config/database");
const { initializeDatabase } = require("./models/initializeDB");
const authModel = require("./models/authModel");
const { ensureAuthenticated } = require("./middlewares/authMiddleware");
const { getCart, saveCart } = require("./utils/cartUtils");
const { loginSession, logoutSession } = require("./utils/sessionUtils");

const app = express();

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

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

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

// Auth Routes
app.get("/register", (req, res) => {
    res.render("auth/register", {error: null, values: {}});
});

app.post("/register", async (req, res) => {
    try {
        const {name, email, password} = req.body || {};

        if (!name || !email || !password) {
            return res.render("auth/register", {error: "All fields are required.", values: {name, email}}); 
        }

        // Check if user exists
        const emailExists = await authModel.emailExists(email);
        if (emailExists) {
            return res.render("auth/register", {error: "Email already exist.", values: {name, email}});
        }

        const newUser = await authModel.createUser(name, email, password);
        // Log user in and redirect (merge cart too)
        await loginSession(req, res, newUser);
        return res.render("login", {success: "Singup successful! Proceed to login. "});
    } catch (err) {
        console.log("Register error:", err);
        return res.status(500).render('auth/register', { error: "Server error. Try again later.", values: req.body });
    }
});

// Login page
app.get("/login", (req, res) => {
    res.render("auth/login", {error: null, values: {}});
});

app.post ("/login", async (req, res) => {
    try {
        const {email, password} = req.body || {};
        if (!email || !password) {
            return res.render("auth/login", {error: "Email and password required.", values: {email}});
        }

        // Fetch user
       const user = await authModel.findUserByEmail(email);
        if (!user) {
            return res.render("auth/login", {error: "Invalid credential.", values: {email}});
        }

        // Compare password
        const isPasswordValid = await authModel.verifyPassword(password, user.password_harsh);
        if (!isPasswordValid) {
            return res.render("auth/login", {error: "Invalid credentials.", values: {email}});
        }

        // Login put user into session and merge cart
        await loginSession(req, res, user);

        // Redirect to intended page if stored, otherwise home
        const redirectTo = req.session.returnTo || "/";
        delete req.session.returnTo;
        return res.redirect(redirectTo);
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).render("auth/login", {error: "Server error. Try again later.", values: req.body});
    }
});

// Logout
app.post("/logout", async (req, res) => {
    try {
        await logoutSession(req, res);
        return res.redirect("/");
    } catch (err) {
        console.error("Logout error:", err);
        return res.redirect("/");
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
app.get("/checkout", ensureAuthenticated, (req, res) => {
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

app.post("/checkout", ensureAuthenticated, (req, res) => {
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
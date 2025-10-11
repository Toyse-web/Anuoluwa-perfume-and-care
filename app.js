require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const PgSession = require("connect-pg-simple")(session);
const multer = require("multer");
const fs = require("fs");

// Import modules
const pool = require("./config/database");
const { initializeDatabase } = require("./models/initializeDB");
const authModel = require("./models/authModel");
const { ensureAuthenticated } = require("./middlewares/authMiddleware");
const { getCart, saveCart } = require("./utils/cartUtils");
const { loginSession, logoutSession } = require("./utils/sessionUtils");
const { ensureAdmin, ensureAdminGuest } = require("./middlewares/adminMiddleware");
const { error } = require("console");

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

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {recursive: true});
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
        cb(null, uniqueName);
    }
});
const upload = multer({storage});

// Debug: log every response attempt
app.use((req, res, next) => {
  let sent = false;
  const oldRender = res.render;
  const oldRedirect = res.redirect;

  res.render = function (...args) {
    if (sent) {
      console.error(`⚠️ DOUBLE RENDER DETECTED on ${req.method} ${req.originalUrl}`);
      console.trace();
      return;
    }
    sent = true;
    return oldRender.apply(this, args);
  };

  res.redirect = function (...args) {
    if (sent) {
      console.error(`⚠️ DOUBLE REDIRECT DETECTED on ${req.method} ${req.originalUrl}`);
      console.trace();
      return;
    }
    sent = true;
    return oldRedirect.apply(this, args);
  };

  next();
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
    res.render("auth/register", {error: null, success: null, values: {}});
});

app.post("/register", async (req, res) => {
    try {
        const {username, email, password} = req.body || {};

        if (!username || !email || !password) {
            return res.render("auth/register", {error: "All fields are required.", success: null, values: {username, email}}); 
        }

        // Check if user exists
        const emailExists = await authModel.emailExists(email);
        if (emailExists) {
            return res.render("auth/register", {
                error: "Email already exists",
                success: null,
                values: {username, email}
            });
        }

        const newUser = await authModel.createUser(username, email, password);
        // Log user in and redirect (merge cart too)
        await loginSession(req, res, newUser);
        return res.redirect("/login?registered=true");
    } catch (err) {
        console.error("Register error:", err);
        return res.status(500).render('auth/register', { error: "Server error. Try again later.", success: null, values: req.body });
    }
});

// Login page
app.get("/login", (req, res) => {
    const success = req.query.registered ? "Singup successful! Please login." : null;
    res.render("auth/login", {error: null, success, values: {}});
});

app.post ("/login", async (req, res) => {
    try {
        const {email, password} = req.body || {};
        if (!email || !password) {
            return res.render("auth/login", {
                error: "Email and password required.",
                success: null, 
                values: {email}
            });
        }

        // Fetch user
       const user = await authModel.findUserByEmail(email);
        if (!user) {
            return res.render("auth/login", {error: "Invalid credential.", success: null, values: {email}});
        }

        // Compare password
        const isPasswordValid = await authModel.verifyPassword(password, user.password_hash);
        if (!isPasswordValid) {
            return res.render("auth/login", {error: "Invalid credentials.", success: null, values: {email}});
        }

        // Login put user into session
        await loginSession(req, res, user);
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            is_admin: user.is_admin
        };
        req.session.save();

        // Redirect to intended page if stored, otherwise home
        const redirectTo = req.session.redirectTo || "/checkout";
        delete req.session.redirectTo;
        return res.redirect(redirectTo);
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).render("auth/login", {error: "Server error. Try again later.", success: null, values: req.body});
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

// Admin dashboard
app.get("/admin/login", ensureAdminGuest, (req, res) => {
  res.render("admin/login", { error: null });
});

app.post("/admin/login", ensureAdminGuest, async (req, res) => {
  const { username, password } = req.body;
  try {
    // Validate input
    if (!username || !password) {
        return res.render("admin/login", {error: "Username and password are required"});
    }
    console.log("Admin login attempt for username:", username);

    const result = await pool.query("SELECT * FROM admins WHERE username = $1", [username]);

    if (result.rows.length === 0) {
        console.log("Admin not found:", username);
        return res.render("admin/login", { error: "Invalid username or password" });
    }

    const admin = result.rows[0];
    console.log("Admin found:", admin.username, "Password hash exists:", !!admin.password_hash);

    // Compare passwords
    const match = await bcrypt.compare(password, admin.password_hash);

    if (!match) {
        console.log("Password mismatch for admin:", username);
        return res.render("admin/login", { error: "Invalid username or password" });
    }
    console.log("Admin login successful:", username);

    //Save session safely
    req.session.admin = { 
        id: admin.id, 
        username: admin.username,
        email: admin.email
    };
    console.log("Session before save:", req.session);

    req.session.save((err) => {
        if (err) {
            console.error("Session save error:", err);
            return res.render("admin/login", {error: "Session error. Please try again."});
        }
        console.log("Session saved successfully, redirecting to /admin");
        console.log("Session after save:", req.session);
      res.redirect("/admin");
    });

  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).render("admin/login", { error: "Server error. Try again." });
  }
});

app.get("/admin/logout", (req, res) => {
  req.session.admin = null;
  res.redirect("/admin/login");
});

app.get("/admin", ensureAdmin, async (req, res) => {
    try {
        console.log("Accessing admin dashboard for:", req.session.admin.username);
        
        const products = await pool.query(`
            SELECT p.*, c.name AS category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.id DESC
        `);
        console.log("Rendering admin dashboard with", products.rows.length, "products");

        res.render("admin/dashboard", {
            admin: req.session.admin,
            products: products.rows
        });
    } catch (err) {
        console.error("Admin dashboard error:", err);
        res.status(500).render("admin/login", {error: "Server error. Try again."});
    }
});


// Add product page
app.get("/admin/add-product", ensureAdmin, async (req, res) => {
  const categories = await pool.query("SELECT * FROM categories ORDER BY name ASC");
  res.render("admin/add-product", { categories: categories.rows, error: null, success: null });
});

app.post("/admin/add-product", ensureAdmin, upload.single("image"), async (req, res) => {
  try {
    const { name, price, category_id } = req.body;
    const imageFile = req.file;

    if (!name || !price || !category_id || !imageFile) {
      const categories = await pool.query("SELECT * FROM categories ORDER BY name ASC");
      return res.render("admin/add-product", { categories: categories.rows, error: "All fields required", success: null });
    }

    const image_url = `/uploads/${imageFile.filename}`;
    await pool.query(
      "INSERT INTO products (name, price, category_id, image_url) VALUES ($1, $2, $3, $4)",
      [name, price, category_id, image_url]
    );

    const categories = await pool.query("SELECT * FROM categories ORDER BY name ASC");
    res.render("admin/add-product", { categories: categories.rows, error: null, success: "Product added successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error.");
  }
});

// Edit products
app.get("/admin/edit/:id", ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const product = await pool.query("SELECT * FROM products WHERE id=$1", [id]);
  const categories = await pool.query("SELECT * FROM categories ORDER BY name ASC");
  res.render("admin/edit-product", { product: product.rows[0], categories: categories.rows, error: null });
});

app.post("/admin/edit/:id", ensureAdmin, upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { name, price, category_id } = req.body;
  const imageFile = req.file;

  let query, values;
  if (imageFile) {
    const image_url = `/uploads/${imageFile.filename}`;
    query = "UPDATE products SET name=$1, price=$2, category_id=$3, image_url=$4 WHERE id=$5";
    values = [name, price, category_id, image_url, id];
  } else {
    query = "UPDATE products SET name=$1, price=$2, category_id=$3 WHERE id=$4";
    values = [name, price, category_id, id];
  }

  await pool.query(query, values);
  res.redirect("/admin");
});



// Delete product
app.post("/admin/delete/:id", ensureAdmin, async (req, res) => {
    try {
        await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
        res.redirect("/admin");
    } catch (err) {
        console.error(err);
        res.status(500).render("error", {message: "Failed to delete product", error: err});
    }
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
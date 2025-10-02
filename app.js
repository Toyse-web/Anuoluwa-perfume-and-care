const express = require("express");
const path = require("path");
const pg = require("pg");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "Anuoluwa-Store",
    password: "Jeanie1234*",
    port: 5432,
});
db.connect();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());
// Session middleware
app.use(session({
    secret: "secretkey123",
    resave: false,
    saveUninitialized: true
}));

// function to get cart from session or cookies
function getCart(req) {
    if (req.session.cart) return req.session.cart;
    
    // If no session, check cookie
    if (req.cookies.cart) {
        try {
            const parsed = JSON.parse(req.cookies.cart);
            req.session.cart = parsed; //restore into session
            return parsed;
        } catch (e) {
            return [];
        }
    }
    return [];
}

// Save cart to both session and cookie
function saveCart(req, res, cart) {
    req.session.cart = cart;
    res.cookie("cart", JSON.stringify(cart), {
        maxAge: 7*24*60*60*1000, // 7 days
        httpOnly: true, //Protect from JS access
        secure: false, //set to true when using HTTPS
    });
}

app.get("/", async(req, res) => {
    try {
        // Fetch categories
        const categoriesResult = await db.query("SELECT * FROM categories ORDER BY id");

        // Fetch products grouped be category
        const productResult = await db.query("SELECT * FROM products ORDER BY category_id");

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
    const { rows } = await DOMQuad.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).send("Product not found");

    res.render("product", {product: rows[0]});
   } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
   }
});

app.post("/cart/add/:id", async (req, res) => {
    const productId = req.params.id;

    // Get product details from DB
    const { rows } = await db.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (rows.length === 0) return res.status(404).send("Product not found");

    const product = rows[0];
    let cart = getCart(req);

    // Check if product already in cart
    const existing = cart.find(p => p.id === product.id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({...product, qty: 1});
    }

    saveCart(req, res, cart);
    res.redirect("/cart");
});

// View cart
app.get("/cart", (req, res) => {
    const cart = getCart(req);
    const total = cart.reduce((sum, p) => sum + p.price * p.qty, 0);
    res.render("cart", {cart, total});
});

// Remove item
app.post("/cart/remove/:id", (req, res) => {
   let cart = getCart(req);
   cart = cart.filter(p => p.id != req.params.id);
   saveCart(req, res, cart);
    res.redirect("/cart");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on localhost${PORT}`));
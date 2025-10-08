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

module.exports = {
    normalizeCart,
    getCart,
    saveCart
};
const { getCart, saveCart } = require('./cartUtils');

async function loginSession(req, res, userRow) {
    // userRow is a DB row: {id, name, email, ...}
    // Attach minimal user info to session
    req.session.user = {
        id: Number(userRow.id),
        name: userRow.name,
        email: userRow.email
    };
    // Merge existing cookie into session (getcart will restore cookie into session)
    const currentCart = getCart(req);
    saveCart(req, res, currentCart);

    // Save session immediately (useful before redirect)
    return new Promise((resolve, reject) => {
        req.session.save(err => (err ? reject(err) : resolve()));
    });
}

function logoutSession(req, res) {
    return new Promise((resolve, reject) => {
        req.session.destroy(err => {
            if (err) {
                reject(err);
            } else {
                res.clearCookie("connect.sid");
                resolve();
            }
        });
    });
}

module.exports = {
    loginSession,
    logoutSession
};
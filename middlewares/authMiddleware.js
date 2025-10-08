function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        // User is logged in
        return next();
    } else {
        // Remember the intended URL
        req.session.redirectTo = req.originalUrl;
        res.redirect("/login");
    }
}

module.exports = {ensureAuthenticated};
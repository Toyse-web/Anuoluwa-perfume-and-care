function ensureAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  next(); 
}

module.exports = { ensureAdmin };

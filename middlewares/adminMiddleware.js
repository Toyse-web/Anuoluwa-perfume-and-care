function ensureAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.redirect("/admin/login"); 
}

function ensureAdminGuest(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect("/admin");
  }
  next();
}

module.exports = { ensureAdmin, ensureAdminGuest };

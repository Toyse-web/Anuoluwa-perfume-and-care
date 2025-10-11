function ensureAdmin(req, res, next) {
  console.log("Checking admin authentication...");
  console.log("Session:", req.session);
  console.log("Admin in session:", req.session.admin);

  if (req.session && req.session.admin) {
    console.log("Admin authenticated:", req.session.admin.username);
    return next();
  }

  console.log("No admin in session, redirecting to login")
  return res.redirect("/admin/login"); 
}

function ensureAdminGuest(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect("/admin");
  }
  next();
}

module.exports = { ensureAdmin, ensureAdminGuest };

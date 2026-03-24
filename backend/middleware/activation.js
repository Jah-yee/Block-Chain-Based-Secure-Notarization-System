function requireSystemActivated(req, res, next) {
  if (!global.systemActivated) {
    return res.status(403).json({ error: "System not activated" });
  }
  next();
}

module.exports = { requireSystemActivated };

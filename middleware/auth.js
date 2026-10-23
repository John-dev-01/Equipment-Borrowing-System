const ROLE_PERMISSIONS = Object.freeze({
  borrower: new Set([
    'equipment:read',
    'requests:create',
    'requests:read-own',
    'requests:cancel-own',
  ]),
  admin: new Set([
    'equipment:read',
    'requests:create',
    'requests:read-own',
    'requests:cancel-own',
    'requests:read-all',
    'requests:review',
    'equipment:manage',
  ]),
});

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function hasPermission(user, permission) {
  return Boolean(
    user &&
    ROLE_PERMISSIONS[user.role] &&
    ROLE_PERMISSIONS[user.role].has(permission)
  );
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');

    if (!hasPermission(req.session.user, permission)) {
      return res.status(403).send(
        req.app.locals.page(
          req,
          'Forbidden',
          '<h1>Access denied</h1><p>Your account does not have permission to view this area.</p>'
        )
      );
    }

    next();
  };
}

function requireRole(role) {
  return requirePermission(
    role === 'admin' ? 'equipment:manage' : 'equipment:read'
  );
}

module.exports = {
  ROLE_PERMISSIONS,
  hasPermission,
  requireLogin,
  requirePermission,
  requireRole,
};

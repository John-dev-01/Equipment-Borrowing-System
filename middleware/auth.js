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
  if (!user || isSystemAdmin(user)) return false;
  return Boolean(ROLE_PERMISSIONS[user.role] && ROLE_PERMISSIONS[user.role].has(permission));
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!hasPermission(req.session.user, permission)) {
      return res.status(403).send(req.app.locals.page(
        req, 'Forbidden', '<h1>Access denied</h1><p>Your account does not have permission to view this area.</p>'
      ));
    }
    next();
  };
}

function requireSystemAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin' || req.session.user.admin_scope !== 'system') {
    return res.status(403).send(req.app.locals.page(
      req, 'Forbidden', '<h1>Access denied</h1><p>Only system administrators can manage departments and department administrators.</p>'
    ));
  }
  next();
}

function isSystemAdmin(user) {
  return Boolean(user && user.role === 'admin' && user.admin_scope === 'system');
}

function requireRole(role) {
  return requirePermission(role === 'admin' ? 'equipment:manage' : 'equipment:read');
}

module.exports = { ROLE_PERMISSIONS, hasPermission, isSystemAdmin, requireLogin, requirePermission, requireRole, requireSystemAdmin };

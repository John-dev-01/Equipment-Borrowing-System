const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../middleware/db');
const { esc } = require('../middleware/views');
const router = express.Router();

const CSPC_DOMAIN = '@my.cspc.edu.ph';
const isCspcEmail = email => typeof email === 'string' && /^[^\s@]+@my\.cspc\.edu\.ph$/i.test(email.trim());
const normalizeEmail = email => String(email || '').trim().toLowerCase();
const getDepartments = () => require('../middleware/departments');

const passwordField = (label, id, name, autocomplete) => `<div class="auth-password-group">
  <label for="${id}">${label}</label><div class="auth-password-field">
    <input id="${id}" type="password" name="${name}" autocomplete="${autocomplete}" placeholder="${label}" required${name === 'password' && autocomplete === 'new-password' ? ' minlength="8"' : ''}>
    <button class="password-toggle" type="button" data-password-toggle data-field-label="${label.toLowerCase()}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false" title="Show ${label.toLowerCase()}">
      <svg data-icon-show viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
      <svg data-icon-hide viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4-.8"/></svg>
    </button></div></div>`;

const form = (kind, error = '', v = {}) => {
  const departments = getDepartments();
  const escapedDepartments = JSON.stringify(departments).replace(/</g, '\\u003c');
  return `<div class="auth-shell ${kind === 'login' ? 'login-mode' : 'register-mode'}" data-auth-mode="${kind}" data-departments='${esc(escapedDepartments)}'>
  <section class="auth-form-panel"><div class="auth-form-area">
    <div class="auth-kicker">${kind === 'login' ? 'Sign in' : 'Create account'}</div><h1>${kind === 'login' ? 'Sign in' : 'Create account'}</h1>
    <p class="auth-form-copy">${kind === 'login' ? 'Access your department equipment library and track your requests.' : 'Join the equipment desk with your CSPC email address.'}</p>
    ${error ? `<p class="flash error">${esc(error)}</p>` : ''}
    <form method="post" class="auth-card">
      ${kind === 'register' ? `<label>Full name<input name="name" autocomplete="name" placeholder="Name" required value="${esc(v.name)}"></label>` : ''}
      <label>CSPC email<input type="email" name="email" autocomplete="email" placeholder="CSPC email" required value="${esc(v.email)}"${kind === 'register' ? ' pattern="[^@\\s]+@my\\.cspc\\.edu\\.ph" title="Use your @my.cspc.edu.ph email address"' : ''}></label>
      ${kind === 'register' ? `<label>College / campus<div class="department-select${v.department ? ' has-value' : ''}" data-department-select data-required-selection><input type="hidden" name="department" value="${esc(v.department || '')}" data-department-value><button class="department-select-trigger" type="button" data-department-trigger role="combobox" aria-label="Select your college or campus" aria-haspopup="listbox" aria-expanded="false" aria-controls="department-options" aria-required="true"><span data-department-label>${esc(v.department || 'Select your college / campus')}</span><span class="department-select-chevron" aria-hidden="true"></span></button><div class="department-select-menu" id="department-options" data-department-options role="listbox" aria-label="Departments" hidden>${departments.map(name => `<button type="button" class="department-option" data-department-option data-value="${esc(name)}" role="option" aria-selected="${v.department === name}">${esc(name)}</button>`).join('')}</div><span class="department-error" data-department-error hidden>Please choose a department.</span></div></label>` : ''}
      ${passwordField('Password', 'auth-password', 'password', kind === 'login' ? 'current-password' : 'new-password')}
      ${kind === 'register' ? passwordField('Confirm password', 'auth-password-confirm', 'password_confirm', 'new-password') : ''}
      ${kind === 'register' ? '<p class="field-note">Use at least 8 characters. New accounts start with the borrower role.</p>' : ''}
      <button>${kind === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
    <p class="auth-switch">${kind === 'login' ? 'New to Equipment Desk?' : 'Already have an account?'} <a href="/${kind === 'login' ? 'register' : 'login'}" data-auth-switch>${kind === 'login' ? 'Create an account' : 'Sign in'}</a></p>
  </div></section>
  <section class="auth-logo-panel" aria-label="CSPC Equipment Desk"><button class="auth-logo-button" type="button" aria-label="Activate logo animation"><span class="shockwave" aria-hidden="true"></span><span class="shockwave" aria-hidden="true"></span><span class="shockwave" aria-hidden="true"></span><span class="shockwave" aria-hidden="true"></span><svg class="auth-logo-svg" viewBox="0 0 48 48" role="img" aria-label="Animated geometric logo"><path class="orbit" d="M24 4a20 20 0 1 1-14.14 5.86"/><path class="orbit orbit-secondary" d="M24 10a14 14 0 1 1-9.9 4.1"/><path class="core" d="m24 13 11 6.35v12.3L24 38l-11-6.35v-12.3z"/><path class="core-lines" d="M24 13v12.5m11-6.15-11 6.15-11-6.15"/></svg></button></section>
</div>`;
};

function startSession(req, res, user, next) {
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role,
      department: user.department, admin_scope: user.admin_scope || 'system' };
    req.session.cookie.expires = false;
    req.session.save(saveErr => {
      if (saveErr) return next(saveErr);
      res.redirect(user.role !== 'admin' ? '/equipment' : user.admin_scope === 'system' ? '/admin/department-admins' : '/admin/requests');
    });
  });
}

router.get('/login', (req, res) => res.send(req.app.locals.page(req, 'Sign in', form('login'))));
router.post('/login', (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const fail = message => res.status(401).send(req.app.locals.page(req, 'Sign in', form('login', message, { email })));
  const user = db.prepare('SELECT id, name, email, password_hash, role, department, admin_scope FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return fail('Incorrect CSPC email or password.');
  startSession(req, res, user, next);
});

router.get('/register', (req, res) => res.send(req.app.locals.page(req, 'Create account', form('register'))));
router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const passwordConfirm = String(req.body.password_confirm || '');
  const department = String(req.body.department || '').trim();
  const fail = message => res.status(400).send(req.app.locals.page(req, 'Create account', form('register', message, { name, email, department })));
  if (name.length < 2 || name.length > 120) return fail('Enter your full name.');
  if (!isCspcEmail(email)) return fail(`Use your ${CSPC_DOMAIN} email address.`);
  if (!getDepartments().includes(department)) return fail('Choose your college or campus.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (password !== passwordConfirm) return fail('Passwords do not match. Please enter the same password in both fields.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail('That CSPC email is already registered.');
  db.prepare('INSERT INTO users (name,email,password_hash,role,department,admin_scope) VALUES (?,?,?,?,?,?)')
    .run(name, email, bcrypt.hashSync(password, 12), 'borrower', department, 'system');
  res.redirect('/login');
});

router.post('/change-password', (req, res) => {
  const sessionUser = req.session.user;
  if (!sessionUser) return res.redirect('/login');
  const backTo = sessionUser.role !== 'admin' ? '/equipment' : sessionUser.admin_scope === 'system' ? '/admin/department-admins' : '/admin/requests';

  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  const confirmPassword = String(req.body.confirm_password || '');
  const account = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(sessionUser.id);
  const fail = message => {
    req.session.flash = { type: 'error', msg: message };
    res.redirect(backTo);
  };
  if (!account || !bcrypt.compareSync(currentPassword, account.password_hash)) return fail('Current password is incorrect.');
  if (newPassword.length < 8) return fail('New password must be at least 8 characters.');
  if (Buffer.byteLength(newPassword, 'utf8') > 72) return fail('New password must be no more than 72 UTF-8 bytes.');
  if (newPassword !== confirmPassword) return fail('New passwords do not match.');
  if (bcrypt.compareSync(newPassword, account.password_hash)) return fail('Choose a new password different from your current password.');

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 12), sessionUser.id);
  req.session.flash = { type: 'ok', msg: 'Password changed successfully.' };
  res.redirect(backTo);
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));
module.exports = router;

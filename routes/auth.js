const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../middleware/db');
const { esc } = require('../middleware/views');
const router = express.Router();

const CSPC_DOMAIN = '@my.cspc.edu.ph';
const isCspcEmail = email => typeof email === 'string' && /^[^\s@]+@my\.cspc\.edu\.ph$/i.test(email.trim());
const normalizeEmail = email => String(email || '').trim().toLowerCase();

const form = (kind, error = '', v = {}) => `<div class="auth-shell ${kind === 'login' ? 'login-mode' : 'register-mode'}" data-auth-mode="${kind}">
  <section class="auth-form-panel">
    <div class="auth-form-area">
      <div class="auth-kicker">${kind === 'login' ? 'Sign in' : 'Create account'}</div>
      <h1>${kind === 'login' ? 'Sign in' : 'Create account'}</h1>
      <p class="auth-form-copy">${kind === 'login' ? 'Access the equipment library and keep track of your requests.' : 'Join the equipment desk with your CSPC email address.'}</p>
      ${error ? `<p class="flash error">${esc(error)}</p>` : ''}
      <form method="post" class="auth-card">
        ${kind === 'register' ? `<label>Full name<input name="name" autocomplete="name" placeholder="Full name" required value="${esc(v.name)}"></label>` : ''}
        <label>CSPC email<input type="email" name="email" autocomplete="email" placeholder="CSPC email" required value="${esc(v.email)}"${kind === 'register' ? ' pattern="[^@\\s]+@my\\.cspc\\.edu\\.ph" title="Use your @my.cspc.edu.ph email address"' : ''}></label>
        <label>Password<input type="password" name="password" autocomplete="${kind === 'login' ? 'current-password' : 'new-password'}" placeholder="Password" required minlength="8"></label>
        ${kind === 'login' ? '<label class="remember-option"><input type="checkbox" name="remember"> <span>Remember me</span></label>' : ''}
        ${kind === 'register' ? '<p class="field-note">Use at least 8 characters. New accounts start with the borrower role.</p>' : ''}
        <button>${kind === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <p class="auth-switch">${kind === 'login' ? 'New to Equipment Desk?' : 'Already have an account?'} <a href="/${kind === 'login' ? 'register' : 'login'}" data-auth-switch>${kind === 'login' ? 'Create an account' : 'Sign in'}</a></p>
    </div>
  </section>
  <section class="auth-logo-panel" aria-label="CSPC Equipment Desk">
    <button class="auth-logo-button" type="button" aria-label="Activate logo animation">
      <span class="shockwave" aria-hidden="true"></span>
      <span class="shockwave" aria-hidden="true"></span>
      <span class="shockwave" aria-hidden="true"></span>
      <span class="shockwave" aria-hidden="true"></span>
      <svg class="auth-logo-svg" viewBox="0 0 48 48" role="img" aria-label="Animated geometric logo">
        <path class="orbit" d="M24 4a20 20 0 1 1-14.14 5.86" />
        <path class="orbit orbit-secondary" d="M24 10a14 14 0 1 1-9.9 4.1" />
        <path class="core" d="m24 13 11 6.35v12.3L24 38l-11-6.35v-12.3z" />
        <path class="core-lines" d="M24 13v12.5m11-6.15-11 6.15-11-6.15" />
      </svg>
    </button>
  </section>
</div>`;

function startSession(req, res, user, next, remember = false) {
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    req.session.cookie.maxAge = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 8;
    req.session.save(saveErr => {
      if (saveErr) return next(saveErr);
      res.redirect(user.role === 'admin' ? '/admin/requests' : '/equipment');
    });
  });
}

router.get('/login', (req, res) => res.send(req.app.locals.page(req, 'Sign in', form('login'))));
router.post('/login', (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const remember = req.body.remember === 'on';
  const fail = message => res.status(401).send(req.app.locals.page(req, 'Sign in', form('login', message, { email })));
  const user = db.prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return fail('Incorrect CSPC email or password.');
  startSession(req, res, user, next, remember);
});

router.get('/register', (req, res) => res.send(req.app.locals.page(req, 'Create account', form('register'))));
router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const fail = message => res.status(400).send(req.app.locals.page(req, 'Create account', form('register', message, { name, email })));
  if (name.length < 2 || name.length > 120) return fail('Enter your full name.');
  if (!isCspcEmail(email)) return fail(`Use your ${CSPC_DOMAIN} email address.`);
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail('That CSPC email is already registered.');
  db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(name, email, bcrypt.hashSync(password, 12), 'borrower');
  res.redirect('/login');
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));
module.exports = router;

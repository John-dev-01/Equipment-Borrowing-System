const path = require('path');
const express = require('express');
const session = require('express-session');
const { page } = require('./middleware/views');
const app = express();
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-change-me');
if (!sessionSecret) throw new Error('SESSION_SECRET must be set in production.');
app.locals.page = page;
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  },
}));
app.get('/', (req, res) => res.redirect(req.session.user ? '/equipment' : '/login'));
app.use(require('./routes/auth'));
app.use(require('./routes/borrower'));
app.use(require('./routes/admin'));
app.use(require('./routes/chat'));
app.use((req, res) => res.status(404).send(page(req, 'Not found', '<h1>Page not found</h1><p><a href="/">Go home</a></p>')));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`CSPC Equipment Desk running at http://localhost:${port}`));

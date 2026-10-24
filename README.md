# Equipment Borrowing System

Campus equipment borrowing system built with Node.js, Express, and SQLite. Each fixed department has its own equipment and department-admin account; borrowers can borrow only from their assigned department.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Use the existing system-admin account to sign in. In local development, the eight department application accounts are created automatically on first startup; their login emails and passwords are in [DEPARTMENT-ADMIN-ACCOUNTS.md](DEPARTMENT-ADMIN-ACCOUNTS.md). The system admin can also create an account for a fixed department from **Department accounts**. Department admins can manage only their department's items, requests, and borrower chats. The department list is fixed in `middleware/departments.js`; departments themselves are not created through the app.

For a new installation without an existing admin account, set these environment variables on first launch. The bootstrap account is created only if the email is valid and the password is at least 8 characters:

```bash
ADMIN_NAME="System Administrator" \
ADMIN_EMAIL="admin@my.cspc.edu.ph" \
ADMIN_PASSWORD="use-a-unique-password" \
SESSION_SECRET="use-a-long-random-secret" \
npm start
```

For local development only, the app has a fallback session secret. Set `SESSION_SECRET` for any deployment beyond a local demo. Do not commit real credentials.

The listed department logins are application usernames; they do not create or verify campus email inboxes. These default passwords are weak and only for local development. Set `NODE_ENV=production` to skip automatic seeding, or set `SEED_DEPARTMENT_ADMINS=false` to disable it explicitly. Replace them with unique strong passwords before any public deployment.

## Accounts and department boundaries

- **System admin:** the existing admin account can create one department-admin account per fixed department and oversee all inventory and requests.
- **Department admin:** signs in with the department-specific account and can manage only that department's equipment, requests, returns, and borrower chats.
- **Borrower:** registers with a CSPC email and selects one of the fixed departments. Borrowers see only equipment assigned to their department and can request or cancel their own pending requests.

Department ownership is enforced in server-side queries and update operations. The unauthenticated legacy `npm run raw` server is disabled; use the Express app.

## Existing database upgrade

Startup adds department records and department ownership to equipment, assigns older equipment without a department to **College of Computer Studies**, and gives legacy admins system-admin scope unless a department scope was explicitly set. Existing user accounts and borrowing history are preserved. Back up `borrowing.db` before deploying an upgrade to a database with valuable data.

## Features

- Email/password login and CSPC-domain borrower registration
- Department-specific equipment catalogue, search, filters, and expected return dates
- Equipment photos, quantity and condition management
- Borrow requests, approvals/rejections, return tracking, and overdue indicators
- Private borrower/admin chat scoped to each department

## Structure

```
middleware/        auth.js (permissions), db.js (schema + migrations), views.js
public/            style.css, app.js, chat.js
routes/            auth.js, borrower.js, admin.js, chat.js
express-server.js  authenticated application entry point
raw-server.js      disabled legacy server
```

## Security notes

This is a prototype. It still needs CSRF protection, rate limiting, password reset/account recovery, and production-grade session storage before a public production launch. Department selection during borrower self-registration is not identity-verified; if borrowers must be restricted to their actual organizational department, connect account creation to an authoritative roster or approval process.

# Equipment Borrowing

Campus equipment borrowing system built with Node.js, Express, and SQLite.

## Run it
```bash
npm install
npm start        # http://localhost:3000
```
Demo accounts: `admin@campus.edu / admin123` and `student@campus.edu / student123`.
Set `SESSION_SECRET` in your environment for anything beyond local demos.
The login page also provides one-click student and admin demo sign-in buttons when `NODE_ENV` is not `production`.

## Google sign-in
Google sign-in is available alongside email/password login once OAuth credentials are configured:

1. Create a Google OAuth 2.0 client ID with application type **Web application** in the Google Cloud Console.
2. Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI (or the value of `GOOGLE_CALLBACK_URL`).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the environment before starting the app. Set `GOOGLE_CALLBACK_URL` if the app runs at a different public URL.

The app requests the user's verified Google email and profile. New Google users are created as borrowers only when their address ends in `@my.cspc.edu.ph`; an existing borrower with the same verified email can use that Google account. Google sign-in cannot access administrator accounts. Credentials are not stored in the repository.

## Features
- **Borrower:** register with an `@my.cspc.edu.ph` email/login, search and filter equipment by category, condition, and availability, view expected return dates for borrowed items, request an item, view/cancel own requests
- **Authentication:** email/password and optional Google account sign-in
- **Admin:** add categories and equipment, edit/delete equipment, approve/reject requests, mark items returned, see overdue loans
- **Access control:** session login, `requireLogin` and `requireRole('admin')` middleware, ownership check on cancel

## Structure
```
middleware/        auth.js (requireLogin / requireRole), db.js (schema + seed), views.js (layout helpers)
public/            style.css
routes/            auth.js, borrower.js, admin.js
express-server.js  main Express app  (npm start)
raw-server.js      plain Node http version (npm run raw)
package.json
```

## Team workflow
Branches `feat/*`, `fix/*`, `docs/*`; conventional commits; PRs need one teammate review; track work on the GitHub issue board.

## Known limitations
No CSRF tokens, no rate limiting, no password reset. Stock is decremented on approval and restored on return.

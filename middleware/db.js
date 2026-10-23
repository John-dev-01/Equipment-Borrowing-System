const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database(path.join(__dirname, '..', 'borrowing.db'));
db.pragma('foreign_keys = ON');

const initialDepartments = require('./departments');
db.exec(`CREATE TABLE IF NOT EXISTS departments (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
const insertDepartment = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
for (const name of initialDepartments) insertDepartment.run(name);

// Departments are first-class records. Keep the existing text department fields
// to make the migration compatible with existing installations and user data.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'borrower' CHECK (role IN ('borrower','admin')),
  department TEXT NOT NULL DEFAULT 'College of Computer Studies',
  admin_scope TEXT NOT NULL DEFAULT 'system' CHECK (admin_scope IN ('system','department'))
);
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  condition TEXT NOT NULL DEFAULT 'Good',
  department TEXT NOT NULL DEFAULT 'College of Computer Studies'
);
CREATE TABLE IF NOT EXISTS categories (name TEXT PRIMARY KEY COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS borrow_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  borrow_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','returned','cancelled')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS google_accounts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  borrower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('borrower', 'admin')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS chat_messages_borrower_id_id_idx ON chat_messages (borrower_id, id);
CREATE INDEX IF NOT EXISTS chat_messages_unread_idx ON chat_messages (borrower_id, sender_role, read_at);
`);

const userColumns = db.pragma('table_info(users)');
if (!userColumns.some(column => column.name === 'department')) {
  db.exec("ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT 'College of Computer Studies'");
}
if (!userColumns.some(column => column.name === 'admin_scope')) {
  db.exec("ALTER TABLE users ADD COLUMN admin_scope TEXT NOT NULL DEFAULT 'system' CHECK (admin_scope IN ('system','department'))");
}
const equipmentColumns = db.pragma('table_info(equipment)');
if (!equipmentColumns.some(column => column.name === 'department')) {
  db.exec("ALTER TABLE equipment ADD COLUMN department TEXT NOT NULL DEFAULT 'College of Computer Studies'");
}
if (!equipmentColumns.some(column => column.name === 'image_url')) {
  db.exec("ALTER TABLE equipment ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
}
db.exec("UPDATE users SET department = 'College of Computer Studies' WHERE department IS NULL OR trim(department) = ''");
db.exec("UPDATE equipment SET department = 'College of Computer Studies' WHERE department IS NULL OR trim(department) = ''");
for (const row of db.prepare('SELECT DISTINCT department FROM users UNION SELECT DISTINCT department FROM equipment').all()) {
  if (row.department && row.department.trim()) insertDepartment.run(row.department.trim());
}
db.exec('CREATE INDEX IF NOT EXISTS equipment_department_idx ON equipment (department, name)');
db.exec('CREATE INDEX IF NOT EXISTS users_department_idx ON users (department, role)');
db.exec(`INSERT OR IGNORE INTO categories (name) SELECT DISTINCT category FROM equipment WHERE trim(category) <> '';`);

// Preserve the prototype's historical inventory adjustments and demo cleanup.
const applyPrototypeInventoryChanges = db.transaction(() => {
  db.prepare("UPDATE equipment SET name = 'Chair' WHERE lower(name) = 'dslr camera'").run();
  const tripod = db.prepare("SELECT id FROM equipment WHERE lower(name) = 'tripod'").all();
  for (const item of tripod) {
    db.prepare('DELETE FROM borrow_requests WHERE equipment_id = ?').run(item.id);
    db.prepare('DELETE FROM equipment WHERE id = ?').run(item.id);
  }
});
applyPrototypeInventoryChanges();

const legacy = db.prepare("SELECT id FROM users WHERE lower(email) IN ('admin@campus.edu','student@campus.edu')").all();
const removeLegacyDemoData = db.transaction(() => {
  for (const user of legacy) {
    db.prepare(`UPDATE equipment SET quantity = quantity + (
      SELECT COUNT(*) FROM borrow_requests WHERE user_id = ? AND equipment_id = equipment.id AND status = 'approved'
    )`).run(user.id);
    db.prepare('DELETE FROM borrow_requests WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
});
removeLegacyDemoData();

db.prepare("UPDATE users SET name = 'CSPC Equipment Administrator' WHERE role = 'admin' AND name = 'CCS Equipment Administrator'").run();

// Existing administrator accounts remain system admins unless their scope was explicitly assigned.
db.prepare("UPDATE users SET admin_scope = 'system' WHERE role = 'admin' AND (admin_scope IS NULL OR trim(admin_scope) = '')").run();

// Optional first system-admin bootstrap, configured only by environment variables.
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || '');
const adminName = String(process.env.ADMIN_NAME || 'CSPC Equipment Administrator').trim();
if (/^[^\s@]+@my\.cspc\.edu\.ph$/.test(adminEmail) && adminPassword.length >= 8) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    db.prepare('INSERT INTO users (name,email,password_hash,role,department,admin_scope) VALUES (?,?,?,?,?,?)')
      .run(adminName || 'CSPC Equipment Administrator', adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin', initialDepartments[0], 'system');
  }
}

// Local development department logins are listed in department-admin-accounts.json.
// Do not create these predictable identities in production deployments.
if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEPARTMENT_ADMINS !== 'false') {
  const demoDepartmentAdmins = require('../department-admin-accounts.json');
  const insertDemoAdmin = db.prepare('INSERT INTO users (name,email,password_hash,role,department,admin_scope) VALUES (?,?,?,?,?,?)');
  for (const account of demoDepartmentAdmins) {
    if (!initialDepartments.includes(account.department)) continue;
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(account.email)) continue;
    if (db.prepare("SELECT 1 FROM users WHERE role='admin' AND admin_scope='department' AND department=?").get(account.department)) continue;
    insertDemoAdmin.run(account.name, account.email, bcrypt.hashSync(account.password, 12), 'admin', account.department, 'department');
  }
}

if (!db.prepare('SELECT 1 FROM equipment LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO equipment (name,category,quantity,condition,department) VALUES (?,?,?,?,?)');
  [['Chair', 'Media', 3, 'Good'], ['Projector', 'Presentation', 2, 'Good'],
   ['Extension Cord', 'Electrical', 10, 'Fair'], ['Laptop', 'Computing', 5, 'Good']]
    .forEach(row => ins.run(...row, initialDepartments[1] || initialDepartments[0]));
  db.exec(`INSERT OR IGNORE INTO categories (name) SELECT DISTINCT category FROM equipment WHERE trim(category) <> '';`);
}

module.exports = db;
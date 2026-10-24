const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../middleware/db');
const { esc, badge, stats } = require('../middleware/views');
const filterDropdown = require('../middleware/filter-dropdown');
const equipmentImage = require('../middleware/equipment-images');
const { requirePermission, isSystemAdmin, requireSystemAdmin } = require('../middleware/auth');
const router = express.Router();
const departmentAdminOnly = (req, res, next) => isSystemAdmin(req.session.user) ? res.redirect('/admin/department-admins') : next();
router.use('/admin/requests', departmentAdminOnly, requirePermission('requests:review'));
router.use('/admin/equipment', departmentAdminOnly, requirePermission('equipment:manage'));
router.use('/admin/categories', departmentAdminOnly, requirePermission('equipment:manage'));
router.use('/admin/department-admins', requireSystemAdmin);
const today = () => new Date().toISOString().slice(0, 10);
const flash = (req, type, msg) => (req.session.flash = { type, msg });
const departments = () => require('../middleware/departments');
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'equipment');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  }}),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|gif|webp|svg\+xml)$/i.test(file.mimetype)),
});
const imageUpload = (req, res, next) => upload.single('image')(req, res, err => {
  if (err) { flash(req, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : 'Upload a valid image file.'); return res.redirect('/admin/equipment'); }
  next();
});
const bulkImageUpload = (req, res, next) => upload.any()(req, res, err => {
  if (err) { flash(req, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : 'Upload valid image files.'); return res.redirect('/admin/equipment'); }
  next();
});

router.get('/admin/department-admins', (req, res) => {
  const rows = departments().map(department => {
    const admin = db.prepare("SELECT name,email FROM users WHERE role='admin' AND admin_scope='department' AND department=? ORDER BY id LIMIT 1").get(department);
    const count = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND admin_scope='department' AND department=?").get(department).n;
    return { department, admin, count };
  });
  const body = `<div class="admin-stock-heading"><div><span class="catalog-kicker">FIXED DEPARTMENT LIST</span><h1>Department accounts</h1></div><span class="catalog-count">${rows.length} departments</span></div>
    <p class="muted">Create one login for each department. Department admins can manage only their assigned department’s equipment, requests, and borrower chats.</p>
    <section class="card"><h2>Create department admin account</h2><form method="post" action="/admin/department-admins" class="inline">
      <label>Full name<input name="name" required maxlength="120"></label><label>CSPC email<input type="email" name="email" required placeholder="name@my.cspc.edu.ph"></label>
      <label>Department<select name="department" required>${departmentOptions(departments(), '')}</select></label><label>Temporary password<input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
      <button>Create account</button></form><p class="field-note">Give the department admin their login details securely.</p></section>
    <h2>Account status</h2><table><thead><tr><th>Department</th><th>Assigned admin account</th><th>Status</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.department)}</td><td>${row.admin ? `${esc(row.admin.name)} · ${esc(row.admin.email)}` : '—'}</td><td>${row.count ? 'Account created' : 'Needs account'}</td></tr>`).join('')}</tbody></table>`;
  res.send(req.app.locals.page(req, 'Department accounts', body));
});

router.post('/admin/department-admins', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const department = String(req.body.department || '').trim();
  if (name.length < 2 || name.length > 120) flash(req, 'error', 'Enter a valid full name.');
  else if (!/^[^\s@]+@my\.cspc\.edu\.ph$/.test(email)) flash(req, 'error', 'Use a @my.cspc.edu.ph email address.');
  else if (password.length < 8) flash(req, 'error', 'Password must be at least 8 characters.');
  else if (!departments().includes(department)) flash(req, 'error', 'Select one of the fixed departments.');
  else if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) flash(req, 'error', 'That email address is already registered.');
  else if (db.prepare("SELECT 1 FROM users WHERE role='admin' AND admin_scope='department' AND department=?").get(department)) flash(req, 'error', 'That department already has an admin account.');
  else {
    db.prepare('INSERT INTO users (name,email,password_hash,role,department,admin_scope) VALUES (?,?,?,?,?,?)')
      .run(name, email, bcrypt.hashSync(password, 12), 'admin', department, 'department');
    flash(req, 'ok', `Admin account created for ${department}.`);
  }
  res.redirect('/admin/department-admins');
});

function requestScope(req) {
  if (!isSystemAdmin(req.session.user)) return { sql: ' WHERE e.department = ?', params: [req.session.user.department], selected: req.session.user.department };
  const requested = typeof req.query.department === 'string' ? req.query.department : '';
  const selected = departments().includes(requested) ? requested : '';
  return selected ? { sql: ' WHERE e.department = ?', params: [selected], selected } : { sql: '', params: [], selected: '' };
}
router.get('/admin/requests', (req, res) => {
  const scope = requestScope(req);
  const rows = db.prepare(`SELECT r.*, e.name AS item, e.department, u.name AS borrower FROM borrow_requests r
    JOIN equipment e ON e.id = r.equipment_id JOIN users u ON u.id = r.user_id${scope.sql}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.id DESC`).all(...scope.params);
  const act = (id, action, label) => `<form method="post" action="/admin/requests/${id}/${action}"><button class="link">${label}</button></form>`;
  const count = predicate => rows.filter(predicate).length;
  const requestFilters = isSystemAdmin(req.session.user) ? `<section class="sidebar-controls" aria-labelledby="request-filter-heading"><div class="sidebar-controls-heading"><h2 id="request-filter-heading">Filters</h2><a href="/admin/requests">Clear</a></div><form class="sidebar-filter-form" method="get" action="/admin/requests">${filterDropdown('department', 'Department', scope.selected, [{ value: '', label: 'All departments' }, ...departments().map(name => ({ value: name, label: name }))])}<button>Apply filters</button></form></section>` : '';
  const body = `<div class="admin-stock-heading"><div><span class="catalog-kicker">${scope.selected ? esc(scope.selected) : 'ALL DEPARTMENTS'}</span><h1>Request queue</h1></div><span class="catalog-count">${rows.length} requests</span></div>${stats([['Total requests', rows.length, true], ['Pending', count(r => r.status === 'pending')], ['On loan', count(r => r.status === 'approved')], ['Overdue', count(r => r.status === 'approved' && r.due_date < today())]])}${rows.length ? `<table class="request-table"><thead><tr><th>Borrower</th><th>Department</th><th>Item</th><th>Dates</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.borrower)}</td><td>${esc(r.department)}</td><td>${esc(r.item)}</td><td>${r.borrow_date} → ${r.due_date}</td><td>${esc(r.purpose)}</td><td>${badge(r.status)}${r.status === 'approved' && r.due_date < today() ? ' <span class="badge rejected">overdue</span>' : ''}</td><td class="acts">${r.status === 'pending' ? act(r.id, 'approve', 'Approve') + act(r.id, 'reject', 'Reject') : ''}${r.status === 'approved' ? act(r.id, 'return', 'Mark returned') : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No requests yet.</p>'}`;
  res.send(req.app.locals.page(req, 'Request queue', body, { sidebarControls: requestFilters }));
});

const findRequest = (id, req) => isSystemAdmin(req.session.user)
  ? db.prepare('SELECT r.* FROM borrow_requests r JOIN equipment e ON e.id = r.equipment_id WHERE r.id = ?').get(id)
  : db.prepare('SELECT r.* FROM borrow_requests r JOIN equipment e ON e.id = r.equipment_id WHERE r.id = ? AND e.department = ?').get(id, req.session.user.department);
const approve = db.transaction((id, user) => {
  const r = isSystemAdmin(user)
    ? db.prepare("SELECT r.* FROM borrow_requests r JOIN equipment e ON e.id=r.equipment_id WHERE r.id=? AND r.status='pending'").get(id)
    : db.prepare("SELECT r.* FROM borrow_requests r JOIN equipment e ON e.id=r.equipment_id WHERE r.id=? AND r.status='pending' AND e.department=?").get(id, user.department);
  if (!r) return 'This request is no longer pending or is outside your department.';
  const dec = db.prepare('UPDATE equipment SET quantity = quantity - 1 WHERE id = ? AND quantity > 0').run(r.equipment_id);
  if (!dec.changes) return 'Cannot approve: no stock left for this item.';
  db.prepare("UPDATE borrow_requests SET status='approved' WHERE id = ?").run(id);
});
const giveBack = db.transaction((id, user) => {
  const r = isSystemAdmin(user)
    ? db.prepare("SELECT r.* FROM borrow_requests r JOIN equipment e ON e.id=r.equipment_id WHERE r.id=? AND r.status='approved'").get(id)
    : db.prepare("SELECT r.* FROM borrow_requests r JOIN equipment e ON e.id=r.equipment_id WHERE r.id=? AND r.status='approved' AND e.department=?").get(id, user.department);
  if (!r) return 'This request is not currently on loan or is outside your department.';
  db.prepare('UPDATE equipment SET quantity = quantity + 1 WHERE id = ?').run(r.equipment_id);
  db.prepare("UPDATE borrow_requests SET status='returned' WHERE id = ?").run(id);
});
router.post('/admin/requests/:id/approve', (req, res) => { const error = approve(req.params.id, req.session.user); flash(req, error ? 'error' : 'ok', error || 'Request approved. Stock updated.'); res.redirect('/admin/requests'); });
router.post('/admin/requests/:id/reject', (req, res) => {
  const r = findRequest(req.params.id, req);
  const changed = r ? db.prepare("UPDATE borrow_requests SET status='rejected' WHERE id = ? AND status='pending'").run(req.params.id) : { changes: 0 };
  flash(req, changed.changes ? 'ok' : 'error', changed.changes ? 'Request rejected.' : 'This request is no longer pending or is outside your department.');
  res.redirect('/admin/requests');
});
router.post('/admin/requests/:id/return', (req, res) => { const error = giveBack(req.params.id, req.session.user); flash(req, error ? 'error' : 'ok', error || 'Item returned. Stock updated.'); res.redirect('/admin/requests'); });

const categoryOptions = (categories, selected) => categories.map(c => `<option value="${esc(c.name)}"${selected === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
const conditionOptions = selected => ['Good', 'Fair', 'Needs repair'].map(c => `<option${selected === c ? ' selected' : ''}>${c}</option>`).join('');
const departmentOptions = (list, selected) => list.map(name => `<option value="${esc(name)}"${selected === name ? ' selected' : ''}>${esc(name)}</option>`).join('');
const equipForm = (e = {}, action = '/admin/equipment', label = 'Add item', categories = [], departmentList = [], className = 'inline', canChooseDepartment = false) => `<form method="post" action="${action}" enctype="multipart/form-data" class="${className}">
<input name="name" placeholder="Name" required value="${esc(e.name)}"><select name="category" required aria-label="Category">${categoryOptions(categories, e.category)}</select>
${canChooseDepartment ? `<select name="department" required aria-label="Department">${departmentOptions(departmentList, e.department)}</select>` : ''}
<input type="number" name="quantity" min="0" required value="${esc(e.quantity ?? 1)}" style="width:5rem"><select name="condition">${conditionOptions(e.condition)}</select>
<label class="image-upload-field">Image<input type="file" name="image" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"><small>Upload JPG, PNG, GIF, SVG, or WebP images up to 5 MB${e.image_url ? ' or keep the current image below.' : '.'}</small></label>
<input name="image_url" placeholder="Image URL (optional)" aria-label="Image URL" value="${esc(e.image_url)}"><button>${label}</button></form>`;

function adminFilters(categories, query, deptList, isSystem) {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const category = typeof query.category === 'string' ? query.category : '';
  const condition = typeof query.condition === 'string' ? query.condition : '';
  const availability = typeof query.availability === 'string' ? query.availability : '';
  const chosenDepartment = typeof query.department === 'string' && deptList.includes(query.department) ? query.department : '';
  return `<section class="sidebar-controls" aria-labelledby="filter-heading"><div class="sidebar-controls-heading"><h2 id="filter-heading">Filters</h2><a href="/admin/equipment">Clear</a></div><form class="sidebar-filter-form" method="get" action="/admin/equipment">
<label>Search<input name="q" aria-label="Search equipment" placeholder="Name or category" value="${esc(q)}"></label>${filterDropdown('category', 'Category', category, [{ value: '', label: 'All categories' }, ...categories.map(({ name }) => ({ value: name, label: name }))])}
${isSystem ? filterDropdown('department', 'Department', chosenDepartment, [{ value: '', label: 'All departments' }, ...deptList.map(name => ({ value: name, label: name }))]) : ''}
${filterDropdown('condition', 'Condition', condition, [{ value: '', label: 'All conditions' }, ...['Good', 'Fair', 'Needs repair'].map(value => ({ value, label: value }))])}${filterDropdown('availability', 'Availability', availability, [{ value: '', label: 'All availability' }, { value: 'available', label: 'Available' }, { value: 'unavailable', label: 'Unavailable' }])}<button>Apply filters</button></form></section>`;
}
function equipmentScope(req, requestedDepartment = '') {
  if (!isSystemAdmin(req.session.user)) return req.session.user.department;
  return departments().includes(requestedDepartment) ? requestedDepartment : '';
}
router.get('/admin/equipment', (req, res) => {
  const deptList = departments();
  const systemAdmin = isSystemAdmin(req.session.user);
  const dept = equipmentScope(req, typeof req.query.department === 'string' ? req.query.department : '');
  const categories = db.prepare('SELECT name FROM categories ORDER BY name COLLATE NOCASE').all();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = categories.some(c => c.name === req.query.category) ? req.query.category : '';
  const condition = ['Good', 'Fair', 'Needs repair'].includes(req.query.condition) ? req.query.condition : '';
  const availability = ['available', 'unavailable'].includes(req.query.availability) ? req.query.availability : '';
  const filters = [], params = [];
  if (dept) { filters.push('department = ?'); params.push(dept); }
  if (q) { filters.push('(name LIKE ? OR category LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (category) { filters.push('category = ?'); params.push(category); }
  if (condition) { filters.push('condition = ?'); params.push(condition); }
  if (availability === 'available') filters.push('quantity > 0');
  if (availability === 'unavailable') filters.push('quantity = 0');
  const rows = db.prepare(`SELECT * FROM equipment${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''} ORDER BY name`).all(...params);
  const cards = rows.map(e => `<article class="admin-equipment-card"><div class="equipment-card-image"><img src="${esc(equipmentImage(e))}" alt="${esc(e.name)}" loading="lazy"></div><div class="admin-equipment-editor"><div class="admin-item-fields">
    <label>Name<input name="item_${e.id}_name" required value="${esc(e.name)}"></label><label>Category<select name="item_${e.id}_category" required>${categoryOptions(categories, e.category)}</select></label>
    <label>Quantity<input type="number" name="item_${e.id}_quantity" min="0" required value="${esc(e.quantity)}"></label><label>Condition<select name="item_${e.id}_condition">${conditionOptions(e.condition)}</select></label>
    <label>Department<input value="${esc(e.department)}" disabled></label><label class="image-upload-field">Replace image<input type="file" name="item_${e.id}_image" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"><small>Leave empty to keep the current image.</small></label>
    <label>Image URL<input name="item_${e.id}_image_url" value="${esc(e.image_url)}"></label></div><button class="link admin-delete-button" type="submit" formmethod="post" formaction="/admin/equipment/${e.id}/delete">Delete item</button></div></article>`).join('');
  const deptLabel = dept || 'All departments';
  const body = `<div class="admin-stock-heading"><div><span class="catalog-kicker">${esc(deptLabel)}</span><h1>Manage stock</h1></div><span class="catalog-count">${rows.length} ${rows.length === 1 ? 'item' : 'items'}</span></div>
    <div class="admin-items-toolbar"><h2>Items</h2><div class="admin-items-actions"><button type="button" data-open-add-item>Add Item</button>${rows.length ? '<button type="submit" form="bulk-equipment-form">Save changes</button>' : ''}</div></div>
    ${rows.length ? `<form id="bulk-equipment-form" method="post" action="/admin/equipment/bulk" enctype="multipart/form-data"><input type="hidden" name="department" value="${esc(dept)}"><section class="admin-equipment-grid" aria-label="Edit equipment">${cards}</section></form>` : '<p class="muted">No equipment matches these filters.</p>'}
    <dialog class="admin-add-dialog" data-add-item-dialog aria-labelledby="add-item-dialog-title"><div class="admin-add-dialog-content"><div class="admin-add-dialog-heading"><div><span class="catalog-kicker">${esc(deptLabel)}</span><h2 id="add-item-dialog-title">Add Item</h2></div><button type="button" class="admin-add-dialog-close" data-close-add-item aria-label="Close add item dialog" title="Close">×</button></div>${equipForm({ department: dept || deptList[0] }, '/admin/equipment', 'Add Item', categories, deptList, 'admin-item-form', systemAdmin)}</div></dialog>`;
  res.send(req.app.locals.page(req, 'Manage stock', body, { sidebarControls: adminFilters(categories, req.query, deptList, systemAdmin) }));
});

function validImageUrl(imageUrl) { return !imageUrl || (imageUrl.length <= 2048 && ((imageUrl.startsWith('/') && !imageUrl.startsWith('//')) || /^https?:\/\//i.test(imageUrl))); }
function clean(body, file, department, existingImage = '') {
  const quantity = Number(body.quantity);
  const imageUrl = file ? `/uploads/equipment/${file.filename}` : (typeof body.image_url === 'string' ? body.image_url.trim() : existingImage);
  if (typeof body.name !== 'string' || !body.name.trim() || typeof body.category !== 'string' || !db.prepare('SELECT 1 FROM categories WHERE name = ?').get(body.category.trim()) ||
      !Number.isInteger(quantity) || quantity < 0 || !departments().includes(department) || !validImageUrl(imageUrl)) return null;
  return [body.name.trim(), body.category.trim(), quantity, ['Good', 'Fair', 'Needs repair'].includes(body.condition) ? body.condition : 'Good', imageUrl];
}
const BAD = 'Enter a valid name, category, whole-number quantity, condition, department, and local path or HTTP(S) image URL.';
router.post('/admin/categories', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 80) flash(req, 'error', 'Enter a category name of 1 to 80 characters.');
  else { const result = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name); flash(req, result.changes ? 'ok' : 'error', result.changes ? 'Category added.' : 'That category already exists.'); }
  res.redirect('/admin/equipment');
});
router.post('/admin/equipment', imageUpload, (req, res) => {
  const systemAdmin = isSystemAdmin(req.session.user);
  const department = systemAdmin ? String(req.body.department || '').trim() : req.session.user.department;
  const values = clean(req.body, req.file, department);
  if (!values) flash(req, 'error', BAD);
  else { db.prepare('INSERT INTO equipment (name,category,quantity,condition,image_url,department) VALUES (?,?,?,?,?,?)').run(...values, department); flash(req, 'ok', `Item added to ${department}.`); }
  res.redirect('/admin/equipment');
});
router.post('/admin/equipment/bulk', bulkImageUpload, (req, res) => {
  const systemAdmin = isSystemAdmin(req.session.user);
  const selectedDepartment = systemAdmin ? equipmentScope(req, String(req.body.department || '')) : req.session.user.department;
  const rows = selectedDepartment
    ? db.prepare('SELECT * FROM equipment WHERE department = ? ORDER BY name').all(selectedDepartment)
    : db.prepare('SELECT * FROM equipment ORDER BY name').all();
  const files = new Map((req.files || []).map(file => [file.fieldname, file]));
  try {
    db.transaction(() => {
      for (const row of rows) {
        const prefix = `item_${row.id}_`;
        const fields = { name: req.body[`${prefix}name`], category: req.body[`${prefix}category`], quantity: req.body[`${prefix}quantity`], condition: req.body[`${prefix}condition`], image_url: req.body[`${prefix}image_url`] };
        const values = clean(fields, files.get(`${prefix}image`), row.department, row.image_url);
        if (!values) throw new Error(`Invalid fields for ${row.name}.`);
        db.prepare('UPDATE equipment SET name=?,category=?,quantity=?,condition=?,image_url=? WHERE id=? AND department=?').run(...values, row.id, row.department);
      }
    })();
    flash(req, 'ok', 'Equipment changes saved.');
  } catch (error) { flash(req, 'error', error.message || BAD); }
  res.redirect('/admin/equipment');
});
router.post('/admin/equipment/:id/delete', (req, res) => {
  const result = isSystemAdmin(req.session.user)
    ? db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id)
    : db.prepare('DELETE FROM equipment WHERE id = ? AND department = ?').run(req.params.id, req.session.user.department);
  if (result.changes) flash(req, 'ok', 'Item deleted.');
  else flash(req, 'error', 'Item not found in your department.');
  res.redirect('/admin/equipment');
});
module.exports = router;

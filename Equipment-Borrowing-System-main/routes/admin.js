const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../middleware/db');
const { esc, badge, stats } = require('../middleware/views');
const equipmentImage = require('../middleware/equipment-images');
const { requirePermission } = require('../middleware/auth');
const router = express.Router();
router.use('/admin/requests', requirePermission('requests:review'));
router.use('/admin/equipment', requirePermission('equipment:manage'));
router.use('/admin/categories', requirePermission('equipment:manage'));
const today = () => new Date().toISOString().slice(0, 10);
const flash = (req, type, msg) => (req.session.flash = { type, msg });
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'equipment');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|gif|webp|svg\+xml)$/i.test(file.mimetype)),
});
const imageUpload = (req, res, next) => upload.single('image')(req, res, err => {
  if (err) {
    flash(req, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : 'Upload a valid image file.');
    return res.redirect('/admin/equipment');
  }
  next();
});
const bulkImageUpload = (req, res, next) => upload.any()(req, res, err => {
  if (err) {
    flash(req, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : 'Upload valid image files.');
    return res.redirect('/admin/equipment');
  }
  next();
});

router.get('/admin/requests', (req, res) => {
  const rows = db.prepare(`SELECT r.*, e.name AS item, u.name AS borrower FROM borrow_requests r
    JOIN equipment e ON e.id = r.equipment_id JOIN users u ON u.id = r.user_id
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.id DESC`).all();
  const act = (id, a, label) => `<form method="post" action="/admin/requests/${id}/${a}"><button class="link">${label}</button></form>`;
  const count = f => rows.filter(f).length;
  const body = `<h1>Request queue</h1>${stats([['Total requests', rows.length, true], ['Pending', count(r => r.status === 'pending')], ['On loan', count(r => r.status === 'approved')], ['Overdue', count(r => r.status === 'approved' && r.due_date < today())]])}${rows.length ? `<table class="request-table"><thead><tr><th>Borrower</th><th>Item</th><th>Dates</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${esc(r.borrower)}</td><td>${esc(r.item)}</td><td>${r.borrow_date} → ${r.due_date}</td><td>${esc(r.purpose)}</td>
<td>${badge(r.status)}${r.status === 'approved' && r.due_date < today() ? ' <span class="badge rejected">overdue</span>' : ''}</td>
<td class="acts">${r.status === 'pending' ? act(r.id, 'approve', 'Approve') + act(r.id, 'reject', 'Reject') : ''}${r.status === 'approved' ? act(r.id, 'return', 'Mark returned') : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">No requests yet.</p>'}`;
  res.send(req.app.locals.page(req, 'Request queue', body));
});

const approve = db.transaction(id => {
  const r = db.prepare("SELECT * FROM borrow_requests WHERE id = ? AND status='pending'").get(id);
  if (!r) return 'This request is no longer pending.';
  const dec = db.prepare('UPDATE equipment SET quantity = quantity - 1 WHERE id = ? AND quantity > 0').run(r.equipment_id);
  if (!dec.changes) return 'Cannot approve: no stock left for this item.';
  db.prepare("UPDATE borrow_requests SET status='approved' WHERE id = ?").run(id);
});
const giveBack = db.transaction(id => {
  const r = db.prepare("SELECT * FROM borrow_requests WHERE id = ? AND status='approved'").get(id);
  if (!r) return 'This request is not currently on loan.';
  db.prepare('UPDATE equipment SET quantity = quantity + 1 WHERE id = ?').run(r.equipment_id);
  db.prepare("UPDATE borrow_requests SET status='returned' WHERE id = ?").run(id);
});

router.post('/admin/requests/:id/approve', (req, res) => {
  const err = approve(req.params.id); err ? flash(req, 'error', err) : flash(req, 'ok', 'Request approved. Stock updated.');
  res.redirect('/admin/requests');
});
router.post('/admin/requests/:id/reject', (req, res) => {
  const r = db.prepare("UPDATE borrow_requests SET status='rejected' WHERE id = ? AND status='pending'").run(req.params.id);
  r.changes ? flash(req, 'ok', 'Request rejected.') : flash(req, 'error', 'This request is no longer pending.');
  res.redirect('/admin/requests');
});
router.post('/admin/requests/:id/return', (req, res) => {
  const err = giveBack(req.params.id); err ? flash(req, 'error', err) : flash(req, 'ok', 'Item returned. Stock updated.');
  res.redirect('/admin/requests');
});

const categoryOptions = (categories, selected) => categories.map(c =>
  `<option value="${esc(c.name)}"${selected === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
const conditionOptions = selected => ['Good', 'Fair', 'Needs repair'].map(c =>
  `<option${selected === c ? ' selected' : ''}>${c}</option>`).join('');
const equipForm = (e = {}, action = '/admin/equipment', label = 'Add item', categories = [], className = 'inline') => `<form method="post" action="${action}" enctype="multipart/form-data" class="${className}">
<input name="name" placeholder="Name" required value="${esc(e.name)}">
<select name="category" required aria-label="Category">${categoryOptions(categories, e.category)}</select>
<input type="number" name="quantity" min="0" required value="${esc(e.quantity ?? 1)}" style="width:5rem">
<select name="condition">${conditionOptions(e.condition)}</select>
<label class="image-upload-field">Image<input type="file" name="image" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"><small>Upload JPG, PNG, GIF, SVG, or WebP images up to 5 MB${e.image_url ? ' or keep the current image below.' : '.'}</small></label>
<input name="image_url" placeholder="Image URL (optional)" aria-label="Image URL" value="${esc(e.image_url)}">
<button>${label}</button></form>`;

const adminFilters = (categories, query = {}) => {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const category = typeof query.category === 'string' ? query.category : '';
  const condition = typeof query.condition === 'string' ? query.condition : '';
  const availability = typeof query.availability === 'string' ? query.availability : '';
  const option = (value, label, selected) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`;
  return `<section class="sidebar-controls" aria-labelledby="filter-heading">
<div class="sidebar-controls-heading"><h2 id="filter-heading">Filters</h2><a href="/admin/equipment">Clear</a></div>
<form class="sidebar-filter-form" method="get" action="/admin/equipment">
<label>Search<input name="q" aria-label="Search equipment" placeholder="Name or category" value="${esc(q)}"></label>
<label>Category<select name="category" aria-label="Filter by category">${option('', 'All categories', category)}${categories.map(c => option(esc(c.name), esc(c.name), category)).join('')}</select></label>
<label>Condition<select name="condition" aria-label="Filter by condition">${option('', 'All conditions', condition)}${['Good', 'Fair', 'Needs repair'].map(c => option(c, c, condition)).join('')}</select></label>
<label>Availability<select name="availability" aria-label="Filter by availability">${option('', 'All availability', availability)}${option('available', 'Available', availability)}${option('unavailable', 'Unavailable', availability)}</select></label>
<button>Apply filters</button>
</form></section>`;
};

router.get('/admin/equipment', (req, res) => {
  const categories = db.prepare('SELECT name FROM categories ORDER BY name COLLATE NOCASE').all();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = categories.some(c => c.name === req.query.category) ? req.query.category : '';
  const condition = ['Good', 'Fair', 'Needs repair'].includes(req.query.condition) ? req.query.condition : '';
  const availability = ['available', 'unavailable'].includes(req.query.availability) ? req.query.availability : '';
  const filters = [];
  const params = [];
  if (q) { filters.push('(name LIKE ? OR category LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (category) { filters.push('category = ?'); params.push(category); }
  if (condition) { filters.push('condition = ?'); params.push(condition); }
  if (availability === 'available') filters.push('quantity > 0');
  if (availability === 'unavailable') filters.push('quantity = 0');
  const rows = db.prepare(`SELECT * FROM equipment${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''} ORDER BY name`).all(...params);
  const cards = rows.map(e => `<article class="admin-equipment-card">
  <div class="equipment-card-image"><img src="${esc(equipmentImage(e))}" alt="${esc(e.name)}" loading="lazy"></div>
  <div class="admin-equipment-editor">
    <div class="admin-item-fields">
      <label>Name<input name="item_${e.id}_name" placeholder="Name" required value="${esc(e.name)}"></label>
      <label>Category<select name="item_${e.id}_category" required>${categoryOptions(categories, e.category)}</select></label>
      <label>Quantity<input type="number" name="item_${e.id}_quantity" min="0" required value="${esc(e.quantity)}"></label>
      <label>Condition<select name="item_${e.id}_condition">${conditionOptions(e.condition)}</select></label>
      <label class="image-upload-field">Replace image<input type="file" name="item_${e.id}_image" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"><small>Leave empty to keep the current image.</small></label>
      <label>Image URL<input name="item_${e.id}_image_url" placeholder="Image URL (optional)" value="${esc(e.image_url)}"></label>
    </div>
    <button class="link admin-delete-button" type="submit" formmethod="post" formaction="/admin/equipment/${e.id}/delete">Delete item</button>
  </div>
</article>`).join('');
  const body = `<div class="admin-stock-heading"><div><span class="catalog-kicker">CSPC / RESOURCE LIBRARY</span><h1>Manage stock</h1></div><span class="catalog-count">${rows.length} ${rows.length === 1 ? 'item' : 'items'}</span></div>
<section><h2>Add item</h2><div class="card">${equipForm({}, '/admin/equipment', 'Add item', categories)}</div></section>
<div class="admin-items-toolbar"><h2>Items</h2>${rows.length ? '<button type="submit" form="bulk-equipment-form">Save changes</button>' : ''}</div>
${rows.length ? `<form id="bulk-equipment-form" method="post" action="/admin/equipment/bulk" enctype="multipart/form-data"><section class="admin-equipment-grid" aria-label="Edit equipment">${cards}</section></form>` : '<p class="muted">No equipment matches these filters.</p>'}`;
  res.send(req.app.locals.page(req, 'Manage stock', body, { sidebarControls: adminFilters(categories, req.query) }));
});

// hello world

function validImageUrl(imageUrl) {
  if (!imageUrl) return true;
  if (/^data:image\/(jpeg|png|gif|webp|svg\+xml);base64,/i.test(imageUrl)) return imageUrl.length <= 8 * 1024 * 1024;
  return imageUrl.length <= 2048 && ((imageUrl.startsWith('/') && !imageUrl.startsWith('//')) || /^https?:\/\//i.test(imageUrl));
}
function clean(b, file, existingImage = '') {
  const q = Number(b.quantity);
  const imageUrl = file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : (typeof b.image_url === 'string' ? b.image_url.trim() : existingImage);
  if (typeof b.name !== 'string' || !b.name.trim() ||
      typeof b.category !== 'string' || !db.prepare('SELECT 1 FROM categories WHERE name = ?').get(b.category.trim()) ||
      !Number.isInteger(q) || q < 0 || !validImageUrl(imageUrl)) return null;
  return [b.name.trim(), b.category.trim(), q, ['Good', 'Fair', 'Needs repair'].includes(b.condition) ? b.condition : 'Good', imageUrl];
}
const BAD = 'Enter valid names, categories, whole-number quantities, conditions, and local path or HTTP(S) image URLs.';
router.post('/admin/categories', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 80) flash(req, 'error', 'Enter a category name of 1 to 80 characters.');
  else {
    const result = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
    flash(req, result.changes ? 'ok' : 'error', result.changes ? 'Category added.' : 'That category already exists.');
  }
  res.redirect('/admin/equipment');
});
router.post('/admin/equipment', imageUpload, (req, res) => {
  const v = clean(req.body, req.file);
  if (!v) flash(req, 'error', BAD);
  else { db.prepare('INSERT INTO equipment (name,category,quantity,condition,image_url) VALUES (?,?,?,?,?)').run(...v); flash(req, 'ok', 'Item added.'); }
  res.redirect('/admin/equipment');
});
router.post('/admin/equipment/bulk', bulkImageUpload, (req, res) => {
  const rows = db.prepare('SELECT * FROM equipment ORDER BY name').all();
  const files = new Map((req.files || []).map(file => [file.fieldname, file]));
  try {
    db.transaction(() => {
      for (const row of rows) {
        const prefix = `item_${row.id}_`;
        const fields = {
          name: req.body[`${prefix}name`],
          category: req.body[`${prefix}category`],
          quantity: req.body[`${prefix}quantity`],
          condition: req.body[`${prefix}condition`],
          image_url: req.body[`${prefix}image_url`],
        };
        const v = clean(fields, files.get(`${prefix}image`), row.image_url);
        if (!v) throw new Error(`Invalid fields for ${row.name}.`);
        db.prepare('UPDATE equipment SET name=?,category=?,quantity=?,condition=?,image_url=? WHERE id=?').run(...v, row.id);
      }
    })();
    flash(req, 'ok', 'All equipment changes saved.');
  } catch (error) {
    flash(req, 'error', error.message || BAD);
  }
  res.redirect('/admin/equipment');
});
router.post('/admin/equipment/:id/delete', (req, res) => {
  try { db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id); flash(req, 'ok', 'Item deleted.'); }
  catch { flash(req, 'error', 'Cannot delete an item that has borrow history. Set its quantity to 0 instead.'); }
  res.redirect('/admin/equipment');
});
module.exports = router;

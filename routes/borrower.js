const express = require('express');
const db = require('../middleware/db');
const { esc, badge } = require('../middleware/views');
const filterDropdown = require('../middleware/filter-dropdown');
const equipmentImage = require('../middleware/equipment-images');
const { isSystemAdmin, requirePermission } = require('../middleware/auth');
const router = express.Router();
const guard = requirePermission('equipment:read');
const systemAdminOnlyDepartmentAccounts = (req, res, next) => isSystemAdmin(req.session.user)
  ? res.redirect('/admin/department-admins')
  : next();
router.use(['/equipment', '/requests', '/my-requests'], systemAdminOnlyDepartmentAccounts);
const today = () => new Date().toISOString().slice(0, 10);

router.get('/equipment', guard, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const categories = db.prepare('SELECT DISTINCT category FROM equipment WHERE department = ? ORDER BY category').all(req.session.user.department)
    .map(row => row.category);
  const category = typeof req.query.category === 'string' && categories.includes(req.query.category)
    ? req.query.category
    : '';
  const conditions = ['Good', 'Fair', 'Needs repair'];
  const condition = typeof req.query.condition === 'string' && conditions.includes(req.query.condition)
    ? req.query.condition
    : '';
  const availability = ['available', 'unavailable'].includes(req.query.availability)
    ? req.query.availability
    : '';
  const filters = ['department = ?'];
  const params = [req.session.user.department];
  if (q) {
    filters.push('(name LIKE ? OR category LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    filters.push('category = ?');
    params.push(category);
  }
  if (condition) {
    filters.push('condition = ?');
    params.push(condition);
  }
  if (availability === 'available') filters.push('quantity > 0');
  if (availability === 'unavailable') filters.push('quantity = 0');
  const rows = db.prepare(`SELECT * FROM equipment${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''} ORDER BY name`)
    .all(...params);
  const loansByEquipment = new Map();
  for (const loan of db.prepare(`SELECT r.equipment_id, r.due_date, COUNT(*) AS copies
    FROM borrow_requests r JOIN equipment e ON e.id = r.equipment_id
    WHERE r.status = 'approved' AND e.department = ?
    GROUP BY r.equipment_id, r.due_date ORDER BY r.due_date`).all(req.session.user.department)) {
    if (!loansByEquipment.has(loan.equipment_id)) loansByEquipment.set(loan.equipment_id, []);
    loansByEquipment.get(loan.equipment_id).push(loan);
  }
  const sidebarControls = `<section class="sidebar-controls" aria-labelledby="filter-heading">
<div class="sidebar-controls-heading"><h2 id="filter-heading">Filters</h2><a href="/equipment">Clear</a></div>
<form class="sidebar-filter-form" method="get" action="/equipment">
<label>Search<input name="q" aria-label="Search equipment" placeholder="Name or category" value="${esc(q)}"></label>
${filterDropdown('category', 'Category', category, [{ value: '', label: 'All categories' }, ...categories.map(value => ({ value, label: value }))])}
${filterDropdown('condition', 'Condition', condition, [{ value: '', label: 'All conditions' }, ...conditions.map(value => ({ value, label: value }))])}
${filterDropdown('availability', 'Availability', availability, [{ value: '', label: 'All availability' }, { value: 'available', label: 'Available' }, { value: 'unavailable', label: 'Unavailable' }])}
<button>Apply filters</button>
</form></section>`;
  const body = `<div class="catalog-heading"><div><span class="catalog-kicker">CSPC / RESOURCE LIBRARY</span><h1>Equipment</h1></div><span class="catalog-count">${rows.length} ${rows.length === 1 ? 'item' : 'items'}</span></div>
${rows.length ? `<section class="equipment-grid" aria-label="Equipment items">
${rows.map(e => `<article class="equipment-card">
  <div class="equipment-card-image"><img src="${esc(equipmentImage(e))}" alt="${esc(e.name)}" loading="lazy"></div>
  <div class="equipment-card-body">
    <div class="equipment-card-meta"><span>${esc(e.category)}</span><span>${esc(e.condition)}</span></div>
    <h2>${esc(e.name)}</h2>
    <div class="equipment-card-stock"><span>Available</span><strong>${e.quantity > 0 ? e.quantity : 'Out of stock'}</strong></div>
    ${(loansByEquipment.get(e.id) || []).length ? `<details class="return-dates"><summary>Expected return dates</summary><ul>${loansByEquipment.get(e.id).map(loan =>
      `<li><time datetime="${esc(loan.due_date)}">${esc(loan.due_date)}</time>${loan.copies > 1 ? ` (${loan.copies} copies)` : ''}</li>`
    ).join('')}</ul></details>` : ''}
    ${e.quantity > 0 ? `<a class="btn equipment-request" href="/equipment/${e.id}/borrow">Request item</a>` : '<span class="equipment-unavailable">Currently unavailable</span>'}
  </div>
</article>`).join('')}</section>`
    : '<p class="muted">No equipment matches these filters. Try changing or clearing them.</p>'}`;
  res.send(req.app.locals.page(req, 'Equipment', body, { sidebarControls }));
});

const borrowForm = (e, error = '', v = {}) => `<h1>Request ${esc(e.name)}</h1>
${error ? `<p class="flash error">${esc(error)}</p>` : ''}
<form method="post" action="/requests" class="card"><input type="hidden" name="equipment_id" value="${e.id}">
<label>Borrow date<input type="date" name="borrow_date" min="${today()}" required value="${esc(v.borrow_date)}"></label>
<label>Return by<input type="date" name="due_date" min="${today()}" required value="${esc(v.due_date)}"></label>
<label>Purpose<textarea name="purpose" required maxlength="300">${esc(v.purpose)}</textarea></label>
<button>Send request</button></form>`;

router.get('/equipment/:id/borrow', guard, (req, res) => {
  const e = db.prepare('SELECT * FROM equipment WHERE id = ? AND department = ?').get(req.params.id, req.session.user.department);
  if (!e) return res.status(404).send(req.app.locals.page(req, 'Not found', '<h1>Item not found</h1>'));
  res.send(req.app.locals.page(req, 'Request', borrowForm(e)));
});

router.post('/requests', guard, (req, res) => {
  const { equipment_id, borrow_date = '', due_date = '', purpose = '' } = req.body;
  const e = db.prepare('SELECT * FROM equipment WHERE id = ? AND department = ?').get(equipment_id, req.session.user.department);
  if (!e) return res.status(404).send(req.app.locals.page(req, 'Not found', '<h1>Item not found</h1>'));
  const fail = m => res.status(400).send(req.app.locals.page(req, 'Request', borrowForm(e, m, req.body)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(borrow_date) || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return fail('Enter valid dates.');
  if (borrow_date < today()) return fail('Borrow date cannot be in the past.');
  if (due_date < borrow_date) return fail('Return date must be on or after the borrow date.');
  if (!purpose.trim()) return fail('Tell us what the equipment is for.');
  if (e.quantity < 1) return fail('This item is currently out of stock.');
  db.prepare('INSERT INTO borrow_requests (user_id,equipment_id,borrow_date,due_date,purpose) VALUES (?,?,?,?,?)')
    .run(req.session.user.id, e.id, borrow_date, due_date, purpose.trim());
  req.session.flash = { type: 'ok', msg: 'Request sent. The custodian will review it.' };
  res.redirect('/my-requests');
});

router.get('/my-requests', guard, (req, res) => {
  const rows = db.prepare(`SELECT r.*, e.name FROM borrow_requests r JOIN equipment e ON e.id = r.equipment_id
    WHERE r.user_id = ? ORDER BY r.id DESC`).all(req.session.user.id);
  const body = `<h1>My requests</h1>${rows.length ? `<table><thead><tr><th>Item</th><th>Borrow</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.borrow_date}</td><td>${r.due_date}</td>
<td>${badge(r.status)}${r.status === 'approved' && r.due_date < today() ? ' <span class="badge rejected">overdue</span>' : ''}</td>
<td>${r.status === 'pending' ? `<form method="post" action="/requests/${r.id}/cancel"><button class="link">Cancel</button></form>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">You have no requests yet. <a href="/equipment">Browse equipment</a> to start one.</p>'}`;
  res.send(req.app.locals.page(req, 'My requests', body));
});

router.post('/requests/:id/cancel', guard, (req, res) => {
  // user_id check prevents cancelling someone else's request
  const r = db.prepare("UPDATE borrow_requests SET status='cancelled' WHERE id = ? AND user_id = ? AND status='pending'")
    .run(req.params.id, req.session.user.id);
  req.session.flash = r.changes ? { type: 'ok', msg: 'Request cancelled.' } : { type: 'error', msg: 'That request cannot be cancelled.' };
  res.redirect('/my-requests');
});
module.exports = router;

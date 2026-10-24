const express = require('express');
const db = require('../middleware/db');
const { isSystemAdmin } = require('../middleware/auth');
const { esc } = require('../middleware/views');
const departments = require('../middleware/departments');
const router = express.Router();

const MESSAGE_LIMIT = 2000;
const borrowerById = db.prepare("SELECT id, name, email, department FROM users WHERE id = ? AND role = 'borrower'");
const messageById = db.prepare(`SELECT m.id, m.borrower_id, m.sender_id, m.sender_role, m.body, m.created_at,
  u.name AS sender_name FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`);
const messagesFor = db.prepare(`SELECT m.id, m.borrower_id, m.sender_id, m.sender_role, m.body, m.created_at,
  u.name AS sender_name FROM chat_messages m JOIN users u ON u.id = m.sender_id
  WHERE m.borrower_id = ? ORDER BY m.id DESC LIMIT 300`);
const insertMessage = db.prepare(`INSERT INTO chat_messages (borrower_id, sender_id, sender_role, body)
  VALUES (?, ?, ?, ?)`);
const markAdminMessagesRead = db.prepare(`UPDATE chat_messages SET read_at = CURRENT_TIMESTAMP
  WHERE borrower_id = ? AND sender_role = 'admin' AND read_at IS NULL`);
const markBorrowerMessagesRead = db.prepare(`UPDATE chat_messages SET read_at = CURRENT_TIMESTAMP
  WHERE borrower_id = ? AND sender_role = 'borrower' AND read_at IS NULL`);
const conversations = db.prepare(`SELECT u.id AS borrower_id, u.name, u.email, u.department,
  (SELECT m.body FROM chat_messages m WHERE m.borrower_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_message,
  (SELECT m.created_at FROM chat_messages m WHERE m.borrower_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_at,
  (SELECT COUNT(*) FROM chat_messages m WHERE m.borrower_id = u.id
    AND m.sender_role = 'borrower' AND m.read_at IS NULL) AS unread_count
  FROM users u WHERE u.role = 'borrower'
  ORDER BY CASE WHEN last_at IS NULL THEN 1 ELSE 0 END, last_at DESC, u.name COLLATE NOCASE`);

function canAdminAccess(user, borrower) {
  return Boolean(borrower && (isSystemAdmin(user) || borrower.department === user.department));
}

function sendJson(res, status, data) {
  return res.set('Cache-Control', 'no-store').status(status).json(data);
}

function requireApiRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return sendJson(res, 401, { error: 'Your session has ended. Sign in again.' });
    if (req.session.user.role !== role) return sendJson(res, 403, { error: 'You do not have access to this conversation.' });
    if (role === 'admin' && isSystemAdmin(req.session.user)) return sendJson(res, 403, { error: 'System-admin access is limited to department accounts.' });
    const fetchSite = req.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      return sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
    }
    if (req.method === 'POST' && req.get('x-chat-request') !== '1') {
      return sendJson(res, 403, { error: 'A same-origin chat request is required.' });
    }
    next();
  };
}

const borrowerApi = requireApiRole('borrower');
const adminApi = requireApiRole('admin');

function chatPage(role, user) {
  const isAdmin = role === 'admin';
  const showDepartmentFilters = isAdmin && isSystemAdmin(user);
  const intro = isAdmin
    ? 'Private conversations with borrowers.'
    : 'A private conversation between you and the admin team.';
  const list = isAdmin ? `<aside class="chat-panel chat-inbox" aria-label="Borrower conversations">
    <header class="chat-inbox-header"><div><h2>Borrowers</h2><p data-chat-filter-summary>All departments</p></div>
      ${showDepartmentFilters ? '<button class="chat-filter-toggle" type="button" data-chat-filter-toggle aria-expanded="false" aria-controls="chat-department-filters">Filter</button>' : ''}</header>
    ${showDepartmentFilters ? `<section class="chat-filter-panel" id="chat-department-filters" data-chat-filter-panel aria-label="Filter borrowers by department" hidden>
      <div class="chat-filter-panel-heading"><strong>Departments</strong><button type="button" class="chat-filter-clear" data-chat-filter-clear>Clear</button></div>
      <div class="chat-filter-options">${departments.map(name => `<label><input type="checkbox" data-department-filter value="${esc(name)}"><span>${esc(name)}</span></label>`).join('')}</div>
    </section>` : ''}
    <div class="chat-conversation-list" data-chat-conversations><p class="chat-empty">Loading conversations…</p></div>
  </aside>` : '';
  const empty = isAdmin
    ? 'Choose a borrower to open their conversation.'
    : 'No messages yet. Send a message to start the conversation.';
  return `<section class="chat-page" data-chat-root data-chat-role="${role}">
    <header class="chat-page-heading"><div><span class="chat-kicker">PRIVATE CHAT</span><h1>Chat</h1><p>${intro}</p></div>
      <span class="chat-status" data-chat-status role="status" aria-live="polite">Connecting…</span>
    </header>
    <div class="chat-layout${isAdmin ? ' chat-layout-admin' : ' chat-layout-borrower'}">
      ${list}
      <section class="chat-panel chat-thread" aria-label="Chat conversation">
        <header class="chat-thread-header"><div><h2 data-chat-title>${isAdmin ? 'Choose a borrower' : 'Equipment Desk'}</h2>
    <p data-chat-subtitle>${isAdmin ? 'Select a borrower to start or continue a conversation.' : 'Only you and the admin team can see this conversation.'}</p></div></header>
        <div class="chat-messages" data-chat-messages role="log" aria-live="polite" aria-relevant="additions text">
          <p class="chat-empty" data-chat-empty>${empty}</p>
        </div>
        <form class="chat-composer" data-chat-form>
          <label class="sr-only" for="chat-message">Message</label>
          <textarea id="chat-message" name="body" rows="3" maxlength="${MESSAGE_LIMIT}" placeholder="Write a message…" required></textarea>
          <div class="chat-composer-footer"><p>Private chat · Up to ${MESSAGE_LIMIT.toLocaleString()} characters</p>
            <button type="submit" data-chat-send${isAdmin ? ' disabled' : ''}>Send message</button></div>
        </form>
      </section>
    </div>
  </section>`;
}

function renderPage(req, res, role) {
  const user = req.session.user;
  if (!user) return res.redirect('/login');
  if (role === 'admin' && isSystemAdmin(user)) return res.redirect('/admin/department-admins');
  if (role === 'admin' && user.role !== 'admin') {
    return res.status(403).send(req.app.locals.page(req, 'Forbidden', '<h1>Access denied</h1><p>This conversation inbox is for administrators.</p>'));
  }
  if (role === 'borrower' && user.role === 'admin') return res.redirect(isSystemAdmin(user) ? '/admin/department-admins' : '/admin/chat');
  return res.send(req.app.locals.page(req, 'Chat', chatPage(role, user)));
}

router.get('/chat', (req, res) => renderPage(req, res, 'borrower'));
router.get('/admin/chat', (req, res) => renderPage(req, res, 'admin'));
router.get('/messages', (req, res) => res.redirect('/chat'));
router.get('/admin/messages', (req, res) => res.redirect('/admin/chat'));

router.get('/api/chat/messages', borrowerApi, (req, res) => {
  const borrowerId = req.session.user.id;
  markAdminMessagesRead.run(borrowerId);
  sendJson(res, 200, { messages: messagesFor.all(borrowerId).reverse() });
});

router.post('/api/chat/messages', borrowerApi, (req, res) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > MESSAGE_LIMIT) {
    return sendJson(res, 400, { error: `Enter a message of 1 to ${MESSAGE_LIMIT.toLocaleString()} characters.` });
  }
  const borrowerId = req.session.user.id;
  const result = insertMessage.run(borrowerId, borrowerId, 'borrower', body);
  return sendJson(res, 201, { message: messageById.get(result.lastInsertRowid) });
});

router.get('/api/admin/chat/conversations', adminApi, (req, res) => {
  const rows = isSystemAdmin(req.session.user)
    ? conversations.all()
    : db.prepare(`SELECT u.id AS borrower_id, u.name, u.email, u.department,
      (SELECT m.body FROM chat_messages m WHERE m.borrower_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT m.created_at FROM chat_messages m WHERE m.borrower_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.borrower_id = u.id AND m.sender_role='borrower' AND m.read_at IS NULL) AS unread_count
      FROM users u WHERE u.role='borrower' AND u.department=?
      ORDER BY CASE WHEN last_at IS NULL THEN 1 ELSE 0 END, last_at DESC, u.name COLLATE NOCASE`).all(req.session.user.department);
  sendJson(res, 200, { conversations: rows });
});

router.get('/api/admin/chat/conversations/:borrowerId/messages', adminApi, (req, res) => {
  const borrowerId = Number(req.params.borrowerId);
  if (!Number.isSafeInteger(borrowerId) || borrowerId < 1) return sendJson(res, 400, { error: 'Invalid borrower.' });
  const borrower = borrowerById.get(borrowerId);
  if (!canAdminAccess(req.session.user, borrower)) return sendJson(res, 404, { error: 'Borrower not found.' });
  markBorrowerMessagesRead.run(borrowerId);
  sendJson(res, 200, { borrower, messages: messagesFor.all(borrowerId).reverse() });
});

router.post('/api/admin/chat/conversations/:borrowerId/messages', adminApi, (req, res) => {
  const borrowerId = Number(req.params.borrowerId);
  if (!Number.isSafeInteger(borrowerId) || borrowerId < 1) return sendJson(res, 400, { error: 'Invalid borrower.' });
  if (!canAdminAccess(req.session.user, borrowerById.get(borrowerId))) return sendJson(res, 404, { error: 'Borrower not found.' });
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > MESSAGE_LIMIT) {
    return sendJson(res, 400, { error: `Enter a message of 1 to ${MESSAGE_LIMIT.toLocaleString()} characters.` });
  }
  const result = insertMessage.run(borrowerId, req.session.user.id, 'admin', body);
  return sendJson(res, 201, { message: messageById.get(result.lastInsertRowid) });
});

module.exports = router;

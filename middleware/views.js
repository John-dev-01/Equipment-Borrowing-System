const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = p => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  equipment: svg('<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>'),
  requests: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  queue: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 010 7M18 14.5c2.2.6 3.5 2.4 3.5 5.5"/>'),
  stock: svg('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
  messages: svg('<path d="M21 11.5a8.5 8.5 0 01-8.5 8.5 9 9 0 01-4-.9L3 21l1.9-5.2A8.5 8.5 0 1121 11.5z"/><path d="M8 11h8m-8 4h5"/>'),
};
const themeToggle = `<button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to light mode" title="Switch to light mode"><svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg><svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 018.8 3.5 8.6 8.6 0 1020.5 15.2z"/></svg><span class="sr-only">Toggle light and dark mode</span></button>`;
const sidebarToggle = `<button class="sidebar-toggle" type="button" data-sidebar-toggle aria-label="Hide sidebar" title="Hide sidebar" aria-controls="control-sidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m8-11-3 3 3 3"/></svg></button>`;
const roleLabel = user => user.role !== 'admin' ? 'Borrower' : user.admin_scope === 'system' ? 'System admin' : 'Department admin';
function page(req, title, body, options = {}) {
  const u = req.session.user;
  const flash = req.session.flash; delete req.session.flash;
  const path = req.path || '';
  const themeStorageKey = u ? `cspc-theme:user:${u.id}` : 'cspc-theme:guest';
  const replayIntro = !u && (path === '/login' || path === '/register');
  const sectionTitle = !u ? '' : u.role === 'admin'
    ? (path === '/admin/chat' || path === '/admin/messages' ? 'Chat' : path.startsWith('/admin/equipment') || path.startsWith('/admin/categories') ? 'Manage stock' : path.startsWith('/admin/department-admins') ? 'Department accounts' : 'Request queue')
    : (path === '/chat' || path === '/messages' ? 'Chat' : path === '/my-requests' || path.startsWith('/requests/') ? 'My requests' : 'Equipment');
  const tabTitle = !u ? `${title} | CSPC Vault`
    : u.role === 'admin' ? `${sectionTitle} | Admin | CSPC Vault`
    : `${sectionTitle} | ${(u.name || 'Account').trim()} | CSPC Vault`;
  const link = (href, icon, label) => `<a href="${href}" title="${label}" aria-label="${label}"${path === href ? ' class="active" aria-current="page"' : ''}>${ICONS[icon]}<span>${label}</span></a>`;
  const flashHtml = flash ? `<p class="flash ${flash.type}">${esc(flash.msg)}</p>` : '';
  const intro = `<div id="site-intro" class="site-intro" role="status" aria-live="polite">
    <div class="site-intro-content">
      <div class="site-intro-logo" aria-hidden="true">
        <svg class="auth-logo-svg" viewBox="0 0 48 48" role="img" aria-label="Animated geometric logo">
          <path class="orbit" d="M24 4a20 20 0 1 1-14.14 5.86" />
          <path class="orbit orbit-secondary" d="M24 10a14 14 0 1 1-9.9 4.1" />
          <path class="core" d="m24 13 11 6.35v12.3L24 38l-11-6.35v-12.3z" />
          <path class="core-lines" d="M24 13v12.5m11-6.15-11 6.15-11-6.15" />
        </svg>
      </div>
      <p id="site-intro-tagline" class="site-intro-tagline" hidden>CSPC Vault</p>
    </div>
  </div>`;
  const head = `<!doctype html><html lang="en" data-theme-storage-key="${esc(themeStorageKey)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(tabTitle)}</title><link id="animated-favicon" rel="icon" type="image/png" sizes="96x96" href="/favicon.png"><script>(()=>{try{const key=document.documentElement.dataset.themeStorageKey||'cspc-theme:guest';const t=localStorage.getItem(key);if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;if(localStorage.getItem('cspc-sidebar')==='hidden')document.documentElement.dataset.sidebar='hidden';const introSeen=sessionStorage.getItem('cspc-intro-seen-v2')==='1';sessionStorage.setItem('cspc-intro-seen-v2','1');if(introSeen&&!${replayIntro})document.documentElement.dataset.introSeen='true'}catch(e){}})()</script><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script><script src="/favicon.js" defer></script><script src="/intro.js" defer></script><script src="/chat.js" defer></script></head><body class="${u ? 'portal-body' : 'auth-body'}">${intro}`;
  if (!u) return `${head}<div class="app guest"><div class="content"><main>${flashHtml}${body}</main></div></div></body></html>`;
  const side = u.role === 'admin'
    ? (u.admin_scope === 'system'
      ? link('/admin/department-admins', 'stock', 'Department accounts')
      : link('/admin/requests', 'queue', 'Request queue') + link('/admin/equipment', 'stock', 'Manage equipment') + link('/admin/chat', 'messages', 'Chat'))
    : link('/equipment', 'equipment', 'Equipment') + link('/my-requests', 'requests', 'My requests') + link('/chat', 'messages', 'Chat');
  const passwordDialog = `<dialog class="password-change-dialog" data-password-dialog aria-labelledby="password-dialog-title">
    <form class="password-dialog-content" method="post" action="/change-password">
      <div class="password-dialog-heading"><div><span class="catalog-kicker">ACCOUNT SECURITY</span><h2 id="password-dialog-title">Change password</h2></div><button class="password-dialog-close" type="button" data-close-password-dialog aria-label="Close">×</button></div>
      <label>Current password<input type="password" name="current_password" autocomplete="current-password" required></label>
      <label>New password<input type="password" name="new_password" autocomplete="new-password" minlength="8" maxlength="72" required></label>
      <label>Confirm new password<input type="password" name="confirm_password" autocomplete="new-password" minlength="8" maxlength="72" required></label>
      <p class="field-note">Use at least 8 characters. Your current password is required to confirm this change.</p>
      <div class="password-dialog-actions"><button type="button" class="password-dialog-cancel" data-close-password-dialog>Cancel</button><button type="submit">Update password</button></div>
    </form>
  </dialog>`;
  const account = `<div class="account-menu"><button class="account-trigger" type="button" data-account-toggle aria-expanded="false" aria-haspopup="true" aria-controls="account-menu"><span class="avatar" aria-hidden="true">${esc((u.name || '?').trim().charAt(0).toUpperCase())}</span><span class="who"><strong>${esc(u.name)}</strong><small>${esc(roleLabel(u))}${u.role === 'admin' && u.admin_scope === 'department' ? ` · ${esc(u.department)}` : ''}</small></span></button><div class="account-popover" id="account-menu" data-account-menu hidden><span class="account-menu-name">${esc(u.name)}</span><small>${esc(u.email)}</small><button class="account-menu-action" type="button" data-open-password-dialog>Change password</button><form method="post" action="/logout"><button class="signout-button">Sign out</button></form></div>${passwordDialog}</div>`;
  return `${head}<div class="app"><aside class="sidebar" id="control-sidebar"><div class="sidebar-heading"><a class="brand" href="/" aria-label="CSPC Equipment Desk"><span class="brand-logo" aria-hidden="true"><svg viewBox="0 0 48 48"><path class="brand-orbit" d="M24 4a20 20 0 1 1-14.14 5.86" /><path class="brand-orbit brand-orbit-secondary" d="M24 10a14 14 0 1 1-9.9 4.1" /><path class="brand-core" d="m24 13 11 6.35v12.3L24 38l-11-6.35v-12.3z" /><path class="brand-core-lines" d="M24 13v12.5m11-6.15-11 6.15-11-6.15" /></svg></span><span class="brand-copy">CSPC  
<small>EQUIPMENT DESK</small></span></a>${sidebarToggle}</div><nav>${side}</nav>${options.sidebarControls || ''}<div class="sidebar-bottom">${account}${themeToggle}</div></aside><div class="content"><main>${flashHtml}${body}</main></div></div></body></html>`;
}
const badge = s => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
const stats = items => `<div class="stats">${items.map(([l, v, hl]) => `<div class="stat${hl ? ' hl' : ''}"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;
module.exports = { esc, page, badge, stats, roleLabel };

(() => {
  const root = document.querySelector('[data-chat-root]');
  if (!root) return;

  const role = root.dataset.chatRole;
  if (role !== 'borrower' && role !== 'admin') return;
  const list = root.querySelector('[data-chat-conversations]');
  const messagePane = root.querySelector('[data-chat-messages]');
  const title = root.querySelector('[data-chat-title]');
  const subtitle = root.querySelector('[data-chat-subtitle]');
  const status = root.querySelector('[data-chat-status]');
  const form = root.querySelector('[data-chat-form]');
  const textarea = form?.querySelector('textarea[name="body"]');
  const sendButton = form?.querySelector('[data-chat-send]');
  if (!messagePane || !form || !textarea || !sendButton) return;

  let activeBorrowerId = null;
  let lastMessageId = 0;
  let conversationSignature = '';
  let currentConversations = [];
  let refreshTimer = null;
  let refreshing = false;

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.assign('/login');
      throw new Error(data.error || 'Sign in again to continue.');
    }
    if (!response.ok) throw new Error(data.error || 'Unable to load messages.');
    return data;
  }

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function showEmpty(message) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.dataset.chatEmpty = '';
    empty.textContent = message;
    messagePane.replaceChildren(empty);
  }

  function formattedTime(value) {
    const raw = String(value || '');
    const parsed = new Date(`${raw.replace(' ', 'T')}Z`);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function appendMessage(message) {
    const item = document.createElement('article');
    item.className = `chat-message${message.sender_role === role ? ' is-own' : ''}`;
    item.dataset.messageId = String(message.id);

    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    const sender = document.createElement('span');
    sender.textContent = message.sender_role === role ? 'You' : (message.sender_name || (message.sender_role === 'admin' ? 'Admin team' : 'Borrower'));
    const time = document.createElement('time');
    time.dateTime = String(message.created_at || '').replace(' ', 'T') + 'Z';
    time.textContent = formattedTime(message.created_at);
    meta.append(sender, time);

    const body = document.createElement('p');
    body.className = 'chat-message-body';
    body.textContent = message.body;
    item.append(meta, body);
    messagePane.append(item);
  }

  function renderMessages(messages, reset = false) {
    const rows = Array.isArray(messages) ? messages : [];
    if (reset) {
      messagePane.replaceChildren();
      lastMessageId = 0;
      if (!rows.length) {
        showEmpty(role === 'borrower'
          ? 'No messages yet. Send a message to start the conversation.'
          : 'No messages yet. Send a message to start this conversation.');
        return;
      }
    }

    messagePane.querySelector('[data-chat-empty]')?.remove();
    const wasNearBottom = messagePane.scrollHeight - messagePane.scrollTop - messagePane.clientHeight < 100;
    const fresh = rows.filter(message => Number(message.id) > lastMessageId);
    for (const message of fresh) {
      appendMessage(message);
      lastMessageId = Math.max(lastMessageId, Number(message.id));
    }
    if (fresh.length && (reset || wasNearBottom)) messagePane.scrollTop = messagePane.scrollHeight;
  }

  function setActiveConversation(id) {
    for (const button of list?.querySelectorAll('[data-borrower-id]') || []) {
      const active = Number(button.dataset.borrowerId) === Number(id);
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  }

  function renderConversations(rows) {
    if (!list) return;
    currentConversations = rows;
    const signature = JSON.stringify(rows);
    if (signature === conversationSignature) {
      setActiveConversation(activeBorrowerId);
      return;
    }
    conversationSignature = signature;
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'chat-empty chat-inbox-empty';
      empty.textContent = 'No borrower accounts are available yet.';
      list.append(empty);
      return;
    }

    for (const conversation of rows) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-conversation';
      button.dataset.borrowerId = String(conversation.borrower_id);
      const top = document.createElement('span');
      top.className = 'chat-conversation-top';
      const name = document.createElement('strong');
      name.textContent = conversation.name;
      top.append(name);
      if (Number(conversation.unread_count) > 0) {
        const badge = document.createElement('span');
        badge.className = 'chat-unread-badge';
        badge.textContent = String(conversation.unread_count);
        badge.setAttribute('aria-label', `${conversation.unread_count} unread messages`);
        top.append(badge);
      }
      const email = document.createElement('span');
      email.className = 'chat-conversation-email';
      email.textContent = conversation.email;
      const preview = document.createElement('span');
      preview.className = 'chat-conversation-preview';
      preview.textContent = conversation.last_message || 'Start a conversation';
      button.append(top, email, preview);
      button.addEventListener('click', () => selectConversation(Number(conversation.borrower_id)));
      list.append(button);
    }
    setActiveConversation(activeBorrowerId);
  }

  async function loadBorrowerMessages(reset = false) {
    const data = await requestJson('/api/chat/messages');
    renderMessages(data.messages, reset);
  }

  async function loadAdminMessages(reset = false) {
    if (activeBorrowerId === null) return;
    const data = await requestJson(`/api/admin/chat/conversations/${activeBorrowerId}/messages`);
    title.textContent = data.borrower.name;
    subtitle.textContent = `${data.borrower.email} · private conversation`;
    renderMessages(data.messages, reset);
  }

  async function selectConversation(id) {
    if (!Number.isSafeInteger(id) || id < 1) return;
    const changed = activeBorrowerId !== id;
    activeBorrowerId = id;
    setActiveConversation(id);
    sendButton.disabled = false;
    if (changed) {
      const selected = currentConversations.find(item => Number(item.borrower_id) === id);
      title.textContent = selected?.name || 'Borrower';
      subtitle.textContent = selected?.email || 'Private conversation';
      showEmpty('Loading conversation…');
      lastMessageId = 0;
    }
    try {
      await loadAdminMessages(changed);
      setStatus('Up to date');
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function loadAdminInbox() {
    const data = await requestJson('/api/admin/chat/conversations');
    renderConversations(data.conversations || []);
    const available = currentConversations.some(item => Number(item.borrower_id) === activeBorrowerId);
    if (!available) activeBorrowerId = null;
    if (activeBorrowerId === null && currentConversations.length) {
      await selectConversation(Number(currentConversations[0].borrower_id));
    } else if (activeBorrowerId !== null) {
      await loadAdminMessages(false);
    } else {
      title.textContent = 'Choose a borrower';
      subtitle.textContent = 'Select a borrower to start or continue a conversation.';
      sendButton.disabled = true;
      showEmpty('Choose a borrower to open their conversation.');
    }
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      if (document.hidden) {
        setStatus('Updates paused while this tab is hidden');
      } else if (role === 'borrower') {
        await loadBorrowerMessages(false);
        setStatus('Up to date');
      } else {
        await loadAdminInbox();
        setStatus('Up to date');
      }
    } catch (error) {
      setStatus(error.message || 'Unable to load messages.', true);
    } finally {
      refreshing = false;
      refreshTimer = window.setTimeout(refresh, 4000);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const body = textarea.value.trim();
    if (!body || body.length > 2000 || (role === 'admin' && activeBorrowerId === null)) return;
    sendButton.disabled = true;
    setStatus('Sending…');
    const url = role === 'borrower'
      ? '/api/chat/messages'
      : `/api/admin/chat/conversations/${activeBorrowerId}/messages`;
    try {
      await requestJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Chat-Request': '1' },
        body: new URLSearchParams({ body }),
      });
      textarea.value = '';
      if (role === 'borrower') await loadBorrowerMessages(false);
      else await loadAdminInbox();
      setStatus('Message sent');
      textarea.focus();
    } catch (error) {
      setStatus(error.message || 'Message could not be sent.', true);
    } finally {
      sendButton.disabled = role === 'admin' && activeBorrowerId === null;
    }
  });

  if (role === 'admin' && list) {
    list.addEventListener('keydown', event => {
      if (event.key === 'Escape') textarea.focus();
    });
  }
  window.addEventListener('beforeunload', () => window.clearTimeout(refreshTimer), { once: true });
  refresh();
})();

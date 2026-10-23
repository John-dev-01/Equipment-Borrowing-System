(() => {
  const root = document.documentElement;
  let theme = root.dataset.theme === 'light' ? 'light' : 'dark';
  const themeStorageKey = root.dataset.themeStorageKey || 'cspc-theme:guest';
  const departmentOptions = (() => {
    try { return JSON.parse(document.querySelector('.auth-shell')?.dataset.departments || '[]'); }
    catch { return []; }
  })();
  const passwordFieldMarkup = (label, id, name, autocomplete) => `<div class="auth-password-group">
    <label for="${id}">${label}</label>
    <div class="auth-password-field">
      <input id="${id}" type="password" name="${name}" autocomplete="${autocomplete}" placeholder="${label}" required${name === 'password' && autocomplete === 'new-password' ? ' minlength="8"' : ''}>
      <button class="password-toggle" type="button" data-password-toggle data-field-label="${label.toLowerCase()}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false" title="Show ${label.toLowerCase()}">
        <svg data-icon-show viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
        <svg data-icon-hide viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4-.8"/></svg>
      </button>
    </div>
  </div>`;

  const fixedCursor = document.createElement('span');
  fixedCursor.id = 'custom-cursor';
  fixedCursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fixedCursor);
  root.dataset.customCursor = 'active';

  // Flip the cursor color depending on the surface under it.
  let lastX = -1, lastY = -1, checkQueued = false;
  const surfaceIsLight = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (m && m.length >= 3) {
        const [r, g, b] = m.map(Number);
        const a = m.length > 3 ? m[3] : 1;
        if (a > 0.5) return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
      }
      el = el.parentElement;
    }
    return false;
  };
  const updateCursorContrast = () => {
    checkQueued = false;
    if (lastX < 0) return;
    const light = surfaceIsLight(lastX, lastY);
    fixedCursor.classList.toggle('on-light', light);
    fixedCursor.classList.toggle('on-dark', !light);
    if (light) {
      fixedCursor.style.background = '#111';
      fixedCursor.style.boxShadow = '0 0 5px 2px rgba(0,0,0,.88), 0 0 13px 6px rgba(0,0,0,.44), 0 0 25px 11px rgba(0,0,0,.2)';
    } else {
      fixedCursor.style.background = '#fff';
      fixedCursor.style.boxShadow = '0 0 5px 2px rgba(255,255,255,.95), 0 0 13px 6px rgba(255,255,255,.58), 0 0 25px 11px rgba(255,255,255,.28)';
    }
  };
  const queueContrastCheck = () => {
    if (checkQueued) return;
    checkQueued = true;
    requestAnimationFrame(updateCursorContrast);
  };

  const departmentMenuCloseTimers = new WeakMap();
  const closeDepartmentMenu = (wrapper, restoreFocus = false) => {
    if (!wrapper) return;
    const trigger = wrapper.querySelector('[data-department-trigger]');
    const menu = wrapper.querySelector('[data-department-options]');
    if (menu) {
      const timer = departmentMenuCloseTimers.get(menu);
      if (timer) window.clearTimeout(timer);
      menu.classList.remove('is-open');
      if (!menu.hidden) {
        const closeTimer = window.setTimeout(() => {
          if (!menu.classList.contains('is-open')) menu.hidden = true;
          departmentMenuCloseTimers.delete(menu);
        }, 180);
        departmentMenuCloseTimers.set(menu, closeTimer);
      }
    }
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus();
  };
  const openDepartmentMenu = wrapper => {
    document.querySelectorAll('[data-department-select]').forEach(other => {
      if (other !== wrapper) closeDepartmentMenu(other);
    });
    const menu = wrapper?.querySelector('[data-department-options]');
    const trigger = wrapper?.querySelector('[data-department-trigger]');
    if (!menu || !trigger) return;
    const timer = departmentMenuCloseTimers.get(menu);
    if (timer) window.clearTimeout(timer);
    departmentMenuCloseTimers.delete(menu);
    const rect = trigger.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    const roomAbove = rect.top;
    menu.classList.toggle('opens-upward', roomBelow < Math.min(250, window.innerHeight * 0.38) && roomAbove > roomBelow);
    menu.hidden = false;
    menu.classList.remove('is-open');
    void menu.offsetWidth;
    trigger.setAttribute('aria-expanded', 'true');
    const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector('[data-department-option]');
    window.requestAnimationFrame(() => {
      if (menu.hidden || trigger.getAttribute('aria-expanded') !== 'true') return;
      menu.classList.add('is-open');
      selected?.focus();
    });
  };

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-department-trigger]');
    if (trigger) {
      const wrapper = trigger.closest('[data-department-select]');
      const menu = wrapper?.querySelector('[data-department-options]');
      if (!menu?.classList.contains('is-open')) openDepartmentMenu(wrapper);
      else closeDepartmentMenu(wrapper);
      return;
    }

    const option = event.target.closest('[data-department-option]');
    if (option) {
      const wrapper = option.closest('[data-department-select]');
      const value = wrapper?.querySelector('[data-department-value]');
      const label = wrapper?.querySelector('[data-department-label]');
      if (value && label) {
        value.value = option.dataset.value || '';
        label.textContent = option.textContent.trim();
        wrapper.classList.toggle('has-value', Boolean(value.value) || wrapper.classList.contains('filter-select'));
        wrapper.classList.remove('is-invalid');
        wrapper.querySelector('[data-department-error]')?.setAttribute('hidden', '');
        wrapper.classList.remove('is-selecting');
        void wrapper.offsetWidth;
        wrapper.classList.add('is-selecting');
        window.setTimeout(() => wrapper.classList.remove('is-selecting'), 240);
        wrapper.querySelectorAll('[data-department-option]').forEach(item => {
          const selected = item === option;
          item.setAttribute('aria-selected', String(selected));
          item.classList.toggle('is-selected', selected);
        });
      }
      closeDepartmentMenu(wrapper, true);
      return;
    }

    if (!event.target.closest('[data-department-select]')) {
      document.querySelectorAll('[data-department-select]').forEach(wrapper => closeDepartmentMenu(wrapper));
    }
  });

  document.addEventListener('keydown', event => {
    const trigger = event.target.closest('[data-department-trigger]');
    if (trigger && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
      const wrapper = trigger.closest('[data-department-select]');
      const menu = wrapper?.querySelector('[data-department-options]');
      if (menu && !menu.classList.contains('is-open')) {
        event.preventDefault();
        openDepartmentMenu(wrapper);
      }
      return;
    }

    const option = event.target.closest('[data-department-option]');
    if (!option) return;
    const wrapper = option.closest('[data-department-select]');
    const options = [...(wrapper?.querySelectorAll('[data-department-option]') || [])];
    const index = options.indexOf(option);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDepartmentMenu(wrapper, true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  });

  document.addEventListener('submit', event => {
    const wrapper = event.target.querySelector('[data-department-select][data-required-selection]');
    if (!wrapper) return;
    const value = wrapper.querySelector('[data-department-value]');
    if (value?.value) return;
    event.preventDefault();
    wrapper.classList.add('is-invalid');
    wrapper.querySelector('[data-department-error]')?.removeAttribute('hidden');
    wrapper.querySelector('[data-department-trigger]')?.focus();
  }, true);

  const moveFixedCursor = event => {
    if (event.pointerType === 'touch') return;
    lastX = event.clientX;
    lastY = event.clientY;
    fixedCursor.style.left = `${lastX}px`;
    fixedCursor.style.top = `${lastY}px`;
    fixedCursor.classList.add('is-visible');
    queueContrastCheck();
  };
  document.addEventListener('transitionend', queueContrastCheck, true);
  document.addEventListener('animationend', queueContrastCheck, true);
  window.addEventListener('scroll', queueContrastCheck, { passive: true, capture: true });
  document.addEventListener('pointermove', moveFixedCursor, { passive: true });
  document.addEventListener('pointerleave', () => fixedCursor.classList.remove('is-visible'));
  window.addEventListener('blur', () => fixedCursor.classList.remove('is-visible'));

  const updateButtons = () => {
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      const label = `Switch to ${nextTheme} mode`;
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    });
  };

  root.dataset.theme = theme;
  updateButtons();

  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = theme;
      try { localStorage.setItem(themeStorageKey, theme); } catch (error) { /* Keep switching available without storage. */ }
      updateButtons();
    });
  });

  const sidebarButtons = document.querySelectorAll('[data-sidebar-toggle]');
  const updateSidebarButtons = () => {
    const hidden = root.dataset.sidebar === 'hidden';
    sidebarButtons.forEach(button => {
      const label = hidden ? 'Show sidebar' : 'Hide sidebar';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-expanded', String(!hidden));
    });
  };
  updateSidebarButtons();
  sidebarButtons.forEach(button => button.addEventListener('click', () => {
    if (root.dataset.sidebar === 'hidden') delete root.dataset.sidebar;
    else root.dataset.sidebar = 'hidden';
    try { localStorage.setItem('cspc-sidebar', root.dataset.sidebar || 'visible'); } catch (error) { /* Sidebar remains toggleable without storage. */ }
    updateSidebarButtons();
  }));

  const accountToggle = document.querySelector('[data-account-toggle]');
  const accountMenu = document.querySelector('[data-account-menu]');
  let accountMenuCloseTimer;
  const closeAccountMenu = () => {
    if (!accountToggle || !accountMenu) return;
    if (accountMenuCloseTimer) window.clearTimeout(accountMenuCloseTimer);
    if (accountMenu.hidden) return;
    accountMenu.classList.remove('is-open');
    accountToggle.setAttribute('aria-expanded', 'false');
    accountMenuCloseTimer = window.setTimeout(() => {
      if (!accountMenu.classList.contains('is-open')) accountMenu.hidden = true;
      accountMenuCloseTimer = undefined;
    }, 190);
  };
  const openAccountMenu = () => {
    if (!accountToggle || !accountMenu) return;
    if (accountMenuCloseTimer) window.clearTimeout(accountMenuCloseTimer);
    accountMenuCloseTimer = undefined;
    accountMenu.hidden = false;
    accountMenu.classList.remove('is-open');
    accountToggle.setAttribute('aria-expanded', 'true');
    void accountMenu.offsetWidth;
    window.requestAnimationFrame(() => {
      if (!accountMenu.hidden && accountToggle.getAttribute('aria-expanded') === 'true') accountMenu.classList.add('is-open');
    });
  };
  if (accountToggle && accountMenu) {
    accountToggle.addEventListener('click', () => {
      if (accountMenu.classList.contains('is-open')) closeAccountMenu();
      else openAccountMenu();
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.account-menu')) closeAccountMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeAccountMenu();
        accountToggle.focus();
      }
    });
  }

  const passwordDialog = document.querySelector('[data-password-dialog]');
  const openPasswordDialogButton = document.querySelector('[data-open-password-dialog]');
  const closePasswordDialogButtons = passwordDialog?.querySelectorAll('[data-close-password-dialog]');
  if (passwordDialog && openPasswordDialogButton) {
    const closePasswordDialog = () => { if (passwordDialog.open) passwordDialog.close(); };
    openPasswordDialogButton.addEventListener('click', () => {
      closeAccountMenu();
      if (!passwordDialog.open) passwordDialog.showModal();
      passwordDialog.appendChild(fixedCursor);
      passwordDialog.querySelector('input[name="current_password"]')?.focus();
    });
    closePasswordDialogButtons?.forEach(button => button.addEventListener('click', closePasswordDialog));
    passwordDialog.addEventListener('click', event => {
      if (event.target === passwordDialog) closePasswordDialog();
    });
    passwordDialog.addEventListener('close', () => {
      document.body.appendChild(fixedCursor);
      queueContrastCheck();
      accountToggle?.focus();
    });
    const form = passwordDialog.querySelector('form');
    const newPassword = form?.querySelector('input[name="new_password"]');
    const confirmPassword = form?.querySelector('input[name="confirm_password"]');
    const validatePasswordMatch = () => {
      if (!confirmPassword) return;
      confirmPassword.setCustomValidity(confirmPassword.value && confirmPassword.value !== newPassword?.value ? 'New passwords do not match.' : '');
    };
    newPassword?.addEventListener('input', validatePasswordMatch);
    confirmPassword?.addEventListener('input', validatePasswordMatch);
    form?.addEventListener('submit', validatePasswordMatch);
  }

  const addItemDialog = document.querySelector('[data-add-item-dialog]');
  const openAddItemButton = document.querySelector('[data-open-add-item]');
  const closeAddItemButton = addItemDialog?.querySelector('[data-close-add-item]');
  if (addItemDialog && openAddItemButton) {
    let addItemCloseTimer;
    const closeAddItemDialog = () => {
      if (!addItemDialog.open || addItemDialog.classList.contains('is-closing')) return;
      addItemDialog.classList.add('is-closing');
      const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
      addItemCloseTimer = window.setTimeout(() => {
        addItemCloseTimer = undefined;
        addItemDialog.classList.remove('is-closing');
        if (addItemDialog.open) addItemDialog.close();
      }, delay);
    };
    openAddItemButton.addEventListener('click', () => {
      if (addItemCloseTimer) window.clearTimeout(addItemCloseTimer);
      addItemCloseTimer = undefined;
      addItemDialog.classList.remove('is-closing');
      if (addItemDialog.open) return;
      addItemDialog.showModal();
      addItemDialog.appendChild(fixedCursor);
      addItemDialog.querySelector('input[name="name"]')?.focus();
    });
    closeAddItemButton?.addEventListener('click', closeAddItemDialog);
    addItemDialog.addEventListener('click', event => {
      if (event.target === addItemDialog) closeAddItemDialog();
    });
    addItemDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeAddItemDialog();
    });
    addItemDialog.addEventListener('close', () => {
      if (addItemCloseTimer) window.clearTimeout(addItemCloseTimer);
      addItemCloseTimer = undefined;
      addItemDialog.classList.remove('is-closing');
      document.body.appendChild(fixedCursor);
      openAddItemButton.focus();
    });
  }

  // Keep the supplied logo animation; it is separate from the auth-panel switch.
  document.querySelectorAll('.auth-logo-button').forEach(logoButton => {
    const replayShockwave = () => {
      logoButton.classList.remove('is-shocking');
      void logoButton.offsetWidth;
      logoButton.classList.add('is-shocking');
    };
    logoButton.addEventListener('click', replayShockwave);
    window.setInterval(replayShockwave, 1500);
    logoButton.addEventListener('animationend', event => {
      if (event.animationName === 'logo-impact') logoButton.classList.remove('is-shocking');
    });
  });

  // Let the split auth panels finish their side-switch animation before routing.
  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-password-toggle]');
    if (!toggle) return;
    const input = toggle.closest('.auth-password-field')?.querySelector('input');
    if (!input) return;
    const visible = input.type === 'password';
    const label = toggle.dataset.fieldLabel || 'password';
    input.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${label}`);
    toggle.setAttribute('title', `${visible ? 'Hide' : 'Show'} ${label}`);
    input.focus({ preventScroll: true });
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-auth-switch]');
    if (!link) return;
    const shell = link.closest('[data-auth-mode]');
    if (!shell || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    if (shell.dataset.authSwitching === 'true') return;

    const switchingToRegister = link.getAttribute('href') === '/register';
    const mode = switchingToRegister ? 'register' : 'login';
    const contentSwapDelay = 310;
    const formPanel = shell.querySelector('.auth-form-panel');
    if (!formPanel) return;
    let switchFinished = false;
    let fallbackTimer;

    const finishSwitch = () => {
      if (switchFinished) return;
      switchFinished = true;
      window.clearTimeout(fallbackTimer);
      formPanel.removeEventListener('transitionend', onPanelTransitionEnd);
      shell.classList.add('auth-switch-settle');
      shell.classList.remove('switch-to-register', 'switch-to-login', 'login-mode', 'register-mode');
      shell.classList.add(switchingToRegister ? 'register-mode' : 'login-mode');
      shell.dataset.authMode = mode;
      delete shell.dataset.authSwitching;
      window.history.pushState({}, '', link.getAttribute('href'));
      void shell.offsetWidth;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => shell.classList.remove('auth-switch-settle'));
      });
    };

    const onPanelTransitionEnd = event => {
      if (event.target === formPanel && event.propertyName === 'transform') finishSwitch();
    };
    formPanel.addEventListener('transitionend', onPanelTransitionEnd);
    shell.dataset.authSwitching = 'true';
    shell.classList.add(switchingToRegister ? 'switch-to-register' : 'switch-to-login');

    window.setTimeout(() => {
      const formArea = shell.querySelector('.auth-form-area');
      if (!formArea) return;
      formArea.innerHTML = `<div class="auth-kicker">${switchingToRegister ? 'Create account' : 'Sign in'}</div>
        <h1>${switchingToRegister ? 'Create account' : 'Sign in'}</h1>
        <p class="auth-form-copy">${switchingToRegister ? 'Join the equipment desk with your CSPC email address.' : 'Access the equipment library and keep track of your requests.'}</p>
        <form method="post" action="/${mode}" class="auth-card">
          ${switchingToRegister ? '<label>Full name<input name="name" autocomplete="name" placeholder="Name" required></label>' : ''}
          <label>CSPC email<input type="email" name="email" autocomplete="email" placeholder="CSPC email" required pattern="[^@\\s]+@my\\.cspc\\.edu\\.ph"></label>
          ${switchingToRegister ? `<label>College / campus<div class="department-select" data-department-select data-required-selection><input type="hidden" name="department" value="" data-department-value><button class="department-select-trigger" type="button" data-department-trigger role="combobox" aria-label="Select your college or campus" aria-haspopup="listbox" aria-expanded="false" aria-controls="department-options" aria-required="true"><span data-department-label>Select your college / campus</span><span class="department-select-chevron" aria-hidden="true"></span></button><div class="department-select-menu" id="department-options" data-department-options role="listbox" aria-label="Departments" hidden>${departmentOptions.map(name => `<button type="button" class="department-option" data-department-option data-value="${name}" role="option" aria-selected="false">${name}</button>`).join('')}</div><span class="department-error" data-department-error hidden>Please choose a department.</span></div></label>` : ''}
          ${passwordFieldMarkup('Password', 'auth-password', 'password', switchingToRegister ? 'new-password' : 'current-password')}
          ${switchingToRegister ? passwordFieldMarkup('Confirm password', 'auth-password-confirm', 'password_confirm', 'new-password') : ''}
          ${switchingToRegister ? '' : '<label class="remember-option"><input type="checkbox" name="remember"> <span>Remember me</span></label>'}
          <button>${switchingToRegister ? 'Create account' : 'Sign in'}</button>
        </form>
        <p class="auth-switch">${switchingToRegister ? 'Already have an account?' : 'New to Equipment Desk?'} <a href="${switchingToRegister ? '/login' : '/register'}" data-auth-switch>${switchingToRegister ? 'Sign in' : 'Create an account'}</a></p>`;
    }, contentSwapDelay);
    fallbackTimer = window.setTimeout(finishSwitch, 760);
  });

  // Keep logo motion independent from the single account-panel slide.

})();

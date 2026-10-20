(() => {
  const root = document.documentElement;
  let theme = root.dataset.theme === 'light' ? 'light' : 'dark';

  const fixedCursor = document.createElement('span');
  fixedCursor.id = 'custom-cursor';
  fixedCursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fixedCursor);
  root.dataset.customCursor = 'active';

  const moveFixedCursor = event => {
    if (event.pointerType === 'touch') return;
    fixedCursor.style.left = `${event.clientX}px`;
    fixedCursor.style.top = `${event.clientY}px`;
    fixedCursor.classList.add('is-visible');
  };
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
      try { localStorage.setItem('cspc-theme', theme); } catch (error) { /* Keep switching available without storage. */ }
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
  const closeAccountMenu = () => {
    if (!accountToggle || !accountMenu) return;
    accountMenu.hidden = true;
    accountToggle.setAttribute('aria-expanded', 'false');
  };
  if (accountToggle && accountMenu) {
    accountToggle.addEventListener('click', () => {
      const isOpen = accountMenu.hidden;
      accountMenu.hidden = !isOpen;
      accountToggle.setAttribute('aria-expanded', String(isOpen));
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
          ${switchingToRegister ? '<label>Full name<input name="name" autocomplete="name" placeholder="Full name" required></label>' : ''}
          <label>CSPC email<input type="email" name="email" autocomplete="email" placeholder="CSPC email" required pattern="[^@\\s]+@my\\.cspc\\.edu\\.ph"></label>
          <label>Password<input type="password" name="password" autocomplete="${switchingToRegister ? 'new-password' : 'current-password'}" placeholder="Password" required minlength="8"></label>
          ${switchingToRegister ? '' : '<label class="remember-option"><input type="checkbox" name="remember"> <span>Remember me</span></label>'}
          <button>${switchingToRegister ? 'Create account' : 'Sign in'}</button>
        </form>
        <p class="auth-switch">${switchingToRegister ? 'Already have an account?' : 'New to Equipment Desk?'} <a href="${switchingToRegister ? '/login' : '/register'}" data-auth-switch>${switchingToRegister ? 'Sign in' : 'Create an account'}</a></p>`;
    }, contentSwapDelay);
    fallbackTimer = window.setTimeout(finishSwitch, 760);
  });

  // Keep logo motion independent from the single account-panel slide.

})();

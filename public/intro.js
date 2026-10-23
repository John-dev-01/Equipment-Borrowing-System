(() => {
  const intro = document.getElementById('site-intro');
  if (!intro || document.documentElement.dataset.introSeen === 'true') return;

  const tagline = document.getElementById('site-intro-tagline');
  window.setTimeout(() => {
    if (!tagline) return;
    tagline.hidden = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        tagline.classList.add('is-visible');
      });
    });
  }, 1000);

  window.setTimeout(() => {
    intro.classList.add('is-exiting');
  }, 4550);

  window.setTimeout(() => {
    intro.classList.add('is-complete');
    intro.setAttribute('aria-hidden', 'true');
  }, 5000);
})();

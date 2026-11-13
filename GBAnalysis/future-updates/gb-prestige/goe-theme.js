/* Apply before paint; this small local script also works with the portal CSP. */
(() => {
  'use strict';
  const root = document.documentElement;
  const deviceTheme = matchMedia('(prefers-color-scheme: dark)');
  let preference, button;
  try { preference = localStorage.getItem('goe-color-theme'); } catch { /* Use the device setting. */ }
  if (preference !== 'light' && preference !== 'dark') preference = null;

  function render() {
    const theme = preference || (deviceTheme.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0d1810' : '#eaf0eb';
    if (button) {
      button.querySelector('span').textContent = theme === 'dark' ? 'Light' : 'Dark';
      button.setAttribute('aria-label', `Use ${theme === 'dark' ? 'light' : 'dark'} mode`);
    }
  }
  render();
  deviceTheme.addEventListener('change', () => { if (!preference) render(); });
  document.addEventListener('DOMContentLoaded', () => {
    button = document.querySelector('#theme-toggle');
    render();
    button.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('goe-color-theme', preference); } catch { /* Keep the choice for this visit. */ }
      render();
    });
  });
})();

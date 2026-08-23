/* Vidocq UI — minimal JS (theme toggle + version selector + nav accordion). */
'use strict';

(function () {
  var STORAGE_THEME = 'vidocq-theme';

  function applyStoredTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_THEME);
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.setAttribute('data-theme', saved);
      }
    } catch (e) { /* ignore */ }
  }

  function setupThemeToggle() {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var html = document.documentElement;
      var current = html.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try { localStorage.setItem(STORAGE_THEME, next); } catch (e) { /* ignore */ }
    });
  }

  // Navigate to the same page in the selected component version (option values
  // are relative URLs rendered by nav.hbs).
  function setupVersionSelector() {
    var sel = document.querySelector('.component-version-selector');
    if (!sel) return;
    sel.addEventListener('change', function () {
      if (this.value) window.location.href = this.value;
    });
  }

  // Opens the sidebar branch containing the current page. Each section is
  // rendered as a closed <details> by default; without this pass the visitor
  // would land on a page whose parent group is folded.
  function setupNavAccordion() {
    var current = document.querySelector('.nav .is-current-page');
    if (!current) return;
    var d = current.closest('details.nav-group-details');
    while (d) {
      d.setAttribute('open', '');
      d = d.parentNode && d.parentNode.closest('details.nav-group-details');
    }
    // Bring the current page into view inside the scrollable sidebar.
    if (typeof current.scrollIntoView === 'function') {
      current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  applyStoredTheme();
  document.addEventListener('DOMContentLoaded', function () {
    setupThemeToggle();
    setupVersionSelector();
    setupNavAccordion();
  });
})();

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

  // Global version selector.
  // - On a versioned page: navigate to the same page in the chosen version
  //   (each option carries its data-url) and remember the choice.
  // - On a versionless page (home, tutorials): no navigation — the choice is
  //   a browsing preference: it is stored and every link on the page that
  //   targets a versioned component is rewritten to that version (when the
  //   component publishes it; e.g. a dev-only component keeps its dev link).
  var STORAGE_VERSION = 'vidocq-docs-version';

  function rewriteVersionedLinks(map, pref) {
    var links = document.querySelectorAll('.nav a, article.doc a');
    Array.prototype.forEach.call(links, function (a) {
      try {
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        var u = new URL(href, window.location.href);
        if (u.origin !== window.location.origin) return;
        var m = u.pathname.match(/^\/([\w-]+)\/([^/]+)(\/.*)?$/);
        if (!m) return;
        var versions = map[m[1]];
        if (!versions || versions.indexOf(m[2]) < 0) return;   // not a versioned URL
        if (versions.indexOf(pref) < 0 || m[2] === pref) return;
        a.setAttribute('href', '/' + m[1] + '/' + pref + (m[3] || '/') + u.search + u.hash);
      } catch (e) { /* ignore malformed hrefs */ }
    });
  }

  function setupVersionSelector() {
    var sel = document.querySelector('.component-version-selector');
    if (!sel) return;
    var map = {};
    try { map = JSON.parse(sel.getAttribute('data-site-versions') || '{}'); } catch (e) { /* ignore */ }
    var contextSwitch = sel.hasAttribute('data-context-switch');

    if (contextSwitch) {
      var pref = null;
      try { pref = localStorage.getItem(STORAGE_VERSION); } catch (e) { /* ignore */ }
      if (pref && sel.querySelector('option[value="' + pref + '"]')) {
        sel.value = pref;
        rewriteVersionedLinks(map, pref);
      }
      sel.addEventListener('change', function () {
        try { localStorage.setItem(STORAGE_VERSION, this.value); } catch (e) { /* ignore */ }
        rewriteVersionedLinks(map, this.value);
      });
    } else {
      // Remember the version being browsed so versionless pages follow it.
      try { localStorage.setItem(STORAGE_VERSION, sel.value); } catch (e) { /* ignore */ }
      sel.addEventListener('change', function () {
        var opt = this.options[this.selectedIndex];
        try { localStorage.setItem(STORAGE_VERSION, this.value); } catch (e) { /* ignore */ }
        var url = opt && opt.getAttribute('data-url');
        if (url) window.location.href = url;
      });
    }
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

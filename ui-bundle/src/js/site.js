/* Vidocq UI — JS minimal (toggle thème + bascule FR/EN). */
'use strict';

(function () {
  var STORAGE_THEME = 'vidocq-theme';
  var STORAGE_LANG = 'vidocq-lang';

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

  // Depth of the current page below the site root, read from the UI asset path
  // that Antora rewrites per page (`../_/js/site.js`, `../../_/js/site.js`, …).
  // Returns -1 when it cannot be determined.
  function siteRootDepth() {
    var el = document.querySelector('script[src*="_/js/site.js"]');
    var src = el ? el.getAttribute('src') || '' : '';
    var marker = src.indexOf('_/js/site.js');
    if (marker < 0) return -1;
    var prefix = src.slice(0, marker);
    if (!/^(\.\.\/)*$/.test(prefix)) return -1;
    return prefix.split('../').length - 1;
  }

  // Toggle FR/EN : remplace le segment de path correspondant au component.
  // Si on est sur /vauban/page.html, le toggle FR pointe vers /vauban-fr/page.html.
  //
  // The href is built RELATIVE to the current page, never as '/'-rooted. An
  // absolute path assumes the site is served from the web root, which breaks
  // when the site is opened over file:// (the first path segment is then a
  // filesystem directory, not the component) and when it is deployed under a
  // sub-path. The component segment is located using the page depth rather than
  // assumed to be first, for the same reason.
  function setupLangToggle() {
    var toggle = document.querySelector('.lang-toggle');
    if (!toggle) return;
    var depth = siteRootDepth();
    if (depth < 0) return;
    var path = location.pathname;
    if (path.charAt(path.length - 1) === '/') path += 'index.html';
    var parts = path.split('/').filter(Boolean);
    var idx = parts.length - 1 - depth;
    if (idx < 0) return;
    var component = parts[idx];
    var isFr = /-fr$/.test(component);
    var counterpart = isFr ? component.replace(/-fr$/, '') : component + '-fr';
    var upToRoot = new Array(depth + 1).join('../') || './';
    var rest = parts.slice(idx + 1).join('/');

    Array.prototype.forEach.call(toggle.querySelectorAll('[data-lang]'), function (el) {
      var lang = el.getAttribute('data-lang');
      var wantsFr = lang === 'fr';
      if ((wantsFr && isFr) || (!wantsFr && !isFr)) {
        el.classList.add('is-current');
        return;
      }
      el.setAttribute('href', upToRoot + counterpart + '/' + rest + (location.hash || ''));
      el.addEventListener('click', function () {
        try { localStorage.setItem(STORAGE_LANG, lang); } catch (e) { /* ignore */ }
      });
    });
  }

  function syncHtmlLang() {
    var meta = document.querySelector('meta[name="vidocq:lang"]');
    if (meta) document.documentElement.setAttribute('lang', meta.content);
  }

  // Ouvre la branche du sidebar qui contient la page courante. Le template
  // rend chaque section comme <details> fermé par défaut ; sans cette passe
  // le visiteur arriverait sur une page dont le parent est replié.
  function setupNavAccordion() {
    var current = document.querySelector('.nav .is-current-page');
    if (!current) return;
    var d = current.closest('details.nav-group-details');
    while (d) {
      d.setAttribute('open', '');
      d = d.parentNode && d.parentNode.closest('details.nav-group-details');
    }
    // Met la page courante en vue dans le sidebar scrollable.
    if (typeof current.scrollIntoView === 'function') {
      current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  applyStoredTheme();
  document.addEventListener('DOMContentLoaded', function () {
    syncHtmlLang();
    setupThemeToggle();
    setupLangToggle();
    setupNavAccordion();
  });
})();

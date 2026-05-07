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

  // Toggle FR/EN : remplace le segment de path correspondant au component.
  // Si on est sur /vauban/page.html, le toggle FR pointe vers /vauban-fr/page.html.
  function setupLangToggle() {
    var toggle = document.querySelector('.lang-toggle');
    if (!toggle) return;
    var path = location.pathname;
    var parts = path.split('/').filter(Boolean);
    if (!parts.length) return;
    var component = parts[0];
    var isFr = /-fr$/.test(component);
    var counterpart = isFr ? component.replace(/-fr$/, '') : component + '-fr';

    Array.prototype.forEach.call(toggle.querySelectorAll('[data-lang]'), function (el) {
      var lang = el.getAttribute('data-lang');
      var wantsFr = lang === 'fr';
      if ((wantsFr && isFr) || (!wantsFr && !isFr)) {
        el.classList.add('is-current');
        return;
      }
      var newParts = parts.slice();
      newParts[0] = counterpart;
      el.setAttribute('href', '/' + newParts.join('/') + (location.hash || ''));
      el.addEventListener('click', function () {
        try { localStorage.setItem(STORAGE_LANG, lang); } catch (e) { /* ignore */ }
      });
    });
  }

  function syncHtmlLang() {
    var meta = document.querySelector('meta[name="vidocq:lang"]');
    if (meta) document.documentElement.setAttribute('lang', meta.content);
  }

  applyStoredTheme();
  document.addEventListener('DOMContentLoaded', function () {
    syncHtmlLang();
    setupThemeToggle();
    setupLangToggle();
  });
})();

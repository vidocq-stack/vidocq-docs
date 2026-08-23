'use strict';

// The site is English-only (ADR-0004); this helper keeps the UI strings in one
// place rather than scattering literals across the templates.
const STRINGS = {
  'on-this-page':       'On this page',
  'edit':               'Edit this page',
  'version':            'Version',
  'search':             'Search the docs…',
  'snapshot-mark':      'Snapshot — development version',
  'powered-by':         'Powered by',
  'documentation':      'Vidocq Documentation',
  'footer-rights':      '© 2026 Vidocq Team — MicroProfile runtime for Java 25, AI-augmented development',
  'previous':           'Previous',
  'next':               'Next',
  'toggle-theme':       'Toggle light/dark theme',
  'modules':            'Modules',
  'overview':           'Overview',
};

module.exports = function i18n(key) {
  return STRINGS[key] != null ? STRINGS[key] : key;
};

'use strict';

const STRINGS = {
  fr: {
    'on-this-page':       'Sur cette page',
    'edit':               'Éditer cette page',
    'version':            'Version',
    'language':           'Langue',
    'snapshot-mark':      'Version en cours de développement',
    'powered-by':         'Propulsé par',
    'documentation':      'Documentation Vidocq',
    'previous':           'Précédent',
    'next':               'Suivant',
    'toggle-theme':       'Basculer thème clair/sombre',
    'lang-fr':            'Français',
    'lang-en':            'English',
  },
  en: {
    'on-this-page':       'On this page',
    'edit':               'Edit this page',
    'version':            'Version',
    'language':           'Language',
    'snapshot-mark':      'Snapshot — development version',
    'powered-by':         'Powered by',
    'documentation':      'Vidocq Documentation',
    'previous':           'Previous',
    'next':               'Next',
    'toggle-theme':       'Toggle light/dark theme',
    'lang-fr':            'Français',
    'lang-en':            'English',
  },
};

module.exports = function i18n(key, options) {
  const ctx = (options && options.data && options.data.root) || {};
  const lang = (ctx.page && ctx.page.attributes && ctx.page.attributes.lang)
    || (ctx.site && ctx.site.attributes && ctx.site.attributes['primary-language'])
    || 'fr';
  const dict = STRINGS[lang] || STRINGS.fr;
  return dict[key] != null ? dict[key] : key;
};

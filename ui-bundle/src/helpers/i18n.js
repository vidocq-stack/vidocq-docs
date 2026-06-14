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
    'footer-rights':      '© 2026 Équipe Vidocq — runtime MicroProfile pour Java 25, développement augmenté par l’IA',
    'previous':           'Précédent',
    'next':               'Suivant',
    'toggle-theme':       'Basculer thème clair/sombre',
    'lang-fr':            'Français',
    'lang-en':            'English',
    'modules':            'Modules',
    'overview':           'Vue d’ensemble',
  },
  en: {
    'on-this-page':       'On this page',
    'edit':               'Edit this page',
    'version':            'Version',
    'language':           'Language',
    'snapshot-mark':      'Snapshot — development version',
    'powered-by':         'Powered by',
    'documentation':      'Vidocq Documentation',
    'footer-rights':      '© 2026 Vidocq Team — MicroProfile runtime for Java 25, AI-augmented development',
    'previous':           'Previous',
    'next':               'Next',
    'toggle-theme':       'Toggle light/dark theme',
    'lang-fr':            'Français',
    'lang-en':            'English',
    'modules':            'Modules',
    'overview':           'Overview',
  },
};

module.exports = function i18n(key, options) {
  const ctx = (options && options.data && options.data.root) || {};
  const lang = detectLang(ctx);
  const dict = STRINGS[lang] || STRINGS.fr;
  return dict[key] != null ? dict[key] : key;
};

// Détermine la langue de la page. Antora n'expose sur `page.attributes` que les
// attributs préfixés `page-`, donc l'attribut `lang` des antora.yml n'y est pas
// visible. On déduit donc la langue du nom du component (suffixe `-fr` = français,
// sinon anglais), comme le fait site.js pour le toggle FR/EN. Ordre de priorité :
//   1. attribut page `lang` s'il est présent (antora.yml utilisant `page-lang`)
//   2. suffixe `-fr` du nom de component / de l'URL
//   3. attribut site `primary-language`
//   4. 'fr' par défaut
function detectLang(ctx) {
  const page = ctx.page || {};
  const attrLang = page.attributes && page.attributes.lang;
  if (attrLang === 'fr' || attrLang === 'en') return attrLang;

  const componentName =
    (page.componentVersion && page.componentVersion.name) ||
    (page.component && page.component.name) ||
    '';
  if (componentName) return /-fr$/.test(componentName) ? 'fr' : 'en';

  if (typeof page.url === 'string') {
    const first = page.url.split('/').filter(Boolean)[0] || '';
    if (first) return /-fr$/.test(first) ? 'fr' : 'en';
  }

  const primary = ctx.site && ctx.site.attributes && ctx.site.attributes['primary-language'];
  if (primary === 'fr' || primary === 'en') return primary;
  return 'fr';
}

module.exports.detectLang = detectLang;

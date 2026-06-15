'use strict';

/**
 * Liste ordonnée des composants pour la langue courante, à afficher dans le
 * sidebar comme accès rapide à chaque module de l'écosystème.
 *
 * - lang = 'fr' → composants `home-fr`, `chappe-fr`, …, `vidocq-fr`
 * - lang = 'en' → composants `home`,    `chappe`,    …, `vidocq`
 *
 * Mode hybride :
 *   1. Composants présents dans ORDER_BASE rendus dans l'ordre métier curated
 *      (home → fondations → couches Jakarta → MicroProfile → orchestrateur).
 *   2. Composants auto-découverts dans `site.components` mais absents de
 *      ORDER_BASE appended en queue, triés alphabétiquement par titre.
 *
 * Conséquence : un nouveau module câblé dans `antora-playbook.yml` apparaît
 * automatiquement dans la sidebar sans toucher ce helper. Pour le
 * repositionner explicitement dans l'ordre métier, l'ajouter à ORDER_BASE.
 */
const ORDER_BASE = [
  'home',
  // Fondations
  'chappe', 'vauban', 'champollion',
  // Couches Jakarta
  'foy', 'cassini', 'mansart',
  // MicroProfile (ravel = Config, knock = Health, dirac = Metrics,
  // heisenberg = Fault Tolerance, humboldt = Telemetry, cervantes = JWT,
  // cyrano = Rest Client, grimm = OpenAPI)
  'ravel', 'knock', 'dirac', 'heisenberg', 'humboldt', 'cervantes', 'cyrano', 'grimm',
  // Orchestrateur
  'vidocq',
];

module.exports = function componentsQuickNav (options) {
  const ctx = (options && options.data && options.data.root) || {};
  const site = ctx.site;
  if (!site || !site.components) return [];

  const lang = detectLang(ctx);

  const suffix = lang === 'fr' ? '-fr' : '';

  // Étape 1 — composants curated dans l'ordre métier de ORDER_BASE.
  const known = ORDER_BASE
    .map((base) => site.components[base + suffix])
    .filter(Boolean);
  const knownNames = new Set(known.map((c) => c.name));

  // Étape 2 — auto-découverte. Tout composant de la langue courante absent
  // de ORDER_BASE est appended en queue, trié alphabétiquement par titre.
  const isLangMatch = (c) =>
    suffix === '-fr' ? c.name.endsWith('-fr') : !c.name.endsWith('-fr');
  const unknown = Object.values(site.components)
    .filter(isLangMatch)
    .filter((c) => !knownNames.has(c.name))
    .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));

  return [...known, ...unknown].map((c) => {
    const v = c.latest || (c.versions && c.versions[0]) || null;
    return {
      name: c.name,
      title: c.title || c.name,
      url:  v && v.url ? v.url : null,
      isHome: /^home(-fr)?$/.test(c.name),
    };
  });
};

// Détecte la langue de la page courante. Antora n'expose sur `page.attributes`
// que les attributs préfixés `page-`, donc l'attribut `lang` des antora.yml n'y
// est PAS visible : on déduit la langue du suffixe `-fr` du nom de component (ou
// de l'URL), exactement comme i18n.js et page-lang.js. La logique est dupliquée
// (et non importée) car Antora charge chaque helper isolément depuis le bundle.
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

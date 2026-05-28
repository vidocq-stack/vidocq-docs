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

  const lang = (ctx.page && ctx.page.attributes && ctx.page.attributes.lang)
    || (site.attributes && site.attributes['primary-language'])
    || 'fr';

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

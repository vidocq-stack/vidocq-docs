'use strict';

/**
 * Ordered list of components displayed in the sidebar as a quick access to
 * every module of the ecosystem.
 *
 * Hybrid mode:
 *   1. Components present in ORDER_BASE are rendered in the curated business
 *      order (home → tutorials → runtime → foundations → Jakarta layers →
 *      MicroProfile).
 *   2. Components auto-discovered in `site.components` but absent from
 *      ORDER_BASE are appended at the tail, sorted alphabetically by title.
 *
 * Consequence: a new module wired into `antora-playbook.yml` shows up in the
 * sidebar automatically without touching this helper. To position it
 * explicitly in the business order, add it to ORDER_BASE.
 */
const ORDER_BASE = [
  'home',
  'tutorials',
  // The runtime — the entry point most readers came for
  'vidocq',
  // Foundations
  'chappe', 'vauban', 'champollion',
  // Jakarta layers (foy = Servlet, cassini = REST, mansart = Data,
  // erasmus = Validation)
  'foy', 'cassini', 'mansart', 'erasmus',
  // MicroProfile (ravel = Config, knock = Health, dirac = Metrics,
  // heisenberg = Fault Tolerance, humboldt = Telemetry, cervantes = JWT,
  // cyrano = Rest Client, grimm = OpenAPI)
  'ravel', 'knock', 'dirac', 'heisenberg', 'humboldt', 'cervantes', 'cyrano', 'grimm',
];

module.exports = function componentsQuickNav (options) {
  const ctx = (options && options.data && options.data.root) || {};
  const site = ctx.site;
  if (!site || !site.components) return [];

  // Step 1 — curated components in ORDER_BASE business order.
  const known = ORDER_BASE
    .map((base) => site.components[base])
    .filter(Boolean);
  const knownNames = new Set(known.map((c) => c.name));

  // Step 2 — auto-discovery: any component absent from ORDER_BASE is appended
  // at the tail, sorted alphabetically by title.
  const unknown = Object.values(site.components)
    .filter((c) => !knownNames.has(c.name))
    .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));

  return [...known, ...unknown].map((c) => {
    const v = c.latest || (c.versions && c.versions[0]) || null;
    return {
      name: c.name,
      title: c.title || c.name,
      url:  v && v.url ? v.url : null,
      isHome: c.name === 'home',
    };
  });
};

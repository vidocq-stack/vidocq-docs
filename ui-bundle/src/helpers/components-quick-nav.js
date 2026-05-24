'use strict';

/**
 * Liste ordonnée des composants pour la langue courante, à afficher dans le
 * sidebar comme accès rapide à chaque module de l'écosystème.
 *
 * - lang = 'fr' → composants `home-fr`, `chappe-fr`, …, `vidocq-fr`
 * - lang = 'en' → composants `home`,    `chappe`,    …, `vidocq`
 *
 * Ordre métier : home (vue d'ensemble) en premier, puis les briques
 * fondatrices (transport / DI / sérialisation), puis les couches qui les
 * composent, et enfin l'orchestrateur — l'ordre que la doc canonique a
 * adopté pour la roadmap et les pages transverses.
 */
const ORDER_BASE = ['home', 'chappe', 'vauban', 'champollion', 'ravel', 'foy', 'cassini', 'mansart', 'knock', 'vidocq'];

module.exports = function componentsQuickNav (options) {
  const ctx = (options && options.data && options.data.root) || {};
  const site = ctx.site;
  if (!site || !site.components) return [];

  const lang = (ctx.page && ctx.page.attributes && ctx.page.attributes.lang)
    || (site.attributes && site.attributes['primary-language'])
    || 'fr';

  const suffix = lang === 'fr' ? '-fr' : '';

  // site.components est un objet { name → component }. Map pour préserver l'ordre métier.
  return ORDER_BASE
    .map((base) => site.components[base + suffix])
    .filter(Boolean)
    .map((c) => {
      const v = c.latest || (c.versions && c.versions[0]) || null;
      return {
        name: c.name,
        title: c.title || c.name,
        url:  v && v.url ? v.url : null,
        isHome: /^home(-fr)?$/.test(c.name),
      };
    });
};

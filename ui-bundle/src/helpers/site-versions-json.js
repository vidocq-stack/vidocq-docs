'use strict';

// JSON map of the versions each component publishes, e.g.
// {"vauban":["dev","0.2.0"],"erasmus":["dev"],...} — embedded as a data
// attribute on the version selector so site.js can rewrite links to the
// visitor's preferred version without guessing which targets exist.
module.exports = function siteVersionsJson (options) {
  const ctx = (options && options.data && options.data.root) || {};
  const site = ctx.site;
  if (!site || !site.components) return '{}';
  const map = {};
  for (const c of Object.values(site.components)) {
    const versions = (c.versions || []).map((v) => v.version).filter(Boolean);
    if (versions.length) map[c.name] = versions;
  }
  return JSON.stringify(map);
};

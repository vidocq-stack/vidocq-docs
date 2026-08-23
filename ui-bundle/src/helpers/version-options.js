'use strict';

/**
 * Options for the global version selector in the header.
 *
 * The list covers every version that exists ANYWHERE on the site (union across
 * components), not just the versions of the current component. When the
 * current component lacks one of them (e.g. erasmus has no 0.2.0), picking it
 * falls back to the site root (home) instead of a dead end.
 *
 * Returns [] on versionless pages (home, tutorials) — the header hides the
 * selector there.
 */
module.exports = function versionOptions (options) {
  const ctx = (options && options.data && options.data.root) || {};
  const site = ctx.site;
  const page = ctx.page || {};
  const current = page.componentVersion && page.componentVersion.version;
  if (!site || !site.components || !current) return [];

  // Union of the site's real versions, in Antora's order (prerelease first).
  const siteVersions = [];
  const seen = new Set();
  for (const c of Object.values(site.components)) {
    for (const v of c.versions || []) {
      if (!v.version || seen.has(v.version)) continue;
      seen.add(v.version);
      siteVersions.push({ version: v.version, label: v.displayVersion || v.version });
    }
  }

  // page.versions is only populated when the component has several versions;
  // on single-version components the current version maps to the page itself.
  const pageVersions = page.versions || [];
  return siteVersions.map((sv) => {
    const pv = pageVersions.find((x) => x.version === sv.version);
    let url = pv && pv.url;
    if (!url && sv.version === current) url = page.url;
    return {
      label: sv.label,
      url: url || '/home/index.html',
      selected: sv.version === current,
    };
  });
};

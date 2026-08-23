'use strict';

/**
 * Sidebar module tree: three top-level entries (overview, tutorials, runtime)
 * followed by a collapsible "Components" node grouped by nature of spec.
 *
 * The tree is version-aware: when the current page belongs to a versioned
 * component (0.2.0, dev…), every link targets the SAME version of the other
 * components, and components that do not exist in that version (e.g. erasmus,
 * dev-only) are hidden. Versionless components (home, tutorials) are always
 * shown. On versionless pages, links target each component's latest version.
 *
 * Groups are collapsed by default except the one containing the current
 * component (server-side `open`, no JS needed). Components discovered in the
 * playbook but absent from the curated lists are appended flat at the tail.
 */
const TOP = ['home', 'tutorials', 'vidocq'];

const CATEGORIES = [
  { label: 'Transport',       names: ['chappe'] },
  { label: 'Jakarta EE Core', names: ['vauban', 'champollion', 'cassini'] },
  { label: 'Jakarta EE Web',  names: ['foy', 'mansart', 'erasmus'] },
  { label: 'MicroProfile',    names: ['ravel', 'knock', 'dirac', 'heisenberg', 'humboldt', 'cervantes', 'cyrano', 'grimm'] },
];

module.exports = function componentsQuickNav (options) {
  const ctx = (options && options.data && options.data.root) || {};
  const site = ctx.site;
  if (!site || !site.components) return null;

  const currentName =
    (ctx.page && ctx.page.componentVersion && ctx.page.componentVersion.name) ||
    (ctx.page && ctx.page.component && ctx.page.component.name) || '';
  const currentVersion =
    (ctx.page && ctx.page.componentVersion && ctx.page.componentVersion.version) || '';

  // null -> component hidden in the current version context
  const entry = (c) => {
    const versions = c.versions || [];
    const versionless = versions.length === 1 && versions[0].version === '';
    let v = null;
    if (!currentVersion || versionless) {
      v = c.latest || versions[0] || null;
    } else {
      v = versions.find((x) => x.version === currentVersion) || null;
      if (!v) return null;
    }
    return {
      name: c.name,
      title: c.title || c.name,
      url: v && v.url ? v.url : null,
      isHome: c.name === 'home',
      isCurrent: c.name === currentName,
    };
  };

  const used = new Set();
  const top = TOP
    .map((n) => site.components[n])
    .filter(Boolean)
    .map((c) => { used.add(c.name); return entry(c); })
    .filter(Boolean);

  let componentsOpen = false;
  const categories = [];
  for (const cat of CATEGORIES) {
    const items = cat.names
      .map((n) => site.components[n])
      .filter(Boolean)
      .map((c) => { used.add(c.name); return entry(c); })
      .filter(Boolean);
    if (!items.length) continue;
    const open = items.some((i) => i.isCurrent);
    if (open) componentsOpen = true;
    categories.push({ label: cat.label, open, items });
  }

  const extra = Object.values(site.components)
    .filter((c) => !used.has(c.name))
    .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name))
    .map(entry)
    .filter(Boolean);

  return { top, categories, componentsOpen, extra };
};

'use strict';

/**
 * Sidebar module tree: three top-level entries (overview, tutorials, runtime)
 * followed by a collapsible "Components" node grouped by nature of spec.
 *
 * Groups are collapsed by default except the one containing the component of
 * the current page (server-side `open`, no JS needed). Components discovered
 * in the playbook but absent from the curated lists are appended flat after
 * the Components node, sorted by title — a new module shows up without
 * touching this helper.
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

  const entry = (c) => {
    const v = c.latest || (c.versions && c.versions[0]) || null;
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
    .map((c) => { used.add(c.name); return entry(c); });

  let componentsOpen = false;
  const categories = [];
  for (const cat of CATEGORIES) {
    const items = cat.names
      .map((n) => site.components[n])
      .filter(Boolean)
      .map((c) => { used.add(c.name); return entry(c); });
    if (!items.length) continue;
    const open = items.some((i) => i.isCurrent);
    if (open) componentsOpen = true;
    categories.push({ label: cat.label, open, items });
  }

  const extra = Object.values(site.components)
    .filter((c) => !used.has(c.name))
    .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name))
    .map(entry);

  return { top, categories, componentsOpen, extra };
};

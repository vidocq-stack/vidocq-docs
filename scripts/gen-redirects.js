#!/usr/bin/env node
// Rewrite build/site/_redirects for Cloudflare Pages.
//
// Antora publishes every component page under its version segment
// (/vauban/0.2.0/..., /vauban/dev/...) but cannot emit redirects from the
// legacy segment-less URLs when latest_version_segment is ''. This script
// enumerates them page by page (wildcards like /vauban/* would swallow the
// /dev/ and /0.2.0/ subtrees, since Pages evaluates redirects before assets).
// Cloudflare's format has no Netlify-style '!' force marker, so the file is
// rewritten from scratch: home rules + one exact rule per released page.
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..', 'build', 'site');
const rules = ['/ /home/ 301', '/index.html /home/index.html 301'];

const listHtml = (dir, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...listHtml(path.join(dir, e.name), base + e.name + '/'));
    else if (e.name.endsWith('.html')) out.push(base + e.name);
  }
  return out;
};

// Highest x.y.z wins; named versions (dev) rank below any release.
const semverKey = (v) => {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? (+m[1] * 1e6 + +m[2] * 1e3 + +m[3]) : -1;
};

for (const comp of fs.readdirSync(SITE, { withFileTypes: true })) {
  if (!comp.isDirectory() || comp.name.startsWith('_') || comp.name === 'home') continue;
  const root = path.join(SITE, comp.name);
  const versions = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  // target: the latest released version if any, else the only (dev) version
  const released = versions.filter((v) => semverKey(v) >= 0).sort((a, b) => semverKey(b) - semverKey(a));
  const target = released[0] || (versions.length === 1 ? versions[0] : null);
  if (!target) continue;
  rules.push(`/${comp.name}/ /${comp.name}/${target}/ 301`);
  for (const page of listHtml(path.join(root, target))) {
    rules.push(`/${comp.name}/${page} /${comp.name}/${target}/${page} 301`);
    // Cloudflare Pages serves pretty URLs (page.html -> /page, index.html ->
    // directory), and that is what visitors copy — cover that form too.
    if (page.endsWith('index.html')) {
      const dir = page.slice(0, -'index.html'.length);
      if (dir) rules.push(`/${comp.name}/${dir} /${comp.name}/${target}/${dir} 301`);
    } else {
      const pretty = page.slice(0, -'.html'.length);
      rules.push(`/${comp.name}/${pretty} /${comp.name}/${target}/${pretty} 301`);
    }
  }
}

fs.writeFileSync(path.join(SITE, '_redirects'), rules.join('\n') + '\n');
console.log(`[gen-redirects] ${rules.length} rules written to build/site/_redirects`);

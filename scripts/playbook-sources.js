// The content sources of an Antora playbook, read and rewritten line by line so that comments and layout stay.
//
// Used by cut-docs-release.js and cumulate-whats-new.js. A source is one `- url:` entry of content.sources; one
// repository can have several (the monorepo has one per documentation layout: its `main`, the old runtime layout of
// docs/<version>, the docs-archive/<version> branches of the bricks).
'use strict';
const fs = require('fs');
const path = require('path');

const indentOf = (line) => line.length - line.trimStart().length;

// The released line a branch carries: docs/0.4.0 and docs-archive/0.4.0 both carry 0.4.0.
const versionOf = (branch) => {
  const m = /^docs(?:-archive)?\/(.+)$/.exec(branch);
  return m ? m[1] : null;
};

// x.y.z; a release candidate x.y.z-RCn ranks just below x.y.z; named versions (dev) are -1.
const semverKey = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-RC(\d+))?$/.exec(v);
  return m ? (+m[1] * 1e6 + +m[2] * 1e3 + +m[3] - (m[4] ? 0.5 - +m[4] / 1000 : 0)) : -1;
};

// A line replaces the earlier release candidates of its own train (RC1 once RC2 is out, every RC once the final is
// out).
const trainOf = (v) => v.replace(/-RC\d+$/, '');
const retired = (v, version) => v !== version && /-RC\d+$/.test(v) && trainOf(v) === trainOf(version);

function repoOf(url) {
  let m = /^https:\/\/codefloe\.com\/Vidocq\/([\w-]+)\.git$/.exec(url);
  if (m) return m[1];
  m = /^(?:\.\.\/)+([\w-]+)(?:\/[\w.-]+)?$/.exec(url); // ../../vidocq/main (workspace) or ../vidocq (sibling)
  if (m) return m[1];
  return url; // '.' is this repository
}

// The items of a flow sequence that may wrap over several lines: [a, b,\n c]. Returns {items, last}.
function flowList(lines, i) {
  let text = lines[i].slice(lines[i].indexOf('[') + 1);
  let j = i;
  while (!text.includes(']') && j + 1 < lines.length) text += ' ' + lines[++j].trim();
  const items = text.slice(0, text.indexOf(']')).split(',').map((s) => s.trim()).filter(Boolean);
  return { items, last: j };
}

function parseSources(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s*url:\s*(\S+)\s*$/.exec(lines[i]);
    if (!m) continue;
    const dash = m[1].length;
    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== '' && indentOf(lines[end]) > dash) end++;
    let start = i;
    while (start > 0 && indentOf(lines[start - 1]) === dash && lines[start - 1].trim().startsWith('#')) start--;
    const src = { url: m[2], repo: repoOf(m[2]), start, end, branches: null, branchesAt: null, startPaths: [] };
    for (let j = i + 1; j < end; j++) {
      const f = /^\s*(branches|start_paths|start_path):\s*(.*)$/.exec(lines[j]);
      if (!f) continue;
      if (f[1] === 'branches') {
        if (f[2].startsWith('[')) {
          const { items, last } = flowList(lines, j);
          src.branches = items;
          src.branchesAt = { first: j, last, indent: lines[j].slice(0, indentOf(lines[j])) };
          j = last;
        }
      } else if (f[1] === 'start_path') {
        src.startPaths = [f[2].trim()];
      } else if (f[2].startsWith('[')) {
        const { items, last } = flowList(lines, j);
        src.startPaths = items;
        j = last;
      } else {
        const own = indentOf(lines[j]);
        while (j + 1 < end && indentOf(lines[j + 1]) > own && /^\s*-\s+\S/.test(lines[j + 1])) {
          src.startPaths.push(lines[++j].trim().replace(/^-\s+/, ''));
        }
      }
    }
    src.dev = !!src.branches && src.branches.some((b) => b === 'main' || b === 'HEAD');
    out.push(src);
  }
  return out;
}

// The repositories with a released line in some source, plus those named by --include, in playbook order.
function versionedRepos(sources, include) {
  const names = [];
  for (const s of sources) {
    const released = (s.branches || []).some((b) => versionOf(b));
    if ((released || include.includes(s.repo)) && !names.includes(s.repo)) names.push(s.repo);
  }
  return names;
}

// The documentation roots (folders of an antora.yml) a release cut pins: the start paths of the sources that read
// the repository's main.
function devStartPaths(sources, repo) {
  const out = [];
  for (const s of sources) {
    if (s.repo !== repo || !s.dev) continue;
    for (const p of s.startPaths) if (!out.includes(p)) out.push(p);
  }
  return out;
}

// Publishes `version` and applies the retention window (the last `keep` lines of each versioned repository, across
// its sources, without the retired release candidates). The new line goes to the sources that read main, since the
// cut branches docs/<version> from main with main's layout; the other sources only lose lines, and a source left
// with none is removed with its comment.
function applyRetention(text, { version, keep, versioned }) {
  const sources = parseSources(text);
  const lines = text.split('\n');
  const edits = []; // {first, last, replacement[]}
  const changes = [];
  for (const repo of versioned) {
    const own = sources.filter((s) => s.repo === repo && s.branches);
    const all = new Set([version]);
    own.forEach((s) => s.branches.map(versionOf).filter(Boolean).forEach((v) => all.add(v)));
    const window = [...all].filter((v) => semverKey(v) >= 0 && !retired(v, version))
      .sort((a, b) => semverKey(b) - semverKey(a)).slice(0, keep);
    for (const s of own) {
      const byVersion = new Map(s.branches.filter(versionOf).map((b) => [versionOf(b), b]));
      if (s.dev) byVersion.set(version, byVersion.get(version) || 'docs/' + version);
      const kept = [...s.branches.filter((b) => !versionOf(b)),
        ...window.filter((v) => byVersion.has(v)).map((v) => byVersion.get(v))];
      if (kept.join() === s.branches.join()) continue;
      changes.push({ repo, from: s.branches, to: kept });
      if (kept.length) {
        edits.push({ first: s.branchesAt.first, last: s.branchesAt.last, replacement: [`${s.branchesAt.indent}branches: [${kept.join(', ')}]`] });
      } else {
        edits.push({ first: s.start, last: s.end - 1, replacement: [] });
      }
    }
  }
  edits.sort((a, b) => b.first - a.first).forEach((e) => lines.splice(e.first, e.last - e.first + 1, ...e.replacement));
  return { text: lines.join('\n'), changes };
}

// The clone of a repository: <workspace>/<repo>/main in the mani workspace, <workspace>/<repo> next to it otherwise.
function repoDir(workspace, repo) {
  for (const d of [path.join(workspace, repo, 'main'), path.join(workspace, repo)]) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
  }
  return null;
}

// The mani workspace holding vidocq-docs/<branch>/ (the first folder above with a mani.yaml; a branch name may have
// a slash, feat/x), or the parent folder of a sibling clone.
function defaultWorkspace(root) {
  for (let d = path.resolve(root, '..'); d !== path.dirname(d); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'mani.yaml'))) return d;
  }
  return path.resolve(root, '..');
}

module.exports = {
  parseSources, applyRetention, versionedRepos, devStartPaths, versionOf, semverKey, retired, repoDir, defaultWorkspace,
};

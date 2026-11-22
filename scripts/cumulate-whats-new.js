#!/usr/bin/env node
// Make the What's new pages of a release line cumulative.
//
//   node scripts/cumulate-whats-new.js --from 0.4.0-RC1 --to 0.4.0-RC2 --base 0.3.0 [--dry-run]
//        [--workspace <dir>] [--playbook <file>] [--print <component>]
//
// When a documentation line is retired because a newer one of the same train replaces it (RC1 dropped
// once RC2 is out, the RCs dropped once the final is out), the entries of the retired page must not
// vanish: for every versioned repository, the What's new page of docs/<to> becomes
//
//   * a lead paragraph that says what the page covers (everything since --base);
//   * one section per line of the train, newest first: "Added in <to> (since <from>)", then the
//     sections the <from> page already carried (or, when <from> is a first page, its whole body as
//     "Brought by <from> (since <base>)");
//   * the {tag-new} badges of the older sections dropped: the NEW badges on the pages mark the
//     newest line only.
//
// Each section starts with an anchor ([#rc2], [#rc1], [#final]) so other pages can link to it.
// The commit goes straight to the docs/<to> branch, as cut-docs-release.js does. It is idempotent:
// a page that already has the section anchor of <to> is left alone.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { parseSources, versionedRepos, devStartPaths, versionOf, repoDir, defaultWorkspace } = require('./playbook-sources');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const FROM = opt('from');
const TO = opt('to');
const BASE = opt('base');
const DRY = args.includes('--dry-run');
const PRINT = opt('print');
const WORKSPACE = path.resolve(ROOT, opt('workspace', defaultWorkspace(ROOT)));
const PAGE = 'modules/ROOT/pages/whats-new.adoc'; // under the folder of the component's antora.yml

if (!FROM || !TO || !BASE) {
  console.error('usage: cumulate-whats-new.js --from <version> --to <version> --base <version> [--dry-run]');
  process.exit(2);
}

const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const anchor = (v) => (/-RC(\d+)$/.exec(v) ? 'rc' + /-RC(\d+)$/.exec(v)[1] : 'final');
const NEW_BADGE = / ?\[\.tag-new\]#NEW# ?/g;
const PLACEHOLDER = /^_Nothing documented yet/m;
const MARK = '// cumulative what\'s new';

// Split a page into its body (after the [.lead] paragraph), dropping title, :description: and lead.
function bodyOf(text) {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && !/^\[\.lead\]/.test(lines[i])) i++;
  if (i === lines.length) return text.trim();
  i++;
  while (i < lines.length && lines[i].trim() !== '') i++; // the lead paragraph
  return lines.slice(i).join('\n').trim();
}

// The attributes of a retired page mean something else on the new line: {release-version} was the
// release before the line (BASE) and is now the line itself, {project-version} the line (FROM).
const pinAttrs = (text, release, project) =>
  text.replace(/\{release-version\}/g, release).replace(/\{project-version\}/g, project);

const demote = (body) => body.split('\n').map((l) => (/^=+ /.test(l) ? '=' + l : l)).join('\n');

// The sections a cumulative page already has: [{id, text}] in file order.
function sectionsOf(body) {
  const out = [];
  const re = /^\[#([\w-]+)\]\n(== .*)$/gm;
  const starts = [];
  let m;
  while ((m = re.exec(body))) starts.push({ id: m[1], at: m.index });
  starts.forEach((s, k) => out.push({ id: s.id, text: body.slice(s.at, k + 1 < starts.length ? starts[k + 1].at : undefined).trim() }));
  return out;
}

function cumulate(fromText, toText) {
  if (toText.includes(MARK)) return null; // already cumulative
  const fromBody = bodyOf(fromText);
  const toBody = PLACEHOLDER.test(bodyOf(toText)) ? '' : bodyOf(toText);

  let older;
  if (fromText.includes(MARK)) {
    older = sectionsOf(fromBody).map((s) => ({ ...s, text: s.text.replace(NEW_BADGE, ' ').replace(/ +—/g, ' —') }));
  } else {
    const body = PLACEHOLDER.test(fromBody) ? '' : pinAttrs(demote(fromBody), BASE, FROM).replace(NEW_BADGE, ' ').replace(/ +—/g, ' —');
    older = [{
      id: anchor(FROM),
      text: `[#${anchor(FROM)}]\n== Brought by ${FROM} (since ${BASE})\n\n` + (body || `_Nothing new in this component in ${FROM}._`),
    }];
  }
  const newest = {
    id: anchor(TO),
    text: `[#${anchor(TO)}]\n== Added in ${TO} (since ${FROM})\n\n` + (toBody ? pinAttrs(demote(toBody), FROM, TO) : `_Nothing new in this component since ${FROM}._`),
  };
  const links = [newest, ...older].map((s) => `<<${s.id},${s.text.split('\n')[1].slice(3).replace(/ \(since.*/, '')}>>`);
  return `= What's new
:description: Everything that changed in this component since the ${BASE} release, release candidate by release candidate.

[.lead]
Everything that landed in this component since the ${BASE} release, newest first: ${links.join(', ')}. The documentation of the earlier release candidates is no longer published, so their entries are kept here. Every entry links to the section that documents it, and the [.tag-new]#NEW# badges on those pages mark what ${TO} added. Each brick of the suite keeps its own page of this kind; xref:home::whats-new.adoc[the ecosystem index] gathers them.

${MARK}

${[newest, ...older].map((s) => s.text).join('\n\n')}
`;
}

// ---- discover the pages from the prod playbook ---------------------------------------------
// A component is matched by its Antora name across lines, since its folder may differ between them: in the
// monorepo, 0.4.0-RC2's runtime is at docs/en of docs/0.4.0-RC2 and its bricks at <brick>/docs/en of
// docs-archive/0.4.0-RC2, while docs/0.4.0 has each under its folder of main. The <from> pages are found through the
// sources that list a <from> branch, the <to> pages under the start paths of the sources that read main (docs/<to>
// is cut from main), so run this before the retention window drops <from> from the playbook, as
// cut-docs-release.js does; --playbook <file> reads another copy.
const sources = parseSources(fs.readFileSync(path.resolve(ROOT, opt('playbook', 'antora-playbook.yml')), 'utf8'));
const repos = versionedRepos(sources, []).filter((n) => n !== '.');

// {component name -> {branch, page}} of one line of a repository.
function pagesOf(dir, roots) {
  const out = new Map();
  for (const { branch, root } of roots) {
    let yml;
    try { yml = sh(`git show origin/${branch}:${root}/antora.yml`, dir); } catch { continue; }
    const name = (/^name:\s*(\S+)/m.exec(yml) || [])[1];
    if (name && !out.has(name)) out.set(name, { branch, page: `${root}/${PAGE}` });
  }
  return out;
}

const failures = [];
for (const name of repos) {
  const dir = repoDir(WORKSPACE, name);
  if (!dir) { failures.push(`${name}: clone not found under ${WORKSPACE}`); continue; }
  try {
    sh('git fetch -q origin', dir);
    const fromRoots = sources.filter((s) => s.repo === name && (s.branches || []).some((b) => versionOf(b) === FROM))
      .flatMap((s) => s.startPaths.map((root) => ({ branch: s.branches.find((b) => versionOf(b) === FROM), root })));
    const toRoots = devStartPaths(sources, name).map((root) => ({ branch: `docs/${TO}`, root }));
    const from = pagesOf(dir, fromRoots);
    const to = pagesOf(dir, toRoots);
    if (!to.size) { console.log(`${name}: no component on docs/${TO} — skipped`); continue; }
    const writes = [];
    for (const [component, t] of to) {
      const label = name === component ? name : `${name}/${component}`;
      const show = (loc) => { try { return sh(`git show origin/${loc.branch}:${loc.page}`, dir); } catch { return null; } };
      const toText = show(t);
      const fromText = from.has(component) ? show(from.get(component)) : null;
      if (!toText) { console.log(`${label}: no What's new page on docs/${TO} — skipped`); continue; }
      if (!fromText) { console.log(`${label}: no What's new page on the ${FROM} line — skipped (nothing to keep)`); continue; }
      const merged = cumulate(fromText, toText);
      if (merged === null) { console.log(`${label}: docs/${TO} is already cumulative`); continue; }
      const count = (x) => (x.match(/^\* /gm) || []).length;
      console.log(`${label}: ${count(toText)} entries of ${TO} + ${count(fromText)} of ${FROM} -> ${count(merged)}${DRY ? ' (dry-run)' : ''}`);
      if (PRINT === component) console.log(merged);
      writes.push({ page: t.page, merged });
    }
    if (DRY || !writes.length) continue;
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), `cumul-${name}-`));
    sh(`git worktree add -q ${wt} origin/docs/${TO}`, dir);
    for (const w of writes) {
      fs.writeFileSync(path.join(wt, w.page), w.merged);
      sh(`git add ${w.page}`, wt);
    }
    sh(`git commit -q -S -s -m "docs(whats-new): keep the ${FROM} entries in the ${TO} pages"`, wt);
    sh(`git push -q origin HEAD:refs/heads/docs/${TO}`, wt);
    sh(`git worktree remove --force ${wt}`, dir);
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
  }
}
console.log('\n---');
if (failures.length) { console.log('FAILURES:'); failures.forEach((f) => console.log('  ' + f)); process.exit(1); }

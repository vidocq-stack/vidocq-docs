#!/usr/bin/env node
// Make the What's new pages of a release line cumulative.
//
//   node scripts/cumulate-whats-new.js --from 0.4.0-RC1 --to 0.4.0-RC2 --base 0.3.0 [--dry-run]
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

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const FROM = opt('from');
const TO = opt('to');
const BASE = opt('base');
const DRY = args.includes('--dry-run');
const PRINT = opt('print');
const WORKSPACE = path.resolve(ROOT, opt('workspace', '..'));
const PAGE = 'docs/en/modules/ROOT/pages/whats-new.adoc';

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

// ---- discover versioned repos from the prod playbook --------------------------------------
const playbook = fs.readFileSync(path.join(ROOT, 'antora-playbook.yml'), 'utf8');
const repos = [];
{
  const lines = playbook.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/-\s*url:\s*https:\/\/codefloe\.com\/Vidocq\/([\w-]+)\.git/);
    if (m && /docs\//.test(lines[i + 1] || '')) repos.push(m[1]);
  }
}

const failures = [];
for (const name of repos) {
  const dir = path.join(WORKSPACE, name);
  try {
    sh('git fetch -q origin', dir);
    const show = (b) => { try { return sh(`git show origin/docs/${b}:${PAGE}`, dir); } catch { return null; } };
    const fromText = show(FROM);
    const toText = show(TO);
    if (!toText) { console.log(`${name}: no What's new page on docs/${TO} — skipped`); continue; }
    if (!fromText) { console.log(`${name}: no What's new page on docs/${FROM} — skipped (nothing to keep)`); continue; }
    const merged = cumulate(fromText, toText);
    if (merged === null) { console.log(`${name}: docs/${TO} is already cumulative`); continue; }
    const count = (t) => (t.match(/^\* /gm) || []).length;
    console.log(`${name}: ${count(toText)} entries of ${TO} + ${count(fromText)} of ${FROM} -> ${count(merged)}${DRY ? ' (dry-run)' : ''}`);
    if (PRINT === name) console.log(merged);
    if (DRY) continue;
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), `cumul-${name}-`));
    sh(`git worktree add -q ${wt} origin/docs/${TO}`, dir);
    fs.writeFileSync(path.join(wt, PAGE), merged);
    sh(`git add ${PAGE}`, wt);
    sh(`git commit -q -S -s -m "docs(whats-new): keep the ${FROM} entries in the ${TO} page"`, wt);
    sh(`git push -q origin HEAD:refs/heads/docs/${TO}`, wt);
    sh(`git worktree remove --force ${wt}`, dir);
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
  }
}
console.log('\n---');
if (failures.length) { console.log('FAILURES:'); failures.forEach((f) => console.log('  ' + f)); process.exit(1); }

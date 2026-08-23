#!/usr/bin/env node
// Cut the documentation for a release train.
//
//   node scripts/cut-docs-release.js --version 0.3.0 --next 0.4.0-SNAPSHOT \
//        [--include erasmus] [--keep 3] [--dry-run]
//
// "Freezing the dev docs" IS the branch cut: for every versioned component
// this script branches docs/<version> from origin/main (the dev docs at this
// exact moment), pins its antora.yml, then moves main's attributes to the next
// SNAPSHOT. Finally it updates both playbooks, keeping the last --keep
// releases (default 3) plus main (dev) — the version dropdown follows the
// playbook automatically, nothing else to touch.
//
// Repos are the sibling clones (../<repo>); every git write goes through an
// ephemeral detached worktree, never through the clone's working tree.
// Branches dropped from the playbook are NOT deleted — re-add them to publish
// an old version again.
//
// Manual follow-ups it will remind you about: cli-version (vidocq only, when
// the CLI ships a new release) and checking the deploy run.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes('--' + name);

const VERSION = opt('version');
const NEXT = opt('next');
const KEEP = parseInt(opt('keep', '3'), 10);
const WORKSPACE = path.resolve(ROOT, opt('workspace', '..'));
const INCLUDE = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--include') INCLUDE.push(args[i + 1]);
const DRY = flag('dry-run');

if (!/^\d+\.\d+\.\d+$/.test(VERSION || '') || !/-SNAPSHOT$/.test(NEXT || '')) {
  console.error('usage: cut-docs-release.js --version X.Y.Z --next A.B.C-SNAPSHOT [--include repo]... [--keep N] [--dry-run]');
  process.exit(2);
}

const semverKey = (v) => {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? (+m[1] * 1e6 + +m[2] * 1e3 + +m[3]) : -1;
};

const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const act = (desc, fn) => { console.log((DRY ? '[dry-run] ' : '') + desc); if (!DRY) return fn(); };

// ---- discover versioned repos from the prod playbook -----------------------
const playbook = fs.readFileSync(path.join(ROOT, 'antora-playbook.yml'), 'utf8');
const repos = []; // {name, branches[]}
{
  const lines = playbook.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/-\s*url:\s*https:\/\/codefloe\.com\/Vidocq\/([\w-]+)\.git/);
    if (!m) continue;
    const bm = (lines[i + 1] || '').match(/branches:\s*\[([^\]]*)\]/);
    const branches = bm ? bm[1].split(',').map((s) => s.trim()) : [];
    repos.push({ name: m[1], branches });
  }
}
const versioned = repos.filter((r) => r.branches.some((b) => b.startsWith('docs/')) || INCLUDE.includes(r.name));
console.log(`Release ${VERSION} (next: ${NEXT}) — ${versioned.length} repos: ${versioned.map((r) => r.name).join(', ')}\n`);

// ---- antora.yml transformations --------------------------------------------
function pinRelease(y) {
  y = y.replace(/^version: (~|dev)$/m, `version: '${VERSION}'`);
  y = y.split('\n').filter((l) => !/^prerelease:/.test(l)).join('\n');
  y = /project-version:/.test(y)
    ? y.replace(/project-version: .*$/m, `project-version: ${VERSION}`)
    : y + `    project-version: ${VERSION}\n`;
  y = /release-version:/.test(y)
    ? y.replace(/release-version: .*$/m, `release-version: ${VERSION}`)
    : y.replace(/(project-version: .*$)/m, `$1\n    release-version: ${VERSION}`);
  return y;
}
function bumpMain(y) {
  if (!/^version: dev$/m.test(y)) {
    y = y.replace(/^version: ~$/m, 'version: dev\nprerelease: true');
  }
  y = /project-version:/.test(y)
    ? y.replace(/project-version: .*$/m, `project-version: ${NEXT}`)
    : y + `    project-version: ${NEXT}\n`;
  y = /release-version:/.test(y)
    ? y.replace(/release-version: .*$/m, `release-version: ${VERSION}`)
    : y.replace(/(project-version: .*$)/m, `$1\n    release-version: ${VERSION}`);
  return y;
}

// ---- per-repo: cut docs/<version>, bump main -------------------------------
const failures = [];
for (const r of versioned) {
  const repoDir = path.join(WORKSPACE, r.name);
  if (!fs.existsSync(path.join(repoDir, '.git'))) { failures.push(`${r.name}: clone not found at ${repoDir}`); continue; }
  try {
    sh('git fetch -q origin main', repoDir);
    const already = sh(`git ls-remote --heads origin docs/${VERSION}`, repoDir) !== '';
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), `cutdocs-${r.name}-`));
    if (already) {
      console.log(`${r.name}: docs/${VERSION} already exists on origin — skipping the cut, bumping main only`);
    } else {
      act(`${r.name}: branch docs/${VERSION} from origin/main, pin antora.yml, push`, () => {
        sh(`git worktree add -q ${wt} origin/main`, repoDir);
        const yml = path.join(wt, 'docs/en/antora.yml');
        fs.writeFileSync(yml, pinRelease(fs.readFileSync(yml, 'utf8')));
        sh('git add docs/en/antora.yml', wt);
        sh(`git commit -q -s -m "docs: pin the ${VERSION} release documentation line"`, wt);
        sh(`git push -q origin HEAD:refs/heads/docs/${VERSION}`, wt);
        sh(`git worktree remove --force ${wt}`, repoDir);
      });
    }
    act(`${r.name}: bump main to ${NEXT}, clear {tag-new} badges, reset whats-new, push`, () => {
      const wt2 = fs.mkdtempSync(path.join(os.tmpdir(), `cutmain-${r.name}-`));
      sh(`git worktree add -q ${wt2} origin/main`, repoDir);
      const yml = path.join(wt2, 'docs/en/antora.yml');
      const before = fs.readFileSync(yml, 'utf8');
      const after = bumpMain(before);
      let dirty = after !== before;
      if (dirty) fs.writeFileSync(yml, after);
      // New cycle: the frozen docs/<VERSION> keeps its NEW badges; main drops
      // them and restarts the what's-new page empty.
      const stripNew = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) stripNew(p);
          else if (e.name.endsWith('.adoc')) {
            const t = fs.readFileSync(p, 'utf8');
            const t2 = t.replace(/ ?\[\.tag-new\]#NEW# ?/g, '');
            if (t2 !== t) { fs.writeFileSync(p, t2); dirty = true; }
          }
        }
      };
      const pagesDir = path.join(wt2, 'docs/en/modules');
      if (fs.existsSync(pagesDir)) stripNew(pagesDir);
      const wn = path.join(wt2, 'docs/en/modules/ROOT/pages/whats-new.adoc');
      if (fs.existsSync(wn)) {
        fs.writeFileSync(wn, `= What's new
:description: Everything that changed across the Vidocq ecosystem since the {release-version} release.

[.lead]
New in the \`{project-version}\` development line — everything listed here landed **after the {release-version} release** and is not part of it. Sections carrying the [.tag-new]#NEW# badge across the documentation point to these features. When the next release train ships, this page is frozen with it and restarts empty on the dev line.

_Nothing documented yet for this cycle. Add entries here (and place [.tag-new]#NEW# badges on the relevant pages) as features land on main._
`);
        dirty = true;
      }
      if (dirty) {
        sh('git add docs/en', wt2);
        sh(`git commit -q -s -m "docs: dev line moves to ${NEXT} (last release: ${VERSION})"`, wt2);
        sh('git push -q origin HEAD:main', wt2);
      } else {
        console.log(`${r.name}: main docs already up to date`);
      }
      sh(`git worktree remove --force ${wt2}`, repoDir);
    });
  } catch (e) {
    failures.push(`${r.name}: ${e.message.split('\n')[0]}`);
  }
}

// ---- playbooks: retention window -------------------------------------------
const kept = (branches) => {
  const releases = [...new Set(branches.filter((b) => b.startsWith('docs/')).map((b) => b.slice(5)).concat(VERSION))]
    .filter((v) => semverKey(v) >= 0)
    .sort((a, b) => semverKey(b) - semverKey(a))
    .slice(0, KEEP);
  return ['main', ...releases.map((v) => 'docs/' + v)];
};

for (const file of ['antora-playbook.yml', 'antora-playbook-local.yml']) {
  const p = path.join(ROOT, file);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  let touched = 0;
  let sample = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/-\s*url:\s*(?:https:\/\/codefloe\.com\/Vidocq\/([\w-]+)\.git|\.\.\/([\w-]+))\s*$/);
    const name = m && (m[1] || m[2]);
    if (!name || !versioned.some((r) => r.name === name)) continue;
    const bm = (lines[i + 1] || '').match(/^(\s*)branches:\s*\[([^\]]*)\]/);
    if (!bm) continue;
    const newList = kept(bm[2].split(',').map((s) => s.trim()));
    if (!sample) sample = newList;
    lines[i + 1] = `${bm[1]}branches: [${newList.join(', ')}]`;
    touched++;
  }
  act(`${file}: retention window applied to ${touched} sources -> [${(sample || kept([])).join(', ')}]`, () => {
    fs.writeFileSync(p, lines.join('\n'));
  });
}

act('vidocq-docs: commit playbooks (push it yourself to trigger the deploy)', () => {
  sh('git add antora-playbook.yml antora-playbook-local.yml', ROOT);
  sh(`git commit -q -s -m "docs-site: publish the ${VERSION} release line (retention: last ${KEEP} + dev)"`, ROOT);
});

console.log('\n---');
if (failures.length) { console.log('FAILURES:'); failures.forEach((f) => console.log('  ' + f)); }
console.log(`Done${DRY ? ' (dry-run, nothing written)' : ''}. Reminders:
  - git push (vidocq-docs) to trigger the site deploy, then check the run.
  - vidocq only: bump cli-version in docs/en/antora.yml (main + docs/${VERSION}) if the CLI shipped a new version.
  - releases older than the ${KEEP}-version window left the playbook but their docs/* branches remain — re-add one to republish it.`);
process.exit(failures.length ? 1 : 0);

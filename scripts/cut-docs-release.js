#!/usr/bin/env node
// Cut the documentation for a release train.
//
//   node scripts/cut-docs-release.js --version 0.3.0 --next 0.4.0-SNAPSHOT \
//        [--include erasmus] [--keep 3] [--bump-branch <name>] [--dry-run]
//
// A release candidate (--version 0.4.0-RC1) is cut the same way, but its docs line is marked
// `prerelease: true`: it appears in the version dropdown without becoming the default one, and
// the bare URLs keep pointing at the latest final release.
//
// --bump-branch <name>: push each repo's main bump (next SNAPSHOT, badges cleared, what's-new
// reset) to the branch <name> instead of main, for repositories whose main only takes pull
// requests; open the PRs yourself.
//
// "Freezing the dev docs" IS the branch cut: for every versioned component
// this script branches docs/<version> from origin/main (the dev docs at this
// exact moment), pins its antora.yml, then moves main's attributes to the next
// SNAPSHOT. Finally it updates both playbooks, keeping the last --keep
// releases (default 3) plus main (dev) — the version dropdown follows the
// playbook automatically, nothing else to touch.
//
// A repository with several components (the monorepo) is cut once: docs/<version>
// branches from its main, and every antora.yml under the start paths of the
// playbook sources that read its main is pinned on it, then bumped on main. Only
// those sources get the new line; the others (the old runtime layout of
// docs/<version>, the docs-archive/<version> branches of the bricks) only leave
// the retention window, and a source left without a line leaves the playbook.
// The monorepo's main takes pull requests only: pass --bump-branch.
//
// Repos are the clones of the mani workspace (<workspace>/<repo>/main) or
// sibling clones (../<repo>); every git write goes through an ephemeral detached
// worktree, never through the clone's working tree. Branches dropped from the
// playbook are NOT deleted — re-add them to publish an old version again.
//
// A release candidate replaces the earlier ones of its train: their docs line leaves the playbooks and
// their What's new entries are kept in the cumulative pages (scripts/cumulate-whats-new.js).
//
// Manual follow-ups it will remind you about: the ecosystem What's new page of
// content/home, which no script writes, and checking the deploy run.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const {
  parseSources, applyRetention, versionedRepos, devStartPaths, versionOf, semverKey, retired: retiredBy, repoDir,
  defaultWorkspace,
} = require('./playbook-sources');
const { stripNewBadges } = require('./new-badges');

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
const WORKSPACE = path.resolve(ROOT, opt('workspace', defaultWorkspace(ROOT)));
const INCLUDE = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--include') INCLUDE.push(args[i + 1]);
const DRY = flag('dry-run');
const BUMP_BRANCH = opt('bump-branch');
const PRERELEASE = /-RC\d+$/.test(VERSION || '');

if (!/^\d+\.\d+\.\d+(-RC\d+)?$/.test(VERSION || '') || !/-SNAPSHOT$/.test(NEXT || '')) {
  console.error('usage: cut-docs-release.js --version X.Y.Z --next A.B.C-SNAPSHOT [--include repo]... [--keep N] [--dry-run]');
  process.exit(2);
}

const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const act = (desc, fn) => { console.log((DRY ? '[dry-run] ' : '') + desc); if (!DRY) return fn(); };

// ---- discover versioned repos from the prod playbook -----------------------
const sources = parseSources(fs.readFileSync(path.join(ROOT, 'antora-playbook.yml'), 'utf8'));
const versionedNames = versionedRepos(sources, INCLUDE); // '.' is this repository (tutorials)
const versioned = versionedNames.filter((n) => n !== '.').map((name) => ({ name, docRoots: devStartPaths(sources, name) }));
console.log(`Release ${VERSION} (next: ${NEXT}) — ${versioned.length} repos: ${versioned.map((r) => `${r.name} (${r.docRoots.length} components)`).join(', ')}\n`);

// ---- antora.yml transformations --------------------------------------------
function pinRelease(y) {
  y = y.replace(/^version: (~|dev)$/m, `version: '${VERSION}'`);
  y = y.split('\n').filter((l) => !/^prerelease:/.test(l)).join('\n');
  if (PRERELEASE) y = y.replace(/^(version: .*)$/m, '$1\nprerelease: true');
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
  const dir = repoDir(WORKSPACE, r.name);
  if (!dir) { failures.push(`${r.name}: clone not found under ${WORKSPACE}`); continue; }
  if (!r.docRoots.length) { failures.push(`${r.name}: no playbook source reads its main`); continue; }
  try {
    sh('git fetch -q origin main', dir);
    // Every root must hold an antora.yml on main: a source of the playbook that names a folder main no longer has
    // would cut a line without that component.
    const missing = r.docRoots.filter((root) => {
      try { sh(`git cat-file -e origin/main:${root}/antora.yml`, dir); return false; } catch { return true; }
    });
    if (missing.length) { failures.push(`${r.name}: no antora.yml on main under ${missing.join(', ')}`); continue; }
    const already = sh(`git ls-remote --heads origin docs/${VERSION}`, dir) !== '';
    if (already) {
      console.log(`${r.name}: docs/${VERSION} already exists on origin — skipping the cut, bumping main only`);
    } else {
      if (DRY) {
        // What the cut would write, read from origin/main without a worktree.
        const pinned = r.docRoots.filter((root) =>
          new RegExp(`^version: '${VERSION.replace(/\./g, '\\.')}'$`, 'm').test(pinRelease(sh(`git show origin/main:${root}/antora.yml`, dir))));
        console.log(`[dry-run] ${r.name}: ${pinned.length}/${r.docRoots.length} antora.yml would read version '${VERSION}'`);
      }
      act(`${r.name}: branch docs/${VERSION} from origin/main, pin ${r.docRoots.length} antora.yml, push`, () => {
        const wt = fs.mkdtempSync(path.join(os.tmpdir(), `cutdocs-${r.name}-`));
        sh(`git worktree add -q ${wt} origin/main`, dir);
        for (const root of r.docRoots) {
          const yml = path.join(wt, root, 'antora.yml');
          fs.writeFileSync(yml, pinRelease(fs.readFileSync(yml, 'utf8')));
          sh(`git add ${root}/antora.yml`, wt);
        }
        sh(`git commit -q -S -s -m "docs: pin the ${VERSION} release documentation line"`, wt);
        sh(`git push -q origin HEAD:refs/heads/docs/${VERSION}`, wt);
        sh(`git worktree remove --force ${wt}`, dir);
      });
    }
    act(`${r.name}: bump main to ${NEXT}, clear {tag-new} badges, reset whats-new, push${BUMP_BRANCH ? ' to ' + BUMP_BRANCH : ''}`, () => {
      const wt2 = fs.mkdtempSync(path.join(os.tmpdir(), `cutmain-${r.name}-`));
      sh(`git worktree add -q ${wt2} origin/main`, dir);
      let dirty = false;
      for (const root of r.docRoots) if (bumpRoot(path.join(wt2, root))) dirty = true;
      if (dirty) {
        sh(`git add ${r.docRoots.join(' ')}`, wt2);
        sh(`git commit -q -S -s -m "docs: dev line moves to ${NEXT} (last release: ${VERSION})"`, wt2);
        sh(`git push -q origin HEAD:${BUMP_BRANCH ? 'refs/heads/' + BUMP_BRANCH : 'main'}`, wt2);
      } else {
        console.log(`${r.name}: main docs already up to date`);
      }
      sh(`git worktree remove --force ${wt2}`, dir);
    });
  } catch (e) {
    failures.push(`${r.name}: ${e.message.split('\n')[0]}`);
  }
}

// One component on main: next SNAPSHOT, NEW badges dropped, What's new restarted empty. True when a file changed.
function bumpRoot(docRoot) {
  const yml = path.join(docRoot, 'antora.yml');
  const before = fs.readFileSync(yml, 'utf8');
  const after = bumpMain(before);
  let dirty = after !== before;
  if (dirty) fs.writeFileSync(yml, after);
  // New cycle: the frozen docs/<VERSION> keeps its NEW badges; main drops
  // them and restarts the what's-new page empty.
  const stripNew = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stripNew(p);
      else if (e.name.endsWith('.adoc')) {
        const t = fs.readFileSync(p, 'utf8');
        const t2 = stripNewBadges(t);
        if (t2 !== t) { fs.writeFileSync(p, t2); dirty = true; }
      }
    }
  };
  const pagesDir = path.join(docRoot, 'modules');
  if (fs.existsSync(pagesDir)) stripNew(pagesDir);
  const wn = path.join(docRoot, 'modules/ROOT/pages/whats-new.adoc');
  if (fs.existsSync(wn)) {
    // Per component: each one owns its page, and home::whats-new.adoc indexes them.
    fs.writeFileSync(wn, `= What's new
:description: Everything that changed in this component since the {release-version} release.

[.lead]
New in the \`{project-version}\` development line — everything listed here landed **after the {release-version} release** and is not part of it. Every entry links to the section that documents it, and those sections carry the [.tag-new]#NEW# badge. Each brick of the suite keeps its own page of this kind; xref:home::whats-new.adoc[the ecosystem index] gathers them. When the next release train ships, this page is frozen with it and restarts empty on the dev line.

_Nothing documented yet for this cycle. Add entries here (and place [.tag-new]#NEW# badges on the relevant pages) as features land on main._
`);
    dirty = true;
  }
  return dirty;
}

// ---- this repo: the versioned tutorials component --------------------------
// content/tutorials builds from this repo's own docs/<version> branches.
try {
  sh('git fetch -q origin main', ROOT);
  const alreadySelf = sh(`git ls-remote --heads origin docs/${VERSION}`, ROOT) !== '';
  if (alreadySelf) {
    console.log(`vidocq-docs: docs/${VERSION} already exists on origin — skipping the cut`);
  } else {
    act(`vidocq-docs: branch docs/${VERSION} (tutorials), pin antora.yml, push`, () => {
      const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'cutdocs-self-'));
      sh(`git worktree add -q ${wt} origin/main`, ROOT);
      const yml = path.join(wt, 'content/tutorials/antora.yml');
      let y = pinRelease(fs.readFileSync(yml, 'utf8'));
      y = y.replace(/docs-line: dev/, 'docs-line: release');
      fs.writeFileSync(yml, y);
      sh('git add content/tutorials/antora.yml', wt);
      sh(`git commit -q -S -s -m "docs: pin the ${VERSION} tutorials line"`, wt);
      sh(`git push -q origin HEAD:refs/heads/docs/${VERSION}`, wt);
      sh(`git worktree remove --force ${wt}`, ROOT);
    });
  }
  act(`vidocq-docs: bump tutorials on main to ${NEXT}, clear badges (committed with the playbooks below)`, () => {
    const yml = path.join(ROOT, 'content/tutorials/antora.yml');
    fs.writeFileSync(yml, bumpMain(fs.readFileSync(yml, 'utf8')));
    const stripSelf = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stripSelf(p);
        else if (e.name.endsWith('.adoc')) {
          const t = fs.readFileSync(p, 'utf8');
          const t2 = stripNewBadges(t);
          if (t2 !== t) fs.writeFileSync(p, t2);
        }
      }
    };
    stripSelf(path.join(ROOT, 'content/tutorials/modules'));
  });
} catch (e) {
  failures.push('vidocq-docs (tutorials): ' + e.message.split('\n')[0]);
}

// A line replaces the earlier release candidates of its own train (RC1 once RC2 is out, every RC once
// the final is out): their entries live on in the cumulative What's new pages (cumulate-whats-new.js).
const retired = (v) => retiredBy(v, VERSION);
const known = [...new Set(sources.flatMap((s) => s.branches || []).map(versionOf).filter(Boolean))];

// ---- What's new: keep the entries of the retired release candidate -------------------------
// Before the retention window: cumulate-whats-new.js finds the pages of the retired line through the playbook.
{
  const previous = known.filter(retired).sort((a, b) => semverKey(b) - semverKey(a))[0];
  const base = known.filter((v) => !/-RC\d+$/.test(v) && semverKey(v) >= 0 && semverKey(v) < semverKey(VERSION))
    .sort((a, b) => semverKey(b) - semverKey(a))[0];
  if (previous && base) {
    const cmd = `node scripts/cumulate-whats-new.js --from ${previous} --to ${VERSION} --base ${base} --workspace ${WORKSPACE}`;
    act(`What's new: ${VERSION} keeps the entries of ${previous} (base ${base}): ${cmd}`, () => {
      console.log(sh(cmd, ROOT));
    });
    console.log(`Remember: the ecosystem What's new (content/home) is edited by hand for the ${VERSION} line.`);
  }
}

// ---- playbooks: retention window -------------------------------------------
for (const file of ['antora-playbook.yml', 'antora-playbook-local.yml']) {
  const p = path.join(ROOT, file);
  const { text, changes } = applyRetention(fs.readFileSync(p, 'utf8'), { version: VERSION, keep: KEEP, versioned: versionedNames });
  act(`${file}: retention window (last ${KEEP} + dev) changes ${changes.length} sources`, () => {
    fs.writeFileSync(p, text);
  });
  for (const c of changes) {
    console.log(`  ${c.repo === '.' ? 'vidocq-docs' : c.repo}: [${c.from.join(', ')}] -> ${c.to.length ? '[' + c.to.join(', ') + ']' : 'source removed'}`);
  }
}

// ---- redirects: the retired lines point to the line that replaced them ---------------------
{
  const file = path.join(ROOT, 'scripts/retired-lines.json');
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  const gone = known.filter(retired);
  if (gone.length) {
    act(`redirects: ${gone.join(', ')} -> ${VERSION} (scripts/retired-lines.json)`, () => {
      gone.forEach((v) => { map[v] = VERSION; });
      Object.keys(map).forEach((k) => { if (retired(k)) map[k] = VERSION; });
      fs.writeFileSync(file, JSON.stringify(map, null, 2) + '\n');
    });
  }
}

act('vidocq-docs: commit playbooks + tutorials bump (push it yourself to trigger the deploy)', () => {
  sh('git add antora-playbook.yml antora-playbook-local.yml content/tutorials scripts/retired-lines.json', ROOT);
  sh(`git commit -q -S -s -m "docs-site: publish the ${VERSION} release line (retention: last ${KEEP} + dev)"`, ROOT);
});

console.log('\n---');
if (failures.length) { console.log('FAILURES:'); failures.forEach((f) => console.log('  ' + f)); }
console.log(`Done${DRY ? ' (dry-run, nothing written)' : ''}. Reminders:
  - git push (vidocq-docs) to trigger the site deploy, then check the run.${BUMP_BRANCH ? `
  - open the pull request of ${BUMP_BRANCH} in each repository whose main takes pull requests only (the monorepo).` : ''}
  - content/home/modules/ROOT/pages/whats-new.adoc is written by hand: add the ${VERSION} section and repin its links (a line that left the window no longer resolves).
  - releases older than the ${KEEP}-version window left the playbook but their docs/* branches remain — re-add one to republish it.`);
process.exit(failures.length ? 1 : 0);

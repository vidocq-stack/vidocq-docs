// node --test scripts/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSources, applyRetention, devStartPaths, versionedRepos } = require('./playbook-sources');

// The shape of antora-playbook.yml after the move into the monorepo (2026-11-22).
const PROD = `content:
  sources:
    - url: https://codefloe.com/Vidocq/vidocq.git
      branches: [docs/0.4.0-RC2, docs/0.3.0]
      start_paths: [docs/en]
    # The released docs of the bricks.
    - url: https://codefloe.com/Vidocq/vidocq.git
      branches: [docs-archive/0.4.0-RC2, docs-archive/0.3.0]
      start_paths: [vauban/docs/en, ravel/docs/en,
                    cyrano/docs/en]
    # ibarra and peano were first released with 0.4.0-RC1.
    - url: https://codefloe.com/Vidocq/vidocq.git
      branches: [docs-archive/0.4.0-RC2]
      start_paths: [ibarra/docs/en, peano/docs/en]
    # erasmus has never been released: dev docs only.
    - url: https://codefloe.com/Vidocq/erasmus.git
      branches: [main]
      start_paths: [docs/en]
    - url: https://codefloe.com/Vidocq/vidocq.git
      branches: [main]
      start_paths:
        - vidocq-runtime/docs/en
        - vidocq-components/vidocq-components-transport/chappe/docs/en
    - url: .
      branches: HEAD
      start_paths: [content/home]
    # tutorials is versioned like the bricks.
    - url: .
      branches: [HEAD, docs/0.4.0-RC2, docs/0.3.0]
      start_paths: [content/tutorials]

ui:
  bundle:
    url: ./ui-bundle/build/ui-bundle.zip
`;

test('reads every source: repository, branches and start paths, inline, wrapped or as a list', () => {
  const s = parseSources(PROD);
  assert.deepEqual(s.map((x) => x.repo), ['vidocq', 'vidocq', 'vidocq', 'erasmus', 'vidocq', '.', '.']);
  assert.deepEqual(s[1].branches, ['docs-archive/0.4.0-RC2', 'docs-archive/0.3.0']);
  assert.deepEqual(s[1].startPaths, ['vauban/docs/en', 'ravel/docs/en', 'cyrano/docs/en']);
  assert.deepEqual(s[4].startPaths, ['vidocq-runtime/docs/en', 'vidocq-components/vidocq-components-transport/chappe/docs/en']);
  assert.equal(s[5].branches, null, 'a scalar branches value is not a list');
  assert.deepEqual(s[6].startPaths, ['content/tutorials']);
});

test('the repository of a local source is the folder of its clone', () => {
  const local = PROD.replace(/https:\/\/codefloe\.com\/Vidocq\/([\w-]+)\.git/g, '../../$1/main');
  assert.deepEqual(parseSources(local).map((x) => x.repo), ['vidocq', 'vidocq', 'vidocq', 'erasmus', 'vidocq', '.', '.']);
});

test('a repository is versioned when a source has a released line', () => {
  assert.deepEqual(versionedRepos(parseSources(PROD), []), ['vidocq', '.']);
  assert.deepEqual(versionedRepos(parseSources(PROD), ['erasmus']), ['vidocq', 'erasmus', '.']);
});

test('the antora.yml to pin are under the start paths of the sources that read main', () => {
  assert.deepEqual(devStartPaths(parseSources(PROD), 'vidocq'), [
    'vidocq-runtime/docs/en', 'vidocq-components/vidocq-components-transport/chappe/docs/en']);
  assert.deepEqual(devStartPaths(parseSources(PROD), 'erasmus'), ['docs/en']);
});

test('the final release: the new line goes to the main source only, the candidates leave, an empty source goes', () => {
  const { text } = applyRetention(PROD, { version: '0.4.0', keep: 3, versioned: ['vidocq', '.'] });
  const s = parseSources(text);
  assert.deepEqual(s.map((x) => [x.repo, x.branches]), [
    ['vidocq', ['docs/0.3.0']],
    ['vidocq', ['docs-archive/0.3.0']],
    ['erasmus', ['main']],
    ['vidocq', ['main', 'docs/0.4.0']],
    ['.', null],
    ['.', ['HEAD', 'docs/0.4.0', 'docs/0.3.0']],
  ]);
  assert.ok(!text.includes('ibarra and peano'), 'the comment of a removed source goes with it');
  assert.ok(text.includes('# The released docs of the bricks.'));
  assert.ok(text.includes('    # erasmus has never been released'));
  assert.ok(text.endsWith('ui:\n  bundle:\n    url: ./ui-bundle/build/ui-bundle.zip\n'));
});

test('the window counts the lines of a repository across its sources', () => {
  const after040 = applyRetention(PROD, { version: '0.4.0', keep: 3, versioned: ['vidocq', '.'] }).text;
  const after050 = applyRetention(after040, { version: '0.5.0', keep: 3, versioned: ['vidocq', '.'] }).text;
  const after060 = applyRetention(after050, { version: '0.6.0', keep: 3, versioned: ['vidocq', '.'] }).text;
  const s = parseSources(after060);
  assert.deepEqual(s.filter((x) => x.repo === 'vidocq').map((x) => x.branches),
    [['main', 'docs/0.6.0', 'docs/0.5.0', 'docs/0.4.0']], 'the archive sources left the window and the playbook');
});

test('a release candidate of a repository outside the monorepo keeps the former behaviour', () => {
  const one = `content:
  sources:
    - url: https://codefloe.com/Vidocq/erasmus.git
      branches: [main, docs/0.3.0]
      start_paths: [docs/en]
`;
  const { text } = applyRetention(one, { version: '0.4.0-RC1', keep: 3, versioned: ['erasmus'] });
  assert.deepEqual(parseSources(text)[0].branches, ['main', 'docs/0.4.0-RC1', 'docs/0.3.0']);
  const rc2 = applyRetention(text, { version: '0.4.0-RC2', keep: 3, versioned: ['erasmus'] }).text;
  assert.deepEqual(parseSources(rc2)[0].branches, ['main', 'docs/0.4.0-RC2', 'docs/0.3.0']);
});

test('a repository not versioned is left alone', () => {
  const { text } = applyRetention(PROD, { version: '0.4.0', keep: 3, versioned: ['.'] });
  assert.deepEqual(parseSources(text).filter((x) => x.repo === 'vidocq').map((x) => x.branches),
    parseSources(PROD).filter((x) => x.repo === 'vidocq').map((x) => x.branches));
});

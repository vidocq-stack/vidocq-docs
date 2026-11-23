// node --test scripts/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { stripNewBadges } = require('./new-badges');

const BADGE = '[.tag-new]#NEW#';

test('a badge between two words leaves one space, not glued words', () => {
  assert.equal(stripNewBadges(`the pool ${BADGE} lists its connections`), 'the pool lists its connections');
});

test('a badge at the end of a title leaves no trailing space', () => {
  assert.equal(stripNewBadges(`== The hot swap agent ${BADGE}\n\nText.`), '== The hot swap agent\n\nText.');
});

test('a badge before punctuation leaves the punctuation against the word', () => {
  assert.equal(stripNewBadges(`\`vidocq:dev\` ${BADGE}, and the rest`), '`vidocq:dev`, and the rest');
  assert.equal(stripNewBadges(`(see xref:a.adoc[A] ${BADGE})`), '(see xref:a.adoc[A])');
});

test('a badge at the start of a line, of a list item or of a table cell goes with its space', () => {
  assert.equal(stripNewBadges(`${BADGE} A sentence.`), 'A sentence.');
  assert.equal(stripNewBadges(`* ${BADGE} An item`), '* An item');
  assert.equal(stripNewBadges(`| ${BADGE} A cell`), '| A cell');
});

test('a badge written against the word before it keeps the space after it', () => {
  assert.equal(stripNewBadges(`\`requestContextListeners\`${BADGE} is read`), '`requestContextListeners` is read');
});

test('every badge of a page is removed, and a page without one is unchanged', () => {
  const page = `= Page\n\n== One ${BADGE}\n\nA ${BADGE} b, c ${BADGE}.\n`;
  assert.equal(stripNewBadges(page), '= Page\n\n== One\n\nA b, c.\n');
  assert.equal(stripNewBadges('= Page\n\nNothing new.\n'), '= Page\n\nNothing new.\n');
});

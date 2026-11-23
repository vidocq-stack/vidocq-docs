// The [.tag-new]#NEW# badge of the dev docs, and how a release cut takes it out of a page.
'use strict';

const BADGE = '\\[\\.tag-new\\]#NEW#';

/**
 * Removes every NEW badge of an AsciiDoc text, with one of the spaces around it and never both: taking both
 * glued the two words a badge sat between ("the pool [.tag-new]#NEW# lists" became "the poollists").
 * The space before the badge goes with it, which also suits a badge before punctuation or at the end of a
 * title; a badge that opens a line takes the space after it.
 */
function stripNewBadges(text) {
  return text
    .replace(new RegExp(' ' + BADGE, 'g'), '')
    .replace(new RegExp('^' + BADGE + ' ?', 'gm'), '')
    .replace(new RegExp(BADGE, 'g'), '');
}

module.exports = { stripNewBadges };

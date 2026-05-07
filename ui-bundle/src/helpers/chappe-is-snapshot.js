'use strict';

const chappeVersion = require('./chappe-version');

module.exports = function chappeIsSnapshot() {
  return /-SNAPSHOT$/i.test(chappeVersion());
};

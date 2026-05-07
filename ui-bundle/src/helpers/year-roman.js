'use strict';

const roman = require('./roman');

module.exports = function yearRoman() {
  return roman(new Date().getUTCFullYear());
};

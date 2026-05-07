'use strict';

const NUMERALS = [
  ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400],
  ['C', 100],  ['XC', 90],  ['L', 50],  ['XL', 40],
  ['X', 10],   ['IX', 9],   ['V', 5],   ['IV', 4],
  ['I', 1],
];

module.exports = function roman(input) {
  let n = parseInt(input, 10);
  if (!Number.isFinite(n) || n <= 0) return String(input || '');
  let out = '';
  for (const [symbol, value] of NUMERALS) {
    while (n >= value) { out += symbol; n -= value; }
  }
  return out;
};

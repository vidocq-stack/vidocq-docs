'use strict';

const fs = require('fs');
const path = require('path');

let cached = null;

function loadVersion() {
  if (cached !== null) return cached;
  const candidates = [
    path.join(__dirname, '..', 'data', 'versions.json'),
    path.join(__dirname, '..', '..', 'data', 'versions.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        cached = String(data.chappe || '');
        return cached;
      } catch (_) { /* continue */ }
    }
  }
  cached = '';
  return cached;
}

module.exports = function chappeIsSnapshot() {
  return /-SNAPSHOT$/i.test(loadVersion());
};

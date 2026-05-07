'use strict';

const path = require('path');
const fs = require('fs');

let cache = null;

function load() {
  if (cache !== null) return cache;
  // Chemin résolu côté UI bundle quand Antora exécute le helper.
  // En build local : versions.json est généré dans ui-bundle/src/data/.
  // En runtime UI bundle : data/versions.json relatif à la racine du UI.
  const candidates = [
    path.join(__dirname, '..', 'data', 'versions.json'),
    path.join(__dirname, '..', '..', 'data', 'versions.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        cache = JSON.parse(fs.readFileSync(p, 'utf8'));
        return cache;
      } catch (e) {
        // ignore et continue
      }
    }
  }
  cache = { chappe: '0.1.0-SNAPSHOT', isSnapshot: true };
  return cache;
}

module.exports = function chappeVersion(field) {
  const data = load();
  if (typeof field === 'string' && field !== 'chappeVersion') {
    return data[field] != null ? String(data[field]) : '';
  }
  return data.chappe || '';
};

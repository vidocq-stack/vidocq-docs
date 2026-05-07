#!/usr/bin/env node
/* eslint-env node */
/**
 * Lit la version courante de Chappe depuis :
 *   - ../chappe/pom.xml en build local
 *   - https://forge.vidocq.dev/.../pom.xml en CI (si le clone est absent)
 *
 * Écrit ui-bundle/src/data/versions.json :
 *   { "chappe": "0.1.0-SNAPSHOT", "isSnapshot": true, "buildDate": "..." }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const REPO_ROOT = path.resolve(__dirname, '..');
const LOCAL_POM = path.resolve(REPO_ROOT, '..', 'chappe', 'pom.xml');
const REMOTE_URL = 'https://forge.vidocq.dev/vidocq/chappe/raw/branch/main/pom.xml';
const OUT_FILE = path.resolve(REPO_ROOT, 'ui-bundle', 'src', 'data', 'versions.json');

function extractRootVersion(pomXml) {
  // Version racine du POM : la première <version> apparaît avant le bloc <dependencyManagement>.
  // On capture la valeur entre <project ...> et la fin de la déclaration projet,
  // en s'arrêtant au premier <dependencyManagement>, <dependencies>, ou <build>.
  const cutoff = pomXml.search(/<(?:dependencyManagement|dependencies|build|subprojects|modules)\b/);
  const head = cutoff > 0 ? pomXml.slice(0, cutoff) : pomXml;
  const match = head.match(/<version>\s*([^<\s][^<]*)\s*<\/version>/);
  if (!match) {
    throw new Error('Aucune <version> racine trouvée dans le POM Chappe.');
  }
  return match[1].trim();
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
        res.resume();
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function main() {
  let version;
  try {
    if (fs.existsSync(LOCAL_POM)) {
      const xml = fs.readFileSync(LOCAL_POM, 'utf8');
      version = extractRootVersion(xml);
      process.stdout.write(`[fetch-chappe-version] Local : ${version}\n`);
    } else {
      process.stdout.write(`[fetch-chappe-version] Pas de clone local, fetch ${REMOTE_URL}\n`);
      const xml = await fetch(REMOTE_URL);
      version = extractRootVersion(xml);
      process.stdout.write(`[fetch-chappe-version] Distant : ${version}\n`);
    }
  } catch (err) {
    process.stderr.write(`[fetch-chappe-version] Échec : ${err.message}\n`);
    process.stderr.write('[fetch-chappe-version] Fallback : 0.0.0-UNKNOWN\n');
    version = '0.0.0-UNKNOWN';
  }

  const payload = {
    chappe: version,
    isSnapshot: /-SNAPSHOT$/i.test(version),
    buildDate: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  process.stdout.write(`[fetch-chappe-version] Écrit ${path.relative(REPO_ROOT, OUT_FILE)}\n`);
}

main();

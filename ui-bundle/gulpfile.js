/* eslint-env node */
'use strict';

const fs = require('fs');
const path = require('path');
const { dest, parallel, series, src } = require('gulp');
const postcss = require('gulp-postcss');
const concat = require('gulp-concat');
const zip = require('gulp-zip');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const postcssImport = require('postcss-import');

const SRC = 'src';
const BUILD = 'build';
const UI = `${BUILD}/ui`;

// Mapping `<source dans node_modules/@fontsource> -> <nom WOFF2 final attendu par fonts.css>`.
// Subset `latin` (couvre FR + EN ; latin-ext non nécessaire pour notre périmètre).
const FONT_MAP = {
  '@fontsource/fira-sans/files/fira-sans-latin-300-normal.woff2':  'fira-sans-300.woff2',
  '@fontsource/fira-sans/files/fira-sans-latin-400-normal.woff2':  'fira-sans-400.woff2',
  '@fontsource/fira-sans/files/fira-sans-latin-500-normal.woff2':  'fira-sans-500.woff2',
  '@fontsource/fira-sans/files/fira-sans-latin-600-normal.woff2':  'fira-sans-600.woff2',
  '@fontsource/fira-sans/files/fira-sans-latin-700-normal.woff2':  'fira-sans-700.woff2',
  '@fontsource/fira-code/files/fira-code-latin-400-normal.woff2':  'fira-code-400.woff2',
  '@fontsource/fira-code/files/fira-code-latin-600-normal.woff2':  'fira-code-600.woff2',
  '@fontsource/fira-code/files/fira-code-latin-700-normal.woff2':  'fira-code-700.woff2',
};

function css() {
  return src(`${SRC}/css/site.css`)
    .pipe(postcss([postcssImport(), autoprefixer(), cssnano({ preset: 'default' })]))
    .pipe(dest(`${UI}/css`));
}

function cssPrint() {
  return src(`${SRC}/css/print.css`)
    .pipe(postcss([autoprefixer(), cssnano({ preset: 'default' })]))
    .pipe(dest(`${UI}/css`));
}

function js() {
  // `vendor/*.js` est listé en premier pour que les libs vendorées (highlight.js, etc.)
  // soient concaténées avant `site.js`. On ne référence le glob que si le dossier
  // existe — sinon gulp/glob lève ENOENT.
  const patterns = [`${SRC}/js/*.js`];
  const vendorDir = path.join(SRC, 'js', 'vendor');
  if (fs.existsSync(vendorDir)) {
    patterns.unshift(`${SRC}/js/vendor/*.js`);
  }
  return src(patterns, { allowEmpty: true })
    .pipe(concat('site.js'))
    .pipe(dest(`${UI}/js`));
}

function copyStatic() {
  return src(
    [
      `${SRC}/layouts/**/*`,
      `${SRC}/partials/**/*`,
      `${SRC}/helpers/**/*`,
      `${SRC}/img/**/*`,
      `${SRC}/data/**/*`,
    ],
    { base: SRC, allowEmpty: true }
  ).pipe(dest(UI));
}

function fonts(cb) {
  // Copie chaque WOFF2 source de @fontsource vers `build/ui/font/<nom canonique>`.
  // Si un fichier source manque (ex. : un futur upgrade de @fontsource change la
  // convention de nommage), on log et on continue — le bundle tombera sur fonts système.
  const dst = path.join(UI, 'font');
  fs.mkdirSync(dst, { recursive: true });

  let copied = 0;
  let missing = 0;

  for (const [from, to] of Object.entries(FONT_MAP)) {
    let resolved;
    try {
      resolved = require.resolve(from, { paths: [process.cwd()] });
    } catch (_) {
      console.warn(`[gulp:fonts] absent : ${from}`);
      missing++;
      continue;
    }
    fs.copyFileSync(resolved, path.join(dst, to));
    copied++;
  }
  console.log(`[gulp:fonts] copiés=${copied} manquants=${missing} (dst=${dst})`);
  cb();
}

function bundle() {
  return src(`${UI}/**/*`, { base: UI, dot: true })
    .pipe(zip('ui-bundle.zip'))
    .pipe(dest(BUILD));
}

const build = parallel(css, cssPrint, js, copyStatic, fonts);
const bundleAll = series(build, bundle);

exports.css = parallel(css, cssPrint);
exports.js = js;
exports.static = copyStatic;
exports.fonts = fonts;
exports.build = build;
exports.bundle = bundleAll;
exports.default = bundleAll;

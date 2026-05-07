/* eslint-env node */
'use strict';

const { dest, parallel, series, src, task } = require('gulp');
const postcss = require('gulp-postcss');
const concat = require('gulp-concat');
const zip = require('gulp-zip');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const postcssImport = require('postcss-import');

const SRC = 'src';
const BUILD = 'build';
const UI = `${BUILD}/ui`;

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
  return src([`${SRC}/js/vendor/*.js`, `${SRC}/js/*.js`], { allowEmpty: true })
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
      `${SRC}/font/**/*`,
      `${SRC}/fonts/**/*`,
      `${SRC}/data/**/*`,
    ],
    { base: SRC, allowEmpty: true }
  ).pipe(dest(UI));
}

function bundle() {
  return src(`${UI}/**/*`, { base: UI, dot: true })
    .pipe(zip('ui-bundle.zip'))
    .pipe(dest(BUILD));
}

task('css', parallel(css, cssPrint));
task('js', js);
task('static', copyStatic);
task('build', parallel('css', 'js', 'static'));
task('bundle', series('build', bundle));
task('default', series('bundle'));

exports.css = parallel(css, cssPrint);
exports.js = js;
exports.static = copyStatic;
exports.build = parallel(css, cssPrint, js, copyStatic);
exports.bundle = series(parallel(css, cssPrint, js, copyStatic), bundle);
exports.default = exports.bundle;

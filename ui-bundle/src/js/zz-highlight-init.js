/* Runs after the vendored highlight.js (vendor/*.js is concatenated first). */
;(function () {
  'use strict'

  document.addEventListener('DOMContentLoaded', function () {
    if (window.hljs) {
      document.querySelectorAll('pre code').forEach(function (el) {
        window.hljs.highlightElement(el)
      })
    }
  })
})()

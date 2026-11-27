'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const asciidoctor = require('@asciidoctor/core')()
const navigation = require('./reader-navigation')

function render (path, sections) {
  const registry = asciidoctor.Extensions.create()
  navigation.register(registry)
  const body = sections.map(title => '== ' + title + '\n\nText.').join('\n\n')
  return asciidoctor.convert('= Example\n\nIntroduction.\n\n' + body, {
    extension_registry: registry,
    attributes: { 'page-relative-src-path': path, idprefix: '', idseparator: '-' }
  })
}

test('component overview keeps the historical section and its anchor after the practical links', () => {
  const html = render('index.adoc', ['Origin of the name', 'At a glance', 'Architecture', 'Quick links'])
  const headings = [...html.matchAll(/<h2 id="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(headings, ['at-a-glance', 'quick-links', 'architecture', 'origin-of-the-name'])
})

test('long guides have local links, short guides open directly on their content', () => {
  const sections = ['Install', 'Build', 'Run', 'Test', 'Deploy']
  assert.match(render('guide.adoc', sections), /href="#deploy"/)
  assert.doesNotMatch(render('guide.adoc', ['Run']), /id="toc"/)
})

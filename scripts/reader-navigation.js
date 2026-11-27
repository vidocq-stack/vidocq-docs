'use strict'

// Use the AsciiDoc section tree so links retain the IDs assigned by the author.
module.exports.register = function register (registry) {
  registry.treeProcessor(function () {
    this.process(function (doc) {
      if (doc.getAttribute('page-relative-src-path') === 'index.adoc') {
        const blocks = doc.getBlocks()
        const section = title => blocks.findIndex(block => block.getContext() === 'section' && block.getTitle() === title)
        const history = section('Origin of the name')
        if (history >= 0) blocks.push(blocks.splice(history, 1)[0])
        const glance = section('At a glance')
        const links = section('Quick links')
        if (glance >= 0 && links > glance + 1) {
          const [quickLinks] = blocks.splice(links, 1)
          blocks.splice(glance + 1, 0, quickLinks)
        }
      } else if (doc.getSections().length >= 5 && !doc.hasAttribute('toc')) {
        doc.setAttribute('toc', '')
        doc.setAttribute('toc-placement', doc.getBlocks()[0].getContext() === 'preamble' ? 'preamble' : 'auto')
        doc.setAttribute('toclevels', '1')
        doc.setAttribute('toc-title', 'On this page')
      }
      return doc
    })
  })
}

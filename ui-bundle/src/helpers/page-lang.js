'use strict';

// Code de langue de la page courante ('fr' ou 'en'), pour `<html lang>` et la
// meta `vidocq:lang`. La détection est dupliquée (et non importée de i18n.js)
// car Antora charge chaque helper isolément depuis le bundle : un `require`
// d'un helper voisin n'est pas garanti de résoudre.
//
// L'attribut `lang` des antora.yml n'étant pas exposé sur `page.attributes`
// (Antora ne publie que les attributs préfixés `page-`), on déduit la langue du
// suffixe `-fr` du nom de component, comme le fait site.js pour le toggle FR/EN.
module.exports = function pageLang(options) {
  const ctx = (options && options.data && options.data.root) || {};
  const page = ctx.page || {};

  const attrLang = page.attributes && page.attributes.lang;
  if (attrLang === 'fr' || attrLang === 'en') return attrLang;

  const componentName =
    (page.componentVersion && page.componentVersion.name) ||
    (page.component && page.component.name) ||
    '';
  if (componentName) return /-fr$/.test(componentName) ? 'fr' : 'en';

  if (typeof page.url === 'string') {
    const first = page.url.split('/').filter(Boolean)[0] || '';
    if (first) return /-fr$/.test(first) ? 'fr' : 'en';
  }

  const primary = ctx.site && ctx.site.attributes && ctx.site.attributes['primary-language'];
  if (primary === 'fr' || primary === 'en') return primary;
  return 'fr';
};

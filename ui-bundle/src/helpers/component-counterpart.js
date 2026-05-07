'use strict';

/**
 * Retourne le nom du component homologue dans l'autre langue.
 * vauban   → vauban-fr
 * vauban-fr → vauban
 * home     → home-fr
 * home-fr  → home
 */
module.exports = function componentCounterpart(name) {
  if (typeof name !== 'string' || !name) return '';
  return /-fr$/.test(name) ? name.replace(/-fr$/, '') : name + '-fr';
};

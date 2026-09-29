const { registerPack, listPacks } = require('../template-engine/src/packs');
const { chilePack } = require('./chile');

// Available domain packs. Which ones are active is decided per deployment with DOMAIN_PACKS
// (comma separated ids; unset means all of them, "none" means only the neutral core).
const CATALOG = { [chilePack.id]: chilePack };

function enabledPackIds(setting) {
  if (setting === undefined || setting === null || String(setting).trim() === '') return Object.keys(CATALOG);
  if (String(setting).trim().toLowerCase() === 'none') return [];
  return String(setting).split(',').map((id) => id.trim()).filter(Boolean);
}

function registerEnabledPacks(setting) {
  for (const id of enabledPackIds(setting)) {
    if (!CATALOG[id]) throw new Error(`Unknown domain pack: ${id}`);
    registerPack(CATALOG[id]);
  }
  return listPacks();
}

module.exports = { CATALOG, enabledPackIds, registerEnabledPacks };

const { packTemplates } = require('../../template-engine/src/packs');

// Initial templates inserted once into PostgreSQL, contributed by the enabled domain packs.
// After that they are edited from the UI like any other.
function seedTemplates() {
  return packTemplates();
}

module.exports = { seedTemplates };

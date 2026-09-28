const { planVitalPagexTemplate } = require('./planvital-pagex');

// Code-owned templates seeded into PostgreSQL as immutable versions.
const seedTemplates = [
  {
    slug: 'planvital-pagex',
    description: 'Formato de carga PAGEX para licencias médicas en AFP PlanVital.',
    configuration: planVitalPagexTemplate
  }
];

module.exports = { planVitalPagexTemplate, seedTemplates };

const { planVitalPagexTemplate } = require('./planvital-pagex');

// Initial templates inserted once into PostgreSQL. After that they are edited from the UI like any other.
const seedTemplates = [
  {
    slug: 'planvital-pagex',
    configuration: {
      ...planVitalPagexTemplate,
      description: 'Formato de carga PAGEX para licencias médicas en AFP PlanVital.',
      destination: 'PlanVital',
      process: 'Licencias médicas PAGEX'
    }
  }
];

module.exports = { planVitalPagexTemplate, seedTemplates };

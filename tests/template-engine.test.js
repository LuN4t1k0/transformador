const test = require('node:test');
const assert = require('node:assert/strict');
const { transformRow } = require('../packages/template-engine/src/engine');
const { planVitalPagexTemplate } = require('../packages/packs/chile/planvital-pagex');

test('transforms a PAGEX row using the PlanVital template without hardcoded engine branches', () => {
  const row = {
    RUT: '10.231.091-8',
    'Nombre completo': 'NEIRA QUINCHAHUAL MARIA',
    Remuneracion: '285149',
    Periodo: '201510',
    'Fecha Inicio': '13-10-2015',
    'Fecha Término': '19-10-2015',
    AFP: 'Capital',
    dias_licencia: '7',
    dias_pagados: '3',
    base_utilizada: '285149',
    monto_rem_dias: '28515',
    aporte_pension: '2852',
    total_aporte_afp: '2852'
  };

  const result = transformRow(row, planVitalPagexTemplate);

  assert.deepEqual(result.issues, []);
  assert.equal(result.output.RUT, '102310918');
  assert.equal(result.output['APELLIDO PATERNO'], 'NEIRA');
  assert.equal(result.output['APELLIDO MATERNO'], 'QUINCHAHUAL');
  assert.equal(result.output.NOMBRE, 'MARIA');
  assert.equal(result.output.PERIODO, '01/10/2015');
  assert.equal(result.output['FEC. INICIO'], '13/10/2015');
  assert.equal(result.output['DIAS LICENCIA'], 7);
});

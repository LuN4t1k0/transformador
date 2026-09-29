const { normalizeRut, isValidRut, formatRut, calculateDv } = require('./rut');
const { planVitalPagexTemplate } = require('./planvital-pagex');

// Chile pack: RUT (format, validation, detection, masking), AFP detection and the PlanVital PAGEX template.

const RUT_FORMATS = [
  { value: 'NO_DOTS_NO_DASH', label: 'Sin puntos ni guion (123456785)', short: 'sin puntos ni guion' },
  { value: 'NO_DOTS_DASH', label: 'Con guion (12345678-5)', short: 'con guion' },
  { value: 'DOTS_DASH', label: 'Con puntos y guion (12.345.678-5)', short: 'con puntos y guion' },
  { value: 'BODY', label: 'Solo el número, sin dígito verificador (12345678)', short: 'solo el número' },
  { value: 'DV', label: 'Solo el dígito verificador (5)', short: 'solo el dígito verificador' }
];

const AFP_VALUES = new Set(['capital', 'cuprum', 'habitat', 'modelo', 'planvital', 'provida', 'uno']);

function normalized(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// A RUT with at least 7 characters and a valid verifier, as a comparable key ("123456785").
function rutKey(value) {
  const text = String(value ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  return text.length >= 7 && isValidRut(text) ? text : null;
}

// `digits` (a string of pseudo-random digits) builds the fake body; the same real RUT must get the same digits.
function fakeRut(value, digits) {
  const real = rutKey(value);
  if (!real) return null;
  const length = real.length - 1;
  const body = `${(Number(digits[0]) % 9) + 1}${digits.slice(1, length)}`.padEnd(length, '7');
  const text = String(value).trim();
  const format = text.includes('.') ? 'DOTS_DASH' : text.includes('-') ? 'NO_DOTS_DASH' : 'NO_DOTS_NO_DASH';
  return formatRut(`${body}${calculateDv(body)}`, format);
}

// Keeps the format, the first two digits and the verifier: 12.•••.•••-5
function maskRut(value) {
  const text = String(value);
  const digitPositions = [...text].flatMap((char, index) => (/\d/.test(char) ? [index] : []));
  const visible = new Set([...digitPositions.slice(0, 2), text.length - 1]);
  return [...text].map((char, index) => (/\d/.test(char) && !visible.has(index) ? '•' : char)).join('');
}

const rutFormat = (format) => ({ transformations: [{ type: 'RUT_FORMAT', format }], validations: [{ type: 'VALID_RUT' }], semanticTypes: ['CHILEAN_RUT'] });

const chilePack = {
  id: 'chile',
  name: 'Chile',
  description: 'RUT (formato, dígito verificador, detección y enmascarado), AFP y la plantilla PlanVital PAGEX.',

  transformations: {
    RUT_FORMAT: {
      normalize(transformation, { oneOf, label }) {
        return { type: 'RUT_FORMAT', format: oneOf(transformation.format, RUT_FORMATS.map((option) => option.value), `${label}: el formato de RUT no es válido.`) };
      },
      apply: (value, transformation) => formatRut(value, transformation.format),
      conversionIssue: { code: 'INVALID_RUT_FORMAT', message: 'Value is not a recognizable RUT' },
      example: () => ({ example: '12.345.678-5', text: 'RUT con dígito verificador (con o sin puntos)' }),
      describe: (transformation) => `RUT ${RUT_FORMATS.find((option) => option.value === transformation.format)?.short || ''}`.trim()
    }
  },

  validations: {
    // Checks the source value: the output may keep only part of the RUT (body or verifier).
    VALID_RUT: {
      label: 'Valida dígito verificador',
      validate: (value, sourceValue) => (isValidRut(sourceValue) ? null : { severity: 'error', code: 'INVALID_RUT', message: 'Invalid Chilean RUT' })
    }
  },

  issues: {
    messages: { INVALID_RUT: 'RUT con dígito verificador inválido', INVALID_RUT_FORMAT: 'No se reconoce como RUT' },
    hints: { INVALID_RUT: 'Revisa el dígito verificador (lo que va después del guion).', INVALID_RUT_FORMAT: 'Usa un RUT como 12.345.678-5 o 12345678-5.' }
  },

  detectors: [
    {
      type: 'CHILEAN_RUT',
      label: 'RUT',
      detect(header, values) {
        const samples = values.filter(Boolean);
        const validSamples = samples.filter(isValidRut).length;
        const headerScore = /\brut\b/.test(normalized(header)) ? 0.35 : 0;
        const valueScore = samples.length ? (validSamples / samples.length) * 0.65 : 0;
        return { confidence: headerScore + valueScore, evidence: { headerScore, validSamples, sampleSize: samples.length } };
      }
    },
    {
      type: 'AFP',
      label: 'AFP',
      detect(header, values) {
        const samples = values.filter(Boolean);
        const validSamples = samples.filter((value) => AFP_VALUES.has(normalized(value))).length;
        return { confidence: (normalized(header).includes('afp') ? 0.4 : 0) + (samples.length ? (validSamples / samples.length) * 0.6 : 0), evidence: { validSamples, sampleSize: samples.length } };
      }
    }
  ],

  // `fake` gives a valid RUT with the same number of digits, written like the original (dots, dash or neither),
  // for pseudonymized samples sent outside (e.g. to the template assistant).
  keys: [{ id: 'CHILEAN_RUT', label: 'RUT', key: rutKey, fake: fakeRut }],

  // RUTs written with dashes are recognized before dates; plain digits only after dates ruled them out,
  // and they keep 8-digit dates (20240503) from being read as RUTs when every value has a valid verifier.
  formatDetectors: [
    {
      stage: 'EARLY',
      detect(texts) {
        if (texts.every((text) => /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/.test(text))) return rutFormat('DOTS_DASH');
        if (texts.every((text) => /^\d{7,8}-[\dkK]$/.test(text))) return rutFormat('NO_DOTS_DASH');
        return null;
      }
    },
    {
      stage: 'LATE',
      detect(texts) {
        return texts.every((text) => /^\d{7,9}$/.test(text) && isValidRut(text)) ? rutFormat('NO_DOTS_NO_DASH') : null;
      }
    }
  ],

  // A destination may split the RUT into two columns: the number and the check digit.
  derivedFormats: [
    { transformations: [{ type: 'RUT_FORMAT', format: 'BODY' }], validations: [{ type: 'VALID_RUT' }] },
    { transformations: [{ type: 'RUT_FORMAT', format: 'DV' }], validations: [{ type: 'VALID_RUT' }] }
  ],

  formats: [
    {
      kind: 'RUT',
      label: 'RUT / dígito verificador',
      transformation: 'RUT_FORMAT',
      option: { key: 'format', label: 'Cómo escribir el RUT', choices: RUT_FORMATS, default: 'NO_DOTS_NO_DASH' },
      validation: { type: 'VALID_RUT', label: 'Marcar como error si el dígito verificador no es válido' },
      // One click turns a full RUT column into two: the number and, right after it, the check digit.
      split: { label: 'Separar en número y dígito verificador', parts: [{ option: 'BODY', suffix: '' }, { option: 'DV', suffix: ' DV' }] }
    }
  ],

  sensitive: {
    isSensitive: (column) => column?.semanticType === 'CHILEAN_RUT'
      || (column?.transformations || []).some((transformation) => transformation.type === 'RUT_FORMAT')
      || (column?.validations || []).some((validation) => validation.type === 'VALID_RUT'),
    mask: maskRut
  },

  templates: [
    {
      slug: 'planvital-pagex',
      configuration: {
        ...planVitalPagexTemplate,
        description: 'Formato de carga PAGEX para licencias médicas en AFP PlanVital.',
        destination: 'PlanVital',
        process: 'Licencias médicas PAGEX'
      }
    }
  ]
};

module.exports = { chilePack, rutKey, maskRut, normalizeRut, RUT_FORMATS };

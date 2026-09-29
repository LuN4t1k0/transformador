const { parseNumber } = require('../../transformations/src');
const { packDetectors } = require('../../template-engine/src/packs');

function normalizeHeader(header) {
  return String(header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const detectors = [
  {
    type: 'EMAIL',
    detect(header, values) {
      const h = normalizeHeader(header);
      const samples = values.filter(Boolean);
      const validSamples = samples.filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))).length;
      return { confidence: (h.includes('email') ? 0.4 : 0) + (samples.length ? (validSamples / samples.length) * 0.6 : 0), evidence: { validSamples, sampleSize: samples.length } };
    }
  },
  {
    type: 'YEAR_MONTH',
    detect(header, values) {
      const h = normalizeHeader(header);
      const samples = values.filter(Boolean);
      const validSamples = samples.filter((value) => /^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(String(value).trim())).length;
      return { confidence: (h.includes('periodo') ? 0.35 : 0) + (samples.length ? (validSamples / samples.length) * 0.65 : 0), evidence: { validSamples, sampleSize: samples.length } };
    }
  },
  {
    type: 'GENERIC_NUMBER',
    detect(header, values) {
      const samples = values.filter(Boolean);
      const validSamples = samples.filter((value) => parseNumber(value) !== null).length;
      return { confidence: samples.length ? (validSamples / samples.length) * 0.8 : 0, evidence: { validSamples, sampleSize: samples.length } };
    }
  }
];

function detectSemanticType(header, values) {
  // Neutral detectors plus the ones contributed by the enabled domain packs (RUT, AFP…).
  const results = [...detectors, ...packDetectors()].map((detector) => {
    const result = detector.detect(header, values);
    return {
      type: detector.type,
      confidence: Number(result.confidence.toFixed(4)),
      evidence: result.evidence
    };
  });

  results.sort((a, b) => b.confidence - a.confidence);
  const best = results[0];
  if (!best || best.confidence < 0.5) {
    return { type: 'GENERIC_TEXT', confidence: 1, evidence: { reason: 'fallback' } };
  }
  return best;
}

module.exports = { detectSemanticType, normalizeHeader };

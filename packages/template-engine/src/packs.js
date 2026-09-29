// Domain packs extend the neutral core with country or industry specific knowledge (identifiers, formats,
// validations, detectors, seed templates). The core only knows this registry; each app registers the packs it
// enables at startup (see packages/packs).
//
// A pack is plain data plus pure functions:
// {
//   id, name, description,
//   transformations: { TYPE: { normalize(t, helpers), apply(value, t), conversionIssue?, example?(t), describe?(t) } },
//   validations: { TYPE: { validate(value, sourceValue) → issue | null, label } },
//   issues: { messages: { CODE: text }, hints: { CODE: text } },
//   detectors: [{ type, label, detect(header, values) → { confidence, evidence } }],
//   keys: [{ id, label, key(value) → normalized key | null }]           row identifiers for learning by example
//   formatDetectors: [{ stage: 'EARLY' | 'LATE', detect(texts) → { transformations, validations, semanticTypes } | null }]
//   formats: [{ kind, label, transformation, option: { key, label, choices, default }, validation? }]  editor formats
//   sensitive: { isSensitive(column) → boolean, mask(text) → text }   masking in on-screen samples
//   templates: [{ slug, configuration }]                                  seed templates
// }

const registry = { packs: [] };

function registerPack(pack) {
  if (!pack?.id) throw new Error('A domain pack needs an id');
  registry.packs = [...registry.packs.filter((current) => current.id !== pack.id), pack];
  return pack;
}

function clearPacks() {
  registry.packs = [];
}

function listPacks() {
  return registry.packs;
}

function fromPacks(key) {
  return registry.packs.flatMap((pack) => pack[key] || []);
}

function packEntry(key, type) {
  for (const pack of registry.packs) {
    if (pack[key]?.[type]) return pack[key][type];
  }
  return null;
}

const packTransformation = (type) => packEntry('transformations', type);
const packValidation = (type) => packEntry('validations', type);
const packTransformationTypes = () => registry.packs.flatMap((pack) => Object.keys(pack.transformations || {}));
const packValidationTypes = () => registry.packs.flatMap((pack) => Object.keys(pack.validations || {}));
const packDetectors = () => fromPacks('detectors');
const packKeys = () => fromPacks('keys');
const packFormatDetectors = (stage) => fromPacks('formatDetectors').filter((detector) => detector.stage === stage);
const packFormats = () => fromPacks('formats');
const packTemplates = () => fromPacks('templates');

function packIssueText(kind, code) {
  for (const pack of registry.packs) {
    const text = pack.issues?.[kind]?.[code];
    if (text) return text;
  }
  return null;
}

function isSensitiveColumn(column) {
  return registry.packs.some((pack) => pack.sensitive?.isSensitive(column));
}

function maskSensitive(column, text) {
  const pack = registry.packs.find((candidate) => candidate.sensitive?.isSensitive(column));
  return pack && text ? pack.sensitive.mask(text) : text;
}

module.exports = {
  registerPack,
  clearPacks,
  listPacks,
  packTransformation,
  packValidation,
  packTransformationTypes,
  packValidationTypes,
  packDetectors,
  packKeys,
  packFormatDetectors,
  packFormats,
  packTemplates,
  packIssueText,
  isSensitiveColumn,
  maskSensitive
};

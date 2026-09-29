// Registers the domain packs enabled for this deployment (NEXT_PUBLIC_DOMAIN_PACKS, same values as the API's
// DOMAIN_PACKS; unset means all). Every module that runs the template engine imports this first.
import { registerEnabledPacks } from '@previley-transformer/packs/index.js';

registerEnabledPacks(process.env.NEXT_PUBLIC_DOMAIN_PACKS);

export { isSensitiveColumn, listPacks, maskSensitive, packDetectors, packFormats, packTransformation, packValidation } from '@previley-transformer/template-engine/src/packs.js';

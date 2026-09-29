// Registers the packs enabled by DOMAIN_PACKS. Loaded first by the API, the worker and the tests.
require('./index').registerEnabledPacks(process.env.DOMAIN_PACKS);

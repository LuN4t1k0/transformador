const { HttpError } = require('../http');

// AUTH_MODE=dev authenticates every request as a configurable local user. Any other mode rejects requests
// until the Previley SSO adapter (see previley-sso.js) creates real sessions.
function createAuthenticator({ users, mode = process.env.AUTH_MODE, devUser = {} }) {
  let devUserPromise = null;

  return async function authenticate() {
    if (mode === 'dev') {
      devUserPromise = devUserPromise || users.upsertBySubject({
        subject: `dev:${devUser.email || 'dev@previley.local'}`,
        email: devUser.email || 'dev@previley.local',
        displayName: devUser.name || 'Usuario de desarrollo'
      }).catch((error) => {
        devUserPromise = null;
        throw error;
      });
      return devUserPromise;
    }
    throw new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión con Previley SSO para continuar.');
  };
}

module.exports = { createAuthenticator };

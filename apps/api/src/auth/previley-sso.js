class PrevileySsoProvider {
  async validateRequest() {
    throw new Error('PrevileySsoProvider.validateRequest must be implemented by the SSO adapter');
  }

  async buildLocalSession() {
    throw new Error('PrevileySsoProvider.buildLocalSession must be implemented by the SSO adapter');
  }
}

function createUnauthenticatedResult(reason) {
  return {
    authenticated: false,
    reason
  };
}

function createAuthenticatedResult(profile) {
  return {
    authenticated: true,
    profile: {
      subject: profile.subject,
      email: profile.email,
      displayName: profile.displayName || profile.email
    }
  };
}

module.exports = {
  PrevileySsoProvider,
  createUnauthenticatedResult,
  createAuthenticatedResult
};

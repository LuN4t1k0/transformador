class TemporaryStorage {
  async save() {
    throw new Error('TemporaryStorage.save must be implemented');
  }

  async open() {
    throw new Error('TemporaryStorage.open must be implemented');
  }

  async delete() {
    throw new Error('TemporaryStorage.delete must be implemented');
  }

  async exists() {
    throw new Error('TemporaryStorage.exists must be implemented');
  }

  async cleanup() {
    throw new Error('TemporaryStorage.cleanup must be implemented');
  }
}

module.exports = { TemporaryStorage };

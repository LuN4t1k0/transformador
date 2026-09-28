const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { TemporaryStorage } = require('./temporary-storage');

class LocalTemporaryStorage extends TemporaryStorage {
  constructor(options = {}) {
    super();
    this.rootDir = options.rootDir || path.join('/tmp', 'previley-excel-transformer');
    this.ttlMs = options.ttlMs || 2 * 60 * 60 * 1000;
  }

  async save(buffer, metadata = {}) {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const extension = metadata.extension ? `.${metadata.extension.replace(/^\./, '')}` : '';
    const key = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    const filePath = path.join(this.rootDir, key);
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    return { key, path: filePath, expiresAt: new Date(Date.now() + this.ttlMs) };
  }

  async open(key) {
    return fs.open(this.#resolve(key), 'r');
  }

  async read(key) {
    return fs.readFile(this.#resolve(key));
  }

  async delete(key) {
    await fs.rm(this.#resolve(key), { force: true });
  }

  async exists(key) {
    try {
      await fs.access(this.#resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(now = new Date()) {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const deleted = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(this.rootDir, entry.name);
      const stats = await fs.stat(filePath);
      if (now.getTime() - stats.mtimeMs > this.ttlMs) {
        await fs.rm(filePath, { force: true });
        deleted.push(entry.name);
      }
    }

    return { deleted };
  }

  #resolve(key) {
    const resolved = path.resolve(this.rootDir, key);
    const root = path.resolve(this.rootDir);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid temporary storage key');
    }
    return resolved;
  }
}

module.exports = { LocalTemporaryStorage };

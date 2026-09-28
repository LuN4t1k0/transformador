const HOURS = 60 * 60 * 1000;

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const config = Object.freeze({
  maxFileSizeBytes: intEnv('MAX_FILE_SIZE_BYTES', 25 * 1024 * 1024),
  maxRows: intEnv('MAX_ROWS', 100000),
  maxUncompressedBytes: intEnv('MAX_UNCOMPRESSED_BYTES', 500 * 1024 * 1024),
  maxColumns: intEnv('MAX_COLUMNS', 200),
  maxSheets: intEnv('MAX_SHEETS', 20),
  maxConcurrentJobs: intEnv('MAX_CONCURRENT_JOBS', 2),
  maxJobDurationMs: intEnv('MAX_JOB_DURATION_MS', 30 * 60 * 1000),
  maxSampleRows: intEnv('MAX_SAMPLE_ROWS', 200),
  tempFileTtlMs: intEnv('TEMP_FILE_TTL_MS', 2 * HOURS),
  hardTempFileTtlMs: intEnv('HARD_TEMP_FILE_TTL_MS', 24 * HOURS)
});

module.exports = { config };

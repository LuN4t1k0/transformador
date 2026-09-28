const crypto = require('node:crypto');

const JOB_FIELDS = {
  status: 'status',
  stage: 'stage',
  totalRows: 'total_rows',
  processedRows: 'processed_rows',
  warningCount: 'warning_count',
  errorCount: 'error_count',
  inputStorageKey: 'input_storage_key',
  outputStorageKey: 'output_storage_key',
  mode: 'mode',
  workbookAnalysis: 'workbook_analysis',
  selectedSheet: 'selected_sheet',
  mapping: 'mapping',
  confirmedIds: 'confirmed_ids',
  validationSummary: 'validation_summary',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  startedAt: 'started_at',
  completedAt: 'completed_at',
  downloadedAt: 'downloaded_at',
  purgedAt: 'purged_at'
};
const JSON_FIELDS = new Set(['workbookAnalysis', 'mapping', 'confirmedIds', 'validationSummary']);
const TERMINAL_STATUSES = ['PURGED', 'EXPIRED', 'CANCELLED', 'FAILED'];

function toJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    status: row.status,
    stage: row.stage,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    mode: row.mode,
    totalRows: row.total_rows,
    processedRows: row.processed_rows,
    warningCount: row.warning_count,
    errorCount: row.error_count,
    inputStorageKey: row.input_storage_key,
    outputStorageKey: row.output_storage_key,
    workbookAnalysis: row.workbook_analysis,
    selectedSheet: row.selected_sheet,
    mapping: row.mapping,
    confirmedIds: row.confirmed_ids || [],
    validationSummary: row.validation_summary,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    downloadedAt: row.downloaded_at,
    purgedAt: row.purged_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createUserRepository(pool) {
  return {
    async upsertBySubject({ subject, email, displayName }) {
      const { rows } = await pool.query(
        `insert into local_users (id, sso_subject, email, display_name)
         values ($1, $2, $3, $4)
         on conflict (sso_subject) do update set email = excluded.email, display_name = excluded.display_name, updated_at = now()
         returning id, sso_subject, email, display_name`,
        [crypto.randomUUID(), subject, email, displayName || email]
      );
      const [row] = rows;
      return { id: row.id, subject: row.sso_subject, email: row.email, displayName: row.display_name };
    }
  };
}

function toTemplate(row) {
  return {
    id: row.template_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    versionId: row.version_id,
    version: row.version,
    ...row.configuration
  };
}

const TEMPLATE_SELECT = `
  select t.id as template_id, t.slug, t.name, t.description, v.id as version_id, v.version, v.configuration
  from templates t join template_versions v on v.id = t.active_version_id`;

function createTemplateRepository(pool) {
  const versionCache = new Map();

  return {
    // Seeds are code-owned: a changed configuration becomes a new immutable version.
    async ensureSeeds(seeds, createdBy) {
      for (const seed of seeds) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query('select pg_advisory_xact_lock(7202)');
          let template = (await client.query('select id, active_version_id from templates where slug = $1', [seed.slug])).rows[0];
          if (!template) {
            template = (await client.query(
              'insert into templates (id, slug, name, description, created_by) values ($1, $2, $3, $4, $5) returning id, active_version_id',
              [crypto.randomUUID(), seed.slug, seed.configuration.name, seed.description, createdBy]
            )).rows[0];
          } else {
            await client.query('update templates set name = $2, description = $3, updated_at = now() where id = $1', [template.id, seed.configuration.name, seed.description]);
          }

          const active = template.active_version_id
            ? (await client.query('select configuration from template_versions where id = $1', [template.active_version_id])).rows[0]
            : null;
          if (!active || JSON.stringify(active.configuration) !== JSON.stringify(seed.configuration)) {
            const { rows } = await client.query('select coalesce(max(version), 0) + 1 as next from template_versions where template_id = $1', [template.id]);
            const versionId = crypto.randomUUID();
            await client.query(
              'insert into template_versions (id, template_id, version, configuration, created_by) values ($1, $2, $3, $4, $5)',
              [versionId, template.id, rows[0].next, seed.configuration, createdBy]
            );
            await client.query('update templates set active_version_id = $2, updated_by = $3, updated_at = now() where id = $1', [template.id, versionId, createdBy]);
          }
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally {
          client.release();
        }
      }
    },

    async listActive() {
      const { rows } = await pool.query(`${TEMPLATE_SELECT} order by t.name`);
      return rows.map(toTemplate);
    },

    async getActive(templateId) {
      const { rows } = await pool.query(`${TEMPLATE_SELECT} where t.id = $1`, [templateId]);
      return rows[0] ? toTemplate(rows[0]) : null;
    },

    async getVersion(versionId) {
      if (versionCache.has(versionId)) return versionCache.get(versionId);
      const { rows } = await pool.query(
        `select t.id as template_id, t.slug, t.name, t.description, v.id as version_id, v.version, v.configuration
         from template_versions v join templates t on t.id = v.template_id where v.id = $1`,
        [versionId]
      );
      const template = rows[0] ? toTemplate(rows[0]) : null;
      if (template) versionCache.set(versionId, template);
      return template;
    }
  };
}

function createJobRepository(pool) {
  return {
    async create({ id, userId, templateId, templateVersionId, fileName, fileSizeBytes, inputStorageKey, status, expiresAt }) {
      const { rows } = await pool.query(
        `insert into transformation_jobs
           (id, user_id, template_id, template_version_id, status, file_name, file_size_bytes, input_storage_key, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [id, userId, templateId, templateVersionId, status, fileName, fileSizeBytes, inputStorageKey, expiresAt]
      );
      return toJob(rows[0]);
    },

    async get(id) {
      const { rows } = await pool.query('select * from transformation_jobs where id = $1', [id]);
      return toJob(rows[0]);
    },

    async getForUser(id, userId) {
      const { rows } = await pool.query('select * from transformation_jobs where id = $1 and user_id = $2', [id, userId]);
      return toJob(rows[0]);
    },

    async listForUser(userId, limit = 50) {
      const { rows } = await pool.query('select * from transformation_jobs where user_id = $1 order by created_at desc limit $2', [userId, limit]);
      return rows.map(toJob);
    },

    // Applies changes only when the job is still in one of `expectStatus`; returns null otherwise.
    async update(id, changes, { expectStatus } = {}) {
      const sets = [];
      const values = [id];
      for (const [field, value] of Object.entries(changes)) {
        const column = JOB_FIELDS[field];
        if (!column) throw new Error(`Unknown job field: ${field}`);
        values.push(JSON_FIELDS.has(field) && value !== null ? JSON.stringify(value) : value);
        sets.push(`${column} = $${values.length}`);
      }
      let where = 'id = $1';
      if (expectStatus) {
        values.push([].concat(expectStatus));
        where += ` and status = any($${values.length})`;
      }
      const { rows } = await pool.query(
        `update transformation_jobs set ${sets.join(', ')}, updated_at = now() where ${where} returning *`,
        values
      );
      return toJob(rows[0]);
    },

    async findExpired(now = new Date(), limit = 100) {
      const { rows } = await pool.query(
        'select * from transformation_jobs where expires_at < $1 and not (status = any($2)) order by expires_at limit $3',
        [now, TERMINAL_STATUSES, limit]
      );
      return rows.map(toJob);
    }
  };
}

module.exports = { createUserRepository, createTemplateRepository, createJobRepository, TERMINAL_STATUSES };

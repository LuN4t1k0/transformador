const crypto = require('node:crypto');

const JOB_FIELDS = {
  templateId: 'template_id',
  templateVersionId: 'template_version_id',
  workingTemplate: 'working_template',
  status: 'status',
  stage: 'stage',
  totalRows: 'total_rows',
  processedRows: 'processed_rows',
  warningCount: 'warning_count',
  errorCount: 'error_count',
  inputStorageKey: 'input_storage_key',
  outputStorageKey: 'output_storage_key',
  rejectsStorageKey: 'rejects_storage_key',
  rejectedRows: 'rejected_rows',
  expiresAt: 'expires_at',
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
  purgedAt: 'purged_at',
  runParameters: 'run_parameters',
  outputFileName: 'output_file_name'
};
const JSON_FIELDS = new Set(['workbookAnalysis', 'mapping', 'confirmedIds', 'validationSummary', 'workingTemplate', 'runParameters']);
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
    rejectsStorageKey: row.rejects_storage_key,
    rejectedRows: row.rejected_rows,
    reuseFromJobId: row.reuse_from_job_id,
    requestedTemplateId: row.requested_template_id,
    workbookAnalysis: row.workbook_analysis,
    selectedSheet: row.selected_sheet,
    workingTemplate: row.working_template,
    confirmedIds: row.confirmed_ids || [],
    runParameters: row.run_parameters || {},
    outputFileName: row.output_file_name,
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
    ...row.configuration,
    id: row.template_id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    destination: row.destination || '',
    process: row.process || '',
    archivedAt: row.archived_at || null,
    versionId: row.version_id,
    version: row.version,
    versionCreatedAt: row.version_created_at,
    versionCreatedBy: row.version_created_by || null
  };
}

const TEMPLATE_SELECT = `
  select t.id as template_id, t.slug, t.name, t.description, t.destination, t.process, t.archived_at,
         v.id as version_id, v.version, v.configuration, v.created_at as version_created_at, u.display_name as version_created_by
  from templates t
  join template_versions v on v.id = t.active_version_id
  left join local_users u on u.id = v.created_by`;

class TemplateNameTakenError extends Error {
  constructor() {
    super('Ya existe una plantilla activa con ese nombre.');
    this.code = 'TEMPLATE_NAME_TAKEN';
  }
}

async function inTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    if (error.code === '23505' && /templates_active_name_idx/.test(error.constraint || error.message)) throw new TemplateNameTakenError();
    throw error;
  } finally {
    client.release();
  }
}

async function insertVersion(client, templateId, configuration, userId) {
  const { rows } = await client.query('select coalesce(max(version), 0) + 1 as next from template_versions where template_id = $1', [templateId]);
  const versionId = crypto.randomUUID();
  await client.query(
    'insert into template_versions (id, template_id, version, configuration, created_by) values ($1, $2, $3, $4, $5)',
    [versionId, templateId, rows[0].next, configuration, userId]
  );
  await client.query(
    `update templates set active_version_id = $2, name = $3, description = $4, destination = $5, process = $6, updated_by = $7, updated_at = now()
     where id = $1`,
    [templateId, versionId, configuration.name, configuration.description || null, configuration.destination || null, configuration.process || null, userId]
  );
  return versionId;
}

function createTemplateRepository(pool) {
  const versionCache = new Map();

  async function getActive(templateId) {
    const { rows } = await pool.query(`${TEMPLATE_SELECT} where t.id = $1`, [templateId]);
    return rows[0] ? toTemplate(rows[0]) : null;
  }

  return {
    // Seeds are only inserted once; afterwards they are regular user-editable templates.
    async ensureSeeds(seeds, createdBy) {
      for (const seed of seeds) {
        await inTransaction(pool, async (client) => {
          await client.query('select pg_advisory_xact_lock(7202)');
          const existing = (await client.query('select id, active_version_id from templates where slug = $1', [seed.slug])).rows[0];
          if (existing?.active_version_id) return;
          const templateId = existing?.id || crypto.randomUUID();
          if (!existing) {
            await client.query('insert into templates (id, slug, name, created_by) values ($1, $2, $3, $4)', [templateId, seed.slug, seed.configuration.name, createdBy]);
          }
          await insertVersion(client, templateId, seed.configuration, createdBy);
        });
      }
    },

    async list({ includeArchived = false } = {}) {
      const { rows } = await pool.query(`${TEMPLATE_SELECT} ${includeArchived ? '' : 'where t.archived_at is null'} order by t.name`);
      return rows.map(toTemplate);
    },

    getActive,

    async getWithVersions(templateId) {
      const template = await getActive(templateId);
      if (!template) return null;
      const { rows } = await pool.query(
        `select v.id, v.version, v.created_at, u.display_name as created_by
         from template_versions v left join local_users u on u.id = v.created_by
         where v.template_id = $1 order by v.version desc`,
        [templateId]
      );
      return { ...template, versions: rows.map((row) => ({ id: row.id, version: row.version, createdAt: row.created_at, createdBy: row.created_by })) };
    },

    async getVersion(versionId) {
      if (versionCache.has(versionId)) return versionCache.get(versionId);
      const { rows } = await pool.query(
        `select t.id as template_id, t.slug, t.name, t.description, t.destination, t.process, t.archived_at,
                v.id as version_id, v.version, v.configuration, v.created_at as version_created_at, u.display_name as version_created_by
         from template_versions v join templates t on t.id = v.template_id left join local_users u on u.id = v.created_by
         where v.id = $1`,
        [versionId]
      );
      if (!rows[0]) return null;
      // Versions are immutable, but the template's name/archive state can change: cache only the configuration.
      const template = { ...toTemplate(rows[0]), ...rows[0].configuration };
      versionCache.set(versionId, template);
      return template;
    },

    async create(configuration, userId) {
      const templateId = crypto.randomUUID();
      await inTransaction(pool, async (client) => {
        await client.query('insert into templates (id, name, created_by) values ($1, $2, $3)', [templateId, configuration.name, userId]);
        await insertVersion(client, templateId, configuration, userId);
      });
      return getActive(templateId);
    },

    async addVersion(templateId, configuration, userId) {
      await inTransaction(pool, (client) => insertVersion(client, templateId, configuration, userId));
      return getActive(templateId);
    },

    async setArchived(templateId, archived) {
      await inTransaction(pool, (client) => client.query(
        `update templates set archived_at = ${archived ? 'now()' : 'null'}, updated_at = now() where id = $1`,
        [templateId]
      ));
      return getActive(templateId);
    },

    async facets() {
      const { rows } = await pool.query(
        `select array_remove(array_agg(distinct destination), null) as destinations, array_remove(array_agg(distinct process), null) as processes
         from templates where archived_at is null`
      );
      return { destinations: (rows[0].destinations || []).sort(), processes: (rows[0].processes || []).sort() };
    }
  };
}

function createJobRepository(pool) {
  return {
    async create({ id, userId, templateId, templateVersionId, fileName, fileSizeBytes, inputStorageKey, status, expiresAt, reuseFromJobId = null, requestedTemplateId = null }) {
      const { rows } = await pool.query(
        `insert into transformation_jobs
           (id, user_id, template_id, template_version_id, status, file_name, file_size_bytes, input_storage_key, expires_at, reuse_from_job_id, requested_template_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
        [id, userId, templateId, templateVersionId, status, fileName, fileSizeBytes, inputStorageKey, expiresAt, reuseFromJobId, requestedTemplateId]
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

    // When each template last produced a file for this user: drives the "same as last time" suggestion.
    async lastUsedTemplates(userId) {
      const { rows } = await pool.query(
        `select template_id, max(completed_at) as last_used_at from transformation_jobs
         where user_id = $1 and template_id is not null and completed_at is not null
         group by template_id`,
        [userId]
      );
      return new Map(rows.map((row) => [row.template_id, row.last_used_at]));
    },

    async countActiveForUser(userId, statuses) {
      const { rows } = await pool.query('select count(*)::int as count from transformation_jobs where user_id = $1 and status = any($2)', [userId, statuses]);
      return rows[0].count;
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

// Audit trail: who did what, with which template version. Metadata never contains row values.
function createAuditRepository(pool, { log = () => {} } = {}) {
  return {
    async record({ userId = null, jobId = null, templateId = null, templateVersionId = null, eventType, metadata = {} }) {
      try {
        await pool.query(
          `insert into audit_events (id, user_id, job_id, template_id, template_version_id, event_type, metadata)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [crypto.randomUUID(), userId, jobId, templateId, templateVersionId, eventType, metadata]
        );
      } catch (error) {
        // Losing an audit row must be visible in logs but must not break the user's action.
        log({ event: 'audit:error', eventType, jobId, message: error.message });
      }
    },

    async listForJob(jobId) {
      const { rows } = await pool.query(
        `select a.event_type, a.metadata, a.created_at, u.display_name
         from audit_events a left join local_users u on u.id = a.user_id
         where a.job_id = $1 order by a.created_at, a.id`,
        [jobId]
      );
      return rows.map((row) => ({ type: row.event_type, metadata: row.metadata, createdAt: row.created_at, user: row.display_name }));
    }
  };
}

module.exports = { createAuditRepository, createUserRepository, createTemplateRepository, createJobRepository, TemplateNameTakenError, TERMINAL_STATUSES };

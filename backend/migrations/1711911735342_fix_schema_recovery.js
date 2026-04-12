/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 🛡️ 1. Create Change Source Enum safely (Idempotent)
  pgm.sql(`
    DO $$ BEGIN
        CREATE TYPE config_change_source AS ENUM ('admin', 'system', 'migration');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  `);

  // 🛡️ 2. Hardening system_config table
  pgm.addColumns('system_config', {
    config_version: { type: 'integer', default: 0 },
    updated_by: { type: 'uuid' },
    updated_at: { type: 'timestamp with time zone', default: pgm.func('current_timestamp') },
    is_seeded: { type: 'boolean', default: false }
  }, { ifNotExists: true });

  // 🛡️ 3. Create Audit History Table
  pgm.createTable('system_config_history', {
    id: 'id',
    version: { type: 'integer', notNull: true },
    config_snapshot: { type: 'jsonb', notNull: true },
    updated_by: { type: 'uuid' },
    updated_at: { type: 'timestamp with time zone', default: pgm.func('current_timestamp') },
    change_reason: { type: 'text' },
    change_source: { type: 'config_change_source', default: 'admin' }
  }, { ifNotExists: true });

  // 🛡️ 4. Add MISSING retry_count to documents (Restores worker stability)
  pgm.addColumns('documents', {
    retry_count: { type: 'integer', default: 0 }
  }, { ifNotExists: true });

  // 🛡️ 5. Set Initial State for Config record
  pgm.sql("UPDATE system_config SET is_seeded = true, config_version = 1 WHERE id = 1");
};

exports.down = (pgm) => {
  pgm.dropColumns('documents', ['retry_count'], { ifExists: true });
  pgm.dropTable('system_config_history', { ifExists: true });
  pgm.dropColumns('system_config', ['config_version', 'updated_by', 'updated_at', 'is_seeded'], { ifExists: true });
  pgm.dropType('config_change_source', { ifExists: true });
};

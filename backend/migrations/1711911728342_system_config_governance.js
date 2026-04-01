exports.up = (pgm) => {
  // 🛡️ system_config: Stores the current active configuration snapshot
  pgm.createTable('system_config', {
    id: { type: 'serial', primaryKey: true },
    version: { type: 'integer', notNull: true, default: 1 },
    config_snapshot: { type: 'jsonb', notNull: true },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });

  // 🛡️ system_config_history: Audit trail for configuration changes
  pgm.createTable('system_config_history', {
    id: { type: 'serial', primaryKey: true },
    version: { type: 'integer', notNull: true },
    config_snapshot: { type: 'jsonb', notNull: true },
    updated_by: {
      type: 'integer',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    timestamp: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    change_reason: { type: 'text' },
  }, { ifNotExists: true });

  // Ensure only one active config (id=1)
  pgm.sql('INSERT INTO system_config (id, version, config_snapshot) VALUES (1, 0, \'{}\') ON CONFLICT DO NOTHING');
};

exports.down = (pgm) => {
  pgm.dropTable('system_config_history');
  pgm.dropTable('system_config');
};

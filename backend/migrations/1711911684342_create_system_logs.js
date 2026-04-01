exports.up = (pgm) => {
    pgm.createTable('system_logs', {
        id: 'id',
        level: { type: 'varchar(20)', notNull: true, default: 'info' },
        message: { type: 'text', notNull: true },
        source: { type: 'varchar(50)', notNull: true, default: 'system' },
        metadata: { type: 'jsonb', default: '{}' },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    // Index for faster queries
    pgm.createIndex('system_logs', 'created_at');
};

exports.down = (pgm) => {
    pgm.dropTable('system_logs');
};

module.exports = {
  development: {
    client: 'pg',
    connection: (() => {
      if (!process.env.DATABASE_URL) {
        throw new Error("❌ [KNEX_FATAL] DATABASE_URL is required for development/production migrations.");
      }
      return process.env.DATABASE_URL;
    })(),
    migrations: {
      directory: './migrations',
      tableName: 'pgmigrations'
    }
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './migrations',
      tableName: 'pgmigrations'
    }
  }
};

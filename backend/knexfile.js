module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgres://bbsns_user:bbsns_pass@localhost:5432/bbsns_db',
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

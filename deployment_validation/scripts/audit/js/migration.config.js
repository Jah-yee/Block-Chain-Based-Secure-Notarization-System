module.exports = {
  databaseUrl: process.env.DATABASE_URL || "postgres://bbsns_user:bbsns_pass@localhost:5432/bbsns_db",
  dir: "migrations",
  migrationsTable: "pgmigrations",
  direction: "up",
  checkOrder: false,
  logFile: "migrations.log",
  // Allow raw SQL migrations
  create: {
    sqlFile: true
  }
};

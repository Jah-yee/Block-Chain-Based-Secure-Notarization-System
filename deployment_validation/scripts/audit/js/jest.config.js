module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  maxWorkers: 1, // Run tests sequentially to avoid DB conflicts
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    '!node_modules/**'
  ],
  coverageReporters: ['text', 'lcov', 'html']
};

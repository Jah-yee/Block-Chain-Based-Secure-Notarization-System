const request = require('supertest');
const app = require('../server');

describe('Server Tests', () => {
  test('Health check endpoint', async () => {
    const response = await request(app).get('/api/status');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('Backend is running');
  });

  test('Routes exist', async () => {
    const routes = ['/users', '/documents', '/transactions'];
    for (const route of routes) {
      const response = await request(app).get(route);
      expect(response.statusCode).not.toBe(404);
    }
  });
});

process.env.DATABASE_URL = 'postgres://bbsns_user:bbsns_pass@localhost:5432/bbsns_test_db';

const express = require('express');
const userRoutes = require('./src/routes/users');
const app = express();
app.use(express.json());
app.use('/users', userRoutes);

const request = require('supertest');

async function test() {
  try {
    const res = await request(app)
      .post('/users/register')
      .send({ name: 'Test', email: 'test@example.com', walletAddress: '0x123', password: 'pass' });
    console.log('Status:', res.status, 'Body:', res.body);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();

import request from 'supertest';
import { server } from '../src/server.js';
import { expect } from 'chai';
import mongoose from 'mongoose';

describe('Server', () => {
  before(async () => {
    // Wait for the server to be ready
    await new Promise(resolve => server.on('listening', resolve));
  });

  after(async () => {
    // Close the server and database connection
    server.close();
    await mongoose.connection.close();
  });

  describe('GET /health', () => {
    it('should return 200 and server status', async () => {
      const res = await request(server).get('/health').expect('Content-Type', /json/).expect(200);

      expect(res.body).to.have.property('status', 'success');
      expect(res.body).to.have.property('message', 'Server is running');
      expect(res.body).to.have.property('environment');
      expect(res.body).to.have.property('uptime');
      expect(res.body).to.have.property('timestamp');
    });
  });

  describe('GET /non-existent-route', () => {
    it('should return 404 for non-existent routes', async () => {
      const res = await request(server)
        .get('/non-existent-route')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).to.have.property('status', 'fail');
      expect(res.body).to.have.property('message').that.includes('not found');
    });
  });

  // Add more tests for your API endpoints here
});

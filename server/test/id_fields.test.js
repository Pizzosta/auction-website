import { expect } from 'chai';
import sinon from 'sinon';

import * as userController from '../src/controllers/userController.js';
import * as authController from '../src/controllers/authController.js';
import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';

// Helper to create mock res
function createRes() {
  return {
    statusCode: 200,
    jsonPayload: null,
    cookie: sinon.spy(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
    clearCookie: sinon.spy(),
  };
}

describe('API id fields', () => {
  let originalUserModel;
  beforeEach(() => {
    originalUserModel = prisma.user;
  });

  it('login responds with user.id and no _id', async () => {
    const plain = 'P@ssw0rd!';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(plain, salt);

    const req = { body: { email: 'login@example.com', password: plain } };
    const res = createRes();

    prisma.user = {
      findFirst: async () => ({
        id: 'login-1',
        firstname: 'Log',
        middlename: '',
        lastname: 'In',
        username: 'login',
        email: 'login@example.com',
        phone: '+10000000000',
        role: 'user',
        passwordHash: hash,
        isDeleted: false,
      }),
    };

    await authController.login(req, res);

    expect(res.statusCode).to.equal(200);
    const user = res.jsonPayload.data.user;
    expect(user).to.have.property('id', 'login-1');
    expect(user).to.not.have.property('_id');
  });

  it('register responds with user.id and no _id', async () => {
    const req = {
      body: {
        firstname: 'Bob',
        middlename: '',
        lastname: 'Smith',
        phone: '+1 000 000 0000',
        username: 'bob',
        email: 'bob@example.com',
        password: 'Str0ng!Pass',
        confirmPassword: 'Str0ng!Pass',
      },
    };
    const res = createRes();

    // Monkey-patch prisma calls used by register
    prisma.user = {
      findFirst: async () => null, // for email/username/phone checks
      create: async () => ({
        id: 'new-user-1',
        firstname: 'Bob',
        middlename: '',
        lastname: 'Smith',
        phone: '+10000000000',
        username: 'bob',
        email: 'bob@example.com',
        role: 'user',
      }),
      update: async () => ({}),
    };

    await authController.register(req, res);

    expect(res.statusCode).to.equal(201);
    expect(res.jsonPayload).to.have.property('data');
    const user = res.jsonPayload.data.user;
    expect(user).to.have.property('id', 'new-user-1');
    expect(user).to.not.have.property('_id');
  });

  it('resetPassword responds with user.id and no _id', async () => {
    // Provide a 64-char hex token (decodedToken) to satisfy validation
    const resetToken = 'a'.repeat(64);
    const req = {
      params: { token: resetToken },
      body: { password: 'NewStr0ng!Pass', confirmPassword: 'NewStr0ng!Pass' },
      ip: '127.0.0.1',
      originalUrl: '/api/auth/reset-password/' + resetToken,
    };
    const res = createRes();

    // Monkey-patch prisma for reset flow
    const now = new Date(Date.now() + 1000 * 60); // not expired
    prisma.user = {
      findFirst: async () => ({
        id: 'u-reset-1',
        firstname: 'Reset',
        email: 'reset@example.com',
        role: 'user',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv', // dummy hash; will not match
      }),
      update: async () => ({}),
    };

    await authController.resetPassword(req, res);

    expect(res.statusCode).to.equal(200);
    expect(res.jsonPayload).to.have.property('data');
    const user = res.jsonPayload.data.user;
    expect(user).to.have.property('id', 'u-reset-1');
    expect(user).to.not.have.property('_id');
  });
  afterEach(() => {
    prisma.user = originalUserModel;
    sinon.restore();
  });

  it('restoreUser responds with user.id and no _id', async () => {
    const req = { params: { id: 'u1' }, user: { role: 'admin', id: 'admin' } };
    const res = createRes();

    prisma.user = {
      findUnique: async () => ({
        id: 'u1',
        isDeleted: true,
        firstname: 'John',
        middlename: 'Q',
        lastname: 'Public',
        email: 'john@example.com',
        username: 'john',
        role: 'user',
      }),
      update: async () => ({}),
    };

    await userController.restoreUser(req, res);

    expect(res.statusCode).to.equal(200);
    expect(res.jsonPayload).to.have.property('data');
    const user = res.jsonPayload.data.user;
    expect(user).to.have.property('id', 'u1');
    expect(user).to.not.have.property('_id');
  });

  it('getMe responds with user.id and no _id', async () => {
    const req = { user: { id: 'me-1' } };
    const res = createRes();

    prisma.user = {
      findUnique: async () => ({
        id: 'me-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        firstname: 'Alice',
        middlename: '',
        lastname: 'Doe',
        username: 'alice',
        email: 'alice@example.com',
        phone: '+10000000000',
        role: 'user',
        rating: 0,
        bio: '',
        location: '',
        isVerified: false,
        isDeleted: false,
        deletedAt: null,
        profilePictureUrl: '',
        profilePictureId: '',
      }),
    };

    await userController.getMe(req, res);

    expect(res.statusCode).to.equal(200);
    const user = res.jsonPayload.data.user;
    expect(user).to.have.property('id', 'me-1');
    expect(user).to.not.have.property('_id');
  });
});

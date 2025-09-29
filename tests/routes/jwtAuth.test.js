const request = require('supertest');
const { Hono } = require('hono');
const authRoutes = require('../../src/routes/auth');
const dbClient = require('../../src/db/client');

// Create a test app with just the auth routes
const testApp = new Hono();
testApp.route('/api', authRoutes);

describe('JWT Auth Routes Integration Tests', () => {
  beforeAll(async () => {
    await dbClient.connect();
  });

  afterAll(async () => {
    await dbClient.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    const prisma = dbClient.getClient();
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'jwtauth'
        }
      }
    });
  });

  describe('POST /api/auth/generate-token', () => {
    test('should generate token for new user', async () => {
      const userData = {
        userId: 'test-jwt-001',
        email: 'jwtauth1@example.com',
        name: 'JWT Auth Test User'
      };

      const response = await request(testApp.fetch)
        .post('/api/auth/generate-token')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.name).toBe(userData.name);
      expect(response.body.user.id).toBeDefined();
      expect(response.body.expiresIn).toBe('24h');
    });

    test('should generate token for existing user', async () => {
      const userData = {
        userId: 'test-jwt-002',
        email: 'jwtauth2@example.com',
        name: 'Existing JWT User'
      };

      // Create user first
      await request(testApp.fetch)
        .post('/api/auth/generate-token')
        .send(userData)
        .expect(201);

      // Request token again for same user
      const response = await request(testApp.fetch)
        .post('/api/auth/generate-token')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
    });

    test('should return 400 for missing required fields', async () => {
      const testCases = [
        { email: 'test@example.com', name: 'Test' }, // Missing userId
        { userId: 'test-001', name: 'Test' }, // Missing email
        { userId: 'test-001', email: 'test@example.com' } // Missing name
      ];

      for (const userData of testCases) {
        const response = await request(testApp.fetch)
          .post('/api/auth/generate-token')
          .send(userData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Missing required fields');
      }
    });
  });

  describe('POST /api/auth/verify-token', () => {
    let validToken;

    beforeEach(async () => {
      // Generate a valid token for testing
      const userData = {
        userId: 'test-verify-jwt',
        email: 'jwtauth.verify@example.com',
        name: 'JWT Verify Test User'
      };

      const tokenResponse = await request(testApp.fetch)
        .post('/api/auth/generate-token')
        .send(userData);

      validToken = tokenResponse.body.token;
    });

    test('should verify valid token', async () => {
      const response = await request(testApp.fetch)
        .post('/api/auth/verify-token')
        .send({ token: validToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('jwtauth.verify@example.com');
      expect(response.body.issuedAt).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
      expect(response.body.expiringSoon).toBe(false);
    });

    test('should reject invalid token', async () => {
      const response = await request(testApp.fetch)
        .post('/api/auth/verify-token')
        .send({ token: 'invalid.token.here' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    test('should return 400 for missing token', async () => {
      const response = await request(testApp.fetch)
        .post('/api/auth/verify-token')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing token');
    });
  });
});
const request = require('supertest');
const { Hono } = require('hono');
const userRoutes = require('../../src/routes/users');
const dbClient = require('../../src/db/client');

// Create a test app with just the user routes
const testApp = new Hono();
testApp.route('/api/users', userRoutes);

describe('User API Integration Tests', () => {
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
          contains: 'apitest'
        }
      }
    });
  });

  describe('POST /api/users', () => {
    test('should create a new user', async () => {
      const userData = {
        name: 'API Test User',
        email: 'apitest@example.com'
      };

      const response = await request(testApp.fetch)
        .post('/api/users')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(userData.name);
      expect(response.body.data.email).toBe(userData.email);
      expect(response.body.data.id).toBeDefined();
    });

    test('should return 400 for invalid data', async () => {
      const userData = {
        name: 'Test User'
        // missing email
      };

      const response = await request(testApp.fetch)
        .post('/api/users')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    test('should return 409 for duplicate email', async () => {
      const userData = {
        name: 'Duplicate User',
        email: 'duplicate.apitest@example.com'
      };

      // Create first user
      await request(testApp.fetch)
        .post('/api/users')
        .send(userData)
        .expect(201);

      // Try to create duplicate
      const response = await request(testApp.fetch)
        .post('/api/users')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /api/users/:id', () => {
    test('should get user by ID', async () => {
      const userData = {
        name: 'Get User Test',
        email: 'getuser.apitest@example.com'
      };

      const createResponse = await request(testApp.fetch)
        .post('/api/users')
        .send(userData)
        .expect(201);

      const userId = createResponse.body.data.id;

      const response = await request(testApp.fetch)
        .get(`/api/users/${userId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(userId);
      expect(response.body.data.email).toBe(userData.email);
    });

    test('should return 404 for non-existent user', async () => {
      const response = await request(testApp.fetch)
        .get('/api/users/fake-id-123')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('PUT /api/users/:id', () => {
    test('should update user', async () => {
      const userData = {
        name: 'Update User Test',
        email: 'updateuser.apitest@example.com'
      };

      const createResponse = await request(testApp.fetch)
        .post('/api/users')
        .send(userData)
        .expect(201);

      const userId = createResponse.body.data.id;
      const updateData = { name: 'Updated Name' };

      const response = await request(testApp.fetch)
        .put(`/api/users/${userId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.email).toBe(userData.email);
    });

    test('should return 404 for non-existent user', async () => {
      const response = await request(testApp.fetch)
        .put('/api/users/fake-id-123')
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/users/:id', () => {
    test('should delete user', async () => {
      const userData = {
        name: 'Delete User Test',
        email: 'deleteuser.apitest@example.com'
      };

      const createResponse = await request(testApp.fetch)
        .post('/api/users')
        .send(userData)
        .expect(201);

      const userId = createResponse.body.data.id;

      const response = await request(testApp.fetch)
        .delete(`/api/users/${userId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify user is deleted
      await request(testApp.fetch)
        .get(`/api/users/${userId}`)
        .expect(404);
    });

    test('should return 404 for non-existent user', async () => {
      const response = await request(testApp.fetch)
        .delete('/api/users/fake-id-123')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/users', () => {
    test('should get all users', async () => {
      // Create test users
      await request(testApp.fetch)
        .post('/api/users')
        .send({ name: 'User 1', email: 'user1.apitest@example.com' });

      await request(testApp.fetch)
        .post('/api/users')
        .send({ name: 'User 2', email: 'user2.apitest@example.com' });

      const response = await request(testApp.fetch)
        .get('/api/users')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toBeInstanceOf(Array);
      expect(response.body.data.total).toBeGreaterThanOrEqual(2);
      expect(response.body.data.limit).toBe(50);
      expect(response.body.data.offset).toBe(0);
    });

    test('should respect pagination parameters', async () => {
      const response = await request(testApp.fetch)
        .get('/api/users?limit=1&offset=0')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users.length).toBeLessThanOrEqual(1);
      expect(response.body.data.limit).toBe(1);
      expect(response.body.data.offset).toBe(0);
    });
  });
});
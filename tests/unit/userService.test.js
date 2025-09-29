const userService = require('../../src/services/userService');
const dbClient = require('../../src/db/client');

describe('User Service', () => {
  beforeAll(async () => {
    await dbClient.connect();
  });

  afterAll(async () => {
    await dbClient.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data more thoroughly
    const prisma = dbClient.getClient();
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: 'test' } },
          { email: { contains: 'example.com' } },
          { email: { contains: 'getall.com' } }
        ]
      }
    });
  });

  describe('createUser', () => {
    test('should create a new user successfully', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com'
      };

      const user = await userService.createUser(userData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.name).toBe(userData.name);
      expect(user.email).toBe(userData.email);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    test('should throw error when email is missing', async () => {
      const userData = { name: 'Test User' };

      await expect(userService.createUser(userData)).rejects.toThrow('Email and name are required');
    });

    test('should throw error when name is missing', async () => {
      const userData = { email: 'test@example.com' };

      await expect(userService.createUser(userData)).rejects.toThrow('Email and name are required');
    });

    test('should throw error when user with email already exists', async () => {
      const userData = {
        name: 'Test User',
        email: 'duplicate@example.com'
      };

      await userService.createUser(userData);

      await expect(userService.createUser(userData)).rejects.toThrow('User with this email already exists');
    });
  });

  describe('getUserById', () => {
    test('should get user by valid ID', async () => {
      const userData = {
        name: 'Test User',
        email: 'getbyid@example.com'
      };

      const createdUser = await userService.createUser(userData);
      const fetchedUser = await userService.getUserById(createdUser.id);

      expect(fetchedUser).toBeDefined();
      expect(fetchedUser.id).toBe(createdUser.id);
      expect(fetchedUser.email).toBe(userData.email);
    });

    test('should throw error for non-existent user ID', async () => {
      const fakeId = 'fake-id-123';

      await expect(userService.getUserById(fakeId)).rejects.toThrow('User not found');
    });

    test('should throw error when ID is not provided', async () => {
      await expect(userService.getUserById()).rejects.toThrow('User ID is required');
    });
  });

  describe('updateUser', () => {
    test('should update user successfully', async () => {
      const userData = {
        name: 'Original Name',
        email: 'update@example.com'
      };

      const createdUser = await userService.createUser(userData);
      const updatedUser = await userService.updateUser(createdUser.id, { name: 'Updated Name' });

      expect(updatedUser.name).toBe('Updated Name');
      expect(updatedUser.email).toBe(userData.email);
      expect(new Date(updatedUser.updatedAt)).toBeInstanceOf(Date);
    });

    test('should throw error when updating non-existent user', async () => {
      const fakeId = 'fake-id-123';

      await expect(userService.updateUser(fakeId, { name: 'New Name' })).rejects.toThrow('User not found');
    });

    test('should throw error when updating to existing email', async () => {
      const user1 = await userService.createUser({ name: 'User 1', email: 'user1@example.com' });
      const user2 = await userService.createUser({ name: 'User 2', email: 'user2@example.com' });

      await expect(
        userService.updateUser(user2.id, { email: 'user1@example.com' })
      ).rejects.toThrow('User with this email already exists');
    });
  });

  describe('deleteUser', () => {
    test('should delete user successfully', async () => {
      const userData = {
        name: 'Delete Me',
        email: 'delete@example.com'
      };

      const createdUser = await userService.createUser(userData);
      const deletedUser = await userService.deleteUser(createdUser.id);

      expect(deletedUser.id).toBe(createdUser.id);

      await expect(userService.getUserById(createdUser.id)).rejects.toThrow('User not found');
    });

    test('should throw error when deleting non-existent user', async () => {
      const fakeId = 'fake-id-123';

      await expect(userService.deleteUser(fakeId)).rejects.toThrow('User not found');
    });
  });

  describe('getAllUsers', () => {
    test('should get all users with default pagination', async () => {
      await userService.createUser({ name: 'User 1', email: 'user1@getall.com' });
      await userService.createUser({ name: 'User 2', email: 'user2@getall.com' });

      const result = await userService.getAllUsers();

      expect(result.users).toBeInstanceOf(Array);
      expect(result.users.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    test('should respect pagination limits', async () => {
      const result = await userService.getAllUsers(1, 0);

      expect(result.users.length).toBeLessThanOrEqual(1);
      expect(result.limit).toBe(1);
      expect(result.offset).toBe(0);
    });
  });
});
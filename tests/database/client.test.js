const dbClient = require('../../src/db/client');

describe('Database Client', () => {
  afterAll(async () => {
    await dbClient.disconnect();
  });

  describe('Connection Management', () => {
    test('should connect to database successfully', async () => {
      const client = await dbClient.connect();
      expect(client).toBeDefined();
      expect(dbClient.isConnected).toBe(true);
    });

    test('should return existing connection if already connected', async () => {
      const client1 = await dbClient.connect();
      const client2 = await dbClient.connect();
      expect(client1).toBe(client2);
    });

    test('should return client when connected', () => {
      const client = dbClient.getClient();
      expect(client).toBeDefined();
    });

    test('should throw error when getting client without connection', async () => {
      await dbClient.disconnect();
      expect(() => dbClient.getClient()).toThrow('Database not connected');
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      await dbClient.connect();
    });

    test('should return healthy status when connected', async () => {
      const health = await dbClient.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
    });

    test('should return disconnected status when not connected', async () => {
      await dbClient.disconnect();
      const health = await dbClient.healthCheck();
      expect(health.status).toBe('disconnected');
      expect(health.error).toBe('Not connected to database');
    });
  });

  describe('Graceful Shutdown', () => {
    test('should disconnect gracefully', async () => {
      await dbClient.connect();
      expect(dbClient.isConnected).toBe(true);

      await dbClient.gracefulShutdown();
      expect(dbClient.isConnected).toBe(false);
    });
  });
});
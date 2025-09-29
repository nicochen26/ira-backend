const { SSEConnection, SSEManager, getSSeManager } = require('../../src/sse/sseManager');

// Mock response object
const createMockResponse = () => ({
  writeHead: jest.fn(),
  write: jest.fn(),
  end: jest.fn(),
  on: jest.fn()
});

describe('SSE Manager', () => {
  let sseManager;

  beforeEach(() => {
    sseManager = new SSEManager();
    // Clear intervals to prevent test interference
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (sseManager) {
      sseManager.cleanup();
    }
    jest.useRealTimers();
  });

  describe('SSEConnection', () => {
    test('should create connection with proper initialization', () => {
      const mockResponse = createMockResponse();
      const connection = new SSEConnection('search-1', 'user-1', mockResponse);

      expect(connection.searchId).toBe('search-1');
      expect(connection.userId).toBe('user-1');
      expect(connection.connected).toBe(true);
      expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });

    test('should send events correctly', () => {
      const mockResponse = createMockResponse();
      const connection = new SSEConnection('search-1', 'user-1', mockResponse);

      const result = connection.sendEvent('test', { message: 'hello' }, '123');

      expect(result).toBe(true);
      expect(mockResponse.write).toHaveBeenCalledWith(
        'id: 123\nevent: test\ndata: {"message":"hello"}\n\n'
      );
    });

    test('should handle send failure when disconnected', () => {
      const mockResponse = createMockResponse();
      const connection = new SSEConnection('search-1', 'user-1', mockResponse);

      // Reset mock after initialization (connected event is sent during init)
      mockResponse.write.mockReset();
      connection.connected = false;

      const result = connection.sendEvent('test', { message: 'hello' });

      expect(result).toBe(false);
      expect(mockResponse.write).not.toHaveBeenCalled();
    });

    test('should send heartbeat events', () => {
      const mockResponse = createMockResponse();
      const connection = new SSEConnection('search-1', 'user-1', mockResponse);

      connection.sendHeartbeat();

      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: heartbeat')
      );
    });

    test('should handle custom response objects', () => {
      const customResponse = {
        write: jest.fn()
      };
      const connection = new SSEConnection('search-1', 'user-1', customResponse);

      const result = connection.sendEvent('test', { message: 'hello' });

      expect(result).toBe(true);
      expect(customResponse.write).toHaveBeenCalledWith(
        'event: test\ndata: {"message":"hello"}\n\n'
      );
    });
  });

  describe('SSEManager', () => {
    test('should add connections correctly', () => {
      const mockResponse = createMockResponse();

      const connection = sseManager.addConnection('search-1', 'user-1', mockResponse);

      expect(connection).toBeInstanceOf(SSEConnection);
      expect(sseManager.getSearchConnectionCount('search-1')).toBe(1);
      expect(sseManager.getUserConnectionCount('user-1')).toBe(1);
      expect(sseManager.getTotalConnectionCount()).toBe(1);
    });

    test('should remove connections correctly', () => {
      const mockResponse = createMockResponse();
      const connection = sseManager.addConnection('search-1', 'user-1', mockResponse);

      sseManager.removeConnection(connection);

      expect(sseManager.getSearchConnectionCount('search-1')).toBe(0);
      expect(sseManager.getUserConnectionCount('user-1')).toBe(0);
      expect(sseManager.getTotalConnectionCount()).toBe(0);
    });

    test('should broadcast to search connections', () => {
      const mockResponse1 = createMockResponse();
      const mockResponse2 = createMockResponse();

      sseManager.addConnection('search-1', 'user-1', mockResponse1);
      sseManager.addConnection('search-1', 'user-2', mockResponse2);
      sseManager.addConnection('search-2', 'user-1', createMockResponse());

      const successCount = sseManager.broadcastToSearch('search-1', 'update', { status: 'processing' });

      expect(successCount).toBe(2);
      expect(mockResponse1.write).toHaveBeenCalledWith(
        expect.stringContaining('event: update')
      );
      expect(mockResponse2.write).toHaveBeenCalledWith(
        expect.stringContaining('event: update')
      );
    });

    test('should broadcast to user connections', () => {
      const mockResponse1 = createMockResponse();
      const mockResponse2 = createMockResponse();

      sseManager.addConnection('search-1', 'user-1', mockResponse1);
      sseManager.addConnection('search-2', 'user-1', mockResponse2);
      sseManager.addConnection('search-3', 'user-2', createMockResponse());

      const successCount = sseManager.broadcastToUser('user-1', 'notification', { message: 'hello' });

      expect(successCount).toBe(2);
      expect(mockResponse1.write).toHaveBeenCalledWith(
        expect.stringContaining('event: notification')
      );
      expect(mockResponse2.write).toHaveBeenCalledWith(
        expect.stringContaining('event: notification')
      );
    });

    test('should enforce connection limits', () => {
      const limitedManager = new SSEManager({ maxConnections: 2 });

      limitedManager.addConnection('search-1', 'user-1', createMockResponse());
      limitedManager.addConnection('search-2', 'user-2', createMockResponse());

      expect(() => {
        limitedManager.addConnection('search-3', 'user-3', createMockResponse());
      }).toThrow('Maximum SSE connections exceeded');

      limitedManager.cleanup();
    });

    test('should clean up stale connections', () => {
      const connection = sseManager.addConnection('search-1', 'user-1', createMockResponse());

      // Simulate stale connection by setting old activity
      connection.lastActivity = Date.now() - (31 * 60 * 1000); // 31 minutes ago

      sseManager.cleanupStaleConnections();

      expect(sseManager.getTotalConnectionCount()).toBe(0);
    });

    test('should handle cleanup on process events', () => {
      const connection = sseManager.addConnection('search-1', 'user-1', createMockResponse());

      expect(sseManager.getTotalConnectionCount()).toBe(1);

      sseManager.cleanup();

      expect(sseManager.getTotalConnectionCount()).toBe(0);
    });

    test('should provide accurate stats', () => {
      sseManager.addConnection('search-1', 'user-1', createMockResponse());
      sseManager.addConnection('search-1', 'user-2', createMockResponse());
      sseManager.addConnection('search-2', 'user-1', createMockResponse());

      const stats = sseManager.getStats();

      expect(stats).toEqual({
        totalConnections: 3,
        searchCount: 2,
        userCount: 2,
        maxConnections: 1000,
        connectionTimeout: 30 * 60 * 1000
      });
    });
  });

  describe('getSSeManager singleton', () => {
    test('should return the same instance', () => {
      const instance1 = getSSeManager();
      const instance2 = getSSeManager();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(SSEManager);
    });
  });
});
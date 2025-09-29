const { IRAService, IRAServiceError } = require('../../src/services/iraService');

// Mock fetch
jest.mock('node-fetch');
const fetch = require('node-fetch');

describe('IRA Service', () => {
  let iraService;

  beforeEach(() => {
    iraService = new IRAService();
    fetch.mockReset();
  });

  describe('createThread', () => {
    test('should create IRA thread successfully', async () => {
      const mockThreadResponse = {
        thread_id: 'test-thread-id',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        metadata: { user_id: 'test-user-id' },
        status: 'idle',
        config: {}
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockThreadResponse
      });

      const result = await iraService.createThread('test-token', { user_id: 'test-user-id' });

      expect(result).toEqual(mockThreadResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.invest-research.example.com/v1/_ira/threads',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ metadata: { user_id: 'test-user-id' } })
        })
      );
    });

    test('should throw error when IRA API fails', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(
        iraService.createThread('test-token')
      ).rejects.toThrow(IRAServiceError);
    });

    test('should throw error when response has no thread_id', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'error' })
      });

      await expect(
        iraService.createThread('test-token')
      ).rejects.toThrow('IRA threads API did not return thread_id');
    });
  });

  describe('startStream', () => {
    test('should start IRA stream successfully', async () => {
      const mockResponse = {
        ok: true,
        body: {
          on: jest.fn()
        }
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await iraService.startStream(
        'test-thread-id',
        'test-token',
        'test query'
      );

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.invest-research.example.com/v1/threads/test-thread-id/runs/stream',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    test('should include correct stream configuration', async () => {
      const mockResponse = { ok: true, body: { on: jest.fn() } };
      fetch.mockResolvedValueOnce(mockResponse);

      await iraService.startStream('test-thread-id', 'test-token', 'test query');

      const callArgs = fetch.mock.calls[0][1];
      const requestBody = JSON.parse(callArgs.body);

      expect(requestBody).toEqual(
        expect.objectContaining({
          input: {
            messages: expect.arrayContaining([
              expect.objectContaining({
                type: 'human',
                content: 'test query'
              })
            ])
          },
          config: expect.objectContaining({
            configurable: expect.objectContaining({
              deepResearch: true,
              mcpWebSearch: true
            }),
            recursion_limit: 60
          }),
          stream_mode: ['values', 'messages-tuple', 'custom'],
          assistant_id: 'planned-supervisor-agent'
        })
      );
    });

    test('should throw error when stream API fails', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      });

      await expect(
        iraService.startStream('test-thread-id', 'test-token', 'test query')
      ).rejects.toThrow(IRAServiceError);
    });
  });

  describe('parseSSEData', () => {
    test('should parse valid SSE data', () => {
      const sseData = `event: test
data: {"message": "hello"}
id: 123`;

      const result = iraService.parseSSEData(sseData);

      expect(result).toEqual({
        type: 'test',
        data: { message: 'hello' },
        id: '123'
      });
    });

    test('should handle malformed JSON data', () => {
      const sseData = `event: test
data: invalid json
id: 123`;

      const result = iraService.parseSSEData(sseData);

      expect(result).toEqual({
        type: 'test',
        data: 'invalid json',
        id: '123'
      });
    });

    test('should return null for empty data', () => {
      const result = iraService.parseSSEData('');
      expect(result).toBeNull();
    });

    test('should handle partial SSE data', () => {
      const sseData = `event: test`;

      const result = iraService.parseSSEData(sseData);

      expect(result).toEqual({
        type: 'test'
      });
    });
  });

  describe('processStreamEvent', () => {
    test('should process metadata event', () => {
      const eventData = {
        type: 'metadata',
        data: { run_id: 'test-run-id', attempt: 1 },
        id: '0'
      };

      const result = iraService.processStreamEvent(eventData);

      expect(result).toEqual({
        type: 'METADATA',
        content: { run_id: 'test-run-id', attempt: 1 },
        sequence: 0
      });
    });

    test('should process values event with messages', () => {
      const eventData = {
        type: 'values',
        data: {
          messages: [
            { content: 'Analyzing data...' }
          ]
        },
        id: '1'
      };

      const result = iraService.processStreamEvent(eventData);

      expect(result).toEqual({
        type: 'THINKING',
        content: 'Analyzing data...',
        sequence: 1
      });
    });

    test('should process values event with final result', () => {
      const eventData = {
        type: 'values',
        data: {
          final_result: '# Analysis Report\nThis is the final result'
        },
        id: '10'
      };

      const result = iraService.processStreamEvent(eventData);

      expect(result).toEqual({
        type: 'REPORT',
        content: '# Analysis Report\nThis is the final result',
        sequence: 10
      });
    });

    test('should process messages event', () => {
      const eventData = {
        type: 'messages',
        data: [
          {
            content: 'Intermediate finding',
            type: 'ai',
            tool_calls: []
          }
        ],
        id: '5'
      };

      const result = iraService.processStreamEvent(eventData);

      expect(result).toEqual({
        type: 'INTERMEDIATE',
        content: 'Intermediate finding',
        sequence: 5,
        metadata: {
          messageType: 'ai',
          toolCalls: []
        }
      });
    });

    test('should return null for empty event data', () => {
      const result = iraService.processStreamEvent(null);
      expect(result).toBeNull();
    });

    test('should return null for event with no data', () => {
      const eventData = { type: 'test' };
      const result = iraService.processStreamEvent(eventData);
      expect(result).toBeNull();
    });
  });
});
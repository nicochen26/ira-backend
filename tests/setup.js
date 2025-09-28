// Load test environment variables
require('dotenv').config({ path: '.env.test' });

// Mock console methods to prevent noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};
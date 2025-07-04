import 'reflect-metadata';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock timers for consistent test behavior
jest.useFakeTimers();

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
});
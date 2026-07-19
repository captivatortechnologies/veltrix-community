/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        // Disable full type-checking in tests (faster; `npm run lint` /
        // `npm run build` still catch real type errors).
        isolatedModules: true,
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.interface.ts',
    '!src/**/index.ts',
    '!src/types/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  // Test-only env defaults for the four fail-fast secrets (see
  // src/config/env.ts) so `npm test` works out of the box without a real
  // .env file. Only fills gaps — real values (e.g. from CI) always win.
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testTimeout: 10000,
  verbose: true,
  bail: false,
  maxWorkers: '50%',
};

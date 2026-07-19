// Main entry point for the @veltrix/sdk package.

// Export the main client class and its config type
export { VeltrixClient } from './client';
export type { VeltrixClientConfig } from './client';

// Export the default base URL constant for convenience
export { DEFAULT_BASE_URL } from './http-client';

// Export error classes for consumers to catch specific errors
export * from './errors';

// Export the SDK version
export { SDK_VERSION } from './version';

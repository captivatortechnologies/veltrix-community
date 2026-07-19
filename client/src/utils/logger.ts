/**
 * Simple logger utility
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Current log level - can be changed at runtime
 */
let currentLevel = LogLevel.INFO;

/**
 * Set the current log level
 * @param level New log level
 */
export const setLogLevel = (level: LogLevel): void => {
  currentLevel = level;
};

/**
 * Get the current log level
 * @returns Current log level
 */
export const getLogLevel = (): LogLevel => {
  return currentLevel;
};

/**
 * Format a log message with timestamp
 * @param level Log level
 * @param message Message to log
 * @param data Optional data to include
 * @returns Formatted log message
 */
const formatLogMessage = (level: string, message: string, data?: unknown): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`;
};

/**
 * Logger interface
 */
export interface LoggerInterface {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/**
 * Main logger implementation
 */
class Logger implements LoggerInterface {
  /**
   * Log a debug message
   * @param message Message to log
   * @param data Optional data to include
   */
  debug(message: string, data?: unknown): void {
    if (currentLevel <= LogLevel.DEBUG) {
      console.debug(formatLogMessage('DEBUG', message, data));
    }
  }

  /**
   * Log an info message
   * @param message Message to log
   * @param data Optional data to include
   */
  info(message: string, data?: unknown): void {
    if (currentLevel <= LogLevel.INFO) {
      console.info(formatLogMessage('INFO', message, data));
    }
  }

  /**
   * Log a warning message
   * @param message Message to log
   * @param data Optional data to include
   */
  warn(message: string, data?: unknown): void {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(formatLogMessage('WARN', message, data));
    }
  }

  /**
   * Log an error message
   * @param message Message to log
   * @param data Optional data to include
   */
  error(message: string, data?: unknown): void {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(formatLogMessage('ERROR', message, data));
    }
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

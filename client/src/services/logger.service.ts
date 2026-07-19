/**
 * Logger service for client applications
 * This service provides standardized logging functionality
 * with support for different log levels and structured logging
 * Environment-aware: verbose console logs for development, minimal logs for production
 */

// Get environment setting from import.meta.env (Vite) or fallback
const IS_DEVELOPMENT = 
  typeof import.meta !== 'undefined' && 
  import.meta.env && 
  import.meta.env.MODE === 'development';

// Log level enum - order matters for filtering (lower to higher severity)
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

// Convert string to log level
export function stringToLogLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    case 'fatal': return LogLevel.FATAL;
    default: return LogLevel.INFO; // Default to INFO
  }
}

// Service log settings interface
export interface LogSettings {
  logLevel: LogLevel;
  includeTimestamps: boolean;
  enableRemoteLogging: boolean;
  context?: string;
}

// Default log settings
const DEFAULT_LOG_SETTINGS: LogSettings = {
  logLevel: IS_DEVELOPMENT ? LogLevel.DEBUG : LogLevel.INFO,
  includeTimestamps: true,
  enableRemoteLogging: !IS_DEVELOPMENT,
  context: 'client'
};

// Metadata type for logging
export type LogMetadata = Record<string, unknown> | Error | unknown;

// Logger interface
export interface ILogger {
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  error(message: string, meta?: LogMetadata): void;
  fatal(message: string, meta?: LogMetadata): void;
  setContext(context: string): void;
}

/**
 * Client-side logger service implementation
 * Features:
 * - Colored console output in development
 * - Optional remote logging in production
 * - Context-aware logging for component identification
 * - Structured error logging with metadata
 */
class LoggerService implements ILogger {
  private settings: LogSettings;
  private remoteLoggingEndpoint?: string;

  constructor(settings?: Partial<LogSettings>, remoteEndpoint?: string) {
    this.settings = { ...DEFAULT_LOG_SETTINGS, ...settings };
    this.remoteLoggingEndpoint = remoteEndpoint;
  }

  /**
   * Configure logger settings
   * @param settings The settings to apply
   */
  configure(settings: Partial<LogSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings
    };
  }

  /**
   * Set the context for this logger instance
   * @param context The context name (e.g., component, feature)
   */
  setContext(context: string): void {
    this.settings.context = context;
  }

  /**
   * Set the remote logging endpoint
   * @param endpoint The endpoint URL for remote logging
   */
  setRemoteLoggingEndpoint(endpoint: string): void {
    this.remoteLoggingEndpoint = endpoint;
  }

  /**
   * Check if a message should be logged based on its level and settings
   * @param level Message log level
   * @returns Whether the message should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levelValue = Object.values(LogLevel).indexOf(level);
    const settingsLevelValue = Object.values(LogLevel).indexOf(this.settings.logLevel);
    
    // Log if message level is >= settings level (e.g., ERROR >= INFO)
    return levelValue >= settingsLevelValue;
  }

  /**
   * Log a debug message
   * @param message The log message
   * @param meta Optional metadata
   */
  debug(message: string, meta?: LogMetadata): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log(LogLevel.DEBUG, message, meta);
    }
  }
  
  /**
   * Log an info message
   * @param message The log message
   * @param meta Optional metadata
   */
  info(message: string, meta?: LogMetadata): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log(LogLevel.INFO, message, meta);
    }
  }
  
  /**
   * Log a warning message
   * @param message The log message
   * @param meta Optional metadata
   */
  warn(message: string, meta?: LogMetadata): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log(LogLevel.WARN, message, meta);
    }
  }
  
  /**
   * Log an error message
   * @param message The log message
   * @param meta Optional metadata
   */
  error(message: string, meta?: LogMetadata): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log(LogLevel.ERROR, message, meta);
    }
  }
  
  /**
   * Log a fatal error message
   * @param message The log message
   * @param meta Optional metadata
   */
  fatal(message: string, meta?: LogMetadata): void {
    // Always log fatal errors regardless of settings
    this.log(LogLevel.FATAL, message, meta);
  }

  /**
   * Format metadata for logging
   * @param meta Metadata to format
   * @returns Formatted metadata
   */
  private formatMetadata(meta?: LogMetadata): unknown {
    if (!meta) return undefined;

    // If meta is an Error, extract message, name and stack
    if (meta instanceof Error) {
      const { message, name, stack, ...rest } = meta;
      return {
        error: message,
        name,
        stack,
        ...rest // Include any additional properties that might be on the error
      };
    }

    return meta;
  }

  /**
   * Create a formatted log message string
   * @param level Log level
   * @param message Log message
   * @returns Formatted log message
   */
  private formatLogMessage(level: LogLevel, message: string): string {
    const timestamp = this.settings.includeTimestamps 
      ? `[${new Date().toLocaleTimeString()}] `
      : '';
    
    const context = this.settings.context 
      ? `(${this.settings.context}) `
      : '';
    
    return `${timestamp}${level.toUpperCase()} ${context}${message}`;
  }
  
  /**
   * Internal logging method
   * @param level The log level
   * @param message The log message
   * @param meta Optional metadata
   */
  private log(level: LogLevel, message: string, meta?: LogMetadata): void {
    const formattedMeta = this.formatMetadata(meta);
    const logMessage = this.formatLogMessage(level, message);
    
    // Console logging
    switch(level) {
      case LogLevel.DEBUG:
        console.debug(
          IS_DEVELOPMENT ? '%c%s' : '%s',
          IS_DEVELOPMENT ? 'color: gray;' : '',
          logMessage,
          formattedMeta || ''
        );
        break;
      case LogLevel.INFO:
        console.info(
          IS_DEVELOPMENT ? '%c%s' : '%s',
          IS_DEVELOPMENT ? 'color: dodgerblue;' : '',
          logMessage,
          formattedMeta || ''
        );
        break;
      case LogLevel.WARN:
        console.warn(
          IS_DEVELOPMENT ? '%c%s' : '%s',
          IS_DEVELOPMENT ? 'color: orange; font-weight: bold;' : '',
          logMessage,
          formattedMeta || ''
        );
        break;
      case LogLevel.ERROR:
        console.error(
          IS_DEVELOPMENT ? '%c%s' : '%s',
          IS_DEVELOPMENT ? 'color: red; font-weight: bold;' : '',
          logMessage,
          formattedMeta || ''
        );
        break;
      case LogLevel.FATAL:
        console.error(
          IS_DEVELOPMENT ? '%c%s' : '%s',
          IS_DEVELOPMENT ? 'color: darkred; font-weight: bold; background: #ffe0e0;' : '',
          logMessage,
          formattedMeta || ''
        );
        break;
    }
    
    // Remote logging for production
    if (this.settings.enableRemoteLogging && this.remoteLoggingEndpoint) {
      // Only log WARN, ERROR, and FATAL to remote in production
      if (level === LogLevel.WARN || level === LogLevel.ERROR || level === LogLevel.FATAL) {
        this.sendToRemoteLogging(level, message, formattedMeta);
      }
    }
  }
  
  /**
   * Send log to remote logging service
   * This is a placeholder for actual implementation
   */
  private sendToRemoteLogging(level: LogLevel, message: string, meta?: unknown): void {
    if (!this.remoteLoggingEndpoint) return;
    
    try {
      const logData = {
        level,
        message,
        timestamp: new Date().toISOString(),
        context: this.settings.context,
        userAgent: navigator.userAgent,
        url: window.location.href,
        ...(meta ? { meta } : {})
      };
      
      // Using navigator.sendBeacon for non-blocking log transmission
      // This works even if page is unloading (important for crash reports)
      if (navigator.sendBeacon && level === LogLevel.FATAL) {
        navigator.sendBeacon(
          this.remoteLoggingEndpoint, 
          JSON.stringify(logData)
        );
        return;
      }
      
      // Fallback to fetch API for normal logs
      fetch(this.remoteLoggingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData),
        // Use keepalive to ensure log is sent even if page is unloading
        keepalive: true,
        // Low priority for logs
        priority: 'low'
      }).catch(() => {
        // Silently fail - we don't want logging errors to affect app
      });
    } catch {
      // Silent fail for logging errors (to avoid recursive issues)
    }
  }
}

// Export a factory function to create logger instances
export function createLogger(context?: string, settings?: Partial<LogSettings>): LoggerService {
  const logger = new LoggerService(settings);
  if (context) {
    logger.setContext(context);
  }
  return logger;
}

// Export a default logger instance
export const logger = new LoggerService();

// Allow importing from components as:
// import { logger } from '../services/logger.service';
export default logger;

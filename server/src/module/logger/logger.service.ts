/**
 * Logger service for consistent application logging
 * This service provides standardized logging functionality
 * with support for different log levels and structured logging
 * Environment-aware: console logs for DEVELOPMENT, file logs for PRODUCTION
 * Tenant-specific log levels and paths
 */
import * as fs from 'fs';
import * as path from 'path';
import { getRequestContext } from '../../middlewares/correlation.middleware';

// Get environment setting (default to development)
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = 'veltrix-server';

// Environment-specific log level configuration
const ENV_LOG_LEVEL = process.env.LOG_LEVEL || (
  NODE_ENV === 'production' ? 'warn' :
  NODE_ENV === 'staging' ? 'info' :
  'debug' // development default
);

// Environment-specific log format
const LOG_FORMAT = process.env.LOG_FORMAT || (
  NODE_ENV === 'production' ? 'json' :
  NODE_ENV === 'staging' ? 'json' :
  'pretty' // development default
);

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

// Tenant log settings interface
export interface TenantLogSettings {
  logLevel: LogLevel;
  includeDebug: boolean;
  enableFileLogging: boolean;
  enableConsoleLogging: boolean;
}

// Default tenant log settings (environment-aware)
const DEFAULT_TENANT_LOG_SETTINGS: TenantLogSettings = {
  logLevel: stringToLogLevel(ENV_LOG_LEVEL),
  includeDebug: ENV_LOG_LEVEL === 'debug',
  enableFileLogging: NODE_ENV !== 'development',
  enableConsoleLogging: true
};

// Store tenant log settings
const tenantLogSettings = new Map<string, TenantLogSettings>();

/**
 * Get tenant log settings
 * @param tenantId The tenant ID
 * @returns The tenant's log settings
 */
export function getTenantLogSettings(tenantId: string): TenantLogSettings {
  return tenantLogSettings.get(tenantId) || {...DEFAULT_TENANT_LOG_SETTINGS};
}

/**
 * Update tenant log settings
 * @param tenantId The tenant ID
 * @param settings The updated settings
 */
export function updateTenantLogSettings(tenantId: string, settings: Partial<TenantLogSettings>): void {
  const currentSettings = getTenantLogSettings(tenantId);
  tenantLogSettings.set(tenantId, {
    ...currentSettings,
    ...settings
  });
}

// Metadata type for logging
export type LogMetadata = Record<string, unknown> | Error | unknown;

// Logger interface
export interface ILogger {
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  error(message: string, meta?: LogMetadata): void;
  fatal(message: string, meta?: LogMetadata): void;
}

/**
 * Advanced logger service implementation
 * Environment-aware: console logs for DEVELOPMENT, file logs for PRODUCTION
 * Tenant-specific log levels and paths
 */
class LoggerService implements ILogger {
  // Default customer ID for system logs
  private DEFAULT_CUSTOMER_ID = 'system';

  /**
   * Get the appropriate log level for a tenant
   * @param tenantId Tenant ID
   * @returns The appropriate log level
   */
  private getTenantLogLevel(tenantId?: string): LogLevel {
    if (!tenantId) return LogLevel.INFO;
    
    const settings = getTenantLogSettings(tenantId);
    return settings.logLevel;
  }

  /**
   * Check if a message should be logged based on its level and tenant settings
   * @param level Message log level
   * @param tenantId Tenant ID
   * @returns Whether the message should be logged
   */
  private shouldLog(level: LogLevel, tenantId?: string): boolean {
    if (!tenantId) return true;
    
    const settings = getTenantLogSettings(tenantId);
    const levelValue = Object.values(LogLevel).indexOf(level);
    const tenantLevelValue = Object.values(LogLevel).indexOf(settings.logLevel);
    
    // Log if message level is >= tenant level (e.g., ERROR >= INFO)
    return levelValue >= tenantLevelValue;
  }
  /**
   * Log a debug message
   * @param message The log message
   * @param meta Optional metadata
   */
  debug(message: string, meta?: LogMetadata): void {
    const tenantId = this.extractTenantId(meta);
    
    if (this.shouldLog(LogLevel.DEBUG, tenantId)) {
      this.log(LogLevel.DEBUG, message, meta, tenantId);
    }
  }
  
  /**
   * Log an info message
   * @param message The log message
   * @param meta Optional metadata
   */
  info(message: string, meta?: LogMetadata): void {
    const tenantId = this.extractTenantId(meta);
    
    if (this.shouldLog(LogLevel.INFO, tenantId)) {
      this.log(LogLevel.INFO, message, meta, tenantId);
    }
  }
  
  /**
   * Log a warning message
   * @param message The log message
   * @param meta Optional metadata
   */
  warn(message: string, meta?: LogMetadata): void {
    const tenantId = this.extractTenantId(meta);
    
    if (this.shouldLog(LogLevel.WARN, tenantId)) {
      this.log(LogLevel.WARN, message, meta, tenantId);
    }
  }
  
  /**
   * Log an error message
   * @param message The log message
   * @param meta Optional metadata
   */
  error(message: string, meta?: LogMetadata): void {
    const tenantId = this.extractTenantId(meta);
    
    if (this.shouldLog(LogLevel.ERROR, tenantId)) {
      this.log(LogLevel.ERROR, message, meta, tenantId);
    }
  }
  
  /**
   * Log a fatal error message
   * @param message The log message
   * @param meta Optional metadata
   */
  fatal(message: string, meta?: LogMetadata): void {
    const tenantId = this.extractTenantId(meta);
    
    // Always log fatal errors regardless of settings
    this.log(LogLevel.FATAL, message, meta, tenantId);
  }
  
  /**
   * Internal logging method
   * @param level The log level
   * @param message The log message
   * @param meta Optional metadata
   */
  /**
   * Extract tenant ID from metadata
   * @param meta Metadata object
   * @returns Tenant ID if found
   */
  private extractTenantId(meta?: LogMetadata): string | undefined {
    if (typeof meta === 'object' && meta !== null && !('tenantId' in meta)) {
      // If meta is an object but doesn't have tenantId, try to find it in nested meta
      if ('meta' in meta && typeof meta.meta === 'object' && meta.meta !== null && 'tenantId' in meta.meta) {
        return String(meta.meta.tenantId);
      }
      
      // If meta has customerId/tenantId, use that
      if ('customerId' in meta) return String(meta.customerId);
      if ('tenantId' in meta) return String(meta.tenantId);
    }
    
    return undefined;
  }

  private log(level: LogLevel, message: string, meta?: LogMetadata, tenantId?: string): void {
    // Get request context for correlation ID
    const context = getRequestContext();
    
    // Ensure we have a customer ID for file paths, default to system
    const customerId = tenantId || context?.customerId || this.DEFAULT_CUSTOMER_ID;
    
    // Construct log entry with timestamp
    const timestamp = new Date().toISOString();
    const logEntry = {
      service: SERVICE_NAME,
      customerId,
      timestamp,
      level,
      message,
      ...(context?.correlationId && { correlationId: context.correlationId }),
      ...(context?.userId && { userId: context.userId }),
      ...(meta ? { meta } : {})
    };
    
    // Format log string based on environment
    const logString = LOG_FORMAT === 'json'
      ? JSON.stringify(logEntry)
      : `[${timestamp}] [${level.toUpperCase()}] [${customerId}]${context?.correlationId ? ` [${context.correlationId}]` : ''} ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;
    
    // Get tenant settings or use defaults
    const settings = tenantId ? getTenantLogSettings(tenantId) : DEFAULT_TENANT_LOG_SETTINGS;
    
    // Console logging - based on tenant settings and environment
    if ((NODE_ENV.toUpperCase() === 'DEVELOPMENT') || settings.enableConsoleLogging) {
      // Log to console
      switch(level) {
        case LogLevel.DEBUG:
          console.debug(logString);
          break;
        case LogLevel.INFO:
          console.info(logString);
          break;
        case LogLevel.WARN:
          console.warn(logString);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(logString);
          break;
      }
    }
    
    // File logging - based on tenant settings and environment
    if ((NODE_ENV.toUpperCase() === 'PRODUCTION') && settings.enableFileLogging) {
      // Log to file in production
      try {
        // Create tenant-specific log directory path
        const logDir = `/var/log/${SERVICE_NAME}/${customerId}`;
        
        // Create log directory if it doesn't exist
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Create a daily log file
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const logFile = path.join(logDir, `${date}.log`);
        
        // Append log to file
        fs.appendFileSync(logFile, logString + '\n');
      } catch (err) {
        // If file logging fails, fallback to console
        console.error('Failed to write to log file:', err);
        console.error(logString);
      }
    }
    
    // For errors, you might want to track them in an error monitoring service
    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      // Call error monitoring service
      // errorMonitoringService.captureError(message, meta);
    }
  }
}

// Export a singleton instance
export const loggerService = new LoggerService();

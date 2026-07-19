/**
 * Logger service for client-side logging
 * This service provides standardized logging functionality
 * with support for different log levels and structured logging
 * Tenant-specific log settings and path management
 */

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
  enableRemoteLogging: boolean;
  includeMetadata: boolean;
}

// Default tenant log settings
const DEFAULT_TENANT_LOG_SETTINGS: TenantLogSettings = {
  logLevel: LogLevel.INFO,
  includeDebug: false,
  enableRemoteLogging: true,
  includeMetadata: true
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
  
  // Store settings in localStorage for persistence
  try {
    localStorage.setItem(`log_settings_${tenantId}`, JSON.stringify(tenantLogSettings.get(tenantId)));
  } catch (e) {
    console.error('Failed to save log settings to localStorage', e);
  }
}

/**
 * Initialize tenant log settings from localStorage
 * @param tenantId The tenant ID
 */
export function initTenantLogSettings(tenantId: string): void {
  try {
    const storedSettings = localStorage.getItem(`log_settings_${tenantId}`);
    if (storedSettings) {
      const parsedSettings = JSON.parse(storedSettings);
      updateTenantLogSettings(tenantId, parsedSettings);
    }
  } catch (e) {
    console.error('Failed to load log settings from localStorage', e);
  }
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
 * Client-side logger service implementation
 * Environment-aware with tenant-specific log settings
 */
class LoggerService implements ILogger {
  // Get environment from import.meta.env (Vite's environment variable system)
  private readonly isDevelopment = import.meta.env.MODE === 'development';
  private readonly appName = 'veltrix-client';
  private readonly serviceName = 'veltrix-client';
  
  // Default tenant ID for system logs
  private DEFAULT_TENANT_ID = 'system';
  
  // Current user's tenant ID
  private _currentTenantId: string | null = null;
  
  /**
   * Set the current tenant ID
   * @param tenantId The tenant ID
   */
  setCurrentTenantId(tenantId: string): void {
    this._currentTenantId = tenantId;
    // Initialize settings for this tenant
    initTenantLogSettings(tenantId);
  }
  
  /**
   * Get the current tenant ID
   * @returns The current tenant ID
   */
  getCurrentTenantId(): string {
    return this._currentTenantId || this.DEFAULT_TENANT_ID;
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
   * Log a debug message - only in development
   * @param message The log message
   * @param meta Optional metadata
   */
  debug(message: string, meta?: LogMetadata): void {
    const tenantId = this.extractTenantId(meta) || this.getCurrentTenantId();
    
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
    const tenantId = this.extractTenantId(meta) || this.getCurrentTenantId();
    
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
    const tenantId = this.extractTenantId(meta) || this.getCurrentTenantId();
    
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
    const tenantId = this.extractTenantId(meta) || this.getCurrentTenantId();
    
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
    const tenantId = this.extractTenantId(meta) || this.getCurrentTenantId();
    
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
    if (typeof meta === 'object' && meta !== null) {
      // If meta has customerId/tenantId, use that
      if ('customerId' in meta) return String(meta.customerId);
      if ('tenantId' in meta) return String(meta.tenantId);
      if ('customerid' in meta) return String(meta.customerid);
      
      // If meta is an object but doesn't have tenantId, try to find it in nested meta
      if ('meta' in meta && typeof meta.meta === 'object' && meta.meta !== null) {
        if ('tenantId' in meta.meta) return String(meta.meta.tenantId);
        if ('customerId' in meta.meta) return String(meta.meta.customerId);
      }
    }
    
    return undefined;
  }

  private log(level: LogLevel, message: string, meta?: LogMetadata, tenantId?: string): void {
    // Ensure we have a tenant ID, default to current tenant or system
    const customerId = tenantId || this.getCurrentTenantId();
    
    // Get tenant settings
    const settings = getTenantLogSettings(customerId);
    
    // Construct log entry with timestamp
    const timestamp = new Date().toISOString();
    const logEntry = {
      service: this.serviceName,
      app: this.appName,
      tenantId: customerId,
      timestamp,
      level,
      message,
      ...(meta && settings.includeMetadata ? { meta } : {})
    };
    
    // Local development logging
    if (this.isDevelopment) {
      // In development, use full console objects with all metadata
      switch(level) {
        case LogLevel.DEBUG:
          if (settings.includeDebug) {
            console.debug(message, meta ? logEntry : '');
          }
          break;
        case LogLevel.INFO:
          console.info(message, meta ? logEntry : '');
          break;
        case LogLevel.WARN:
          console.warn(message, meta ? logEntry : '');
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(message, meta ? logEntry : '');
          break;
      }
    } else {
      // Production logging
      // Send to console with less metadata
      switch(level) {
        case LogLevel.INFO:
          // In production, INFO logs might be filtered
          console.info(message);
          break;
        case LogLevel.WARN:
          console.warn(message);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(message);
          break;
      }
    }
    
    // Remote logging - send logs to server for storage
    if (settings.enableRemoteLogging && !this.isDevelopment) {
      try {
        // Only send logs of level WARN or higher to reduce traffic
        if (level === LogLevel.WARN || level === LogLevel.ERROR || level === LogLevel.FATAL) {
          this.sendLogToServer(logEntry, customerId);
        }
        
        // For error monitoring services
        if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
          // Example of how you might integrate with error monitoring:
          // if (window.errorMonitoringService) {
          //   window.errorMonitoringService.captureException(
          //     meta instanceof Error ? meta : new Error(message),
          //     { extra: { ...logEntry } }
          //   );
          // }
        }
      } catch (err) {
        // If remote logging fails, log locally
        console.error('Failed to send log to server:', err);
      }
    }
  }
  
  /**
   * Send log to server for storage
   * @param logEntry The log entry
   * @param tenantId The tenant ID
   */
  // Stub: parameters intentionally unused until remote log shipping lands.
  private sendLogToServer(_logEntry: Record<string, unknown>, _tenantId: string): void {
    // This would normally make a fetch request to the server
    // For now, just simulate the request
    // In a real implementation, you would use fetch or axios to send to a backend endpoint
    
    // Example implementation (commented out):
    /*
    fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId
      },
      body: JSON.stringify(logEntry)
    }).catch(err => {
      console.error('Failed to send log to server:', err);
    });
    */
  }
}

// Export a singleton instance
export const logger = new LoggerService();

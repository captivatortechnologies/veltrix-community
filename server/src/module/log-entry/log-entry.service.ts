import prisma from '../../db';
import { 
  LogEntryCreateRequestType, 
  LogEntryQueryParamsType,
  LogEntryResponseType,
  LogEntryLevelType
} from './log-entry.schema';
import { loggerService } from '../../module/logger/logger.service';

export const logEntryService = {
  // Get all log entries with pagination and filtering
  async getAllLogEntries(customerId: string, queryParams: LogEntryQueryParamsType): Promise<{
    logEntries: LogEntryResponseType[];
    totalCount: number;
    pageNum: number;
    limitNum: number;
  }> {
    loggerService.info(`Fetching log entries for customer ID ${customerId} with filters: ${JSON.stringify(queryParams)}`);
    
    const { page = '1', limit = '20', level, source, fromDate, toDate } = queryParams;
    
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter conditions
    const where: any = { customerId };
    
    if (level) {
      where.level = level;
    }
    
    if (source) {
      where.source = source;
    }
    
    if (fromDate || toDate) {
      where.timestamp = {};
      if (fromDate) {
        where.timestamp.gte = new Date(fromDate);
      }
      if (toDate) {
        where.timestamp.lte = new Date(toDate);
      }
    }
    
    // Get total count for pagination
    const totalCount = await prisma.logEntry.count({ where });
    
    // Get log entries
    const logEntries = await prisma.logEntry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: limitNum
    });
    
    // Cast the types to match our schema
    const typedLogEntries = logEntries.map(entry => ({
      ...entry,
      level: entry.level as LogEntryLevelType,
      createdAt: entry.timestamp, // Use timestamp as createdAt if not available
      updatedAt: entry.timestamp  // Use timestamp as updatedAt if not available
    }));
    
    return {
      logEntries: typedLogEntries,
      totalCount,
      pageNum,
      limitNum
    };
  },
  
  // Get log entry by ID
  async getLogEntryById(id: string, customerId: string): Promise<LogEntryResponseType | null> {
    loggerService.info(`Fetching log entry with ID ${id} for customer ID ${customerId}`);
    
    const logEntry = await prisma.logEntry.findFirst({
      where: {
        id: id,
        customerId
      }
    });
    
    if (!logEntry) {
      return null;
    }
    
    // Cast the types to match our schema
    return {
      ...logEntry,
      level: logEntry.level as LogEntryLevelType,
      createdAt: logEntry.timestamp, // Use timestamp as createdAt if not available
      updatedAt: logEntry.timestamp  // Use timestamp as updatedAt if not available
    };
  },
  
  // Create a new log entry
  async createLogEntry(data: LogEntryCreateRequestType, customerId: string): Promise<LogEntryResponseType> {
    loggerService.info(`Creating log entry for customer ID ${customerId}`);
    
    const logEntry = await prisma.logEntry.create({
      data: {
        timestamp: new Date(),
        level: data.level,
        source: data.source,
        message: data.message,
        details: data.details,
        customerId
      }
    });
    
    // Cast the types to match our schema
    return {
      ...logEntry,
      level: logEntry.level as LogEntryLevelType,
      createdAt: logEntry.timestamp, // Use timestamp as createdAt if not available
      updatedAt: logEntry.timestamp  // Use timestamp as updatedAt if not available
    };
  },
  
  // Delete a log entry
  async deleteLogEntry(id: string, customerId: string): Promise<boolean> {
    loggerService.info(`Deleting log entry with ID ${id} for customer ID ${customerId}`);
    
    // Check if the log entry exists and belongs to the customer
    const logEntry = await prisma.logEntry.findFirst({
      where: {
        id: id,
        customerId
      }
    });
    
    if (!logEntry) {
      throw new Error('Log entry not found');
    }
    
    // Delete the log entry
    await prisma.logEntry.delete({
      where: { id: id }
    });
    
    return true;
  },
  
  // Get log sources for a customer (for filtering)
  async getLogSources(customerId: string): Promise<string[]> {
    loggerService.info(`Fetching log sources for customer ID ${customerId}`);
    
    const sources = await prisma.logEntry.findMany({
      where: { customerId },
      select: { source: true },
      distinct: ['source'],
      orderBy: { source: 'asc' }
    });
    
    return sources.map(s => s.source);
  },
  
  // Get log levels for a customer (for filtering)
  async getLogLevels(customerId: string): Promise<LogEntryLevelType[]> {
    loggerService.info(`Fetching log levels for customer ID ${customerId}`);
    
    const levels = await prisma.logEntry.findMany({
      where: { customerId },
      select: { level: true },
      distinct: ['level'],
      orderBy: { level: 'asc' }
    });
    
    return levels.map(l => l.level as LogEntryLevelType);
  }
};

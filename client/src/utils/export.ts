/**
 * Export utilities for various formats
 */
import { logger } from './logger';

/**
 * Export format enum
 */
export enum ExportFormat {
  PDF = 'pdf',
  PNG = 'png',
  CSV = 'csv',
  EXCEL = 'excel'
}

/**
 * Export options interface
 */
export interface ExportOptions {
  /**
   * Filename without extension (will be automatically added based on format)
   */
  filename: string;
  
  /**
   * Title for the export (used in headers)
   */
  title?: string;
  
  /**
   * Whether to include a timestamp in the filename
   */
  includeTimestamp?: boolean;
  
  /**
   * Sheet name for Excel exports
   */
  sheetName?: string;
  
  /**
   * Page size for PDF exports (default: 'a4')
   */
  pdfPageSize?: string;
  
  /**
   * Page orientation for PDF exports (default: 'portrait')
   */
  pdfOrientation?: 'portrait' | 'landscape';
}

/**
 * Generate a filename with timestamp (if requested)
 * @param baseFilename Base filename without extension
 * @param format Export format
 * @param includeTimestamp Whether to add a timestamp
 * @returns Complete filename with extension
 */
const generateFilename = (
  baseFilename: string,
  format: ExportFormat,
  includeTimestamp?: boolean
): string => {
  let filename = baseFilename.replace(/[\\/:*?"<>|]/g, '-');
  
  if (includeTimestamp) {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    filename = `${filename}_${timestamp}`;
  }
  
  // Add appropriate extension
  switch (format) {
    case ExportFormat.PDF:
      return `${filename}.pdf`;
    case ExportFormat.PNG:
      return `${filename}.png`;
    case ExportFormat.CSV:
      return `${filename}.csv`;
    case ExportFormat.EXCEL:
      return `${filename}.xlsx`;
  }
};

/**
 * Convert array of objects to CSV string
 * @param data Array of objects to convert
 * @returns CSV string
 */
const convertToCSV = (data: Record<string, unknown>[]): string => {
  if (data.length === 0) return '';
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV rows
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Handle strings with commas, quotes, etc.
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value !== undefined && value !== null ? value : '';
      }).join(',')
    )
  ];
  
  return csvRows.join('\n');
};

/**
 * Export data to CSV
 * @param data Array of objects to export
 * @param options Export options
 */
const exportToCSV = (data: Record<string, unknown>[], options: ExportOptions): void => {
  try {
    // Convert data to CSV
    const csvContent = convertToCSV(data);
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = generateFilename(options.filename, ExportFormat.CSV, options.includeTimestamp);
    
    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logger.info(`CSV export successful: ${filename}`);
  } catch (_error) {
    logger.error(`CSV export failed: ${_error instanceof Error ? _error.message : String(_error)}`);
    throw _error;
  }
};

/**
 * Export data to Excel (XLSX)
 * This is a placeholder - in a real implementation, you would use a library like xlsx or exceljs
 * @param data Array of objects to export
 * @param options Export options
 */
const exportToExcel = async (data: Record<string, unknown>[], options: ExportOptions): Promise<void> => {
  try {
    // Lazy-load xlsx so it stays out of the main bundle (only pulled on export).
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Data');

    const filename = generateFilename(options.filename, ExportFormat.EXCEL, options.includeTimestamp);
    XLSX.writeFile(workbook, filename);

    logger.info(`Excel export successful: ${filename}`);
  } catch (error) {
    logger.error(`Excel export failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

/**
 * Export HTML element to PDF
 * This is a placeholder - in a real implementation, you would use a library like html2pdf or jspdf
 * @param target HTML element or selector to export
 * @param options Export options
 */
const exportToPDF = async (target: HTMLElement | string, options: ExportOptions): Promise<void> => {
  try {
    const element = typeof target === 'string'
      ? (document.querySelector(target) as HTMLElement)
      : target;

    if (!element) {
      throw new Error(`Element not found: ${target}`);
    }

    // Rasterize the report to a canvas, then paginate it into a PDF.
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');

    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: options.pdfOrientation || 'portrait',
      unit: 'pt',
      format: (options.pdfPageSize as string) || 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const filename = generateFilename(options.filename, ExportFormat.PDF, options.includeTimestamp);
    pdf.save(filename);

    logger.info(`PDF export successful: ${filename}`);
  } catch (error) {
    logger.error(`PDF export failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

/**
 * Export HTML element to PNG
 * This is a placeholder - in a real implementation, you would use a library like html2canvas
 * @param target HTML element or selector to export
 * @param _options Export options
 */
const exportToPNG = async (target: HTMLElement | string, options: ExportOptions): Promise<void> => {
  try {
    const element = typeof target === 'string'
      ? (document.querySelector(target) as HTMLElement)
      : target;

    if (!element) {
      throw new Error(`Element not found: ${target}`);
    }

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const filename = generateFilename(options.filename, ExportFormat.PNG, options.includeTimestamp);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logger.info(`PNG export successful: ${filename}`);
  } catch (error) {
    logger.error(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

/**
 * Export data based on format
 * @param data Data to export (array for CSV/Excel, HTML element for PDF/PNG)
 * @param format Export format
 * @param options Export options
 */
export const exportData = async (
  data: Record<string, unknown>[] | HTMLElement | string,
  format: ExportFormat,
  options: ExportOptions
): Promise<void> => {
  try {
    switch (format) {
      case ExportFormat.CSV:
        if (!Array.isArray(data)) {
          throw new Error('CSV export requires an array of objects');
        }
        exportToCSV(data, options);
        break;
        
      case ExportFormat.EXCEL:
        if (!Array.isArray(data)) {
          throw new Error('Excel export requires an array of objects');
        }
        await exportToExcel(data, options);
        break;
        
      case ExportFormat.PDF:
        if (Array.isArray(data)) {
          throw new Error('PDF export requires an HTML element or selector');
        }
        await exportToPDF(data, options);
        break;
        
      case ExportFormat.PNG:
        if (Array.isArray(data)) {
          throw new Error('PNG export requires an HTML element or selector');
        }
        await exportToPNG(data, options);
        break;
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  } catch (error) {
    logger.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

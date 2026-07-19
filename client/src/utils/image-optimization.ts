/**
 * Image Optimization Utilities
 * 
 * Utilities for optimizing images, generating srcsets, and handling responsive images.
 */

/**
 * Image format support detection
 */
export const IMAGE_FORMATS = {
  WEBP: 'image/webp',
  AVIF: 'image/avif',
  JPEG: 'image/jpeg',
  PNG: 'image/png'
} as const;

/**
 * Check if browser supports WebP format
 */
export function supportsWebP(): Promise<boolean> {
  return new Promise((resolve) => {
    const webP = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    img.src = webP;
  });
}

/**
 * Check if browser supports AVIF format
 */
export function supportsAVIF(): Promise<boolean> {
  return new Promise((resolve) => {
    const avif = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
    const img = new Image();
    img.onload = () => resolve(img.width === 2);
    img.onerror = () => resolve(false);
    img.src = avif;
  });
}

/**
 * Get best supported image format
 */
export async function getBestImageFormat(): Promise<string> {
  const avifSupported = await supportsAVIF();
  if (avifSupported) return IMAGE_FORMATS.AVIF;
  
  const webpSupported = await supportsWebP();
  if (webpSupported) return IMAGE_FORMATS.WEBP;
  
  return IMAGE_FORMATS.JPEG;
}

/**
 * Generate srcset for responsive images
 */
export function generateSrcSet(
  baseUrl: string,
  widths: number[] = [320, 640, 768, 1024, 1280, 1536]
): string {
  return widths
    .map(width => {
      const url = baseUrl.includes('?') 
        ? `${baseUrl}&w=${width}`
        : `${baseUrl}?w=${width}`;
      return `${url} ${width}w`;
    })
    .join(', ');
}

/**
 * Generate sizes attribute for responsive images
 */
export function generateSizes(
  breakpoints: Record<string, string> = {
    '(max-width: 640px)': '100vw',
    '(max-width: 1024px)': '50vw',
    '(max-width: 1536px)': '33vw'
  },
  defaultSize: string = '25vw'
): string {
  const sizeStrings = Object.entries(breakpoints)
    .map(([query, size]) => `${query} ${size}`);
  
  sizeStrings.push(defaultSize);
  
  return sizeStrings.join(', ');
}

/**
 * Calculate optimal image dimensions
 */
export function calculateOptimalDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight?: number
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;
  
  if (maxHeight) {
    const widthFromHeight = maxHeight * aspectRatio;
    const heightFromWidth = maxWidth / aspectRatio;
    
    if (widthFromHeight <= maxWidth) {
      return {
        width: Math.round(widthFromHeight),
        height: maxHeight
      };
    } else {
      return {
        width: maxWidth,
        height: Math.round(heightFromWidth)
      };
    }
  }
  
  return {
    width: Math.min(originalWidth, maxWidth),
    height: Math.round(Math.min(originalWidth, maxWidth) / aspectRatio)
  };
}

/**
 * Get image URL with optimization parameters
 */
export function getOptimizedImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  } = {}
): string {
  const { width, height, quality = 85, format } = options;
  
  const params = new URLSearchParams();
  
  if (width) params.set('w', width.toString());
  if (height) params.set('h', height.toString());
  if (quality) params.set('q', quality.toString());
  if (format) params.set('format', format);
  
  const queryString = params.toString();
  
  if (!queryString) return url;
  
  return url.includes('?')
    ? `${url}&${queryString}`
    : `${url}?${queryString}`;
}

/**
 * Create blur placeholder data URL
 */
export function createBlurPlaceholder(
  width: number = 10,
  height: number = 10,
  color: string = '#e5e7eb'
): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <filter id="blur">
        <feGaussianBlur stdDeviation="2"/>
      </filter>
      <rect fill="${color}" width="${width}" height="${height}" filter="url(#blur)"/>
    </svg>
  `.trim();
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Lazy load images in viewport
 */
export function observeImages(
  selector: string = 'img[data-src]',
  options: IntersectionObserverInit = {}
): IntersectionObserver {
  const defaultOptions: IntersectionObserverInit = {
    rootMargin: '50px',
    threshold: 0.01,
    ...options
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const src = img.dataset.src;
        
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      }
    });
  }, defaultOptions);
  
  // Observe all matching images
  document.querySelectorAll(selector).forEach(img => {
    observer.observe(img);
  });
  
  return observer;
}

/**
 * Estimate image file size
 */
export function estimateImageSize(
  width: number,
  height: number,
  format: string = IMAGE_FORMATS.JPEG,
  quality: number = 85
): number {
  const pixels = width * height;
  
  // Rough estimates in bytes per pixel
  const bytesPerPixel: Record<string, number> = {
    [IMAGE_FORMATS.JPEG]: 0.5 * (quality / 100),
    [IMAGE_FORMATS.PNG]: 3,
    [IMAGE_FORMATS.WEBP]: 0.3 * (quality / 100),
    [IMAGE_FORMATS.AVIF]: 0.2 * (quality / 100)
  };
  
  return Math.round(pixels * (bytesPerPixel[format] || 1));
}

/**
 * Get image dimensions from file
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Compress image using canvas
 */
export function compressImage(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      const { width, height } = calculateOptimalDimensions(
        img.width,
        img.height,
        maxWidth,
        maxHeight
      );
      
      canvas.width = width;
      canvas.height = height;
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

export default {
  supportsWebP,
  supportsAVIF,
  getBestImageFormat,
  generateSrcSet,
  generateSizes,
  calculateOptimalDimensions,
  getOptimizedImageUrl,
  createBlurPlaceholder,
  observeImages,
  estimateImageSize,
  getImageDimensions,
  compressImage
};

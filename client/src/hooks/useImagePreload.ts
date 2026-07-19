/**
 * useImagePreload Hook
 * 
 * Preloads images for better perceived performance.
 * Returns loading state and error information.
 */

import { useState, useEffect } from 'react';

interface ImagePreloadOptions {
  /** Array of image URLs to preload */
  images: string[];
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

interface ImagePreloadResult {
  /** Whether all images have loaded */
  loaded: boolean;
  /** Loading progress (0-1) */
  progress: number;
  /** Number of images loaded */
  loadedCount: number;
  /** Total number of images */
  totalCount: number;
  /** Array of URLs that failed to load */
  errors: string[];
}

/**
 * Preload images and track loading state
 */
export function useImagePreload({
  images,
  timeout = 10000
}: ImagePreloadOptions): ImagePreloadResult {
  const [loadedCount, setLoadedCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const totalCount = images.length;

  useEffect(() => {
    if (!images.length) {
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        // Mark remaining images as errors after timeout
        const remaining = images.filter((_, index) => index >= loadedCount);
        setErrors(prev => [...prev, ...remaining]);
      }
    }, timeout);

    const loadImage = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
          if (!cancelled) {
            setLoadedCount(prev => prev + 1);
          }
          resolve();
        };
        
        img.onerror = () => {
          if (!cancelled) {
            setErrors(prev => [...prev, src]);
            setLoadedCount(prev => prev + 1); // Count errors as "loaded" for progress
          }
          reject(new Error(`Failed to load image: ${src}`));
        };
        
        img.src = src;
      });
    };

    // Load all images in parallel
    Promise.allSettled(images.map(loadImage))
      .then(() => {
        if (!cancelled) {
          clearTimeout(timeoutId);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [images, timeout, loadedCount]);

  return {
    loaded: loadedCount === totalCount,
    progress: totalCount > 0 ? loadedCount / totalCount : 0,
    loadedCount,
    totalCount,
    errors
  };
}

/**
 * Preload a single image
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Preload multiple images
 */
export function preloadImages(images: string[]): Promise<void[]> {
  return Promise.all(images.map(preloadImage));
}

export default useImagePreload;

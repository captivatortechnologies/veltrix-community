/**
 * LazyImage Component
 * 
 * Optimized image component with lazy loading, placeholder, and error handling.
 * Uses Intersection Observer API for visibility detection.
 */

import React, { useState, useRef, useEffect, ImgHTMLAttributes } from 'react';

// onLoad/onError are omitted from the native img attributes because this
// component exposes simpler callback signatures for them below.
interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'placeholder' | 'onLoad' | 'onError'> {
  /** Image source URL */
  src: string;
  /** Alternative text for accessibility */
  alt: string;
  /** Placeholder image shown while loading */
  placeholder?: string;
  /** CSS class for the container */
  className?: string;
  /** CSS class for the image element */
  imgClassName?: string;
  /** Callback when image loads successfully */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: (error: Event) => void;
  /** Root margin for intersection observer (default: '50px') */
  rootMargin?: string;
  /** Threshold for intersection observer (default: 0.01) */
  threshold?: number;
  /** Blur effect during loading (default: true) */
  blur?: boolean;
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23e5e7eb" width="400" height="300"/%3E%3C/svg%3E',
  className = '',
  imgClassName = '',
  onLoad,
  onError,
  rootMargin = '50px',
  threshold = 0.01,
  blur = true,
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState<string>(placeholder);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: load image immediately
      setImageSrc(src);
      return;
    }

    // Create intersection observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Image is visible, start loading
            setImageSrc(src);
            
            // Stop observing once we've triggered the load
            if (observerRef.current && imgRef.current) {
              observerRef.current.unobserve(imgRef.current);
            }
          }
        });
      },
      {
        rootMargin,
        threshold
      }
    );

    // Start observing
    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }

    // Cleanup
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [src, rootMargin, threshold]);

  const handleLoad = () => {
    setImageLoaded(true);
    setImageError(false);
    onLoad?.();
  };

  const handleError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setImageError(true);
    setImageLoaded(false);
    onError?.(event.nativeEvent);
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`
          transition-all duration-300 ease-in-out
          ${blur && !imageLoaded ? 'blur-sm scale-105' : 'blur-0 scale-100'}
          ${imageLoaded ? 'opacity-100' : 'opacity-70'}
          ${imageError ? 'opacity-50' : ''}
          ${imgClassName}
        `}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        decoding="async"
        {...props}
      />
      
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Failed to load image
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

LazyImage.displayName = 'LazyImage';

export default LazyImage;

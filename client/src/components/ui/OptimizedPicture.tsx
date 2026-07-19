/**
 * OptimizedPicture Component
 * 
 * Responsive picture component with modern format support (AVIF, WebP).
 * Automatically generates multiple sources and fallbacks.
 */

import React, { ImgHTMLAttributes } from 'react';
import { generateSrcSet, generateSizes } from '@/utils/image-optimization';

interface OptimizedPictureProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> {
  /** Base image URL */
  src: string;
  /** Alternative text for accessibility */
  alt: string;
  /** Array of widths for srcset generation */
  widths?: number[];
  /** Sizes attribute or breakpoint config */
  sizes?: string | Record<string, string>;
  /** Default size for sizes attribute */
  defaultSize?: string;
  /** Enable AVIF format (default: true) */
  avif?: boolean;
  /** Enable WebP format (default: true) */
  webp?: boolean;
  /** Image quality (1-100, default: 85) */
  quality?: number;
  /** CSS class for container */
  className?: string;
  /** CSS class for img element */
  imgClassName?: string;
  /** Lazy loading (default: true) */
  lazy?: boolean;
}

const OptimizedPicture: React.FC<OptimizedPictureProps> = ({
  src,
  alt,
  widths = [320, 640, 768, 1024, 1280, 1536],
  sizes,
  defaultSize = '100vw',
  avif = true,
  webp = true,
  quality = 85,
  className = '',
  imgClassName = '',
  lazy = true,
  ...props
}) => {
  // Generate sizes attribute
  const sizesAttr = typeof sizes === 'string' 
    ? sizes 
    : sizes 
      ? generateSizes(sizes, defaultSize)
      : defaultSize;

  // Generate base URL with quality parameter
  const getUrlWithFormat = (format?: string) => {
    let url = src;
    const separator = url.includes('?') ? '&' : '?';
    
    if (quality && quality !== 85) {
      url += `${separator}q=${quality}`;
    }
    
    if (format) {
      const formatSeparator = url.includes('?') ? '&' : '?';
      url += `${formatSeparator}format=${format}`;
    }
    
    return url;
  };

  return (
    <picture className={className}>
      {/* AVIF source - best compression */}
      {avif && (
        <source
          type="image/avif"
          srcSet={generateSrcSet(getUrlWithFormat('avif'), widths)}
          sizes={sizesAttr}
        />
      )}
      
      {/* WebP source - good compression */}
      {webp && (
        <source
          type="image/webp"
          srcSet={generateSrcSet(getUrlWithFormat('webp'), widths)}
          sizes={sizesAttr}
        />
      )}
      
      {/* JPEG fallback - universal support */}
      <img
        src={src}
        alt={alt}
        srcSet={generateSrcSet(getUrlWithFormat('jpg'), widths)}
        sizes={sizesAttr}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        className={imgClassName}
        {...props}
      />
    </picture>
  );
};

OptimizedPicture.displayName = 'OptimizedPicture';

export default OptimizedPicture;

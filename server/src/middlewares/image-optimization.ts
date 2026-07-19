/**
 * ImageOptimization Middleware for Backend
 *
 * Fastify middleware for serving optimized images.
 * Supports format conversion, resizing, and quality adjustment.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

interface ImageOptimizationOptions {
  /** Maximum image width */
  maxWidth?: number;
  /** Maximum image height */
  maxHeight?: number;
  /** Image quality (1-100) */
  quality?: number;
  /** Output format */
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  /** Cache directory for optimized images */
  cacheDir?: string;
  /** Enable caching (default: true) */
  cache?: boolean;
  /** Cache TTL in seconds (default: 86400 - 24 hours) */
  cacheTTL?: number;
}

/**
 * Parse query parameters for image optimization
 */
function parseImageParams(query: Record<string, unknown>): ImageOptimizationOptions {
  return {
    maxWidth: query.w ? parseInt(query.w as string, 10) : undefined,
    maxHeight: query.h ? parseInt(query.h as string, 10) : undefined,
    quality: query.q ? parseInt(query.q as string, 10) : 85,
    format: (query.format as 'jpeg' | 'png' | 'webp' | 'avif') || undefined
  };
}

/**
 * Generate cache key for optimized image
 */
function generateCacheKey(
  filePath: string,
  options: ImageOptimizationOptions
): string {
  const key = `${filePath}-${options.maxWidth || 'auto'}-${options.maxHeight || 'auto'}-${options.quality || 85}-${options.format || 'original'}`;
  return createHash('md5').update(key).digest('hex');
}

/**
 * Get cached image path
 */
function getCachedImagePath(
  cacheDir: string,
  cacheKey: string,
  format?: string
): string {
  const ext = format || 'jpg';
  return path.join(cacheDir, `${cacheKey}.${ext}`);
}

/**
 * Check if cached image exists and is fresh
 */
async function isCacheFresh(
  cachedPath: string,
  originalPath: string,
  ttl: number
): Promise<boolean> {
  try {
    const [cachedStats, originalStats] = await Promise.all([
      fs.stat(cachedPath),
      fs.stat(originalPath)
    ]);

    // Check if cache is newer than original
    if (cachedStats.mtime < originalStats.mtime) {
      return false;
    }

    // Check TTL
    const age = Date.now() - cachedStats.mtime.getTime();
    return age < ttl * 1000;
  } catch {
    return false;
  }
}

/**
 * Optimize image using Sharp
 */
async function optimizeImage(
  inputPath: string,
  outputPath: string,
  options: ImageOptimizationOptions
): Promise<void> {
  let pipeline = sharp(inputPath);

  // Resize if dimensions specified
  if (options.maxWidth || options.maxHeight) {
    pipeline = pipeline.resize(options.maxWidth, options.maxHeight, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  // Convert format and set quality
  const quality = options.quality || 85;

  switch (options.format) {
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality });
      break;
    case 'png':
      pipeline = pipeline.png({
        quality,
        compressionLevel: 9
      });
      break;
    case 'jpeg':
    default:
      pipeline = pipeline.jpeg({
        quality,
        progressive: true,
        mozjpeg: true
      });
      break;
  }

  // Save optimized image
  await pipeline.toFile(outputPath);
}

/**
 * Fastify middleware for image optimization
 */
export async function imageOptimizationMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const options = parseImageParams(request.query as Record<string, unknown>);
    const { url } = request;

    // Extract file path from URL (remove query string)
    const filePath = url.split('?')[0];

    // Determine absolute file path
    const publicDir = path.join(process.cwd(), 'public');
    const absolutePath = path.join(publicDir, filePath);

    // Guard against path traversal — the resolved path must stay inside
    // publicDir (a request like `/../../etc/passwd` must not escape it).
    if (!absolutePath.startsWith(publicDir + path.sep) && absolutePath !== publicDir) {
      reply.code(400).send({ error: 'Invalid image path' });
      return;
    }

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch {
      reply.code(404).send({ error: 'Image not found' });
      return;
    }

    // If no optimization requested, serve original
    if (!options.maxWidth && !options.maxHeight && !options.format) {
      const file = await fs.readFile(absolutePath);
      const ext = path.extname(absolutePath).slice(1);
      reply.type(`image/${ext}`).send(file);
      return;
    }

    // Check cache
    const cacheDir = path.join(process.cwd(), '.image-cache');
    const cacheKey = generateCacheKey(absolutePath, options);
    const cachedPath = getCachedImagePath(cacheDir, cacheKey, options.format);

    // Serve from cache if fresh
    const cacheTTL = 86400; // 24 hours
    if (await isCacheFresh(cachedPath, absolutePath, cacheTTL)) {
      const file = await fs.readFile(cachedPath);
      const format = options.format || 'jpeg';
      reply
        .type(`image/${format}`)
        .header('Cache-Control', `public, max-age=${cacheTTL}`)
        .send(file);
      return;
    }

    // Create cache directory if needed
    await fs.mkdir(cacheDir, { recursive: true });

    // Optimize and cache
    await optimizeImage(absolutePath, cachedPath, options);

    // Serve optimized image
    const file = await fs.readFile(cachedPath);
    const format = options.format || 'jpeg';
    reply
      .type(`image/${format}`)
      .header('Cache-Control', `public, max-age=${cacheTTL}`)
      .send(file);
  } catch (error) {
    console.error('Image optimization error:', error);
    reply.code(500).send({ error: 'Failed to optimize image' });
  }
}

/**
 * Fastify plugin for image optimization
 */
export function imageOptimizationPlugin(
  fastify: any,
  options: { routes?: string[] } = {}
): void {
  const routes = options.routes || ['/images/*', '/uploads/*', '/assets/*'];

  routes.forEach(route => {
    fastify.get(route, imageOptimizationMiddleware);
  });
}

export default imageOptimizationMiddleware;

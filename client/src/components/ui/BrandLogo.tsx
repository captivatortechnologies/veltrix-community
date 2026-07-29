import { Shield } from 'lucide-react'
import { useBrand } from '../../brand'

/**
 * Path of the bundled default logo. A deployment that points
 * VELTRIX_BRAND_LOGO_URL at its own image replaces the mark entirely; the
 * default value is treated as "no custom logo" so we render the accent mark.
 */
const DEFAULT_LOGO_URL = '/assets/logo.svg'

interface BrandLogoProps {
  /** Extra classes on the wrapper (margins, alignment). */
  className?: string
}

/**
 * Standalone brand lockup (icon + wordmark) used across the auth flow and
 * anywhere a logo is shown outside the app shell.
 *
 * Two modes, both driven entirely by the deployment's brand config (no baked-in
 * colors, so nothing reads as the old blue asset):
 *   1. Custom logo — when VELTRIX_BRAND_LOGO_URL is set, that image renders as-is.
 *   2. Default mark — otherwise a shield + wordmark tinted with the brand accent
 *      (VELTRIX_BRAND_COLOR), so a company can recolour it (or drop in its own
 *      logo) without a rebuild.
 */
export function BrandLogo({ className = '' }: BrandLogoProps) {
  const brand = useBrand()
  const hasCustomLogo = Boolean(brand.logoUrl) && brand.logoUrl !== DEFAULT_LOGO_URL

  if (hasCustomLogo) {
    return (
      <img
        src={brand.logoUrl}
        alt={`${brand.name} logo`}
        className={`h-10 w-auto inline-block ${className}`}
      />
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      style={{ color: brand.color }}
    >
      <Shield className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
      <span className="text-2xl font-bold tracking-tight">{brand.name}</span>
    </span>
  )
}

export default BrandLogo

/** App icon from `/app-icon.png` — keep in sync with mobile `assets/icon.png`; bump ?v= with index.html / manifest when icons change. */
export default function BrandMark({
  size = 40,
  className = '',
  alt = '',
}: {
  size?: number
  className?: string
  alt?: string
}) {
  const radius = Math.max(6, Math.round(size * 0.22))
  return (
    <img
      src="/app-icon.png?v=20260602"
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: radius, objectFit: 'cover', display: 'block' }}
    />
  )
}

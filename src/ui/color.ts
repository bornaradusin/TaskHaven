// Text that can be read on a colour (labels, avatars).

export function textOn(color: string): string {
  const hex = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#1f2328'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.4 ? '#1f2328' : '#ffffff'
}

/** A label's colours: its own, a little darker for white text to be read on it. */
export function chipStyle(color: string): Record<string, string> {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : '#9e9e9e'
  return { background: c, color: textOn(c) }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

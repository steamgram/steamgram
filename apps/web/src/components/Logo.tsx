type Props = { className?: string; pulse?: boolean }

/**
 * The WASD mark from the app icon, transparent background, for in-app use.
 * Overflow stays visible so the pulsing key can dip below the box instead of being cut off.
 */
export function Logo({ className = 'h-24', pulse = false }: Props) {
  const font = { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontWeight: 700 } as const
  return (
    <svg viewBox="80 120 352 258" className={`overflow-visible ${className}`} aria-label="SteamGram" role="img">
      <defs>
        <linearGradient id="logo-key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd4ff" />
          <stop offset="1" stopColor="#4da8e0" />
        </linearGradient>
        <linearGradient id="logo-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7fb5" />
          <stop offset="1" stopColor="#1e5a85" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#66c0f4" strokeWidth="10" opacity="0.6">
        <rect x="201" y="126" width="110" height="110" rx="24" />
        <rect x="86" y="241" width="110" height="110" rx="24" />
        <rect x="316" y="241" width="110" height="110" rx="24" />
      </g>
      <g fill="#66c0f4" opacity="0.6" fontSize="70" textAnchor="middle" style={font}>
        <text x="256" y="206">W</text>
        <text x="141" y="321">A</text>
        <text x="371" y="321">D</text>
      </g>
      <g className={pulse ? 'logo-pulse' : undefined}>
        <rect x="201" y="261" width="110" height="110" rx="24" fill="url(#logo-side)" />
        <rect x="201" y="241" width="110" height="110" rx="24" fill="url(#logo-key)" />
        <text x="256" y="322" fontSize="76" textAnchor="middle" fill="#0b0f17" style={font}>
          S
        </text>
      </g>
    </svg>
  )
}

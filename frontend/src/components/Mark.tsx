export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M 79.726,23.235 A 40,40 0 1 0 89.547,56.000 A 40,40 0 0 0 89.547,44.000 L 56.000,44.000 L 56.000,56.000 L 77.350,56.000 A 28,28 0 1 1 70.808,31.264 Z"
        fill="#17140F"
      />
      <rect x="56" y="44.0" width="21.35" height="12" fill="#C26A1E" />
    </svg>
  )
}

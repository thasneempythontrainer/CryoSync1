import { useId, type SVGProps } from "react"

function BrandMark(props: SVGProps<SVGSVGElement>) {
  const gradId = `cryosync-grad-${useId().replace(/:/g, "")}`
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path
        d="M20 3 34.7 11.5 34.7 28.5 20 37 5.3 28.5 5.3 11.5 20 3Z"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinejoin="round"
        fill="rgba(34,211,238,0.08)"
      />
      <g stroke={`url(#${gradId})`} strokeWidth="1.6" strokeLinecap="round">
        <path d="M20 11v18" />
        <path d="m12.3 15.5 15.4 9" />
        <path d="m12.3 24.5 15.4-9" />
      </g>
      <circle cx="20" cy="20" r="4.2" fill={`url(#${gradId})`} />
    </svg>
  )
}

export { BrandMark }

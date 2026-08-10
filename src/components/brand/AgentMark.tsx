import { useId, type SVGProps } from "react"

function AgentMark(props: SVGProps<SVGSVGElement>) {
  const gradId = `kyra-grad-${useId().replace(/:/g, "")}`
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
        d="M20 8 C 20 15, 27 22, 34 22 C 27 22, 20 29, 20 36 C 20 29, 13 22, 6 22 C 13 22, 20 15, 20 8 Z"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinejoin="round"
        fill={`url(#${gradId})`}
        fillOpacity="0.14"
      />
      <path
        d="M31 5.5 C 31 7.8, 33.2 10, 35.5 10 C 33.2 10, 31 12.2, 31 14.5 C 31 12.2, 28.8 10, 26.5 10 C 28.8 10, 31 7.8, 31 5.5 Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  )
}

export { AgentMark }

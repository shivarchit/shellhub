interface LogoProps {
  size?: number
}

export default function Logo({ size = 32 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-mark" x1="14" y1="10" x2="27" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22c55e" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#0b1120" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="none" stroke="#253345" />
      <rect x="5" y="6" width="17" height="7.5" rx="2" fill="#1a2332" stroke="#2b3b55" />
      <circle cx="8.6" cy="9.75" r="1.4" fill="#22c55e" />
      <rect x="12" y="8.9" width="7" height="1.7" rx="0.85" fill="#3d4c63" />
      <rect x="5" y="16" width="17" height="7.5" rx="2" fill="#1a2332" stroke="#2b3b55" />
      <circle cx="8.6" cy="19.75" r="1.4" fill="#f59e0b" />
      <rect x="12" y="18.9" width="7" height="1.7" rx="0.85" fill="#3d4c63" />
      <path d="M15.5 11 L26.5 18.2 L15.5 25.4 L15.5 21.2 L20.5 18.2 L15.5 15.2 Z" fill="url(#logo-mark)" stroke="#0b1120" strokeWidth="1.2" />
    </svg>
  )
}

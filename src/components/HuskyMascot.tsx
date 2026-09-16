// A small original illustration -- not the University of Washington's
// trademarked Husky logo, just a simple friendly husky face for the header.
export function HuskyMascot({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears -- white outline first so they read clearly against the
          purple header, dark tips inside */}
      <path d="M9 5 L19 19 L5 21 Z" fill="#ffffff" />
      <path d="M39 5 L43 21 L29 19 Z" fill="#ffffff" />
      <path d="M11 10 L17.5 18.5 L8 19.8 Z" fill="#2a2a2a" />
      <path d="M37 10 L40 19.8 L30.5 18.5 Z" fill="#2a2a2a" />

      {/* Head */}
      <circle cx="24" cy="25" r="15.5" fill="#ffffff" />

      {/* Face mask markings (classic husky grey saddle) */}
      <path
        d="M9.5 21c.5-3.5 3.5-6 6.5-6 2.3 0 4 1.7 4 4.3 0 3.3-2.5 5.7-6 5.7-2.7 0-4.2-1.7-4.5-4z"
        fill="#8a8a8a"
      />
      <path
        d="M38.5 21c-.5-3.5-3.5-6-6.5-6-2.3 0-4 1.7-4 4.3 0 3.3 2.5 5.7 6 5.7 2.7 0 4.2-1.7 4.5-4z"
        fill="#8a8a8a"
      />
      <path
        d="M24 15c2 0 3 2 3 4.5 0 3-1.3 5.5-3 5.5s-3-2.5-3-5.5c0-2.5 1-4.5 3-4.5z"
        fill="#8a8a8a"
      />

      {/* Eyes */}
      <circle cx="17.5" cy="23" r="2.8" fill="#7EC1E8" />
      <circle cx="30.5" cy="23" r="2.8" fill="#7EC1E8" />
      <circle cx="17.5" cy="23" r="1.3" fill="#1c1330" />
      <circle cx="30.5" cy="23" r="1.3" fill="#1c1330" />

      {/* Snout */}
      <ellipse cx="24" cy="32" rx="7" ry="6" fill="#ffffff" />
      <ellipse cx="24" cy="31.5" rx="2.3" ry="1.7" fill="#2a2a2a" />
      <path d="M24 33.2c-1.3 1.7-3.2 2-4.2 1.5M24 33.2c1.3 1.7 3.2 2 4.2 1.5" stroke="#2a2a2a" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  )
}

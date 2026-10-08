import { useId } from 'react';
// Sweeping ribbon bands (DESIGN.md §7.1). Purely decorative; colors come from the variant class.
export function Ribbons({ variant = 'orange' }: { variant?: 'orange' | 'soft' | 'dark' }) {
  // useId output contains characters that break url(#…) references in some browsers.
  const id = 'ribbon' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg
      className={`ribbons ribbons-${variant}`}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id + 'a'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="ribbon-stop-1" />
          <stop offset="1" className="ribbon-stop-2" />
        </linearGradient>
        <linearGradient id={id + 'b'} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" className="ribbon-stop-2" />
          <stop offset="1" className="ribbon-stop-3" />
        </linearGradient>
      </defs>
      <g className="ribbon ribbon-one">
        <path d="M -160 -120 C 120 220 380 420 640 560 S 900 760 760 520" stroke={`url(#${id}a)`} />
      </g>
      <g className="ribbon ribbon-two">
        <path
          d="M 520 -160 C 760 160 980 260 1200 300 S 1560 420 1620 760"
          stroke={`url(#${id}b)`}
        />
      </g>
      <g className="ribbon ribbon-three">
        <path d="M 980 1060 C 1080 820 1260 700 1600 640" stroke={`url(#${id}a)`} />
      </g>
    </svg>
  );
}

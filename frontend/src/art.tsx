import type { ReactNode } from "react";

/* Hand-built vector illustrations. No external images, so nothing can break or leak a visitor's IP. */

type P = { className?: string; width?: number; height?: number };

function Person({
  x,
  y,
  s = 1,
  shirt,
  skin,
  hair,
}: {
  x: number;
  y: number;
  s?: number;
  shirt: string;
  skin: string;
  hair: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-22 0 C-22 -34 -14 -52 0 -52 C14 -52 22 -34 22 0 Z" fill={shirt} />
      <rect x="-7" y="-60" width="14" height="10" rx="5" fill={skin} />
      <circle cx="0" cy="-72" r="15" fill={skin} />
      <path d="M-15 -73 C-15 -90 15 -90 15 -73 C9 -80 -9 -80 -15 -73Z" fill={hair} />
    </g>
  );
}

function Frame({ children, id, className }: { children: ReactNode; id: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 640 440"
      className={className}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width="640" height="440" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>{children}</g>
    </svg>
  );
}

export function SceneHero({ className }: P) {
  return (
    <Frame id="hero" className={className}>
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde7c7" />
          <stop offset="0.55" stopColor="#fdf2e0" />
          <stop offset="1" stopColor="#e6f7ec" />
        </linearGradient>
        <radialGradient id="hero-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="640" height="440" fill="url(#hero-sky)" />
      <circle cx="470" cy="150" r="150" fill="url(#hero-sun)" />
      <circle cx="470" cy="150" r="46" fill="#fbbf24" />
      <ellipse cx="120" cy="90" rx="60" ry="16" fill="#fff" opacity=".8" />
      <ellipse cx="160" cy="76" rx="40" ry="14" fill="#fff" opacity=".8" />
      <path d="M0 290 C120 230 220 250 320 280 C430 310 520 250 640 270 L640 440 L0 440Z" fill="#a7e3bd" />
      <path d="M0 340 C140 300 260 330 360 345 C470 360 560 320 640 335 L640 440 L0 440Z" fill="#5fcf8d" />
      <path d="M0 395 C160 370 300 400 420 390 C520 382 580 380 640 388 L640 440 L0 440Z" fill="#12b76a" />
      {/* village */}
      <g transform="translate(40 232)">
        <rect x="0" y="30" width="54" height="40" fill="#fff" />
        <polygon points="-6,32 27,6 60,32" fill="#f97316" />
        <rect x="21" y="46" width="14" height="24" fill="#92400e" />
        <rect x="80" y="40" width="46" height="34" fill="#fff" />
        <polygon points="74,42 103,18 132,42" fill="#0ea5e9" />
        <rect x="97" y="54" width="12" height="20" fill="#92400e" />
      </g>
      {/* trees */}
      <g>
        <rect x="552" y="262" width="8" height="40" fill="#92400e" />
        <circle cx="556" cy="250" r="30" fill="#16a34a" />
        <rect x="596" y="280" width="7" height="30" fill="#92400e" />
        <circle cx="600" cy="268" r="22" fill="#22c55e" />
      </g>
      {/* people */}
      <Person x={190} y={400} s={1.5} shirt="#0ea5e9" skin="#8d5524" hair="#1f1209" />
      <Person x={262} y={410} s={1.75} shirt="#f97316" skin="#c68642" hair="#2b1a0e" />
      <Person x={340} y={405} s={1.6} shirt="#fff" skin="#6b3f1d" hair="#0b0704" />
      <Person x={415} y={412} s={1.8} shirt="#a855f7" skin="#e0ac69" hair="#3b2314" />
      <Person x={490} y={402} s={1.45} shirt="#f43f5e" skin="#8d5524" hair="#1f1209" />
      {/* heart */}
      <g transform="translate(325 108)">
        <path
          d="M0 40 C-50 8 -46 -26 -20 -30 C-8 -32 0 -24 0 -16 C0 -24 8 -32 20 -30 C46 -26 50 8 0 40Z"
          fill="#f43f5e"
        />
        <path d="M-14 -10 C-18 -16 -10 -22 -4 -17" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7" />
      </g>
      {/* sparkles */}
      <g fill="#fff">
        <circle cx="260" cy="150" r="4" />
        <circle cx="395" cy="80" r="3" />
        <circle cx="300" cy="62" r="2.5" />
      </g>
    </Frame>
  );
}

export function SceneEducation({ className }: P) {
  return (
    <Frame id="edu" className={className}>
      <defs>
        <linearGradient id="edu-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfdbfe" />
          <stop offset="1" stopColor="#fef9c3" />
        </linearGradient>
      </defs>
      <rect width="640" height="440" fill="url(#edu-bg)" />
      <circle cx="530" cy="85" r="40" fill="#fde047" />
      <ellipse cx="120" cy="90" rx="62" ry="17" fill="#fff" opacity=".85" />
      <ellipse cx="168" cy="74" rx="40" ry="14" fill="#fff" opacity=".85" />
      <path d="M0 330 C140 290 260 320 360 330 C470 340 560 300 640 315 L640 440 L0 440Z" fill="#86efac" />
      <path d="M0 380 C160 350 300 385 430 372 C520 364 580 365 640 372 L640 440 L0 440Z" fill="#4ade80" />
      <rect x="175" y="200" width="290" height="150" rx="4" fill="#fff7ed" />
      <polygon points="150,205 320,118 490,205" fill="#ef4444" />
      <rect x="300" y="82" width="4" height="40" fill="#78350f" />
      <polygon points="304,82 336,92 304,102" fill="#facc15" />
      <rect x="296" y="278" width="48" height="72" rx="4" fill="#92400e" />
      <circle cx="334" cy="316" r="3" fill="#fde68a" />
      {[205, 246, 366, 407].map((x) => (
        <g key={x}>
          <rect x={x} y="228" width="28" height="36" rx="3" fill="#93c5fd" />
          <path d={`M${x + 14} 228 V264 M${x} 246 H${x + 28}`} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
      <Person x={130} y={395} s={1.2} shirt="#0ea5e9" skin="#8d5524" hair="#1f1209" />
      <Person x={185} y={402} s={1.0} shirt="#f43f5e" skin="#c68642" hair="#2b1a0e" />
      <Person x={470} y={398} s={1.15} shirt="#a855f7" skin="#6b3f1d" hair="#0b0704" />
      <Person x={525} y={404} s={1.0} shirt="#f97316" skin="#e0ac69" hair="#3b2314" />
      {/* books */}
      <g transform="translate(70 360)">
        <rect width="70" height="14" rx="2" fill="#2563eb" />
        <rect x="6" y="-14" width="60" height="14" rx="2" fill="#f59e0b" />
        <rect x="2" y="-28" width="64" height="14" rx="2" fill="#10b981" />
      </g>
    </Frame>
  );
}

export function SceneMedical({ className }: P) {
  return (
    <Frame id="med" className={className}>
      <defs>
        <linearGradient id="med-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe4e6" />
          <stop offset="1" stopColor="#ccfbf1" />
        </linearGradient>
        <linearGradient id="med-heart" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb7185" />
          <stop offset="1" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <rect width="640" height="440" fill="url(#med-bg)" />
      <circle cx="90" cy="90" r="60" fill="#fff" opacity=".5" />
      <circle cx="560" cy="360" r="90" fill="#fff" opacity=".45" />
      <circle cx="540" cy="70" r="26" fill="#99f6e4" opacity=".7" />
      <path
        d="M320 372 C165 270 128 180 188 132 C240 92 300 122 320 168 C340 122 400 92 452 132 C512 180 475 270 320 372Z"
        fill="url(#med-heart)"
      />
      <path d="M215 150 C190 172 196 205 222 238" stroke="#fff" strokeWidth="8" strokeLinecap="round" fill="none" opacity=".35" />
      <rect x="298" y="176" width="44" height="116" rx="10" fill="#fff" />
      <rect x="262" y="212" width="116" height="44" rx="10" fill="#fff" />
      <path
        d="M20 234 H150 L176 190 L214 292 L246 214 L268 234 H372 L398 200 L424 262 L446 234 H620"
        stroke="#0f766e"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".55"
      />
      <g transform="rotate(-30 110 350)">
        <rect x="70" y="340" width="80" height="30" rx="15" fill="#fff" />
        <path d="M110 340 H135 a15 15 0 0 1 0 30 H110Z" fill="#14b8a6" />
      </g>
      <g transform="rotate(25 540 150)">
        <rect x="500" y="140" width="80" height="30" rx="15" fill="#fff" />
        <path d="M540 140 H565 a15 15 0 0 1 0 30 H540Z" fill="#f43f5e" />
      </g>
    </Frame>
  );
}

export function SceneWater({ className }: P) {
  return (
    <Frame id="wat" className={className}>
      <defs>
        <linearGradient id="wat-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#bae6fd" />
        </linearGradient>
        <linearGradient id="wat-drop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      <rect width="640" height="440" fill="url(#wat-bg)" />
      <circle cx="90" cy="80" r="38" fill="#fde68a" />
      <path d="M320 40 C320 40 205 170 205 262 a115 115 0 0 0 230 0 C435 170 320 40 320 40Z" fill="url(#wat-drop)" />
      <path d="M262 232 C252 262 258 292 282 312" stroke="#fff" strokeWidth="10" strokeLinecap="round" fill="none" opacity=".45" />
      <path d="M0 360 C140 330 260 350 360 358 C470 366 560 335 640 345 L640 440 L0 440Z" fill="#fde68a" />
      <path d="M0 405 C160 385 300 410 430 400 C520 393 580 392 640 398 L640 440 L0 440Z" fill="#fcd34d" />
      <ellipse cx="320" cy="372" rx="110" ry="14" fill="#38bdf8" opacity=".6" />
      <ellipse cx="320" cy="372" rx="70" ry="8" fill="#7dd3fc" opacity=".8" />
      {/* well */}
      <g transform="translate(70 270)">
        <rect x="0" y="50" width="90" height="60" rx="6" fill="#a8a29e" />
        <path d="M0 70 H90 M0 90 H90 M30 50 V70 M60 70 V90 M30 90 V110" stroke="#78716c" strokeWidth="2" />
        <rect x="6" y="0" width="6" height="54" fill="#78350f" />
        <rect x="78" y="0" width="6" height="54" fill="#78350f" />
        <polygon points="-8,6 45,-30 98,6" fill="#b45309" />
        <rect x="42" y="8" width="4" height="26" fill="#44403c" />
        <rect x="35" y="32" width="18" height="14" rx="2" fill="#0ea5e9" />
      </g>
      <Person x={520} y={400} s={1.4} shirt="#f97316" skin="#6b3f1d" hair="#0b0704" />
      <rect x="548" y="318" width="22" height="30" rx="6" fill="#0ea5e9" />
      <rect x="553" y="310" width="12" height="9" rx="3" fill="#0284c7" />
    </Frame>
  );
}

export function SceneCommunity({ className }: P) {
  return (
    <Frame id="com" className={className}>
      <defs>
        <linearGradient id="com-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#d1fae5" />
        </linearGradient>
      </defs>
      <rect width="640" height="440" fill="url(#com-bg)" />
      <circle cx="540" cy="80" r="40" fill="#fbbf24" />
      <path d="M0 340 C140 310 260 335 360 342 C470 350 560 320 640 330 L640 440 L0 440Z" fill="#86efac" />
      <path d="M0 395 C160 372 300 398 430 388 C520 380 580 380 640 386 L640 440 L0 440Z" fill="#34d399" />
      {/* finished houses */}
      <g>
        <rect x="40" y="250" width="110" height="100" fill="#fff" />
        <polygon points="28,254 95,196 162,254" fill="#ef4444" />
        <rect x="82" y="296" width="26" height="54" fill="#92400e" />
        <rect x="52" y="272" width="20" height="22" fill="#93c5fd" />
        <rect x="118" y="272" width="20" height="22" fill="#93c5fd" />
        <rect x="170" y="280" width="90" height="70" fill="#fef3c7" />
        <polygon points="160,284 215,236 270,284" fill="#0ea5e9" />
        <rect x="204" y="312" width="22" height="38" fill="#92400e" />
      </g>
      {/* house under construction */}
      <g transform="translate(300 0)">
        <rect x="0" y="270" width="140" height="80" fill="#fde68a" />
        <path d="M-6 270 L70 218 L146 270" stroke="#92400e" strokeWidth="6" fill="none" />
        <path d="M0 270 L70 218 M140 270 L70 218" stroke="#b45309" strokeWidth="3" />
        {/* scaffold */}
        <g stroke="#78716c" strokeWidth="3">
          <path d="M-20 350 V220 M160 350 V220 M-20 250 H160 M-20 300 H160 M-20 250 L30 300 M30 250 L80 300 M80 250 L130 300" />
        </g>
        <rect x="50" y="300" width="28" height="50" fill="#92400e" />
      </g>
      {/* crane */}
      <g stroke="#f59e0b" strokeWidth="5" fill="none">
        <path d="M545 350 V150 M545 150 H430 M545 150 L600 150 M545 175 L430 150" />
        <path d="M455 150 V210" stroke="#44403c" strokeWidth="2" />
      </g>
      <rect x="440" y="206" width="30" height="16" fill="#a16207" />
      <Person x={250} y={405} s={1.2} shirt="#f97316" skin="#8d5524" hair="#1f1209" />
      <Person x={470} y={410} s={1.25} shirt="#0ea5e9" skin="#c68642" hair="#2b1a0e" />
      <rect x="448" y="338" width="44" height="6" rx="3" fill="#facc15" transform="translate(-34 40)" />
    </Frame>
  );
}

/* Small line icons */
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icon = {
  Shield: (p: P) => (
    <svg {...base} {...p}>
      <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
      <path d="M8.5 12l2.5 2.5L15.5 10" />
    </svg>
  ),
  Refund: (p: P) => (
    <svg {...base} {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
  Lock: (p: P) => (
    <svg {...base} {...p}>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.3" />
    </svg>
  ),
  EyeOff: (p: P) => (
    <svg {...base} {...p}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.6 3.2M6.5 7.6C4.2 9 2.8 11 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.8-.3 4-.9" />
      <path d="M9.9 10a3 3 0 0 0 4.1 4.1" />
    </svg>
  ),
  User: (p: P) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.7-4 4-6 8-6s7.3 2 8 6" />
    </svg>
  ),
  Rocket: (p: P) => (
    <svg {...base} {...p}>
      <path d="M5 15c-1.5 1.3-2 4-2 6 2 0 4.7-.5 6-2" />
      <path d="M14 4c3-1.5 6-1.5 6-1.5s0 3-1.5 6l-6 6-4.5-4.5 6-6z" />
      <circle cx="15" cy="9" r="1.5" />
    </svg>
  ),
  Heart: (p: P) => (
    <svg {...base} {...p}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
    </svg>
  ),
  Eye: (p: P) => (
    <svg {...base} {...p}>
      <path d="M2.5 12C4 9 7.5 6 12 6s8 3 9.5 6c-1.5 3-5 6-9.5 6s-8-3-9.5-6z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Check: (p: P) => (
    <svg {...base} {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  Arrow: (p: P) => (
    <svg {...base} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  Key: (p: P) => (
    <svg {...base} {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3" />
    </svg>
  ),
};

export function Logo({ className = "h-8 w-8" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#12b76a" />
      <path
        d="M16 25.5s-8-4.9-8-10.6A4.5 4.5 0 0 1 16 12.2a4.5 4.5 0 0 1 8 2.7c0 5.7-8 10.6-8 10.6z"
        fill="#fff"
      />
    </svg>
  );
}

import { spread, type Theme } from './types';

const BAT =
  'M32 10 C28 4 24 4 22 9 C16 2 6 2 0 12 C8 10 12 14 14 20 C18 15 24 16 27 22 C29 18 30 16 32 16 C34 16 35 18 37 22 C40 16 46 15 50 20 C52 14 56 10 64 12 C58 2 48 2 42 9 C40 4 36 4 32 10Z';

/** A glowing jack-o'-lantern under a full moon, with a web in the corner. Original artwork. */
function Illustration() {
  return (
    <>
      <circle cx="1060" cy="130" r="92" fill="#F3E6C4" />
      <circle cx="1030" cy="108" r="14" fill="#E2D2A8" />
      <circle cx="1090" cy="160" r="20" fill="#E2D2A8" />
      <circle cx="1075" cy="100" r="8" fill="#E2D2A8" />
      <path
        d="M0 0 Q60 40 120 0 M0 0 Q40 60 0 120 M0 0 L150 150 M0 0 L90 160 M0 0 L160 90 M30 30 Q46 22 58 0 M30 30 Q22 46 0 58 M62 62 Q90 50 112 20 M62 62 Q50 90 20 112"
        stroke="#4A3B73"
        strokeWidth="2"
        fill="none"
      />
      <path d="M560 460 Q800 380 1000 420 T1280 400 V560 H560Z" fill="#120E22" />
      <path d="M0 500 Q300 440 620 480 T1280 470 V560 H0Z" fill="#231B3D" />
      <g fill="#120E22">
        <rect x="700" y="388" width="34" height="56" rx="17" />
        <rect x="760" y="402" width="28" height="44" rx="14" />
      </g>
      <g transform="translate(900 420)">
        <clipPath id="hw-pumpkin">
          <ellipse cx="0" cy="0" rx="130" ry="104" />
        </clipPath>
        <ellipse cx="0" cy="0" rx="130" ry="104" fill="#E9741F" />
        <ellipse cx="-62" cy="0" rx="66" ry="102" fill="#F28C28" />
        <ellipse cx="62" cy="0" rx="66" ry="102" fill="#F28C28" />
        <ellipse cx="0" cy="0" rx="48" ry="104" fill="#F59A3A" />
        <g clipPath="url(#hw-pumpkin)" stroke="#B85A14" strokeWidth="1.6" opacity=".5">
          {[-70, -48, -26, -4, 18, 40, 62, 84].map((y) => (
            <path key={y} d={`M-130 ${y} H130`} />
          ))}
        </g>
        <path
          d="M-8 -100 Q-4 -132 22 -140"
          stroke="#4E7A3A"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <g className="pb-flicker" fill="#FFD166">
          <path d="M-70 -24 L-36 -50 L-26 -12Z" />
          <path d="M70 -24 L36 -50 L26 -12Z" />
          <path d="M-10 0 L10 0 L0 18Z" />
          <path d="M-78 30 Q0 90 78 30 L60 42 L46 30 L30 48 L12 32 L-6 50 L-22 32 L-40 48 L-56 32Z" />
        </g>
      </g>
      <g transform="translate(1110 470)">
        <ellipse cx="0" cy="0" rx="72" ry="56" fill="#E9741F" />
        <ellipse cx="0" cy="0" rx="30" ry="56" fill="#F59A3A" />
        <path
          d="M-3 -54 Q0 -72 12 -78"
          stroke="#4E7A3A"
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </>
  );
}

const BATS = [
  [620, 90, 70],
  [760, 200, 46],
  [1150, 300, 54],
  [520, 260, 38],
];

function Effects() {
  return (
    <>
      {spread(14).map((p, i) => (
        <span
          key={`s${i}`}
          aria-hidden="true"
          className="absolute size-[3px] rounded-full bg-[#F6EEDD]"
          style={{
            left: p.left,
            top: 20 + ((i * 47) % 260),
            animation: `pb-twinkle ${2 + (i % 4)}s ease-in-out ${-(i % 3)}s infinite`,
          }}
        />
      ))}
      {BATS.map(([left, top, width], i) => (
        <svg
          key={`b${i}`}
          aria-hidden="true"
          width={width}
          height={Math.round((width ?? 0) * 0.47)}
          viewBox="0 0 64 30"
          className="absolute"
          style={{
            left,
            top,
            animation: `pb-bat ${6 + i * 1.5}s ease-in-out ${-i * 1.7}s infinite`,
          }}
        >
          <path d={BAT} fill="#0B0816" />
        </svg>
      ))}
    </>
  );
}

export const halloween: Theme = {
  key: 'halloween',
  loadFont: () => import('@fontsource/creepster/400.css'),
  heading: { fontFamily: "'Creepster', system-ui", fontWeight: 400, letterSpacing: '0.02em' },
  dark: true,
  vars: {
    '--t-bg': '#17122A',
    '--t-ink': '#F6EEDD',
    '--t-muted': '#C9BEDD',
    '--t-line': '#2C2349',
    '--t-header': '#120E22',
    '--t-hero': '#1D1636',
    '--t-hero-ink': '#F28C28',
    '--t-hero-muted': '#D9CFEA',
    '--t-eyebrow': '#FFD166',
    '--t-heading': '#F28C28',
    '--t-accent': '#F28C28',
    '--t-on-accent': '#17122A',
    '--t-hero-cta': '#F28C28',
    '--t-on-hero-cta': '#17122A',
    '--t-card': '#231B3D',
    '--t-card-line': '#3A2E5E',
    '--t-media': '#120E22',
    '--t-price': '#FFB46B',
    '--t-badge': '#F28C28',
    '--t-on-badge': '#17122A',
    '--t-wa': '#F28C28',
    '--t-on-wa': '#17122A',
    '--t-wa-ring': 'rgba(242,140,40,.35)',
  },
  Illustration,
  Effects,
  strip: {
    title: { pt: 'Festa à fantasia chegando?', en: 'Costume party coming up?' },
    text: {
      pt: 'Peças para decorar a mesa ou montar a fantasia, no tamanho que você precisar.',
      en: 'Pieces to dress the table or finish the costume, in the size you need.',
    },
  },
  StripMark: () => (
    <svg width="66" height="32" viewBox="0 0 64 30" aria-hidden="true">
      <path d={BAT} fill="none" stroke="#F28C28" strokeWidth="2" />
    </svg>
  ),
};

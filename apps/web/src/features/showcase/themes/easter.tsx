import { spread, type Theme } from './types';

const EGG =
  'M0 -58 C33 -58 48 -10 48 15 C48 43 26 61 0 61 C-26 61 -48 43 -48 15 C-48 -10 -33 -58 0 -58Z';

/** A bunny holding a printed egg on spring grass. Original artwork for PrintBI. */
function Illustration() {
  return (
    <>
      <circle cx="1150" cy="90" r="64" fill="#FFEFB5" />
      <path d="M0 470 Q320 430 640 460 T1280 450 V560 H0Z" fill="#CFEFDF" />
      <path d="M0 505 Q360 480 720 500 T1280 492 V560 H0Z" fill="#A9DFC4" />
      <g stroke="#7CC9A3" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M700 470 q4 -26 -6 -40" />
        <path d="M712 470 q-2 -30 10 -44" />
        <path d="M1180 466 q4 -26 -6 -40" />
        <path d="M1192 466 q-2 -30 10 -44" />
        <path d="M860 476 q2 -20 -8 -32" />
      </g>
      <g transform="translate(940 300)">
        <ellipse cx="0" cy="170" rx="110" ry="14" fill="#7CC9A3" opacity=".6" />
        <g transform="rotate(-8 -30 -150)">
          <ellipse cx="-34" cy="-150" rx="22" ry="70" fill="#FFFFFF" />
          <ellipse cx="-34" cy="-146" rx="11" ry="52" fill="#F9D3DF" />
        </g>
        <g transform="rotate(10 34 -150)">
          <ellipse cx="34" cy="-150" rx="22" ry="70" fill="#FFFFFF" />
          <ellipse cx="34" cy="-146" rx="11" ry="52" fill="#F9D3DF" />
        </g>
        <ellipse cx="0" cy="80" rx="92" ry="96" fill="#FFFFFF" />
        <circle cx="0" cy="-50" r="70" fill="#FFFFFF" />
        <circle cx="-24" cy="-58" r="7" fill="#2F2A3D" />
        <circle cx="24" cy="-58" r="7" fill="#2F2A3D" />
        <circle cx="-21" cy="-61" r="2.2" fill="#fff" />
        <circle cx="27" cy="-61" r="2.2" fill="#fff" />
        <circle cx="-42" cy="-34" r="11" fill="#F9D3DF" />
        <circle cx="42" cy="-34" r="11" fill="#F9D3DF" />
        <path d="M-8 -38 Q0 -30 8 -38 Q0 -44 -8 -38Z" fill="#E98AA6" />
        <path
          d="M0 -32 V-22 M0 -22 Q-8 -16 -14 -20 M0 -22 Q8 -16 14 -20"
          stroke="#2F2A3D"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="-50" cy="168" rx="34" ry="16" fill="#FFFFFF" />
        <ellipse cx="50" cy="168" rx="34" ry="16" fill="#FFFFFF" />
        <g transform="translate(0 70)">
          <clipPath id="easter-egg">
            <path d={EGG} />
          </clipPath>
          <path d={EGG} fill="#FFEFB5" />
          <g clipPath="url(#easter-egg)">
            <path
              d="M-50 0 L-35 -12 L-20 0 L-5 -12 L10 0 L25 -12 L40 0 L55 -12 V8 L40 20 L25 8 L10 20 L-5 8 L-20 20 L-35 8 L-50 20Z"
              fill="#8E7FE0"
            />
            <g stroke="#E8D58E" strokeWidth="1.4" opacity=".8">
              {[-40, -28, 32, 44].map((y) => (
                <path key={y} d={`M-50 ${y} H50`} />
              ))}
            </g>
          </g>
          <ellipse cx="-58" cy="10" rx="18" ry="14" fill="#FFFFFF" />
          <ellipse cx="58" cy="10" rx="18" ry="14" fill="#FFFFFF" />
        </g>
      </g>
      <g transform="translate(720 420) rotate(-12)">
        <path
          d="M0 -44 C25 -44 36 -8 36 11 C36 32 20 46 0 46 C-20 46 -36 32 -36 11 C-36 -8 -25 -44 0 -44Z"
          fill="#F9D3DF"
        />
        <g fill="#ffffff">
          <circle cx="-12" cy="-4" r="5" />
          <circle cx="10" cy="8" r="5" />
          <circle cx="-4" cy="24" r="5" />
          <circle cx="14" cy="-18" r="4" />
        </g>
      </g>
      <g transform="translate(1150 410) rotate(10)">
        <path
          d="M0 -50 C28 -50 41 -9 41 13 C41 37 23 52 0 52 C-23 52 -41 37 -41 13 C-41 -9 -28 -50 0 -50Z"
          fill="#CFEFDF"
        />
        <path d="M-41 4 H41 M-38 22 H38" stroke="#7CC9A3" strokeWidth="7" />
      </g>
    </>
  );
}

const COLORS = ['#FFEFB5', '#F9D3DF', '#CFEFDF', '#B9AEEB', '#ffffff'];

function Effects() {
  return (
    <>
      {spread(14).map((p, i) => {
        const w = 8 + (i % 3) * 3;
        return (
          <span
            key={i}
            aria-hidden="true"
            className="absolute top-0"
            style={{
              left: p.left,
              width: w,
              height: i % 2 === 0 ? w : w * 1.6,
              borderRadius: i % 2 === 0 ? 999 : 3,
              background: COLORS[i % COLORS.length],
              animation: `pb-confetti ${p.duration + 3}s linear ${p.delay}s infinite`,
            }}
          />
        );
      })}
    </>
  );
}

export const easter: Theme = {
  key: 'easter',
  loadFont: () => import('@fontsource/fredoka/700.css'),
  heading: { fontFamily: "'Fredoka', 'Schibsted Grotesk', sans-serif", fontWeight: 700 },
  dark: false,
  vars: {
    '--t-bg': '#FBF8F1',
    '--t-ink': '#2F2A3D',
    '--t-muted': '#5E5872',
    '--t-line': '#EDE8F7',
    '--t-header': '#ffffff',
    '--t-hero': '#E9E4FB',
    '--t-hero-ink': '#3E2F8F',
    '--t-hero-muted': '#4E4864',
    '--t-eyebrow': '#5A4BC0',
    '--t-heading': '#3E2F8F',
    '--t-accent': '#5A4BC0',
    '--t-on-accent': '#ffffff',
    '--t-hero-cta': '#5A4BC0',
    '--t-on-hero-cta': '#ffffff',
    '--t-card': '#ffffff',
    '--t-card-line': '#EDE8F7',
    '--t-media': '#FFF3C9',
    '--t-price': '#43369A',
    '--t-badge': '#5A4BC0',
    '--t-on-badge': '#ffffff',
    '--t-wa': '#E9E4FB',
    '--t-on-wa': '#43369A',
    '--t-wa-ring': '#B9AEEB',
  },
  Illustration,
  Effects,
  strip: {
    title: { pt: 'Quer o ovo com o nome da criança?', en: 'Want the egg with your child’s name?' },
    text: {
      pt: 'A gente personaliza cor, nome e tamanho.',
      en: 'We personalize color, name and size.',
    },
  },
  StripMark: () => (
    <svg width="48" height="58" viewBox="-40 -46 80 94" aria-hidden="true">
      <path
        d="M0 -42 C24 -42 35 -8 35 10 C35 31 20 44 0 44 C-20 44 -35 31 -35 10 C-35 -8 -24 -42 0 -42Z"
        fill="none"
        stroke="#5A4BC0"
        strokeWidth="5"
        strokeDasharray="10 8"
      />
    </svg>
  ),
};

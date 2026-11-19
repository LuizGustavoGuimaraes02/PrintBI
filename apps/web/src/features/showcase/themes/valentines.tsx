import { spread, type Theme } from './types';

const BIG_HEART =
  'M0 150 C-17 133 -165 50 -165 -42 C-165 -108 -116 -150 -66 -150 C-33 -150 -10 -130 0 -103 C10 -130 33 -150 66 -150 C116 -150 165 -108 165 -42 C165 50 17 133 0 150Z';
export const HEART =
  'M0 60 C-7 53 -66 20 -66 -17 C-66 -43 -46 -60 -26 -60 C-13 -60 -4 -52 0 -41 C4 -52 13 -60 26 -60 C46 -60 66 -43 66 -17 C66 20 7 53 0 60Z';

/** A printed heart keychain with its ring, and a smaller heart. Original artwork for PrintBI. */
function Illustration() {
  return (
    <>
      <g fill="#F9CCD6">
        <circle cx="1180" cy="80" r="140" />
        <circle cx="700" cy="560" r="120" />
      </g>
      <g transform="translate(930 290)">
        <clipPath id="val-heart">
          <path d={BIG_HEART} />
        </clipPath>
        <circle cx="0" cy="-168" r="26" fill="none" stroke="#D4A23C" strokeWidth="9" />
        <path d={BIG_HEART} fill="#C2264B" />
        <g clipPath="url(#val-heart)" stroke="#A81E40" strokeWidth="2.2" opacity=".6">
          {[-120, -96, -72, -48, -24, 0, 24, 48, 72, 96, 120].map((y) => (
            <path key={y} d={`M-170 ${y} H170`} />
          ))}
        </g>
        <path
          d="M-110 -70 C-112 -100 -86 -120 -60 -118"
          stroke="#F28BA8"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="0" cy="-150" r="10" fill="#FCE1E6" />
      </g>
      <g transform="translate(720 410) rotate(-14)">
        <path d={HEART} fill="#F28BA8" />
        <path
          d="M-40 -26 C-41 -40 -30 -48 -20 -47"
          stroke="#FFF6F4"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </>
  );
}

const COLORS = ['#F28BA8', '#E0456A', '#ffffff', '#F9CCD6'];

function Effects() {
  return (
    <>
      {spread(12).map((p, i) => {
        const size = 16 + p.size * 8;
        return (
          <svg
            key={i}
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="-70 -64 140 128"
            className="absolute -bottom-8"
            style={{
              left: p.left,
              animation: `pb-rise ${p.duration + 2}s linear ${p.delay}s infinite`,
            }}
          >
            <path d={HEART} fill={COLORS[i % COLORS.length]} />
          </svg>
        );
      })}
    </>
  );
}

export const valentines: Theme = {
  key: 'valentines',
  loadFont: () => import('@fontsource/fraunces/600-italic.css'),
  heading: { fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontWeight: 600 },
  dark: false,
  vars: {
    '--t-bg': '#FFF6F4',
    '--t-ink': '#3B1220',
    '--t-muted': '#7A4352',
    '--t-line': '#F6DCE1',
    '--t-header': '#ffffff',
    '--t-hero': '#FCE1E6',
    '--t-hero-ink': '#3B1220',
    '--t-hero-muted': '#6B2E40',
    '--t-eyebrow': '#A81E40',
    '--t-heading': '#3B1220',
    '--t-accent': '#C2264B',
    '--t-on-accent': '#ffffff',
    '--t-hero-cta': '#C2264B',
    '--t-on-hero-cta': '#ffffff',
    '--t-card': '#ffffff',
    '--t-card-line': 'transparent',
    '--t-media': '#FCE1E6',
    '--t-price': '#8E1734',
    '--t-badge': '#C2264B',
    '--t-on-badge': '#ffffff',
    '--t-wa': '#FCE1E6',
    '--t-on-wa': '#8E1734',
    '--t-wa-ring': 'transparent',
  },
  Illustration,
  Effects,
  strip: {
    title: { pt: 'Tem uma ideia só de vocês?', en: 'Have an idea that’s only yours?' },
    text: {
      pt: 'Mande uma foto ou um desenho e a gente transforma em peça.',
      en: 'Send us a photo or a sketch and we’ll turn it into a piece.',
    },
  },
  StripMark: () => (
    <svg width="60" height="54" viewBox="-70 -64 140 128" aria-hidden="true">
      <path d={HEART} fill="none" stroke="#C2264B" strokeWidth="8" strokeDasharray="14 10" />
    </svg>
  ),
};

import { spread, type Theme } from './types';

const STAR = 'M0 -44 L12 -14 L44 -12 L19 8 L28 40 L0 22 L-28 40 L-19 8 L-44 -12 L-12 -14Z';

/** Santa holding a printed star over a snowy pine forest. Original artwork for PrintBI. */
function Illustration() {
  return (
    <>
      <path d="M0 470 Q260 420 560 450 T1280 430 V560 H0Z" fill="#E9EFEA" />
      <path d="M0 505 Q320 480 680 498 T1280 488 V560 H0Z" fill="#ffffff" />
      <g fill="#173F30">
        <path d="M640 470 L680 350 L720 470Z" />
        <path d="M650 420 L680 320 L710 420Z" />
        <path d="M1200 460 L1240 330 L1280 460Z" />
      </g>
      <g fill="#2E7A5B">
        <path d="M720 470 L770 320 L820 470Z" />
        <path d="M735 410 L770 290 L805 410Z" />
        <path d="M1090 460 L1150 290 L1210 460Z" />
        <path d="M1108 390 L1150 260 L1192 390Z" />
      </g>
      <g fill="#ffffff" opacity=".9">
        <path d="M752 360 L770 340 L788 360Z" />
        <path d="M1132 330 L1150 308 L1168 330Z" />
      </g>
      <g transform="translate(950 120)">
        <ellipse cx="0" cy="330" rx="140" ry="16" fill="#1D2B26" opacity=".18" />
        <path d="M-120 330 Q-134 170 0 158 Q134 170 120 330Z" fill="#B8312F" />
        <rect x="-122" y="262" width="244" height="26" rx="5" fill="#1D2B26" />
        <rect
          x="-20"
          y="257"
          width="40"
          height="36"
          rx="6"
          fill="none"
          stroke="#D4A23C"
          strokeWidth="6"
        />
        <path
          d="M-120 200 Q-160 210 -150 262"
          stroke="#B8312F"
          strokeWidth="34"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="-150" cy="268" r="20" fill="#1D2B26" />
        <path
          d="M120 200 Q170 190 176 150"
          stroke="#B8312F"
          strokeWidth="34"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="178" cy="140" r="20" fill="#1D2B26" />
        <g transform="translate(184 92)">
          <clipPath id="xmas-star">
            <path d={STAR} />
          </clipPath>
          <path d={STAR} fill="#E8B84A" />
          <g clipPath="url(#xmas-star)" stroke="#C4932C" strokeWidth="1.6">
            {[-32, -20, -8, 4, 16, 28].map((y) => (
              <path key={y} d={`M-46 ${y} H46`} />
            ))}
          </g>
        </g>
        <circle cx="0" cy="96" r="58" fill="#F3C8A6" />
        <circle cx="-36" cy="110" r="10" fill="#EE9C94" opacity=".75" />
        <circle cx="36" cy="110" r="10" fill="#EE9C94" opacity=".75" />
        <g fill="#ffffff">
          <path d="M-60 104 C-66 152 -50 198 -20 226 Q0 240 20 226 C50 198 66 152 60 104 Q42 132 0 132 Q-42 132 -60 104Z" />
          {[
            [-58, 122, 15],
            [-58, 150, 17],
            [-48, 178, 18],
            [-32, 204, 18],
            [-12, 222, 16],
            [58, 122, 15],
            [58, 150, 17],
            [48, 178, 18],
            [32, 204, 18],
            [12, 222, 16],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
        <g stroke="#DCE3E0" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M-40 160 q6 10 0 20" />
          <path d="M-18 186 q6 10 0 20" />
          <path d="M18 186 q-6 10 0 20" />
          <path d="M40 160 q-6 10 0 20" />
          <path d="M0 170 q6 10 0 20" />
        </g>
        <ellipse cx="0" cy="140" rx="9" ry="6" fill="#9C3A34" />
        <path
          d="M0 120 C-8 110 -32 108 -46 122 C-36 122 -22 132 -8 131 Q-2 129 0 124 Q2 129 8 131 C22 132 36 122 46 122 C32 108 8 110 0 120Z"
          fill="#ffffff"
        />
        <path d="M-46 122 C-36 122 -22 132 -8 131" stroke="#DCE3E0" strokeWidth="2.5" fill="none" />
        <path d="M46 122 C36 122 22 132 8 131" stroke="#DCE3E0" strokeWidth="2.5" fill="none" />
        <circle cx="0" cy="112" r="9" fill="#E59A8A" />
        <circle cx="-20" cy="88" r="5.5" fill="#1D2B26" />
        <circle cx="20" cy="88" r="5.5" fill="#1D2B26" />
        <path
          d="M-30 76 Q-20 70 -10 76 M10 76 Q20 70 30 76"
          stroke="#ffffff"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M-64 58 Q-56 -18 26 -36 Q82 -44 96 12 L72 52Z" fill="#B8312F" />
        <rect x="-72" y="46" width="144" height="26" rx="13" fill="#ffffff" />
        <circle cx="98" cy="16" r="18" fill="#ffffff" />
      </g>
    </>
  );
}

function Effects() {
  return (
    <>
      {spread(20).map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute top-0 rounded-full bg-white"
          style={{
            left: p.left,
            width: 4 + p.size * 2,
            height: 4 + p.size * 2,
            opacity: 0.9,
            animation: `pb-snow ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </>
  );
}

export const christmas: Theme = {
  key: 'christmas',
  loadFont: () => import('@fontsource/playfair-display/700-italic.css'),
  heading: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontStyle: 'italic',
    fontWeight: 700,
  },
  dark: false,
  vars: {
    '--t-bg': '#F3F1EA',
    '--t-ink': '#1D2B26',
    '--t-muted': '#4E5F58',
    '--t-line': '#E4E1D6',
    '--t-header': '#ffffff',
    '--t-hero': '#1F5641',
    '--t-hero-ink': '#ffffff',
    '--t-hero-muted': '#E4EFE9',
    '--t-eyebrow': '#F3D99B',
    '--t-heading': '#1F5641',
    '--t-accent': '#1F5641',
    '--t-on-accent': '#ffffff',
    '--t-hero-cta': '#ffffff',
    '--t-on-hero-cta': '#1F5641',
    '--t-card': '#ffffff',
    '--t-card-line': 'transparent',
    '--t-media': '#E6EEE9',
    '--t-price': '#1F5641',
    '--t-badge': '#1F5641',
    '--t-on-badge': '#ffffff',
    '--t-wa': '#B8312F',
    '--t-on-wa': '#ffffff',
    '--t-wa-ring': '#D4A23C',
  },
  Illustration,
  Effects,
  strip: {
    title: { pt: 'Presente com o nome de cada um', en: 'A gift with everyone’s name' },
    text: {
      pt: 'Kits para a família toda ou para a empresa: fale com a gente cedo para chegar a tempo.',
      en: 'Sets for the whole family or the office: talk to us early so they arrive in time.',
    },
  },
  StripMark: () => (
    <svg width="56" height="56" viewBox="-50 -50 100 100" aria-hidden="true">
      <path
        d={STAR}
        fill="none"
        stroke="#B8312F"
        strokeWidth="5"
        strokeLinejoin="round"
        strokeDasharray="12 8"
      />
    </svg>
  ),
};

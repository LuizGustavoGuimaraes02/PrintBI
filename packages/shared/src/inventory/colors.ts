/**
 * Filament color catalog: static data, so it costs nothing in the database.
 * Each color has a finish and either one hex value or several stops (multi-color,
 * rainbow, gradients). A custom hex color is always allowed on top of this list.
 */

export const COLOR_FAMILIES = [
  'white',
  'gray',
  'black',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'brown',
  'metallic',
  'multi',
  'clear',
] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];

export const COLOR_FINISHES = [
  'basic',
  'matte',
  'silk',
  'metallic',
  'neon',
  'glow',
  'translucent',
  'marble',
  'sparkle',
  'wood',
  'carbon',
  'multicolor',
  'color-change',
] as const;
export type ColorFinish = (typeof COLOR_FINISHES)[number];

export interface FilamentColor {
  key: string;
  name: string;
  family: ColorFamily;
  finish: ColorFinish;
  /** One color for solid filaments; two or more for multi-color and gradients. */
  stops: string[];
}

type Row = [name: string, stops: string | string[], family: ColorFamily, finish: ColorFinish];

const ROWS: Row[] = [
  // Basic whites, grays and blacks
  ['White', '#F5F5F2', 'white', 'basic'],
  ['Cold White', '#EEF2F5', 'white', 'basic'],
  ['Ivory', '#F2EBD3', 'white', 'basic'],
  ['Bone White', '#E9E2CF', 'white', 'basic'],
  ['Cream', '#EFE3C2', 'white', 'basic'],
  ['Light Gray', '#C8CCCF', 'gray', 'basic'],
  ['Gray', '#8E9399', 'gray', 'basic'],
  ['Silver Gray', '#A9ADB1', 'gray', 'basic'],
  ['Dark Gray', '#4A4F55', 'gray', 'basic'],
  ['Charcoal', '#2E3236', 'black', 'basic'],
  ['Black', '#1F2328', 'black', 'basic'],
  ['Jet Black', '#0E0F11', 'black', 'basic'],
  // Reds
  ['Red', '#C8102E', 'red', 'basic'],
  ['Bright Red', '#E1251B', 'red', 'basic'],
  ['Cherry', '#9E1B32', 'red', 'basic'],
  ['Burgundy', '#6D1A2E', 'red', 'basic'],
  ['Wine', '#5A1A2B', 'red', 'basic'],
  ['Coral', '#F26B5B', 'red', 'basic'],
  ['Salmon', '#F59A8B', 'red', 'basic'],
  ['Terracotta', '#C65D3B', 'red', 'basic'],
  ['Brick', '#9C3D2E', 'red', 'basic'],
  // Oranges
  ['Orange', '#F37021', 'orange', 'basic'],
  ['Bright Orange', '#FF7A1A', 'orange', 'basic'],
  ['Tangerine', '#F28C28', 'orange', 'basic'],
  ['Amber', '#F2A93B', 'orange', 'basic'],
  ['Peach', '#F7B58C', 'orange', 'basic'],
  ['Pumpkin', '#E66A1F', 'orange', 'basic'],
  // Yellows
  ['Yellow', '#F7D117', 'yellow', 'basic'],
  ['Lemon', '#F5E663', 'yellow', 'basic'],
  ['Sunflower', '#F5B700', 'yellow', 'basic'],
  ['Mustard', '#D4A017', 'yellow', 'basic'],
  ['Pastel Yellow', '#F8EDA2', 'yellow', 'basic'],
  ['Gold Yellow', '#E8B923', 'yellow', 'basic'],
  // Greens
  ['Green', '#2E9E4F', 'green', 'basic'],
  ['Grass Green', '#4CAF50', 'green', 'basic'],
  ['Lime', '#A4D233', 'green', 'basic'],
  ['Mint', '#9FE2BF', 'green', 'basic'],
  ['Pastel Green', '#B8E3B0', 'green', 'basic'],
  ['Sage', '#9CAF88', 'green', 'basic'],
  ['Olive', '#6B7A2A', 'green', 'basic'],
  ['Army Green', '#4B5320', 'green', 'basic'],
  ['Forest Green', '#1F5A3A', 'green', 'basic'],
  ['Dark Green', '#1B4332', 'green', 'basic'],
  ['Emerald', '#009B77', 'green', 'basic'],
  ['Jade', '#00A86B', 'green', 'basic'],
  ['Teal', '#0B7A75', 'green', 'basic'],
  ['Pine', '#2B5B4E', 'green', 'basic'],
  // Blues
  ['Blue', '#1F5FBF', 'blue', 'basic'],
  ['Royal Blue', '#2A4FB0', 'blue', 'basic'],
  ['Cobalt', '#0047AB', 'blue', 'basic'],
  ['Navy', '#1D2A4D', 'blue', 'basic'],
  ['Ocean Blue', '#1B6CA8', 'blue', 'basic'],
  ['Steel Blue', '#4A7398', 'blue', 'basic'],
  ['Sky Blue', '#6FB7E8', 'blue', 'basic'],
  ['Light Blue', '#A7D3F2', 'blue', 'basic'],
  ['Baby Blue', '#BFDDF4', 'blue', 'basic'],
  ['Pastel Blue', '#AFCBEA', 'blue', 'basic'],
  ['Ice Blue', '#D6EEF8', 'blue', 'basic'],
  ['Cyan', '#11B5C9', 'blue', 'basic'],
  ['Turquoise', '#2BC4B4', 'blue', 'basic'],
  // Purples
  ['Purple', '#6E3FA3', 'purple', 'basic'],
  ['Violet', '#7F4BC7', 'purple', 'basic'],
  ['Grape', '#5B2A86', 'purple', 'basic'],
  ['Plum', '#6B2D5C', 'purple', 'basic'],
  ['Lavender', '#B9A3DC', 'purple', 'basic'],
  ['Lilac', '#C8A2C8', 'purple', 'basic'],
  ['Pastel Purple', '#CDB4DB', 'purple', 'basic'],
  ['Magenta', '#C2187A', 'purple', 'basic'],
  // Pinks
  ['Pink', '#F06FA4', 'pink', 'basic'],
  ['Hot Pink', '#FF2E93', 'pink', 'basic'],
  ['Fuchsia', '#D3168C', 'pink', 'basic'],
  ['Bubblegum', '#FF85B3', 'pink', 'basic'],
  ['Rose', '#E8758F', 'pink', 'basic'],
  ['Blush', '#F4C2C2', 'pink', 'basic'],
  ['Sakura', '#F7B7C9', 'pink', 'basic'],
  ['Pastel Pink', '#F8C8DC', 'pink', 'basic'],
  // Browns and neutrals
  ['Brown', '#6F4E37', 'brown', 'basic'],
  ['Chocolate', '#4E2E1E', 'brown', 'basic'],
  ['Coffee', '#5B3A29', 'brown', 'basic'],
  ['Caramel', '#A9652E', 'brown', 'basic'],
  ['Tan', '#C8A27A', 'brown', 'basic'],
  ['Beige', '#D9C3A0', 'brown', 'basic'],
  ['Sand', '#CBB28B', 'brown', 'basic'],
  ['Khaki', '#B3A06B', 'brown', 'basic'],
  ['Nude', '#E2B79C', 'brown', 'basic'],
  // Matte
  ['Matte White', '#ECEBE6', 'white', 'matte'],
  ['Matte Ivory', '#E9E0C8', 'white', 'matte'],
  ['Matte Light Gray', '#BFC3C5', 'gray', 'matte'],
  ['Matte Gray', '#868B90', 'gray', 'matte'],
  ['Matte Charcoal', '#34383C', 'black', 'matte'],
  ['Matte Black', '#232528', 'black', 'matte'],
  ['Matte Red', '#B42A2F', 'red', 'matte'],
  ['Matte Terracotta', '#B9634A', 'red', 'matte'],
  ['Matte Orange', '#E0702C', 'orange', 'matte'],
  ['Matte Yellow', '#E8C547', 'yellow', 'matte'],
  ['Matte Green', '#3D8B57', 'green', 'matte'],
  ['Matte Army Green', '#545B34', 'green', 'matte'],
  ['Matte Blue', '#2E5E9E', 'blue', 'matte'],
  ['Matte Navy', '#25304D', 'blue', 'matte'],
  ['Matte Ice Blue', '#C9DDE6', 'blue', 'matte'],
  ['Matte Purple', '#6A4C93', 'purple', 'matte'],
  ['Matte Pink', '#E592B1', 'pink', 'matte'],
  ['Matte Beige', '#CDB898', 'brown', 'matte'],
  ['Matte Chocolate', '#553826', 'brown', 'matte'],
  // Silk (single color)
  ['Silk White', '#F2F0EA', 'white', 'silk'],
  ['Silk Silver', '#C0C4C8', 'metallic', 'silk'],
  ['Silk Gold', '#D4A537', 'metallic', 'silk'],
  ['Silk Champagne', '#E3C99A', 'metallic', 'silk'],
  ['Silk Copper', '#B8733A', 'metallic', 'silk'],
  ['Silk Bronze', '#9C6B30', 'metallic', 'silk'],
  ['Silk Rose Gold', '#D9A08A', 'metallic', 'silk'],
  ['Silk Black', '#22252A', 'black', 'silk'],
  ['Silk Red', '#C0283A', 'red', 'silk'],
  ['Silk Orange', '#E8762F', 'orange', 'silk'],
  ['Silk Yellow', '#EBC33A', 'yellow', 'silk'],
  ['Silk Green', '#2FA35B', 'green', 'silk'],
  ['Silk Mint', '#8FD8B8', 'green', 'silk'],
  ['Silk Blue', '#2F6FD1', 'blue', 'silk'],
  ['Silk Sky Blue', '#7EBBE6', 'blue', 'silk'],
  ['Silk Purple', '#8A4FC9', 'purple', 'silk'],
  ['Silk Pink', '#E46AA0', 'pink', 'silk'],
  // Metallic
  ['Gold', '#C9A227', 'metallic', 'metallic'],
  ['Silver', '#B7BABD', 'metallic', 'metallic'],
  ['Copper', '#B87333', 'metallic', 'metallic'],
  ['Bronze', '#8C6239', 'metallic', 'metallic'],
  ['Brass', '#B5A642', 'metallic', 'metallic'],
  ['Rose Gold', '#B76E79', 'metallic', 'metallic'],
  ['Titanium', '#8A8D8F', 'metallic', 'metallic'],
  ['Gunmetal', '#53565A', 'metallic', 'metallic'],
  ['Metallic Blue', '#3A5BA0', 'metallic', 'metallic'],
  ['Metallic Red', '#9B2335', 'metallic', 'metallic'],
  ['Metallic Green', '#2E6B4F', 'metallic', 'metallic'],
  // Neon and fluorescent
  ['Fluorescent Green', '#39FF14', 'green', 'neon'],
  ['Neon Yellow', '#DFFF00', 'yellow', 'neon'],
  ['Fluorescent Orange', '#FF5F1F', 'orange', 'neon'],
  ['Fluorescent Red', '#FF3131', 'red', 'neon'],
  ['Neon Pink', '#FF10F0', 'pink', 'neon'],
  ['Fluorescent Pink', '#FF48A5', 'pink', 'neon'],
  ['Neon Blue', '#1F51FF', 'blue', 'neon'],
  ['Neon Purple', '#B026FF', 'purple', 'neon'],
  // Glow in the dark
  ['Glow Green', '#B4F5A0', 'green', 'glow'],
  ['Glow Blue', '#9AD8F5', 'blue', 'glow'],
  ['Glow White', '#E9F5E4', 'white', 'glow'],
  ['Glow Orange', '#FFD0A0', 'orange', 'glow'],
  ['Glow Purple', '#D7B8F5', 'purple', 'glow'],
  // Translucent
  ['Clear', '#E6F0F2', 'clear', 'translucent'],
  ['Smoke Gray', '#7C8388', 'clear', 'translucent'],
  ['Transparent Red', '#E2404F', 'clear', 'translucent'],
  ['Transparent Orange', '#F59A3C', 'clear', 'translucent'],
  ['Transparent Yellow', '#F5DB4C', 'clear', 'translucent'],
  ['Transparent Green', '#4CC27A', 'clear', 'translucent'],
  ['Transparent Blue', '#3D8BE0', 'clear', 'translucent'],
  ['Transparent Purple', '#9B6BD6', 'clear', 'translucent'],
  ['Transparent Pink', '#F27BB5', 'clear', 'translucent'],
  // Marble and stone
  ['Marble White', '#E4E1DA', 'white', 'marble'],
  ['Marble Gray', '#A3A39C', 'gray', 'marble'],
  ['Granite', '#7D7F7D', 'gray', 'marble'],
  ['Stone Gray', '#9A9A92', 'gray', 'marble'],
  ['Terrazzo', '#D8D2C4', 'white', 'marble'],
  // Sparkle and galaxy
  ['Galaxy Black', '#1E1F2B', 'black', 'sparkle'],
  ['Galaxy Blue', '#233A75', 'blue', 'sparkle'],
  ['Galaxy Purple', '#3B2463', 'purple', 'sparkle'],
  ['Galaxy Green', '#1F4D3A', 'green', 'sparkle'],
  ['Sparkle Red', '#8E1B2C', 'red', 'sparkle'],
  ['Sparkle Silver', '#AEB2B6', 'metallic', 'sparkle'],
  // Wood
  ['Light Wood', '#D8B48A', 'brown', 'wood'],
  ['Bamboo', '#D6C08A', 'brown', 'wood'],
  ['Cherry Wood', '#9B5A3C', 'brown', 'wood'],
  ['Walnut', '#6B4A2F', 'brown', 'wood'],
  ['Ebony', '#3B2A1F', 'brown', 'wood'],
  // Carbon fiber
  ['Carbon Black', '#2A2C2E', 'black', 'carbon'],
  ['Carbon Gray', '#4F5357', 'gray', 'carbon'],
  // Dual and tri-color silk, rainbow and gradients
  ['Silk Gold & Silver', ['#D4A537', '#C0C4C8'], 'multi', 'multicolor'],
  ['Silk Red & Gold', ['#C0283A', '#D4A537'], 'multi', 'multicolor'],
  ['Silk Black & Red', ['#22252A', '#C0283A'], 'multi', 'multicolor'],
  ['Silk Blue & Green', ['#2F6FD1', '#2FA35B'], 'multi', 'multicolor'],
  ['Silk Blue & Purple', ['#2F6FD1', '#8A4FC9'], 'multi', 'multicolor'],
  ['Silk Pink & Purple', ['#E46AA0', '#8A4FC9'], 'multi', 'multicolor'],
  ['Silk Copper & Green', ['#B8733A', '#2E6B4F'], 'multi', 'multicolor'],
  ['Silk Black & Gold', ['#22252A', '#D4A537'], 'multi', 'multicolor'],
  ['Silk Red, Gold & Purple', ['#C0283A', '#D4A537', '#8A4FC9'], 'multi', 'multicolor'],
  ['Silk Blue, Green & Purple', ['#2F6FD1', '#2FA35B', '#8A4FC9'], 'multi', 'multicolor'],
  ['Silk Red, Green & Blue', ['#C0283A', '#2FA35B', '#2F6FD1'], 'multi', 'multicolor'],
  [
    'Rainbow',
    ['#E1251B', '#F37021', '#F7D117', '#2E9E4F', '#1F5FBF', '#6E3FA3'],
    'multi',
    'multicolor',
  ],
  [
    'Pastel Rainbow',
    ['#F8C8DC', '#F7B58C', '#F8EDA2', '#B8E3B0', '#AFCBEA', '#CDB4DB'],
    'multi',
    'multicolor',
  ],
  [
    'Silk Rainbow',
    ['#C0283A', '#E8762F', '#EBC33A', '#2FA35B', '#2F6FD1', '#8A4FC9'],
    'multi',
    'multicolor',
  ],
  ['Sunset Gradient', ['#FF5E3A', '#FF9F1C', '#F7D117'], 'multi', 'multicolor'],
  ['Ocean Gradient', ['#0B3D91', '#1B6CA8', '#2BC4B4'], 'multi', 'multicolor'],
  ['Forest Gradient', ['#1B4332', '#2E9E4F', '#A4D233'], 'multi', 'multicolor'],
  ['Candy Gradient', ['#FF85B3', '#B9A3DC', '#A7D3F2'], 'multi', 'multicolor'],
  ['Fire Gradient', ['#9E1B32', '#E1251B', '#FF7A1A'], 'multi', 'multicolor'],
  // Color change
  ['Temperature Change Blue to White', ['#2F6FD1', '#F5F5F2'], 'multi', 'color-change'],
  ['Temperature Change Purple to Pink', ['#6E3FA3', '#F06FA4'], 'multi', 'color-change'],
  ['Temperature Change Green to Yellow', ['#2E9E4F', '#F7D117'], 'multi', 'color-change'],
  ['UV Change White to Purple', ['#F5F5F2', '#8A4FC9'], 'multi', 'color-change'],
  ['UV Change White to Pink', ['#F5F5F2', '#F06FA4'], 'multi', 'color-change'],
];

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const FILAMENT_COLORS: readonly FilamentColor[] = ROWS.map(
  ([name, stops, family, finish]) => ({
    key: slug(name),
    name,
    family,
    finish,
    stops: Array.isArray(stops) ? stops : [stops],
  }),
);

const BY_KEY = new Map(FILAMENT_COLORS.map((color) => [color.key, color]));

export function findColor(key: string | null | undefined): FilamentColor | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Every typed word must match the name, family or finish ("silk gold", "neon", "pink matte"). */
export function searchColors(
  query: string,
  colors: readonly FilamentColor[] = FILAMENT_COLORS,
): FilamentColor[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...colors];
  return colors.filter((color) => {
    const haystack = fold(`${color.name} ${color.family} ${color.finish}`);
    return words.every((word) => haystack.includes(word));
  });
}

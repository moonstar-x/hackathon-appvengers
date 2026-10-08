// Brand tiles served by smartclub.ec (389×389 squircles, logo included). Keyed by businessId;
// a business without an entry, or whose image fails to load, falls back to a text tile.
const base = 'https://smartclub.ec/wp-content/uploads/2026/04/';
export const brandLogos: Record<string, string> = {
  'farmacias-economicas': base + 'economicas-1.png',
  medicity: base + 'medicity-1.png',
  wellderma: base + 'wellderma-1.png',
  mascotas: base + 'mascotas-1.png',
  ambiente: base + 'ambiente-1.png',
};

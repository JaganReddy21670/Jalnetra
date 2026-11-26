/** Pull "lat, lng" out of free text like "Hostel roof (GPS 17.44500, 78.34900)". */
export function parseGps(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

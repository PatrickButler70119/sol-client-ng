export const KNT_MS = 1.94384449;

export function UVtoTwdTws(uv) {
  let twd = -Math.atan2(uv[1], uv[0]) - Math.PI / 2;
  if (twd < 0) {
    twd += Math.PI * 2;
  }
  const tws = Math.hypot(uv[0], uv[1]);
  
  return [twd, tws];
}

export function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

export function degToRad(deg) {
  return deg * Math.PI / 180;
}

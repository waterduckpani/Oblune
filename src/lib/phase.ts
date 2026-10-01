// The Oblune moon. The logo's crescent is one phase of a continuous family:
// a disc (r 35) with a window where the inner disc (r 24) lies on the dark side
// of a terminator ellipse with semi-axes (A, 29.5). A runs from -24 (new moon,
// the ring alone) through 0 (half) to +24 (full, a solid disc). The logo is A = 12.

export const R_OUT = 35;
export const R_IN = 24;
export const RY = 29.5;

/** Phase as a 0..1 illumination value, 0 = new, 1 = full. The logo sits at 0.75. */
export const toA = (lit: number) => (lit * 2 - 1) * R_IN;
export const toLit = (A: number) => (A / R_IN + 1) / 2;

/** Shader units are normalised to the outer radius. */
export const PHASE_NEW = -R_IN / R_OUT;
export const PHASE_LOGO = 12 / R_OUT;
export const PHASE_FULL = R_IN / R_OUT;
export const litToShader = (lit: number) => toA(lit) / R_OUT;

const f = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** SVG path data (evenodd) for the emblem at a given illumination, centred on 0,0, unrotated. */
export function emblemPath(lit: number): string {
  const outer = `M35 0A35 35 0 1 1 -35 0A35 35 0 1 1 35 0Z`;
  const A = toA(lit);
  if (A >= R_IN - 0.01) return outer; // full: no window
  if (A <= -R_IN + 0.01) {
    // new: the whole inner disc is the window
    return `${outer}M24 0A24 24 0 1 0 -24 0A24 24 0 1 0 24 0Z`;
  }
  const a = Math.max(Math.abs(A), 0.001);
  // where the terminator meets the inner circle
  const y2 = (R_IN * R_IN - a * a) / (1 - (a * a) / (RY * RY));
  const y = Math.sqrt(Math.max(Math.min(y2, R_IN * R_IN), 0));
  if (A >= 0) {
    // window is left of the left half of the ellipse: circle arc via the left, back along the ellipse
    const x = -Math.sqrt(Math.max(R_IN * R_IN - y * y, 0));
    return `${outer}M${f(x)} ${f(-y)}A24 24 0 0 0 ${f(x)} ${f(y)}A${f(a)} 29.5 0 0 1 ${f(x)} ${f(-y)}Z`;
  }
  // A < 0: window is left of the right half of the ellipse (more than half dark)
  const x = Math.sqrt(Math.max(R_IN * R_IN - y * y, 0));
  return `${outer}M${f(x)} ${f(-y)}A24 24 0 1 0 ${f(x)} ${f(y)}A${f(a)} 29.5 0 0 0 ${f(x)} ${f(-y)}Z`;
}

export type Phase = 'crescent' | 'half' | 'gibbous' | 'full';

export const PHASES: Record<Phase, { lit: number; label: string; meaning: string }> = {
  crescent: { lit: 0.3, label: 'In development', meaning: 'Still being built' },
  half: { lit: 0.5, label: 'Prototype', meaning: 'Works end to end, not yet public' },
  gibbous: { lit: 0.8, label: 'Ready to launch', meaning: 'Finished, waiting on the App Store' },
  full: { lit: 1, label: 'Live', meaning: 'Shipped and in use' },
};

/**
 * The lit part of a plain moon disc of radius r at a given illumination, lit from the right.
 * Used for the big coloured moons behind each project's devices.
 */
export function litPath(lit: number, r = 48): string {
  const l = Math.min(1, Math.max(0, lit));
  if (l <= 0.001) return '';
  if (l >= 0.999) return `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0Z`;
  const rx = Math.abs(1 - 2 * l) * r;
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${f(rx)} ${r} 0 0 ${l < 0.5 ? 0 : 1} 0 ${-r}Z`;
}

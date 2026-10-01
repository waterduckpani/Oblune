// Shared GLSL. The same studio lights every metal surface on the page:
// the raymarched moon evaluates it per pixel, the devices sample it through a PMREM.

export const ENV_GLSL = /* glsl */ `
float softbox(vec3 d, float az, float el, float w, float h, float soft) {
  float a = atan(d.x, d.z);
  float e = asin(clamp(d.y, -1.0, 1.0));
  float da = abs(a - az);
  da = min(da, 6.2831853 - da);
  return smoothstep(w + soft, w, da) * smoothstep(h + soft, h, abs(e - el));
}

// Azimuth 0 points back at the viewer, so front faces reflect what is "behind the camera".
vec3 studioEnv(vec3 d, vec2 light) {
  float y = d.y;
  vec3 col = mix(vec3(0.075, 0.078, 0.086), vec3(0.30, 0.31, 0.33), smoothstep(-0.55, 0.02, y));
  col = mix(col, vec3(0.86, 0.87, 0.89), smoothstep(0.05, 0.85, y));
  col += vec3(1.25) * exp(-pow((y - 0.035) / 0.03, 2.0));
  col += vec3(0.35) * exp(-pow((y - 0.035) / 0.12, 2.0));
  col += vec3(2.6) * softbox(d, -0.55 + light.x, 0.18 + light.y, 0.07, 0.62, 0.05);
  col += vec3(1.1) * softbox(d, 0.72 + light.x * 0.4, 0.1, 0.05, 0.5, 0.06);
  col += vec3(0.9) * softbox(d, 2.3, 0.25, 0.25, 0.4, 0.2);
  col += vec3(0.9) * softbox(d, -2.4, 0.2, 0.2, 0.45, 0.2);
  col *= 1.0 - 0.55 * softbox(d, 0.25, 0.0, 0.12, 0.9, 0.08);
  return col;
}
`;

export const SDF_GLSL = /* glsl */ `
const float R_IN = 24.0 / 35.0;
const float RY = 29.5 / 35.0;

// Exact ellipse SDF (Inigo Quilez)
float sdEllipse(vec2 p, vec2 ab) {
  p = abs(p);
  if (p.x > p.y) { p = p.yx; ab = ab.yx; }
  float l = ab.y * ab.y - ab.x * ab.x;
  float m = ab.x * p.x / l; float m2 = m * m;
  float n = ab.y * p.y / l; float n2 = n * n;
  float c = (m2 + n2 - 1.0) / 3.0; float c3 = c * c * c;
  float q = c3 + m2 * n2 * 2.0;
  float d = c3 + m2 * n2;
  float g = m + m * n2;
  float co;
  if (d < 0.0) {
    float h = acos(clamp(q / c3, -1.0, 1.0)) / 3.0;
    float s = cos(h); float t = sin(h) * sqrt(3.0);
    float rx = sqrt(max(-c * (s + t + 2.0) + m2, 0.0));
    float ry = sqrt(max(-c * (s - t + 2.0) + m2, 0.0));
    co = (ry + sign(l) * rx + abs(g) / (rx * ry) - m) / 2.0;
  } else {
    float h = 2.0 * m * n * sqrt(d);
    float s = sign(q + h) * pow(abs(q + h), 1.0 / 3.0);
    float u = sign(q - h) * pow(abs(q - h), 1.0 / 3.0);
    float rx = -s - u - c * 4.0 + 2.0 * m2;
    float ry = (s - u) * sqrt(3.0);
    float rm = sqrt(rx * rx + ry * ry);
    co = (ry / sqrt(rm - rx) + 2.0 * g / rm - m) / 2.0;
  }
  co = clamp(co, 0.0, 1.0);
  vec2 r = ab * vec2(co, sqrt(1.0 - co * co));
  return length(r - p) * sign(p.y - r.y);
}

// The emblem in 2D: outer disc minus the crescent window. A is the terminator semi-axis.
float sdEmblem2D(vec2 p, float A) {
  float a = max(abs(A), 0.002);
  float dE = sdEllipse(p, vec2(a, RY));
  float dDark = A >= 0.0 ? max(p.x, -dE) : min(p.x, dE);
  dDark = mix(dDark, p.x, smoothstep(0.03, 0.005, abs(A)));
  float dHole = max(length(p) - R_IN, dDark);
  return max(length(p) - 1.0, -dHole);
}
`;

/** Shared high-precision mercator → eye helper (split-double center). */
const mercToEyeGlsl = `
uniform vec2 u_center_hi;
uniform vec2 u_center_lo;
uniform float u_world_size;
uniform float u_wrap;

vec2 mercToEye(vec2 merc) {
  vec2 m = vec2(merc.x + u_wrap, merc.y);
  vec2 d = (m - u_center_hi) - u_center_lo;
  return d * u_world_size;
}
`;

export const fillVertexShader = `#version 300 es
precision highp float;

// Normalized mercator [0,1] — converted to eye space on the GPU.
in vec2 a_pos;
uniform mat4 u_matrix;
${mercToEyeGlsl}

void main() {
  gl_Position = u_matrix * vec4(mercToEye(a_pos), 0.0, 1.0);
}
`;

export const fillFragmentShader = `#version 300 es
precision highp float;

uniform vec4 u_color;
out vec4 outColor;

void main() {
  outColor = u_color;
}
`;

export const lineVertexShader = `#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_other;
in float a_side;

uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_width;
${mercToEyeGlsl}

out float v_dist;

void main() {
  vec2 eye = mercToEye(a_pos);
  vec2 eyeOther = mercToEye(a_other);
  vec4 clip = u_matrix * vec4(eye, 0.0, 1.0);
  vec4 clipOther = u_matrix * vec4(eyeOther, 0.0, 1.0);

  vec2 ndc = clip.xy / max(clip.w, 1e-6);
  vec2 ndcOther = clipOther.xy / max(clipOther.w, 1e-6);
  vec2 screenDelta = (ndcOther - ndc) * u_viewport;
  float len = length(screenDelta);
  vec2 screenDir = len > 1e-6 ? screenDelta / len : vec2(1.0, 0.0);
  vec2 screenNorm = vec2(-screenDir.y, screenDir.x);

  float halfWidth = u_width * 0.5;
  float aa = 1.0;
  float extrude = halfWidth + aa;
  clip.xy += screenNorm * a_side * extrude * clip.w * 2.0 / u_viewport;
  gl_Position = clip;
  v_dist = a_side * extrude;
}
`;

export const lineFragmentShader = `#version 300 es
precision highp float;

in float v_dist;
uniform vec4 u_color;
uniform float u_width;
out vec4 outColor;

void main() {
  float halfWidth = u_width * 0.5;
  float aa = 1.0;
  float alpha = 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(v_dist));
  outColor = vec4(u_color.rgb, u_color.a * alpha);
}
`;

export const circleVertexShader = `#version 300 es
precision highp float;

in vec2 a_center;
in vec2 a_corner;

uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_radius;
${mercToEyeGlsl}

out vec2 v_offset;

void main() {
  float aa = 1.0;
  float r = u_radius + aa;
  vec4 clip = u_matrix * vec4(mercToEye(a_center), 0.0, 1.0);
  clip.xy += a_corner * r * clip.w * 2.0 / u_viewport;
  gl_Position = clip;
  v_offset = a_corner * r;
}
`;

export const circleFragmentShader = `#version 300 es
precision highp float;

in vec2 v_offset;
uniform vec4 u_color;
uniform float u_radius;
out vec4 outColor;

void main() {
  float dist = length(v_offset);
  float aa = 1.0;
  float alpha = 1.0 - smoothstep(u_radius - aa, u_radius + aa, dist);
  if (alpha <= 0.0) discard;
  outColor = vec4(u_color.rgb, u_color.a * alpha);
}
`;

/** Split a float64 into float32 hi/lo for GPU double emulation. */
export function splitDouble(n: number): [number, number] {
  const hi = Math.fround(n);
  return [hi, n - hi];
}

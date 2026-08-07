export const tileVertexShader = `#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_uv;

uniform mat4 u_matrix;
uniform vec4 u_tile; // x, y, size, unused in world pixels
uniform vec4 u_uvRect; // u0, v0, u1, v1

out vec2 v_uv;

void main() {
  vec2 world = u_tile.xy + a_pos * u_tile.z;
  gl_Position = u_matrix * vec4(world, 0.0, 1.0);
  v_uv = mix(u_uvRect.xy, u_uvRect.zw, a_uv);
}
`;

export const tileFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;

out vec4 outColor;

void main() {
  vec4 color = texture(u_texture, v_uv);
  outColor = vec4(color.rgb, color.a * u_opacity);
}
`;

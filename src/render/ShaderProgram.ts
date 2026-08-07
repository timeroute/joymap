export class ShaderProgram {
  readonly program: WebGLProgram;
  private readonly _uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly _attributes = new Map<string, number>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertexSrc: string,
    fragmentSrc: string,
  ) {
    const vs = compile(gl, gl.VERTEX_SHADER, vertexSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create WebGL program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link failed: ${info}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  uniform(name: string): WebGLUniformLocation | null {
    if (!this._uniforms.has(name)) {
      this._uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this._uniforms.get(name) ?? null;
  }

  attribute(name: string): number {
    if (!this._attributes.has(name)) {
      this._attributes.set(name, this.gl.getAttribLocation(this.program, name));
    }
    return this._attributes.get(name) ?? -1;
  }

  destroy(): void {
    this.gl.deleteProgram(this.program);
  }
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

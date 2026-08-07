import type { Transform } from "../camera/Transform";
import type { TileEntry } from "../source/TileCache";
import { ShaderProgram } from "./ShaderProgram";
import { tileFragmentShader, tileVertexShader } from "./shaders/tile";

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private _program!: ShaderProgram;
  private _vao!: WebGLVertexArrayObject;
  private _quad!: WebGLBuffer;
  private _dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this._initGpu();
  }

  /** Rebuild programs/buffers after webglcontextrestored. */
  reinitialize(): void {
    this._disposeGpu(false);
    this._initGpu();
  }

  setPixelRatio(dpr: number): void {
    this._dpr = dpr;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = Math.max(1, Math.round(cssWidth * this._dpr));
    const h = Math.max(1, Math.round(cssHeight * this._dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  clear(r = 0.93, g = 0.94, b = 0.96, a = 1): void {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  ensureTexture(entry: TileEntry): WebGLTexture | null {
    if (entry.texture) return entry.texture;
    if (!entry.image) return null;
    const gl = this.gl;
    const image = entry.image;
    let texture: WebGLTexture | null = null;
    try {
      texture = gl.createTexture();
      if (!texture) return null;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      entry.texture = texture;
      image.close();
      if (entry.image === image) entry.image = null;
      return texture;
    } catch (err) {
      if (texture) gl.deleteTexture(texture);
      entry.texture = null;
      console.warn("[joymap] texture upload failed", err);
      return null;
    }
  }

  drawTiles(
    transform: Transform,
    tiles: Array<{
      entry: TileEntry;
      worldX: number;
      worldY: number;
      size: number;
      uvRect?: [number, number, number, number];
    }>,
    opacity = 1,
  ): void {
    const gl = this.gl;
    this._program.use();
    gl.bindVertexArray(this._vao);

    const matrix = transform.getProjectionMatrix();
    gl.uniformMatrix4fv(this._program.uniform("u_matrix"), false, matrix);
    gl.uniform1f(this._program.uniform("u_opacity"), opacity);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this._program.uniform("u_texture"), 0);

    for (const tile of tiles) {
      const texture = this.ensureTexture(tile.entry);
      if (!texture) continue;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform4f(
        this._program.uniform("u_tile"),
        tile.worldX,
        tile.worldY,
        tile.size,
        0,
      );
      const uv = tile.uvRect ?? [0, 0, 1, 1];
      gl.uniform4f(
        this._program.uniform("u_uvRect"),
        uv[0],
        uv[1],
        uv[2],
        uv[3],
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.bindVertexArray(null);
  }

  destroy(): void {
    this._disposeGpu(true);
  }

  private _initGpu(): void {
    const gl = this.gl;
    this._program = new ShaderProgram(gl, tileVertexShader, tileFragmentShader);

    const vao = gl.createVertexArray();
    const quad = gl.createBuffer();
    if (!vao || !quad) throw new Error("Failed to allocate GL buffers");
    this._vao = vao;
    this._quad = quad;

    const data = new Float32Array([
      0, 0, 0, 0,
      1, 0, 1, 0,
      0, 1, 0, 1,
      1, 1, 1, 1,
    ]);

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    const aPos = this._program.attribute("a_pos");
    const aUv = this._program.attribute("a_uv");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private _disposeGpu(callDelete: boolean): void {
    if (!callDelete) return;
    const gl = this.gl;
    try {
      gl.deleteBuffer(this._quad);
      gl.deleteVertexArray(this._vao);
      this._program.destroy();
    } catch {
      // Context may already be lost.
    }
  }
}

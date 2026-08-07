import type { Transform } from "../camera/Transform";
import type { FillMesh, LineMesh } from "../source/GeoJSONSource";
import { ShaderProgram } from "./ShaderProgram";
import {
  circleFragmentShader,
  circleVertexShader,
  fillFragmentShader,
  fillVertexShader,
  lineFragmentShader,
  lineVertexShader,
  splitDouble,
} from "./shaders/vector";

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const CIRCLE_CORNERS: ReadonlyArray<[number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

export class VectorRenderer {
  private _fillProg!: ShaderProgram;
  private _lineProg!: ShaderProgram;
  private _circleProg!: ShaderProgram;
  private _fillVao!: WebGLVertexArrayObject;
  private _fillVbo!: WebGLBuffer;
  private _fillIbo!: WebGLBuffer;
  private _lineVao!: WebGLVertexArrayObject;
  private _lineVbo!: WebGLBuffer;
  private _circleVao!: WebGLVertexArrayObject;
  private _circleVbo!: WebGLBuffer;
  /** Scratch for expanding circle quads (merc + corner). */
  private _scratch = new Float32Array(0);
  /** Avoid re-uploading when the same typed array is drawn again. */
  private _fillVboData: Float32Array | null = null;
  private _fillIboIndices: Uint32Array | null = null;
  private _lineVboData: Float32Array | null = null;
  private _circlePoints: ReadonlyArray<{ x: number; y: number }> | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this._initGpu();
  }

  /** Rebuild programs/buffers after webglcontextrestored. */
  reinitialize(): void {
    this._fillVboData = null;
    this._fillIboIndices = null;
    this._lineVboData = null;
    this._circlePoints = null;
    this._initGpu();
  }

  private _initGpu(): void {
    const gl = this.gl;
    this._fillProg = new ShaderProgram(gl, fillVertexShader, fillFragmentShader);
    this._lineProg = new ShaderProgram(gl, lineVertexShader, lineFragmentShader);
    this._circleProg = new ShaderProgram(
      gl,
      circleVertexShader,
      circleFragmentShader,
    );

    const fillVao = gl.createVertexArray();
    const fillVbo = gl.createBuffer();
    const fillIbo = gl.createBuffer();
    const lineVao = gl.createVertexArray();
    const lineVbo = gl.createBuffer();
    const circleVao = gl.createVertexArray();
    const circleVbo = gl.createBuffer();
    if (
      !fillVao ||
      !fillVbo ||
      !fillIbo ||
      !lineVao ||
      !lineVbo ||
      !circleVao ||
      !circleVbo
    ) {
      throw new Error("Failed to allocate vector GL buffers");
    }
    this._fillVao = fillVao;
    this._fillVbo = fillVbo;
    this._fillIbo = fillIbo;
    this._lineVao = lineVao;
    this._lineVbo = lineVbo;
    this._circleVao = circleVao;
    this._circleVbo = circleVbo;

    gl.bindVertexArray(fillVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fillVbo);
    const aFillPos = this._fillProg.attribute("a_pos");
    gl.enableVertexAttribArray(aFillPos);
    gl.vertexAttribPointer(aFillPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fillIbo);
    gl.bindVertexArray(null);

    gl.bindVertexArray(lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
    const aPos = this._lineProg.attribute("a_pos");
    const aOther = this._lineProg.attribute("a_other");
    const aSide = this._lineProg.attribute("a_side");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(aOther);
    gl.vertexAttribPointer(aOther, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(aSide);
    gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null);

    gl.bindVertexArray(circleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, circleVbo);
    const aCenter = this._circleProg.attribute("a_center");
    const aCorner = this._circleProg.attribute("a_corner");
    gl.enableVertexAttribArray(aCenter);
    gl.vertexAttribPointer(aCenter, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  drawFills(
    transform: Transform,
    meshes: readonly FillMesh[],
    wraps: number[],
    color: Rgba,
  ): void {
    if (meshes.length === 0) return;
    const gl = this.gl;
    const prog = this._fillProg;
    prog.use();
    gl.bindVertexArray(this._fillVao);
    gl.uniformMatrix4fv(
      prog.uniform("u_matrix"),
      false,
      transform.getProjectionMatrix(),
    );
    gl.uniform4f(prog.uniform("u_color"), color.r, color.g, color.b, color.a);
    this._bindMercUniforms(prog, transform);

    for (const mesh of meshes) {
      if (this._fillVboData !== mesh.positions) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this._fillVbo);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
        this._fillVboData = mesh.positions;
      }
      if (this._fillIboIndices !== mesh.indices) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._fillIbo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        this._fillIboIndices = mesh.indices;
      }
      for (const wrap of wraps) {
        gl.uniform1f(prog.uniform("u_wrap"), wrap);
        gl.drawElements(
          gl.TRIANGLES,
          mesh.indices.length,
          gl.UNSIGNED_INT,
          0,
        );
      }
    }
    gl.bindVertexArray(null);
  }

  drawLines(
    transform: Transform,
    meshes: readonly LineMesh[],
    wraps: number[],
    color: Rgba,
    widthPx: number,
  ): void {
    if (meshes.length === 0) return;
    const gl = this.gl;
    const prog = this._lineProg;
    prog.use();
    gl.bindVertexArray(this._lineVao);
    gl.uniformMatrix4fv(
      prog.uniform("u_matrix"),
      false,
      transform.getProjectionMatrix(),
    );
    gl.uniform2f(prog.uniform("u_viewport"), transform.width, transform.height);
    gl.uniform1f(prog.uniform("u_width"), widthPx);
    gl.uniform4f(prog.uniform("u_color"), color.r, color.g, color.b, color.a);
    this._bindMercUniforms(prog, transform);

    for (const mesh of meshes) {
      if (this._lineVboData !== mesh.vertices) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lineVbo);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        this._lineVboData = mesh.vertices;
      }
      for (const wrap of wraps) {
        gl.uniform1f(prog.uniform("u_wrap"), wrap);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      }
    }
    gl.bindVertexArray(null);
  }

  drawCircles(
    transform: Transform,
    points: ReadonlyArray<{ x: number; y: number }>,
    wraps: number[],
    color: Rgba,
    radiusPx: number,
  ): void {
    if (points.length === 0) return;
    const gl = this.gl;
    const prog = this._circleProg;
    prog.use();
    gl.bindVertexArray(this._circleVao);
    gl.uniformMatrix4fv(
      prog.uniform("u_matrix"),
      false,
      transform.getProjectionMatrix(),
    );
    gl.uniform2f(prog.uniform("u_viewport"), transform.width, transform.height);
    gl.uniform1f(prog.uniform("u_radius"), radiusPx);
    gl.uniform4f(prog.uniform("u_color"), color.r, color.g, color.b, color.a);
    this._bindMercUniforms(prog, transform);

    if (this._circlePoints !== points) {
      const eye = this._ensureScratch(points.length * 6 * 4);
      let o = 0;
      for (const p of points) {
        for (const [cx, cy] of CIRCLE_CORNERS) {
          eye[o++] = p.x;
          eye[o++] = p.y;
          eye[o++] = cx;
          eye[o++] = cy;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this._circleVbo);
      gl.bufferData(gl.ARRAY_BUFFER, eye, gl.STATIC_DRAW);
      this._circlePoints = points;
    }

    for (const wrap of wraps) {
      gl.uniform1f(prog.uniform("u_wrap"), wrap);
      gl.drawArrays(gl.TRIANGLES, 0, points.length * 6);
    }
    gl.bindVertexArray(null);
  }

  private _bindMercUniforms(prog: ShaderProgram, transform: Transform): void {
    const cm = transform.centerMercator;
    const [hx, lx] = splitDouble(cm.x);
    const [hy, ly] = splitDouble(cm.y);
    const gl = this.gl;
    gl.uniform2f(prog.uniform("u_center_hi"), hx, hy);
    gl.uniform2f(prog.uniform("u_center_lo"), lx, ly);
    gl.uniform1f(prog.uniform("u_world_size"), transform.worldSize);
  }

  private _ensureScratch(size: number): Float32Array {
    if (this._scratch.length < size) {
      this._scratch = new Float32Array(size);
    }
    return this._scratch.length === size
      ? this._scratch
      : this._scratch.subarray(0, size);
  }

  destroy(): void {
    const gl = this.gl;
    try {
      gl.deleteBuffer(this._fillVbo);
      gl.deleteBuffer(this._fillIbo);
      gl.deleteBuffer(this._lineVbo);
      gl.deleteBuffer(this._circleVbo);
      gl.deleteVertexArray(this._fillVao);
      gl.deleteVertexArray(this._lineVao);
      gl.deleteVertexArray(this._circleVao);
      this._fillProg.destroy();
      this._lineProg.destroy();
      this._circleProg.destroy();
    } catch {
      // Context may already be lost.
    }
  }
}

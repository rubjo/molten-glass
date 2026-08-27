/**
 * Small WebGL helpers with real error reporting, so a broken shader throws a
 * readable message instead of silently rendering nothing.
 */

/**
 * Compile a shader and throw with the info log on failure.
 * @param {WebGLRenderingContext} gl
 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @param {string} source
 * @returns {WebGLShader}
 */
export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    throw new Error(`[molten-glass] Failed to compile ${kind} shader:\n${log}`);
  }
  return shader;
}

/**
 * Link a program from vertex + fragment sources and throw on failure.
 * @param {WebGLRenderingContext} gl
 * @param {string} vertexSrc
 * @param {string} fragmentSrc
 * @returns {WebGLProgram}
 */
export function createProgram(gl, vertexSrc, fragmentSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  // Shaders can be detached/deleted once linked.
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[molten-glass] Failed to link program:\n${log}`);
  }
  return program;
}

/**
 * Create a fullscreen-triangle-pair vertex buffer and bind it to attribute `p`.
 * @param {WebGLRenderingContext} gl
 * @param {WebGLProgram} program
 * @returns {WebGLBuffer}
 */
export function createQuad(gl, program) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return buffer;
}

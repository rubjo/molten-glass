/**
 * GLSL shader sources for the molten-glass effect.
 *
 * The fragment shader samples a real backdrop texture and warps the sampling
 * coordinate toward the edges with a rotational "melt" distortion plus an edge
 * refraction/pinch, an optional chromatic split, a glass tint, and a specular rim.
 * The center stays clear, so the real content shows through undistorted there.
 */

export const VERTEX_SRC = /* glsl */ `
  attribute vec2 p;
  void main() {
    gl_Position = vec4(p, 0.0, 1.0);
  }
`;

export const FRAGMENT_SRC = /* glsl */ `
  precision highp float;

  uniform vec2      u_res;        // canvas resolution in device pixels
  uniform sampler2D u_tex;        // real backdrop texture
  uniform vec2      u_texScale;   // maps lens-local UV -> texture UV
  uniform vec2      u_texOffset;
  uniform float     u_twist;
  uniform float     u_refract;
  uniform float     u_exponent;
  uniform float     u_specular;
  uniform float     u_chroma;
  uniform vec3      u_tint;
  uniform float     u_tintStrength;
  uniform float     u_overscan;     // device px the canvas bleeds past the visible lens (per side)
  uniform float     u_cornerRadius; // visible lens border-radius in device px

  // Sample the backdrop with the lens-local -> texture mapping applied.
  vec3 sampleTex(vec2 lensUV) {
    return texture2D(u_tex, lensUV * u_texScale + u_texOffset).rgb;
  }

  // Signed distance to a rounded rectangle (negative inside, 0 on the border).
  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
  }

  void main() {
    // Top-left origin UV so it matches screen-space math for capture mode.
    vec2 uv = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
    vec2 centerDist = uv - 0.5;

    vec2 aspectCorrected = centerDist * vec2(u_res.x / u_res.y, 1.0);
    float radius = length(aspectCorrected);

    float normalizedRadius = smoothstep(0.0, 0.6, radius);
    float edgeStrength = pow(normalizedRadius, u_exponent);

    // Rotational "melt" that grows toward the rim.
    float angle = edgeStrength * u_twist * (1.0 - radius);
    float cosA = cos(angle);
    float sinA = sin(angle);
    vec2 liquidDist = vec2(
      centerDist.x * cosA - centerDist.y * sinA,
      centerDist.x * sinA + centerDist.y * cosA
    );

    vec2 refractOffset = liquidDist * edgeStrength * u_refract;
    vec2 sampleUV = uv - refractOffset;

    // Chromatic aberration: split the channels along the radial direction at the edges.
    vec3 color;
    if (u_chroma > 0.0) {
      vec2 dir = radius > 0.0001 ? centerDist / radius : vec2(0.0);
      vec2 offs = dir * u_chroma * edgeStrength * 0.03;
      color = vec3(
        sampleTex(sampleUV + offs).r,
        sampleTex(sampleUV).g,
        sampleTex(sampleUV - offs).b
      );
    } else {
      color = sampleTex(sampleUV);
    }

    // Glass tint.
    color = mix(color, u_tint, u_tintStrength);

    // Specular rim that follows the actual lens shape (rounded rectangle) via an SDF.
    vec2 halfSize = max(u_res * 0.5 - u_overscan, vec2(1.0));
    float band = min(halfSize.x, halfSize.y);
    float cornerR = min(u_cornerRadius, band);
    float dist = sdRoundBox(gl_FragCoord.xy - u_res * 0.5, halfSize, cornerR);
    float shapeEdge = clamp(1.0 + dist / band, 0.0, 1.0); // 0 in the core, 1 at the border
    float highlight = pow(shapeEdge, u_exponent + 2.0) * u_specular * 0.5;
    color += vec3(highlight);

    gl_FragColor = vec4(color, 1.0);
  }
`;

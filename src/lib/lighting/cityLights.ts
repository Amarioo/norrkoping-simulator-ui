/**
 * Step 6 artificial lighting: shader-based surface illumination for many fixtures.
 *
 * Three.js PointLights/SpotLights are not used for fixtures: each extra light changes every lit
 * program and costs per fragment for every light. Instead every lit material (Standard, Physical,
 * Lambert, Phong, Toon) gets one fixed shader patch (patchMaterial) that adds:
 *
 * 1. Street lamps from a world-space light grid. Lamps live in a float texture (LAMP_TEXELS texels
 *    per lamp); the grid texture lists up to MAX_PER_CELL lamp indices per 25 m cell (a lamp is listed
 *    in every cell its range touches). A fragment evaluates only its own cell's lamps, so the cost per
 *    pixel is bounded (≤ 16) however many fixtures exist; no CPU selection, no popping.
 *    Each lamp has a luminaire profile (full-cutoff street / lantern), inverse-square falloff in
 *    metres with a smooth range window, 16 horizontal occlusion sectors from building footprints
 *    (no light behind façades or through buildings) and, for bridge-deck lamps, no light below the
 *    deck. Shading uses the material's own diffuse colour, normal and roughness (Lambert diffuse,
 *    normalised Blinn specular), so roads, pavements, walls, vehicles and terrain respond with their
 *    real albedo. (A full RE_Direct per light was measured too slow to compile on ANGLE/D3D.)
 * 2. Stadium floodlights: ≤ STADIUM_MAX spot emitters in the arena frame, evaluated only inside the
 *    stadium volume (soft box), with analytic roof occluders so floodlights do not shine through the
 *    stand roofs.
 *
 * Shader configuration never changes after the first compile: lamp count, time of day and
 * floodlight state are uniforms or texture contents (no program recompiles while scrubbing time).
 * Intensities are a perceptual calibration: lux computed from candela and distance in metres, then
 * scaled to display irradiance (LUX_SCALE); see docs/step6/lighting-architecture.md.
 */
import {
  DataTexture,
  FloatType,
  Matrix3,
  Matrix4,
  NearestFilter,
  RGBAFormat,
  Vector4,
  type Material,
} from 'three';

export const LAMP_TEXELS = 8;
export const MAX_PER_CELL = 16;
export const SECTORS = 16;
export const STADIUM_MAX = 16;
export const STADIUM_ROOFS = 8;
/** Display irradiance per lux for street lighting (night-adapted perceptual calibration). */
export const STREET_LUX_SCALE = 0.035;
/** Display irradiance per lux for the floodlights (compressed: a 1 200 lux pitch ≈ 1.1). */
export const STADIUM_LUX_SCALE = 0.0009;

export interface ShaderLamp {
  /** Emitter position, scene units. */
  x: number;
  y: number;
  z: number;
  rangeM: number;
  /** Linear RGB colour (unit luminance-ish) of the light. */
  color: [number, number, number];
  /** Peak (nadir) luminous intensity, candela. */
  candela: number;
  /** 0 full-cutoff street luminaire, 1 lantern / post-top. */
  profile: number;
  /** Street bracket's horizontal arm direction, into the road (radians); lanterns stay radial. */
  heading?: number;
  /** Mounting surface height (scene units) and whether light below it is blocked (bridge decks). */
  baseY: number;
  clipBelow: boolean;
  /** 16 horizontal occlusion distances, metres (sector s centred at angle (s + 0.5)·22.5° − 180°). */
  occlusionM: number[];
}
export interface StadiumEmitter {
  /** Arena frame, metres (y above the pitch). */
  position: [number, number, number];
  /** Unit aim direction, arena frame. */
  aim: [number, number, number];
  cosInner: number;
  cosOuter: number;
  candela: number;
  color: [number, number, number];
}
export interface StadiumRoof {
  /** Arena frame, metres: x0 < x1, z0 < z1, roof plane height y. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

/** Shared uniforms: every patched material references these objects, so updates are free. */
export function createLightingUniforms() {
  const empty = new DataTexture(new Float32Array([-1, -1, -1, -1]), 1, 1, RGBAFormat, FloatType);
  empty.needsUpdate = true;
  return {
    cityLampTex: { value: empty as DataTexture },
    cityGridTex: { value: empty as DataTexture },
    /** originX, originZ, 1 / cell size, columns (scene units). */
    cityGrid: { value: new Vector4(0, 0, 1, 0) },
    cityGridRows: { value: 0 },
    cityLampLevel: { value: 0 },
    /** Lamp slots per grid cell, a uniform so the shader loop stays dynamic (not unrolled). */
    cityCellSlots: { value: MAX_PER_CELL },
    cityLuxScale: { value: STREET_LUX_SCALE },
    cityMetres: { value: 25 },
    stadiumLevel: { value: 0 },
    stadiumCount: { value: 0 },
    stadiumRoofCount: { value: 0 },
    stadiumLuxScale: { value: STADIUM_LUX_SCALE },
    /** World (scene units) → arena frame (metres). */
    stadiumToLocal: { value: new Matrix4() },
    /** Arena directions → world directions (rotation only). */
    stadiumToWorld: { value: new Matrix3() },
    /** Half extents x, z (m), top y (m), edge softness (m). */
    stadiumBox: { value: new Vector4(70, 96, 30, 8) },
    stadiumLights: { value: Array.from({ length: STADIUM_MAX * 3 }, () => new Vector4()) },
    stadiumRoofs: { value: Array.from({ length: STADIUM_ROOFS * 2 }, () => new Vector4()) },
  };
}
export type LightingUniforms = ReturnType<typeof createLightingUniforms>;

/** Packs lamps into the lamp texture (LAMP_TEXELS texels per row, one row per lamp). */
export function packLamps(lamps: ShaderLamp[]) {
  const rows = Math.max(1, lamps.length);
  const data = new Float32Array(LAMP_TEXELS * 4 * rows);
  lamps.forEach((l, i) => {
    const o = i * LAMP_TEXELS * 4;
    data.set([l.x, l.y, l.z, l.rangeM], o);
    data.set(
      [l.color[0] * l.candela, l.color[1] * l.candela, l.color[2] * l.candela, l.profile],
      o + 4,
    );
    data.set(
      [l.baseY, l.clipBelow ? 1 : 0, Math.sin(l.heading ?? 0), Math.cos(l.heading ?? 0)],
      o + 8,
    );
    for (let s = 0; s < SECTORS; s++) data[o + 12 + s] = l.occlusionM[s] ?? l.rangeM;
  });
  const texture = new DataTexture(data, LAMP_TEXELS, rows, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
export interface LightGrid {
  originX: number;
  originZ: number;
  cell: number;
  columns: number;
  rows: number;
  /** Lamp indices per cell (row-major), at most MAX_PER_CELL each. */
  cells: number[][];
  /** Cells whose lamp list was truncated to MAX_PER_CELL (should be 0). */
  overflow: number;
}
/**
 * Lists every lamp in each cell its range circle touches. A cell with more than MAX_PER_CELL lamps
 * keeps the nearest ones (to the cell centre) and is counted in `overflow`.
 */
export function buildLightGrid(lamps: ShaderLamp[], metresPerUnit: number, cell = 1): LightGrid {
  if (!lamps.length)
    return { originX: 0, originZ: 0, cell, columns: 0, rows: 0, cells: [], overflow: 0 };
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const l of lamps) {
    const r = l.rangeM / metresPerUnit;
    x0 = Math.min(x0, l.x - r);
    z0 = Math.min(z0, l.z - r);
    x1 = Math.max(x1, l.x + r);
    z1 = Math.max(z1, l.z + r);
  }
  const originX = Math.floor(x0 / cell) * cell,
    originZ = Math.floor(z0 / cell) * cell;
  const columns = Math.ceil((x1 - originX) / cell),
    rows = Math.ceil((z1 - originZ) / cell);
  const cells: number[][] = Array.from({ length: columns * rows }, () => []);
  lamps.forEach((l, i) => {
    const r = l.rangeM / metresPerUnit;
    for (
      let cz = Math.floor((l.z - r - originZ) / cell);
      cz <= Math.floor((l.z + r - originZ) / cell);
      cz++
    )
      for (
        let cx = Math.floor((l.x - r - originX) / cell);
        cx <= Math.floor((l.x + r - originX) / cell);
        cx++
      ) {
        if (cx < 0 || cz < 0 || cx >= columns || cz >= rows) continue;
        // Distance from the lamp to the nearest point of the cell.
        const nx = Math.max(originX + cx * cell, Math.min(l.x, originX + (cx + 1) * cell)),
          nz = Math.max(originZ + cz * cell, Math.min(l.z, originZ + (cz + 1) * cell));
        if (Math.hypot(nx - l.x, nz - l.z) <= r) cells[cz * columns + cx].push(i);
      }
  });
  let overflow = 0;
  cells.forEach((list, k) => {
    if (list.length <= MAX_PER_CELL) return;
    overflow++;
    const cx = originX + ((k % columns) + 0.5) * cell,
      cz = originZ + (Math.floor(k / columns) + 0.5) * cell;
    list.sort(
      (a, b) =>
        Math.hypot(lamps[a].x - cx, lamps[a].z - cz) - Math.hypot(lamps[b].x - cx, lamps[b].z - cz),
    );
    list.length = MAX_PER_CELL;
  });
  return { originX, originZ, cell, columns, rows, cells, overflow };
}
export function packGrid(grid: LightGrid) {
  const width = Math.max(1, grid.columns * (MAX_PER_CELL / 4)),
    height = Math.max(1, grid.rows);
  const data = new Float32Array(width * height * 4).fill(-1);
  grid.cells.forEach((list, k) => {
    const cx = k % grid.columns,
      cz = Math.floor(k / grid.columns);
    list.forEach((lamp, j) => (data[(cz * width + cx * (MAX_PER_CELL / 4)) * 4 + j] = lamp));
  });
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vCityWorld;
`;
const VERTEX_MAIN = /* glsl */ `
	{
		vec4 cityWorld = vec4( transformed, 1.0 );
		#ifdef USE_BATCHING
			cityWorld = batchingMatrix * cityWorld;
		#endif
		#ifdef USE_INSTANCING
			cityWorld = instanceMatrix * cityWorld;
		#endif
		vCityWorld = ( modelMatrix * cityWorld ).xyz;
	}
`;
const FRAGMENT_PARS = /* glsl */ `
varying vec3 vCityWorld;
uniform highp sampler2D cityLampTex;
uniform highp sampler2D cityGridTex;
uniform vec4 cityGrid;
uniform float cityGridRows;
uniform float cityLampLevel;
uniform float cityLuxScale;
uniform float cityMetres;
uniform float stadiumLevel;
uniform int stadiumCount;
uniform int cityCellSlots;
uniform int stadiumRoofCount;
uniform float stadiumLuxScale;
uniform mat4 stadiumToLocal;
uniform mat3 stadiumToWorld;
uniform vec4 stadiumBox;
uniform vec4 stadiumLights[ ${STADIUM_MAX * 3} ];
uniform vec4 stadiumRoofs[ ${STADIUM_ROOFS * 2} ];

float cityOcclusion( int lamp, int s ) {
	vec4 t = texelFetch( cityLampTex, ivec2( 3 + s / 4, lamp ), 0 );
	int c = s - ( s / 4 ) * 4;
	return c == 0 ? t.x : c == 1 ? t.y : c == 2 ? t.z : t.w;
}
// Street lamp i at world point P: irradiance colour (zero when it contributes nothing) and the unit
// world direction to the lamp. Straight-line code (no early returns): the D3D compiler behind ANGLE
// compiles branchy loop bodies very slowly.
vec3 cityLamp( int i, vec3 P, out vec3 dir ) {
	vec4 t0 = texelFetch( cityLampTex, ivec2( 0, i ), 0 );
	vec4 t1 = texelFetch( cityLampTex, ivec2( 1, i ), 0 );
	vec4 t2 = texelFetch( cityLampTex, ivec2( 2, i ), 0 );
	vec3 Lm = ( t0.xyz - P ) * cityMetres;
	float d2 = max( dot( Lm, Lm ), 0.09 );
	float d = sqrt( d2 );
	dir = Lm / d;
	float r = min( d / t0.w, 1.0 );
	// Lanterns fade sooner across lawns; preserve the longer road throw of street brackets.
	float window = 1.0 - mix( r * r * r * r, r * r, t1.w );
	float below = step( 0.5, t2.y ) * step( P.y, t2.x - 0.4 / cityMetres );
	float hd = length( Lm.xz );
	float s = ( atan( -Lm.z, -Lm.x ) + PI ) * ( ${SECTORS}.0 / ( 2.0 * PI ) ) - 0.5;
	float fs = floor( s );
	int s0 = int( fs ) + ( fs < 0.0 ? ${SECTORS} : 0 );
	int s1 = s0 + 1 >= ${SECTORS} ? 0 : s0 + 1;
	float occ = mix( cityOcclusion( i, s0 ), cityOcclusion( i, s1 ), s - fs );
	float fade = hd > 0.3 ? 1.0 - smoothstep( occ + 0.2, occ + 1.2, hd ) : 1.0;
	float c = dir.y;
	// Broad longitudinal street distribution and a softer house-side cutoff. Use the existing arm
	// orientation and already normalised direction. Nadir is unchanged; lanterns remain radial.
	float across = dot( -dir.xz, t2.zw );
	float along = dot( dir.xz, vec2( t2.w, -t2.z ) );
	float streetShape = 1.0 + 0.65 * along * along - 0.45 * max( -across, 0.0 );
	float profile = t1.w < 0.5
		? streetShape * ( 0.75 + 0.55 * sqrt( max( 0.0, 1.0 - c * c ) ) ) * smoothstep( 0.17, 0.37, c )
		: ( 0.85 + 0.25 * c ) * smoothstep( -0.12, 0.2, c );
	return t1.rgb * ( profile * window * window * fade * ( 1.0 - below ) / d2 );
}
// Floodlight j at arena-frame point p (metres): irradiance colour (zero outside the beam or behind a
// roof) and the unit WORLD direction to the emitter.
vec3 stadiumLight( int j, vec3 p, out vec3 dir ) {
	vec4 a = stadiumLights[ j * 3 ];
	vec4 b = stadiumLights[ j * 3 + 1 ];
	vec4 e = stadiumLights[ j * 3 + 2 ];
	vec3 L = a.xyz - p;
	float d2 = max( dot( L, L ), 1.0 );
	vec3 l = L * inversesqrt( d2 );
	float spot = smoothstep( b.w, a.w, dot( -l, b.xyz ) );
	float open = 1.0;
	for ( int k = 0; k < stadiumRoofCount; k ++ ) {
		vec4 rect = stadiumRoofs[ k * 2 ];
		float ry = stadiumRoofs[ k * 2 + 1 ].x;
		float crosses = ( p.y < ry - 0.05 ) != ( a.y < ry ) ? 1.0 : 0.0;
		vec2 q = p.xz + ( ry - p.y ) / ( a.y - p.y + 1e-4 ) * L.xz;
		float inside = step( rect.x, q.x ) * step( q.x, rect.y ) * step( rect.z, q.y ) * step( q.y, rect.w );
		open *= 1.0 - crosses * inside;
	}
	dir = normalize( stadiumToWorld * l );
	return e.rgb * ( spot * open / d2 );
}
`;
const FRAGMENT_MAIN = /* glsl */ `
	{
		// Lighting in world space: one normal/view transform per fragment, none per light. One dynamic
		// loop (uniform bounds): floodlights first, then the grid cell's lamp slots until the first empty
		// slot. Lean shading (Lambert diffuse; normalised Blinn specular for standard materials),
		// accumulated and added once. Measured: the full RE_Direct per light inside constant-bound loops
		// made each lit program much larger and slower to compile on ANGLE/D3D (+1.4 s map ready).
		vec3 cityN = inverseTransformDirection( geometryNormal, viewMatrix );
		vec3 cityV = inverseTransformDirection( geometryViewDir, viewMatrix );
		vec3 cityIrradiance = vec3( 0.0 );
		vec3 citySpecular = vec3( 0.0 );
		#ifdef STANDARD
			float cityShininess = clamp( 2.0 / max( pow4( material.roughness ), 1e-4 ) - 2.0, 1.0, 2048.0 );
		#else
			float cityShininess = 1.0;
		#endif
		ivec2 cityCell = ivec2( floor( ( vCityWorld.xz - cityGrid.xy ) * cityGrid.z ) );
		bool cityInGrid = cityCell.x >= 0 && cityCell.y >= 0 && cityCell.x < int( cityGrid.w ) && cityCell.y < int( cityGridRows );
		int cityLamps = cityLampLevel > 0.0005 && cityInGrid ? cityCellSlots : 0;
		vec3 stadiumP = vec3( 0.0 );
		float stadiumMask = 0.0;
		if ( stadiumLevel > 0.0005 ) {
			stadiumP = ( stadiumToLocal * vec4( vCityWorld, 1.0 ) ).xyz;
			stadiumMask = ( 1.0 - smoothstep( stadiumBox.x, stadiumBox.x + stadiumBox.w, abs( stadiumP.x ) ) )
				* ( 1.0 - smoothstep( stadiumBox.y, stadiumBox.y + stadiumBox.w, abs( stadiumP.z ) ) )
				* ( 1.0 - smoothstep( stadiumBox.z, stadiumBox.z + 8.0, stadiumP.y ) );
		}
		int cityFloods = stadiumMask > 0.0 ? stadiumCount : 0;
		for ( int n = 0; n < cityFloods + cityLamps; n ++ ) {
			vec3 dir;
			vec3 col;
			if ( n < cityFloods ) {
				col = stadiumLight( n, stadiumP, dir ) * ( stadiumLuxScale * stadiumLevel * stadiumMask );
			} else {
				int slot = n - cityFloods;
				vec4 ids = texelFetch( cityGridTex, ivec2( cityCell.x * ${MAX_PER_CELL / 4} + slot / 4, cityCell.y ), 0 );
				int c = slot - ( slot / 4 ) * 4;
				float id = c == 0 ? ids.x : c == 1 ? ids.y : c == 2 ? ids.z : ids.w;
				if ( id < 0.0 ) break;
				col = cityLamp( int( id ), vCityWorld, dir ) * ( cityLuxScale * cityLampLevel );
			}
			float nl = max( dot( cityN, dir ), 0.0 );
			cityIrradiance += col * nl;
			float nh = max( dot( cityN, normalize( dir + cityV ) ), 0.0 );
			citySpecular += col * ( nl * pow( nh, cityShininess ) * ( cityShininess + 8.0 ) / 25.13 );
		}
		#ifdef STANDARD
			reflectedLight.directDiffuse += cityIrradiance * BRDF_Lambert( material.diffuseContribution );
			reflectedLight.directSpecular += citySpecular * material.specularColor;
		#else
			reflectedLight.directDiffuse += cityIrradiance * BRDF_Lambert( material.diffuseColor );
		#endif
	}
`;
const PATCH_KEY = 'city-lights-v1';
const patched = new WeakSet<Material>();
type LitMaterial = Material & {
  isMeshStandardMaterial?: boolean;
  isMeshLambertMaterial?: boolean;
  isMeshPhongMaterial?: boolean;
  isMeshToonMaterial?: boolean;
};
/** True for materials whose shaders run lights_fragment_maps (lit three.js materials). */
export function isLitMaterial(m: Material) {
  const l = m as LitMaterial;
  return !!(
    l.isMeshStandardMaterial ||
    l.isMeshLambertMaterial ||
    l.isMeshPhongMaterial ||
    l.isMeshToonMaterial
  );
}
/**
 * Adds the lighting patch to a lit material (idempotent). Chains any existing onBeforeCompile and
 * program cache key (e.g. groundLayers.layeredGround).
 */
export function patchMaterial(material: Material, uniforms: LightingUniforms) {
  if (patched.has(material) || !isLitMaterial(material)) return false;
  patched.add(material);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const hadOwnKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERTEX_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERTEX_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_pars_begin>', '#include <lights_pars_begin>\n' + FRAGMENT_PARS)
      .replace(
        '#include <lights_fragment_maps>',
        FRAGMENT_MAIN + '\n#include <lights_fragment_maps>',
      );
  };
  material.customProgramCacheKey = hadOwnKey
    ? () => previousKey.call(material) + '|' + PATCH_KEY
    : () => PATCH_KEY;
  material.needsUpdate = true;
  return true;
}
export function isPatched(material: Material) {
  return patched.has(material);
}

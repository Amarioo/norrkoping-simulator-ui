/**
 * Step 6 artificial lighting: shader-based surface illumination for many fixtures.
 *
 * Three.js PointLights/SpotLights are not used for fixtures: each extra light changes every lit
 * program and costs per fragment for every light. Instead every lit material (Standard, Physical,
 * Lambert, Phong, Toon) gets one fixed shader patch (patchMaterial) that adds:
 *
 * 1. Street lamps from a world-space light grid. Lamps live in a float texture (LAMP_TEXELS texels
 *    per lamp, wrapped into further column blocks beyond the device texture height); every 25 m cell
 *    lists up to MAX_PER_CELL lamp indices (a lamp is listed in every cell its range touches). A
 *    fragment evaluates only its own cell's lamps, so the cost per pixel is bounded (≤ 16) however
 *    many fixtures exist; no CPU selection, no popping. Since Lighting Phase 0 the cells are stored
 *    sparsely (lightIndex.ts): a page directory (one texel per chunk of chunkCells² cells, −1 =
 *    empty) points into a page atlas that holds only chunks containing lit cells.
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
  RedFormat,
  RGBAFormat,
  RGFormat,
  Vector4,
  type Material,
} from 'three';

export const LAMP_TEXELS = 8;
/**
 * Most lamps one 25 m cell may list (the shader loop guard). 16 until Lighting Phase A3 (fixed slots);
 * 32 since Phase L1, where cells store a run in a lamp list, so the cost per pixel and the memory
 * follow the actual count. A set with more is rejected, never truncated.
 */
export const MAX_PER_CELL = 32;
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
  const noPages = new DataTexture(new Float32Array([-1]), 1, 1, RedFormat, FloatType);
  noPages.needsUpdate = true;
  const emptyRg = new DataTexture(new Float32Array([0, 0]), 1, 1, RGFormat, FloatType);
  emptyRg.needsUpdate = true;
  return {
    cityLampTex: { value: empty as DataTexture },
    /** Page atlas (RG32F): one (start, count) texel per cell, chunkCells × chunkCells cells per page. */
    cityGridTex: { value: emptyRg as DataTexture },
    /** Lamp list (R32F): lamp indices of every cell's run, cityListWidth texels per row. */
    cityListTex: { value: noPages as DataTexture },
    cityListWidth: { value: 1 },
    /** Page directory (R32F): page index of every chunk, −1 for an empty chunk. */
    cityPageTex: { value: noPages as DataTexture },
    /** Directory originX, originZ (scene units, chunk-aligned), 1 / cell size, columns (chunks). */
    cityGrid: { value: new Vector4(0, 0, 1, 0) },
    /** Directory rows (chunks). */
    cityGridRows: { value: 0 },
    /** Cells per chunk side, pages per atlas row, lamp atlas rows (column-block height). */
    cityChunkCells: { value: 1 },
    cityPagesPerRow: { value: 1 },
    cityLampRows: { value: 1 },
    cityLampLevel: { value: 0 },
    /** Most lamps evaluated per cell (loop guard), a uniform so the loop stays dynamic (not unrolled). */
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

/**
 * Lamp texture layout: lamp i occupies LAMP_TEXELS texels of row (i mod rows) in column block
 * floor(i / rows), rows = min(count, maxTextureSize). Up to maxTextureSize lamps this is exactly the
 * Step 6 layout (LAMP_TEXELS × count). Throws before allocating when the atlas cannot fit the device.
 */
export function lampLayout(count: number, maxTextureSize: number) {
  const rows = Math.max(1, Math.min(count, maxTextureSize));
  const blocks = Math.max(1, Math.ceil(count / rows));
  const width = blocks * LAMP_TEXELS;
  if (width > maxTextureSize || count >= 2 ** 24)
    throw new Error(
      `${count} lamps exceed the lamp atlas limit for max texture size ${maxTextureSize}`,
    );
  return { rows, width, height: rows };
}
/** Packs lamps (in index order) into RGBA32F lamp atlas data. */
export function packLampData(lamps: ShaderLamp[], maxTextureSize = 16384) {
  const { rows, width, height } = lampLayout(lamps.length, maxTextureSize);
  const data = new Float32Array(width * height * 4);
  lamps.forEach((l, i) => {
    const o = ((i % rows) * width + Math.floor(i / rows) * LAMP_TEXELS) * 4;
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
  return { data, width, height, rows };
}
/**
 * Float data texture read with texelFetch only (no filtering, no mipmaps). The typed array stays on
 * the texture: WebGL context restoration re-uploads from it, so it must never be released on upload.
 * `channels`: true or 1 = R32F, 2 = RG32F, otherwise RGBA32F.
 */
export function floatTexture(
  data: Float32Array,
  width: number,
  height: number,
  channels: boolean | 1 | 2 | 4 = 4,
) {
  const format = channels === true || channels === 1 ? RedFormat : channels === 2 ? RGFormat : RGBAFormat;
  const texture = new DataTexture(data, width, height, format, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
/** Packs lamps into the lamp texture (see lampLayout). */
export function packLamps(lamps: ShaderLamp[], maxTextureSize = 16384) {
  const { data, width, height, rows } = packLampData(lamps, maxTextureSize);
  const texture = floatTexture(data, width, height);
  texture.userData.rows = rows;
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
uniform highp sampler2D cityPageTex;
uniform highp sampler2D cityListTex;
uniform int cityListWidth;
uniform vec4 cityGrid;
uniform float cityGridRows;
uniform float cityLampLevel;
uniform float cityLuxScale;
uniform float cityMetres;
uniform float stadiumLevel;
uniform int stadiumCount;
uniform int cityCellSlots;
uniform int cityChunkCells;
uniform int cityPagesPerRow;
uniform int cityLampRows;
uniform int stadiumRoofCount;
uniform float stadiumLuxScale;
uniform mat4 stadiumToLocal;
uniform mat3 stadiumToWorld;
uniform vec4 stadiumBox;
uniform vec4 stadiumLights[ ${STADIUM_MAX * 3} ];
uniform vec4 stadiumRoofs[ ${STADIUM_ROOFS * 2} ];

float cityOcclusion( ivec2 lamp, int s ) {
	vec4 t = texelFetch( cityLampTex, lamp + ivec2( 3 + s / 4, 0 ), 0 );
	int c = s - ( s / 4 ) * 4;
	return c == 0 ? t.x : c == 1 ? t.y : c == 2 ? t.z : t.w;
}
// Street lamp i at world point P: irradiance colour (zero when it contributes nothing) and the unit
// world direction to the lamp. Straight-line code (no early returns): the D3D compiler behind ANGLE
// compiles branchy loop bodies very slowly.
vec3 cityLamp( int i, vec3 P, out vec3 dir ) {
	int block = i / cityLampRows;
	ivec2 base = ivec2( block * ${LAMP_TEXELS}, i - block * cityLampRows );
	vec4 t0 = texelFetch( cityLampTex, base, 0 );
	vec4 t1 = texelFetch( cityLampTex, base + ivec2( 1, 0 ), 0 );
	vec4 t2 = texelFetch( cityLampTex, base + ivec2( 2, 0 ), 0 );
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
	float occ = mix( cityOcclusion( base, s0 ), cityOcclusion( base, s1 ), s - fs );
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
		// loop: floodlights first, then the grid cell's run of lamps (its count, at most cityCellSlots). Lean shading (Lambert diffuse; normalised Blinn specular for standard materials),
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
		// Sparse cell lookup (lightIndex.ts): cell → chunk → page directory → cell header (start,
		// count) → lamp list. Read only at night; an empty chunk (−1) or a point outside has no lamps.
		ivec2 cityCell = ivec2( floor( ( vCityWorld.xz - cityGrid.xy ) * cityGrid.z ) );
		ivec2 cityDirCells = ivec2( int( cityGrid.w ), int( cityGridRows ) ) * cityChunkCells;
		bool cityInGrid = cityCell.x >= 0 && cityCell.y >= 0 && cityCell.x < cityDirCells.x && cityCell.y < cityDirCells.y;
		int cityListStart = 0;
		int cityLamps = 0;
		if ( cityLampLevel > 0.0005 && cityInGrid ) {
			ivec2 cityChunk = cityCell / cityChunkCells;
			float cityPage = texelFetch( cityPageTex, cityChunk, 0 ).r;
			if ( cityPage >= 0.0 ) {
				int page = int( cityPage );
				int pageRow = page / cityPagesPerRow;
				ivec2 local = cityCell - cityChunk * cityChunkCells;
				vec2 head = texelFetch( cityGridTex, ivec2( ( page - pageRow * cityPagesPerRow ) * cityChunkCells + local.x, pageRow * cityChunkCells + local.y ), 0 ).xy;
				cityListStart = int( head.x );
				cityLamps = min( int( head.y ), cityCellSlots );
			}
		}
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
				int at = cityListStart + n - cityFloods;
				int listRow = at / cityListWidth;
				float id = texelFetch( cityListTex, ivec2( at - listRow * cityListWidth, listRow ), 0 ).r;
				col =cityLamp( int( id ), vCityWorld, dir ) * ( cityLuxScale * cityLampLevel );
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
const PATCH_KEY = 'city-lights-v3';
/**
 * Uniform binding of a patched material. A lit material can outlive the controller that patched it
 * (cached or shared materials, scene recreation); patching it again with another controller's
 * uniforms rebinds it. Compiled programs keep their uniform objects (three.js materialProperties
 * .uniforms, looked up by name on every upload), so rebinding replaces the entries in every compiled
 * uniforms object of the material: no recompilation and no per-frame indirection. A later compile
 * (e.g. after WebGL context restoration) injects the current binding.
 */
interface MaterialBinding {
  uniforms: LightingUniforms;
  /** Uniform objects of the material's compiled programs (bounded: the most recent compiles). */
  compiled: Record<string, unknown>[];
}
const bindings = new WeakMap<Material, MaterialBinding>();
const MAX_COMPILED = 8;
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
 * Adds the lighting patch to a lit material, or rebinds an already patched material to `uniforms`.
 * Returns true only for a new patch. Chains any existing onBeforeCompile and program cache key
 * (e.g. groundLayers.layeredGround). The program cache key and shader text never depend on the
 * uniforms, so rebinding never creates a program variant.
 */
export function patchMaterial(material: Material, uniforms: LightingUniforms) {
  if (!isLitMaterial(material)) return false;
  const existing = bindings.get(material);
  if (existing) {
    if (existing.uniforms !== uniforms) {
      existing.uniforms = uniforms;
      for (const compiled of existing.compiled) Object.assign(compiled, uniforms);
    }
    return false;
  }
  const binding: MaterialBinding = { uniforms, compiled: [] };
  bindings.set(material, binding);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const hadOwnKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, binding.uniforms);
    binding.compiled.push(shader.uniforms);
    if (binding.compiled.length > MAX_COMPILED) binding.compiled.shift();
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
  return bindings.has(material);
}
/** The uniforms a patched material is currently bound to (tests and diagnostics). */
export function boundUniforms(material: Material) {
  return bindings.get(material)?.uniforms ?? null;
}

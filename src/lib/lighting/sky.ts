/**
 * Sky dome driven by the same state as the lights and fog (environment.ts), so the visible sky,
 * the hemisphere light and the fog colour always agree. Follows the camera; drawn first, no depth
 * write, no fog. Horizon gradient, a twilight glow on the sun's side, the sun disk when it is up and
 * a faint urban sky glow at night.
 */
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3, type Camera } from 'three';
import type { EnvironmentState } from './environment';

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize( ( modelMatrix * vec4( position, 0.0 ) ).xyz );
	vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	gl_Position = p.xyww;
}
`;
const FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunDisk;
uniform float glow;
varying vec3 vDir;
void main() {
	vec3 d = normalize( vDir );
	float h = d.y;
	vec3 sky = mix( horizon, zenith, pow( clamp( h, 0.0, 1.0 ), 0.45 ) );
	sky = h < 0.0 ? mix( horizon, horizon * 0.55, clamp( -h * 6.0, 0.0, 1.0 ) ) : sky;
	float mu = max( dot( d, sunDir ), 0.0 );
	float side = pow( mu, 3.0 ) * ( 1.0 - clamp( h * 2.5, 0.0, 1.0 ) );
	sky += sunColor * side * glow;
	sky += sunColor * smoothstep( 0.99985, 0.99993, mu ) * sunDisk * 6.0;
	gl_FragColor = vec4( sky, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;
export function createSky() {
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      zenith: { value: new Color() },
      horizon: { value: new Color() },
      sunColor: { value: new Color() },
      sunDir: { value: new Vector3(0, 1, 0) },
      sunDisk: { value: 0 },
      glow: { value: 0 },
    },
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const geometry = new SphereGeometry(1000, 32, 16);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(camera: Camera, env: EnvironmentState, sunDir: Vector3) {
      mesh.position.copy(camera.position);
      const u = material.uniforms;
      u.zenith.value.copy(env.zenith);
      u.horizon.value.copy(env.horizon);
      u.sunColor.value.copy(env.sunColor);
      u.sunDir.value.copy(sunDir);
      u.sunDisk.value = env.elevation > -1 ? 1 : 0;
      // Warm glow on the sun's side from golden hour to the end of civil twilight.
      u.glow.value = Math.max(0, 1 - Math.abs(env.elevation - 0.5) / 7.5) * 0.55;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

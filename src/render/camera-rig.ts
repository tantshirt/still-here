import * as THREE from 'three';
import type { AppContext } from '../app/context';

const PRESETS = { under: -35, level: 5, above: 65 } as const;

export type CameraPreset = keyof typeof PRESETS;

export interface SlabBounds {
  readonly longEdge: number;
  readonly shortEdge: number;
  readonly thickness: number;
  readonly figureHeight: number;
}

export function fitCamera(
  camera: THREE.PerspectiveCamera,
  preset: CameraPreset,
  bounds: SlabBounds,
): void {
  const elevation = THREE.MathUtils.degToRad(PRESETS[preset]);
  const direction = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
  const { longEdge, shortEdge, thickness, figureHeight } = bounds;
  const edgeZ = shortEdge / 2;
  const corners: THREE.Vector3[] = [];
  for (const x of [-longEdge / 2, longEdge / 2]) {
    for (const y of [-thickness, figureHeight]) {
      for (const z of [-edgeZ, edgeZ]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  const fits = (distance: number) => {
    camera.position.copy(direction).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return corners.every(corner => {
      const projected = corner.clone().project(camera);
      return projected.z < 1 && Math.abs(projected.x) <= 0.7 && Math.abs(projected.y) <= 0.7;
    });
  };
  let lo = 5;
  let hi = 600;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  fits(hi);
}

export function applyCameraPreset(
  camera: THREE.PerspectiveCamera,
  context: Pick<AppContext, 'camera'>,
  bounds: SlabBounds,
  width: number,
  height: number,
): void {
  camera.aspect = width / height;
  camera.fov = 40;
  fitCamera(camera, context.camera, bounds);
  camera.updateProjectionMatrix();
}

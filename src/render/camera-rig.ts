import * as THREE from 'three';
import { tokens } from '../generated/tokens';
import type { AppContext } from '../app/context';

const PRESETS = { under: -35, level: 5, above: 65 } as const;

export type CameraPreset = keyof typeof PRESETS;

export interface SlabBounds {
  readonly longEdge: number;
  readonly shortEdge: number;
  readonly thickness: number;
  readonly figureHeight: number;
}

export function fitCameraDistance(
  camera: THREE.PerspectiveCamera,
  preset: CameraPreset,
  bounds: SlabBounds,
): number {
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
  return hi;
}

export function fitCamera(
  camera: THREE.PerspectiveCamera,
  preset: CameraPreset,
  bounds: SlabBounds,
): void {
  fitCameraDistance(camera, preset, bounds);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

export interface CameraRigState {
  readonly preset: CameraPreset;
  readonly tweenFromSceneT: number;
  readonly tweenStartSceneT: number;
  readonly tweenDuration: number;
  readonly fromDistance: number;
  readonly toDistance: number;
  readonly elevation: number;
}

export function createCameraRig(initial: CameraPreset = 'under'): {
  readonly getPreset: () => CameraPreset;
  requestPreset(
    preset: CameraPreset,
    sceneT: number,
    camera: THREE.PerspectiveCamera,
    bounds: SlabBounds,
    reducedMotion: boolean,
  ): void;
  update(
    camera: THREE.PerspectiveCamera,
    bounds: SlabBounds,
    width: number,
    height: number,
    sceneT: number,
    paused: boolean,
  ): void;
} {
  let preset = initial;
  let rig: CameraRigState | null = null;
  let frozenSceneT: number | null = null;

  const directionFor = (elevationDeg: number) => {
    const elevation = THREE.MathUtils.degToRad(elevationDeg);
    return new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
  };

  const applyPose = (
    camera: THREE.PerspectiveCamera,
    bounds: SlabBounds,
    width: number,
    height: number,
    elevationDeg: number,
    distance: number,
  ) => {
    camera.aspect = width / height;
    camera.fov = 40;
    const direction = directionFor(elevationDeg);
    camera.position.copy(direction).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };

  return {
    getPreset: () => preset,
    requestPreset(next, sceneT, camera, bounds, reducedMotion) {
      if (next === preset && !rig) return;
      const elevation = PRESETS[next];
      const toDistance = fitCameraDistance(camera, next, bounds);
      const fromDistance = camera.position.length() || fitCameraDistance(camera, preset, bounds);
      preset = next;
      if (reducedMotion) {
        rig = null;
        frozenSceneT = null;
        return;
      }
      rig = {
        preset: next,
        tweenFromSceneT: sceneT,
        tweenStartSceneT: sceneT,
        tweenDuration: tokens.motion.camera / 1000,
        fromDistance,
        toDistance,
        elevation,
      };
      frozenSceneT = null;
    },
    update(camera, bounds, width, height, sceneT, paused) {
      const elevation = rig ? rig.elevation : PRESETS[preset];
      if (rig) {
        if (paused && frozenSceneT === null) frozenSceneT = sceneT;
        if (!paused && frozenSceneT !== null) {
          const delta = sceneT - frozenSceneT;
          rig = {
            ...rig,
            tweenStartSceneT: rig.tweenStartSceneT + delta,
            tweenFromSceneT: rig.tweenFromSceneT + delta,
          };
          frozenSceneT = null;
        }
        const effectiveT = paused && frozenSceneT !== null ? frozenSceneT : sceneT;
        const elapsed = Math.max(0, effectiveT - rig.tweenStartSceneT);
        const progress = Math.min(1, elapsed / rig.tweenDuration);
        const distance = rig.fromDistance + (rig.toDistance - rig.fromDistance) * progress;
        applyPose(camera, bounds, width, height, elevation, distance);
        if (progress >= 1) rig = null;
        return;
      }
      const distance = fitCameraDistance(camera, preset, bounds);
      applyPose(camera, bounds, width, height, elevation, distance);
    },
  };
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

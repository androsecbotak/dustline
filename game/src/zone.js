// Blue Zone: the signature PUBG-style shrinking circle for DUSTLINE v2.
// 5 phases. Each phase: a wait (safe inside the current circle), then a shrink
// toward a smaller circle picked inside the current one. Standing outside the
// circle drains health at the phase's damage-per-second rate. The final circle
// is ~3 units wide and never shrinks further.
import * as THREE from 'three';

export const PHASE_COUNT = 5;
export const WAIT_SECONDS = [25, 20, 18, 15, 12];
export const SHRINK_SECONDS = [15, 12, 10, 8, 6];
export const DPS = [2, 4, 6, 10, 15];
export const RADIUS_FACTOR = [0.62, 0.55, 0.5, 0.45, 0.93];
export const START_RADIUS = 42;
export const WALL_HEIGHT = 30;

function pickNextTarget(center, radius, phase, rng) {
  // Next center: random point inside the current circle, offset up to 40% of
  // the current radius from the current center (seeded rng, so replays match).
  const maxOffset = radius * 0.4;
  const angle = rng() * Math.PI * 2;
  const dist = Math.sqrt(rng()) * maxOffset;
  const nextCenter = {
    x: center.x + Math.cos(angle) * dist,
    z: center.z + Math.sin(angle) * dist,
  };
  const nextRadius = radius * RADIUS_FACTOR[phase];
  return { nextCenter, nextRadius };
}

export function createZone(scene, bounds, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  const mapCenter = { x: 0, z: 0 };

  const state = {
    phase: 0, // 0..4, or 5 when done
    phaseState: 'wait', // 'wait' | 'shrink' | 'done'
    timer: WAIT_SECONDS[0], // seconds left in the current wait/shrink
    center: { ...mapCenter },
    radius: START_RADIUS,
    nextCenter: { ...mapCenter },
    nextRadius: START_RADIUS,
    dps: DPS[0],
  };

  // Shrink interpolation bookkeeping (not part of the HUD-facing state).
  let shrinkFrom = { ...mapCenter };
  let shrinkFromRadius = START_RADIUS;
  let shrinkElapsed = 0;
  let shrinkDuration = SHRINK_SECONDS[0];

  function setNextTarget() {
    const { nextCenter, nextRadius } = pickNextTarget(
      state.center, state.radius, state.phase, random,
    );
    state.nextCenter = nextCenter;
    state.nextRadius = nextRadius;
  }

  // ---- Rendering -----------------------------------------------------------
  const wallGeo = new THREE.CylinderGeometry(1, 1, WALL_HEIGHT, 64, 1, true);
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x3a7bff,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(state.center.x, WALL_HEIGHT / 2, state.center.z);
  wall.scale.set(state.radius, 1, state.radius);
  scene.add(wall);

  // Thin white ring on the ground marking where the NEXT zone will be.
  const ringGeo = new THREE.RingGeometry(0.96, 1.0, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const nextRing = new THREE.Mesh(ringGeo, ringMat);
  nextRing.rotation.x = -Math.PI / 2;
  nextRing.position.set(state.nextCenter.x, 0.05, state.nextCenter.z);
  nextRing.scale.set(state.nextRadius, state.nextRadius, 1);
  scene.add(nextRing);

  function syncMeshes() {
    wall.position.set(state.center.x, WALL_HEIGHT / 2, state.center.z);
    wall.scale.set(state.radius, 1, state.radius);
    nextRing.position.set(state.nextCenter.x, 0.05, state.nextCenter.z);
    nextRing.scale.set(state.nextRadius, state.nextRadius, 1);
    nextRing.visible = state.phaseState !== 'done';
  }

  setNextTarget();
  syncMeshes();

  function beginShrink() {
    state.phaseState = 'shrink';
    shrinkFrom = { ...state.center };
    shrinkFromRadius = state.radius;
    shrinkElapsed = 0;
    shrinkDuration = SHRINK_SECONDS[state.phase];
    state.timer = shrinkDuration;
  }

  function finishShrink() {
    // Snap to the target, then advance to the next phase (or finish).
    state.center = { ...state.nextCenter };
    state.radius = state.nextRadius;
    state.phase += 1;
    if (state.phase >= PHASE_COUNT) {
      state.phase = PHASE_COUNT;
      state.phaseState = 'done';
      state.timer = 0;
      state.dps = DPS[PHASE_COUNT - 1];
      state.nextCenter = { ...state.center };
      state.nextRadius = state.radius;
      return;
    }
    state.dps = DPS[state.phase];
    state.phaseState = 'wait';
    state.timer = WAIT_SECONDS[state.phase];
    setNextTarget();
  }

  function step(dt) {
    if (state.phaseState === 'done') return;
    if (state.phaseState === 'wait') {
      state.timer -= dt;
      // Snap tiny float residue to zero so exact-duration fast-forwards land.
      if (state.timer <= 1e-9) {
        state.timer = 0;
        beginShrink();
      }
      return;
    }
    // 'shrink': interpolate center/radius toward the next circle.
    shrinkElapsed += dt;
    state.timer = Math.max(0, shrinkDuration - shrinkElapsed);
    const t = Math.min(1, shrinkElapsed / shrinkDuration);
    state.center = {
      x: shrinkFrom.x + (state.nextCenter.x - shrinkFrom.x) * t,
      z: shrinkFrom.z + (state.nextCenter.z - shrinkFrom.z) * t,
    };
    state.radius = shrinkFromRadius + (state.nextRadius - shrinkFromRadius) * t;
    if (t >= 1 || shrinkDuration - shrinkElapsed <= 1e-9) finishShrink();
  }

  return {
    state,

    update(dt) {
      step(dt);
      syncMeshes();
      return state;
    },

    // Damage per second at a map point: phase dps outside the circle, 0 inside.
    damageAt(x, z) {
      const dx = x - state.center.x;
      const dz = z - state.center.z;
      return Math.hypot(dx, dz) > state.radius ? state.dps : 0;
    },

    // Advance the zone clock by `seconds` (testing helper: force fast shrinks).
    setFastForward(seconds) {
      let remaining = seconds;
      while (remaining > 0 && state.phaseState !== 'done') {
        const chunk = Math.min(0.05, remaining);
        step(chunk);
        remaining -= chunk;
      }
      syncMeshes();
      return state;
    },

    // Shallow copy of the HUD-facing state (center/nextCenter are copied too).
    getState() {
      return {
        ...state,
        center: { ...state.center },
        nextCenter: { ...state.nextCenter },
      };
    },
  };
}

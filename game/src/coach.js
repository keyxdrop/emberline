// The first-minute coach: three small pieces of guidance that teach the game
// while it is being played, and nothing else. An objective marker floats over
// the place the round wants the player to be (a Relay to plant at, the
// team-mate carrying the Spark, the planted charge to defend), with its
// distance; a hint chip above the objective line names the one job of the
// moment in the early rounds; and a red arc at the crosshair shows which
// direction a hit just came from. Pure DOM and projection math: main.js says
// where the objective is and where a hit came from, and calls update() once a
// frame with the camera. The coach never touches the simulation.
import * as THREE from 'three';

const scratch = new THREE.Vector3();

export function createCoach() {
  const marker = document.getElementById('waypoint');
  const markerLabel = document.getElementById('waypoint-label');
  const markerDist = document.getElementById('waypoint-dist');
  const arc = document.getElementById('dmgdir');
  const chip = document.getElementById('hint');

  let target = null; // { x, y, z } in world space, or null for no marker
  let targetLabel = '';
  let arcTimer = 0;
  let lastHint = '';

  function hideMarker() {
    if (marker && !marker.hidden) marker.hidden = true;
  }

  return {
    // Point the marker at a world position, or clear it with null.
    setTarget(point, label) {
      if (!point) {
        target = null;
        hideMarker();
        return;
      }
      target = point;
      targetLabel = label || '';
      if (markerLabel && markerLabel.textContent !== targetLabel) markerLabel.textContent = targetLabel;
    },

    // A hit landed on the player from world position `from`: flash the arc at
    // the bearing relative to where the player is facing (0 = ahead).
    damageFrom(from, playerPos, yaw) {
      if (!arc || !from) return;
      const dx = from.x - playerPos.x;
      const dz = from.z - playerPos.z;
      // Player forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const rel = Math.atan2(dx * rightX + dz * rightZ, dx * fwdX + dz * fwdZ);
      arc.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
      arc.classList.add('on');
      clearTimeout(arcTimer);
      arcTimer = setTimeout(() => arc.classList.remove('on'), 650);
    },

    // The one job of the moment, in words. Pass '' to clear the chip.
    hint(text) {
      if (!chip || text === lastHint) return;
      lastHint = text;
      chip.textContent = text || '';
      chip.hidden = !text;
    },

    // Project the marker once per frame. Behind the camera or too close to
    // matter (the player is standing on it) hides it.
    update(camera, playerPos) {
      if (!marker || !target) return;
      scratch.set(target.x, target.y, target.z);
      const dist = playerPos ? Math.hypot(target.x - playerPos.x, target.z - playerPos.z) : 0;
      scratch.project(camera);
      if (scratch.z > 1 || scratch.z < -1 || dist < 2.2) {
        hideMarker();
        return;
      }
      const x = (scratch.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-scratch.y * 0.5 + 0.5) * window.innerHeight;
      marker.style.left = `${x.toFixed(0)}px`;
      marker.style.top = `${y.toFixed(0)}px`;
      if (markerDist) markerDist.textContent = `${Math.round(dist)}m`;
      marker.hidden = false;
    },
  };
}

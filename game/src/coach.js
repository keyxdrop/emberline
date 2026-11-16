// coach.js — the quiet instructor riding on the player's shoulder. It owns
// three teaching tools: the objective marker (what to do, where, how far), the
// hint chips that sequence the first two rounds and then get out of the way,
// and the damage-direction arc that turns "shot from nowhere" into "shot from
// there". It reads a state snapshot from the game and never touches the rules.

import * as THREE from 'three';

const wrapPi = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class Coach {
  constructor(hud, camera) {
    this.hud = hud;
    this.camera = camera;
    this.v = new THREE.Vector3();
    this.taughtHurt = false;
  }

  resetMatch() {
    this.taughtHurt = false;
    this.hud.clearChips();
  }

  onBuyPhase(round) {
    if (round === 1) {
      this.hud.chips([
        'BUY — click a row or press 1–8. The Forgeline is the pro pick.',
        'You hold the Spark Charge ◆ — your squad will guard you.',
      ]);
    } else if (round === 2) {
      this.hud.chips([
        'Slagweave Vest turns away a third of every bullet.',
        'Won the round? Winners bank $2,700. Spend it before it rusts.',
      ]);
    } else {
      this.hud.clearChips();
    }
  }

  onLiveStart(round) {
    if (round === 1) {
      this.hud.chips([
        'Follow the ◆ marker north to the Forge.',
        'Inside the glowing ring, hold E to plant the charge.',
      ]);
    } else if (round === 2) {
      this.hud.chips([
        'Shift walks, Ctrl crouches, R reloads, G throws a Pop Charge.',
        'The red arc after a hit points straight at your shooter.',
      ]);
    } else {
      this.hud.clearChips();
    }
  }

  onPlanted(byUs) {
    if (byUs) this.hud.chips(['Charge live — 30 seconds. Guard it, do not chase.']);
  }

  onDefuseThreat() {
    this.hud.chips(['They are defusing — get to the Forge, now!']);
  }

  onPlayerHurt(shooterPos, playerPos, playerYaw) {
    if (!this.taughtHurt) {
      this.taughtHurt = true;
      this.hud.chips(['That red arc points at your shooter. Use it.']);
    }
    // Bearing of the shooter in the player's own frame: 0 ahead, + right.
    const worldYaw = Math.atan2(-(shooterPos.x - playerPos.x), -(shooterPos.z - playerPos.z));
    this.hud.damageFrom(wrapPi(worldYaw - playerYaw));
  }

  // The marker, refreshed every frame from the game's snapshot.
  update(snap) {
    if (!snap.playerAlive || (snap.phase !== 'live' && snap.phase !== 'planted')) {
      this.hud.marker(false);
      return;
    }
    let target = null;
    let label = '';
    if (snap.planted) {
      target = snap.chargePos;
      label = 'GUARD THE CHARGE';
    } else if (snap.playerHasCharge) {
      target = snap.sitePos;
      label = 'PLANT AT THE FORGE';
    } else if (snap.carrierPos) {
      target = snap.carrierPos;
      label = `PROTECT ${snap.carrierName}`;
    } else if (snap.chargePos) {
      target = snap.chargePos;
      label = 'RECOVER THE CHARGE';
    }
    if (!target) {
      this.hud.marker(false);
      return;
    }
    this.v.set(target.x, (target.y ?? 1.6), target.z).project(this.camera);
    const dist = this.camera.position.distanceTo(new THREE.Vector3(target.x, 1.2, target.z));
    if (this.v.z > 1) {
      // Behind the camera: pin to the bottom edge so the player turns around.
      this.hud.marker(true, window.innerWidth / 2, window.innerHeight - 90, label, dist);
      return;
    }
    const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    const clampedX = Math.max(50, Math.min(window.innerWidth - 50, x));
    const clampedY = Math.max(70, Math.min(window.innerHeight - 60, y));
    this.hud.marker(true, clampedX, clampedY, label, dist);
  }
}

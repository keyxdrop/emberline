// hud.js — everything drawn over the 3D world: scoreboard, clock, wallet,
// health, killfeed, radio, banners, the buy menu, the objective marker and the
// damage arc. Pure DOM work; the game tells it what happened and it paints.
// Element ids are a contract with game/index.html.

import { WEAPONS, GEAR, BUY_ROWS } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), clock: $('roundClock'), live: $('livePill'),
      scoreE: $('scoreEmber'), scoreA: $('scoreAshen'), roundLabel: $('roundLabel'),
      money: $('money'), hpFill: $('hpFill'), hpText: $('hpText'),
      armourTag: $('armourTag'), weapon: $('weaponText'), ammo: $('ammoText'),
      gear: $('gearText'), killfeed: $('killfeed'), radio: $('radio'),
      banner: $('banner'), bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub'),
      chips: $('chips'), marker: $('marker'), markerLabel: $('markerLabel'),
      markerDist: $('markerDist'), dmg: $('dmgArc'), hit: $('hitmarker'),
      buy: $('buyMenu'), buyGrid: $('buyGrid'), buyMoney: $('buyMoney'),
      buyClock: $('buyClock'), plant: $('plantBar'), plantFill: $('plantFill'),
      plantLabel: $('plantLabel'), flash: $('flashOverlay'), lowHp: $('lowHp'),
      start: $('startScreen'), end: $('endScreen'), endTitle: $('endTitle'),
      endStats: $('endStats'), charge: $('chargeTag'),
    };
    this.bannerTimer = 0;
    this.dmgTimer = 0;
    this.hitTimer = 0;
    this.radioTimer = 0;
    this.buildBuyRows();
  }

  buildBuyRows() {
    this.buyRowEls = new Map();
    BUY_ROWS.forEach((row, i) => {
      const def = WEAPONS[row.id] ?? GEAR[row.id];
      const div = document.createElement('button');
      div.className = 'buy-row';
      div.innerHTML =
        `<span class="buy-key">${i + 1}</span>` +
        `<span class="buy-main"><span class="buy-name">${def.name}</span>` +
        `<span class="buy-kind">${def.kind}</span>` +
        `<span class="buy-blurb">${def.blurb}</span></span>` +
        `<span class="buy-price">$${def.price}</span>` +
        `<span class="buy-state"></span>`;
      div.addEventListener('click', () => this.onBuy && this.onBuy(row.id));
      this.el.buyGrid.appendChild(div);
      this.buyRowEls.set(row.id, div);
    });
  }

  // Refresh every row's affordability and ownership for the current wallet.
  refreshBuy(money, owned) {
    for (const [id, div] of this.buyRowEls) {
      const def = WEAPONS[id] ?? GEAR[id];
      const has = owned.has(id);
      div.classList.toggle('owned', has);
      div.classList.toggle('poor', !has && money < def.price);
      div.querySelector('.buy-state').textContent = has ? 'OWNED' : money < def.price ? '—' : 'BUY';
    }
    this.el.buyMoney.textContent = `$${money}`;
  }

  showBuy(seconds) {
    this.el.buy.classList.add('open');
    this.el.buyClock.textContent = `Round starts in ${Math.ceil(seconds)}s — press B to close early`;
  }

  hideBuy() {
    this.el.buy.classList.remove('open');
  }

  setScore(ember, ashen, round) {
    this.el.scoreE.textContent = ember;
    this.el.scoreA.textContent = ashen;
    this.el.roundLabel.textContent = `ROUND ${round}`;
  }

  setClock(seconds, planted) {
    const s = Math.max(0, Math.ceil(seconds));
    this.el.clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.clock.classList.toggle('danger', planted || s <= 15);
    this.el.live.innerHTML = planted ? '● CHARGE LIVE' : '● LIVE';
    this.el.live.classList.toggle('planted', !!planted);
  }

  setWallet(money) {
    this.el.money.textContent = `$${money}`;
  }

  setPlayer(hp, armour, weaponName, ammo, reserve, grenades, flashes, hasCharge) {
    this.el.hpFill.style.width = `${Math.max(0, hp)}%`;
    this.el.hpFill.classList.toggle('low', hp <= 35);
    this.el.hpText.textContent = `${Math.ceil(hp)}`;
    this.el.armourTag.textContent = armour ? '🛡 VEST' : '';
    this.el.weapon.textContent = weaponName;
    this.el.ammo.innerHTML = `${ammo}<span class="ammo-res"> / ${reserve}</span>`;
    const bits = [];
    if (grenades > 0) bits.push(`G — Pop Charge ×${grenades}`);
    if (flashes > 0) bits.push(`F — Flash ×${flashes}`);
    this.el.gear.textContent = bits.join('   ');
    this.el.charge.textContent = hasCharge ? '◆ YOU HOLD THE SPARK CHARGE — plant it at the Forge' : '';
    this.el.lowHp.classList.toggle('on', hp <= 35 && hp > 0);
  }

  killfeed(killer, victim, weaponName, killerTeam, victimTeam) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML =
      `<span class="feed-k ${killerTeam}">${killer}</span>` +
      `<span class="feed-w">${weaponName}</span>` +
      `<span class="feed-v ${victimTeam}">▸ ${victim}</span>`;
    this.el.killfeed.appendChild(row);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.firstChild.remove();
    setTimeout(() => row.classList.add('fade'), 4200);
    setTimeout(() => row.remove(), 5000);
  }

  radio(name, line, team) {
    this.el.radio.innerHTML = `<span class="radio-name ${team}">⌁ ${name}:</span> ${line}`;
    this.el.radio.classList.add('show');
    this.radioTimer = 4.2;
  }

  banner(title, sub, seconds = 3.2) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub ?? '';
    this.el.banner.classList.add('show');
    this.bannerTimer = seconds;
  }

  // The end-shot callout: a smaller, hotter line under the round banner that
  // names the kill the round will be remembered by.
  callout(text) {
    const el = $('callout');
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3400);
  }

  chips(list) {
    this.el.chips.innerHTML = '';
    for (const text of list) {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = text;
      this.el.chips.appendChild(chip);
    }
  }

  clearChips() {
    this.el.chips.innerHTML = '';
  }

  // Objective marker: screen-space pin with a live distance readout.
  marker(show, x, y, label, dist) {
    if (!show) {
      this.el.marker.classList.remove('show');
      return;
    }
    this.el.marker.classList.add('show');
    this.el.marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    this.el.markerLabel.textContent = label;
    this.el.markerDist.textContent = `${Math.max(1, Math.round(dist))}m`;
  }

  // The red arc that points at whoever just shot the player. Bearing is in
  // radians, 0 = ahead, positive = to the right.
  damageFrom(bearing) {
    this.el.dmg.style.transform = `translate(-50%, -50%) rotate(${bearing}rad)`;
    this.el.dmg.classList.add('show');
    this.dmgTimer = 0.7;
  }

  hitmarker(kill) {
    this.el.hit.classList.toggle('kill', !!kill);
    this.el.hit.classList.add('show');
    this.hitTimer = kill ? 0.22 : 0.1;
  }

  plantProgress(frac, label) {
    if (frac === null) {
      this.el.plant.classList.remove('show');
      return;
    }
    this.el.plant.classList.add('show');
    this.el.plantFill.style.width = `${Math.round(frac * 100)}%`;
    this.el.plantLabel.textContent = label;
  }

  flash(opacity) {
    this.el.flash.style.opacity = String(opacity);
  }

  showStart() { this.el.start.classList.add('open'); }
  hideStart() { this.el.start.classList.remove('open'); }

  showEnd(title, statsHtml) {
    this.el.endTitle.textContent = title;
    this.el.endStats.innerHTML = statsHtml;
    this.el.end.classList.add('open');
  }
  hideEnd() { this.el.end.classList.remove('open'); }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
    if (this.dmgTimer > 0) {
      this.dmgTimer -= dt;
      if (this.dmgTimer <= 0) this.el.dmg.classList.remove('show');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hit.classList.remove('show');
    }
    if (this.radioTimer > 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) this.el.radio.classList.remove('show');
    }
  }
}

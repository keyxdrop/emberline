// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, rosters,
// killfeed, buy menu, banners and the one overlay panel. It never touches the
// simulation; main.js pushes numbers in and reads the callbacks out.
import { WEAPONS, GRENADE, FLASH, ARMOR } from './weapons.js';

const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'A 5v5 tactical FPS that runs entirely in your browser — no download, no sign-up. Ember plants the Spark; Ashen stops them. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoEl = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorFill = $('armor-fill');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const timerLabel = $('timer-label');
  const scoreEmber = $('score-ember');
  const scoreAshen = $('score-ashen');
  const roundValue = $('round-value');
  const objective = $('objective');
  const area = $('area-name');
  const rosterEmber = $('roster-ember-list');
  const rosterAshen = $('roster-ashen-list');
  const killfeed = $('killfeed');
  const callouts = $('callouts');
  const flashEl = $('flash');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const progress = $('progress');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const vignette = $('vignette');
  const spectate = $('spectate');

  let hitTimer = 0;
  let lastAmmo = '';
  let lastHealth = '';
  let lastTimer = '';
  let lastScore = '';
  let lastRoster = '';
  let lastMoney = -1;
  let bannerTimer = 0;

  function row(name, hp, alive, isPlayer, isCarrier) {
    const cls = alive ? '' : ' dead';
    const shown = isPlayer ? 'YOU' : name;
    const carry = isCarrier ? ' ◆' : '';
    return `<div class="roster-row${cls}"><span>${shown}${carry}</span><span class="roster-hp">${alive ? hp : '✕'}</span></div>`;
  }

  const buyItems = [
    ...WEAPONS.map((w, i) => ({ key: String(i + 1), name: w.name, price: w.price, index: i, kind: 'weapon' })),
    { key: '6', name: GRENADE.name, price: GRENADE.price, index: 5, kind: 'grenade' },
    { key: '7', name: ARMOR.name, price: ARMOR.price, index: 6, kind: 'armor' },
    { key: '8', name: FLASH.name, price: FLASH.price, index: 7, kind: 'flash' },
  ];

  return {
    setHealth(hp, armor) {
      const key = `${hp}|${armor}`;
      if (key === lastHealth) return;
      lastHealth = key;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
      armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      const key = `${mag}|${reserve}|${name}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;
      const key = `${text}|${phase}`;
      if (key === lastTimer) return;
      lastTimer = key;
      timerValue.textContent = text;
      timerLabel.textContent = phase === 'buy' ? 'BUY' : phase === 'planted' ? 'SPARK LIVE' : phase === 'over' ? 'ROUND OVER' : 'LIVE';
      timerValue.classList.toggle('urgent', s <= 10 && phase !== 'buy' && phase !== 'over');
    },
    setScore(ember, ashen, round) {
      const key = `${ember}|${ashen}|${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreEmber.textContent = String(ember);
      scoreAshen.textContent = String(ashen);
      roundValue.textContent = `ROUND ${round}`;
    },
    setObjective(text) {
      if (objective.textContent !== text) objective.textContent = text;
    },
    setArea(name) {
      if (area.textContent !== name) area.textContent = name;
    },
    setRoster(ember, ashen) {
      const sig = JSON.stringify([ember, ashen]);
      if (sig === lastRoster) return;
      lastRoster = sig;
      rosterEmber.innerHTML = ember.map((p) => row(p.name, p.hp, p.alive, p.isPlayer, p.isCarrier)).join('');
      rosterAshen.innerHTML = ashen.map((p) => row(p.name, p.hp, p.alive, p.isPlayer, p.isCarrier)).join('');
    },
    killfeed(killer, killerTeam, victim, victimTeam, headshot) {
      const entry = document.createElement('div');
      entry.className = 'killfeed-entry';
      entry.innerHTML = `<span class="${killerTeam}">${killer}</span> ${headshot ? '◉' : '✕'} <span class="${victimTeam}">${victim}</span>`;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.remove(), 5200);
    },
    // Team radio: a named line in the speaker's team colour, gone in seconds.
    callout(name, team, text) {
      if (!callouts) return;
      const entry = document.createElement('div');
      entry.className = 'callout-entry';
      entry.innerHTML = `<span class="${team}">${name}</span> — ${text}`;
      callouts.appendChild(entry);
      while (callouts.children.length > 3) callouts.removeChild(callouts.firstChild);
      setTimeout(() => entry.remove(), 4600);
    },
    // A flash charge went off in the player's face: white out, then fade.
    whiteFlash(strength = 1) {
      if (!flashEl) return;
      flashEl.style.transition = 'none';
      flashEl.style.opacity = String(Math.min(1, strength));
      requestAnimationFrame(() => {
        flashEl.style.transition = 'opacity 900ms ease-out';
        flashEl.style.opacity = '0';
      });
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 140);
    },
    banner(titleText, sub, tone, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub || '';
      banner.className = `banner show ${tone || ''}`;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('show'), holdMs);
    },
    showBuy(money, owned) {
      buyMoney.textContent = `$${money}`;
      buyList.innerHTML = buyItems.map((item) => {
        const has = item.kind === 'weapon' ? owned(item.index) : false;
        const afford = money >= item.price;
        return `<button type="button" class="buy-row${has ? ' owned' : ''}${afford ? '' : ' poor'}" data-index="${item.index}" data-kind="${item.kind}">
          <span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span>
          <span class="buy-state">${has ? 'OWNED' : `$${item.price}`}</span></button>`;
      }).join('');
      buyList.querySelectorAll('.buy-row').forEach((el) => {
        el.addEventListener('click', () => callbacks.onBuy(Number(el.dataset.index), el.dataset.kind));
      });
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    buyOpen() {
      return !buyMenu.hidden;
    },
    showProgress(label, frac) {
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    },
    hideProgress() {
      progress.hidden = true;
    },
    setSpectate(name) {
      spectate.hidden = !name;
      if (name) spectate.textContent = `Spectating ${name} — next round to play`;
    },
    showOverlay(mode, data) {
      // The three-step brief belongs to the start screen only; the round and
      // match panels keep their own story.
      const steps = document.getElementById('brief-steps');
      if (steps) steps.style.display = mode === 'start' ? '' : 'none';
      if (mode === 'match') {
        title.textContent = data.winner === 'ember' ? 'EMBERLINE WINS' : data.winner === 'ashen' ? 'ASHEN WINS' : 'DRAW';
        copy.textContent = `Final ${data.ember} — ${data.ashen}. ${data.winner === 'ember' ? 'The yard is yours.' : 'The yard holds its breath.'}`;
        play.textContent = 'Play again';
      } else if (mode === 'round') {
        title.textContent = data.winner === 'ember' ? 'Round to Ember' : 'Round to Ashen';
        copy.textContent = `${data.reason}. ${data.ember} — ${data.ashen}.`;
        play.textContent = 'Next round';
      } else {
        const text = COPY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}

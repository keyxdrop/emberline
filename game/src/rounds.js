// The match: rounds, phases, economy and the objective, as one state machine.
// Phases: buy (15 s, shop open) -> live (100 s) -> planted (35 s fuse, once the
// Spark Charge is down) -> over (4 s banner) -> next round, or match end at 5
// round wins (9 rounds max). Money: kill +300, plant/defuse +300, round win
// +3000, round loss +1500. main.js wires the events out to HUD, audio and bots.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createMatch() {
  const state = {
    phase: 'buy',
    round: 1,
    score: { ember: 0, ashen: 0 },
    timer: BUY_SECONDS,
    money: 800,
    kills: 0,
    deaths: 0,
    plant: { site: null, planted: false, fuse: 0, progress: 0, defuse: 0 },
    winner: null,
    reason: '',
    matchWinner: null,
  };

  let events = {};

  function setPhase(phase, timer) {
    state.phase = phase;
    state.timer = timer;
    if (events.onPhase) events.onPhase(phase);
  }

  function endRound(winner, reason) {
    if (state.phase === 'over') return;
    state.winner = winner;
    state.reason = reason;
    state.score[winner] += 1;
    state.money += winner === 'ember' ? 3000 : 1500;
    setPhase('over', 4);
    if (events.onRoundEnd) events.onRoundEnd(winner, reason, state.score);
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.score.ember > state.score.ashen ? 'ember'
        : state.score.ashen > state.score.ember ? 'ashen' : 'draw';
      if (events.onMatchEnd) events.onMatchEnd(state.matchWinner, state.score);
    }
  }

  return {
    state,
    on(evt) {
      events = evt;
    },
    startMatch() {
      state.round = 1;
      state.score.ember = 0;
      state.score.ashen = 0;
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.matchWinner = null;
      state.plant.site = null;
      state.plant.planted = false;
      state.plant.fuse = 0;
      state.plant.progress = 0;
      state.plant.defuse = 0;
      setPhase('buy', BUY_SECONDS);
    },
    startRound() {
      state.plant.site = null;
      state.plant.planted = false;
      state.plant.fuse = 0;
      state.plant.progress = 0;
      state.plant.defuse = 0;
      state.winner = null;
      state.reason = '';
      setPhase('buy', BUY_SECONDS);
    },
    nextRound() {
      state.round += 1;
      this.startRound();
    },
    startLive() {
      if (state.phase === 'buy') setPhase('live', ROUND_SECONDS);
    },
    plantAt(site) {
      state.plant.site = site;
      state.plant.planted = true;
      state.plant.fuse = FUSE_SECONDS;
      state.plant.progress = 0;
      state.plant.defuse = 0;
      state.money += 300;
      setPhase('planted', FUSE_SECONDS);
      if (events.onPlant) events.onPlant(site);
    },
    defused() {
      state.money += 300;
      endRound('ashen', 'Spark defused');
      if (events.onDefuse) events.onDefuse();
    },
    addKill(team) {
      if (team === 'ember') {
        state.kills += 1;
        state.money += 300;
      }
    },
    addDeath() {
      state.deaths += 1;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    update(dt, alive) {
      if (state.phase === 'over') {
        state.timer -= dt;
        return;
      }
      if (state.phase === 'buy') {
        state.timer -= dt;
        if (state.timer <= 0) this.startLive();
        return;
      }
      if (state.phase === 'live') {
        state.timer -= dt;
        if (alive.ember === 0) endRound('ashen', 'Ember team eliminated');
        else if (alive.ashen === 0) endRound('ember', 'Ashen team eliminated');
        else if (state.timer <= 0) endRound('ashen', 'Time expired — Ember failed to plant');
        return;
      }
      if (state.phase === 'planted') {
        state.timer -= dt;
        state.plant.fuse = state.timer;
        // A planted Spark keeps ticking even with Ember wiped out: Ashen must
        // still cut it (main.js advances the defuse, or auto-advances it with
        // nobody left to stop them). Elimination of Ashen ends it at once.
        if (alive.ashen === 0) {
          endRound('ember', 'Ashen team eliminated');
        } else if (state.timer <= 0) {
          endRound('ember', 'Spark detonated');
        }
      }
    },
    roundOver() {
      return state.timer <= 0 && state.phase === 'over';
    },
  };
}

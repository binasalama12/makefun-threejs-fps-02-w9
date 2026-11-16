// DOM HUD for Coral Marina: health, cash, round and timer up top, score
// chips, ammo block, a live kill feed, the buy panel, a plant progress bar
// and the menu/scoreboard overlay. It only renders what main.js hands it.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const hpNum = el('hp-num');
  const hpFill = el('hp-fill');
  const moneyEl = el('money');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo');
  const weaponName = el('weapon-name');
  const nadeCount = el('nade-count');
  const timerEl = el('timer');
  const phaseEl = el('phase-label');
  const roundEl = el('round-label');
  const scoreW = el('score-w');
  const scoreR = el('score-r');
  const objectiveEl = el('objective');
  const feedEl = el('feed');
  const hitmarker = el('hitmarker');
  const vignette = el('vignette');
  const cross = el('crosshair');
  const buyEl = el('buy');
  const buyRows = el('buy-rows');
  const buyMoney = el('buy-money');
  const plantWrap = el('plant-wrap');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const banner = el('banner');
  const overlay = el('overlay');
  const ovTitle = el('overlay-title');
  const ovCopy = el('overlay-copy');
  const ovStats = el('overlay-stats');
  const playBtn = el('play');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(node, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  return {
    setVitals(hp, money) {
      setText(hpNum, 'hp', String(Math.max(0, Math.ceil(hp))));
      hpFill.style.width = `${Math.max(0, hp)}%`;
      hpFill.style.background = hp > 55 ? 'var(--aqua)' : hp > 25 ? 'var(--brass)' : 'var(--coral)';
      setText(moneyEl, 'money', `$${money}`);
    },
    setAmmo(mag, reserve, name, grenades, smokes = 0) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wn', name);
      setText(nadeCount, 'nade', `Foam Burst × ${grenades} [G] · Mist Veil × ${smokes} [H]`);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setTop(round, wScore, rScore, seconds, phase) {
      setText(roundEl, 'round', `ROUND ${round}`);
      setText(scoreW, 'sw', String(wScore));
      setText(scoreR, 'sr', String(rScore));
      const t = Math.max(0, Math.ceil(seconds));
      setText(timerEl, 'timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      timerEl.classList.toggle('urgent', t <= 10 && phase === 'live');
      setText(phaseEl, 'phase', phase);
    },
    setObjective(text) { setText(objectiveEl, 'obj', text); },
    setCrosshair(spreadPx) {
      cross.style.setProperty('--sp', `${Math.round(6 + spreadPx)}px`);
    },
    hitMarker(kill, headshot = false) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      hitmarker.classList.toggle('head', headshot);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill', 'head'), kill ? 280 : headshot ? 200 : 110);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    feed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feedEl.prepend(line);
      while (feedEl.children.length > 5) feedEl.lastChild.remove();
      setTimeout(() => { line.style.opacity = '0'; }, 4200);
      setTimeout(() => { line.remove(); }, 4900);
    },
    // Kill feed entry: "Attacker ▸ Victim" with an optional weapon tag and a
    // coral ◎ HEADSHOT mark. Shares the feed stack (last 5, fading) so kills
    // read as one timeline instead of a second panel.
    killFeed(attacker, victim, { headshot = false, weapon = '', bonus = '' } = {}) {
      const line = document.createElement('div');
      line.className = 'feed-kill';
      const who = document.createElement('span');
      who.textContent = `${attacker} ▸ ${victim}`;
      line.append(who);
      if (weapon) {
        const w = document.createElement('span');
        w.className = 'feed-weapon';
        w.textContent = ` · ${weapon}`;
        line.append(w);
      }
      if (headshot) {
        const hs = document.createElement('span');
        hs.className = 'feed-hs';
        hs.textContent = ' ◎ HEADSHOT';
        line.append(hs);
      }
      if (bonus) {
        const b = document.createElement('span');
        b.textContent = ` ${bonus}`;
        line.append(b);
      }
      feedEl.prepend(line);
      while (feedEl.children.length > 5) feedEl.lastChild.remove();
      setTimeout(() => { line.style.opacity = '0'; }, 4600);
      setTimeout(() => { line.remove(); }, 5300);
    },
    showBanner(text, sub) {
      banner.innerHTML = '';
      const h = document.createElement('div');
      h.className = 'banner-title';
      h.textContent = text;
      const s = document.createElement('div');
      s.className = 'banner-sub';
      s.textContent = sub ?? '';
      banner.append(h, s);
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), 2600);
    },
    showBuy(items, money) {
      buyMoney.textContent = `Cash $${money} — press 1-6 to buy, B or wait to sail out`;
      buyRows.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('div');
        row.className = `buy-row${item.owned ? ' owned' : ''}${item.equipped ? ' equipped' : ''}${!item.afford && !item.owned ? ' poor' : ''}`;
        const left = document.createElement('span');
        left.textContent = `${item.key}. ${item.name}`;
        const right = document.createElement('span');
        right.textContent = item.equipped ? 'EQUIPPED' : item.owned ? 'OWNED' : `$${item.price}`;
        row.append(left, right);
        buyRows.append(row);
      }
      buyEl.hidden = false;
    },
    hideBuy() { buyEl.hidden = true; },
    buyVisible() { return !buyEl.hidden; },
    setPlant(frac, label) {
      if (frac === null) { plantWrap.hidden = true; return; }
      plantWrap.hidden = false;
      plantFill.style.width = `${Math.round(frac * 100)}%`;
      plantLabel.textContent = label;
    },
    showOverlay({ title, copy, stats, action }) {
      ovTitle.textContent = title;
      ovCopy.textContent = copy;
      ovStats.innerHTML = '';
      for (const line of stats ?? []) {
        const d = document.createElement('div');
        d.textContent = line;
        ovStats.append(d);
      }
      playBtn.textContent = action;
      overlay.hidden = false;
    },
    hideOverlay() { overlay.hidden = true; },
    overlayVisible() { return !overlay.hidden; },
    onPlay(handler) { playBtn.addEventListener('click', handler); },
  };
}

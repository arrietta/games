'use strict';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const isImg = s => typeof s === 'string' && (/^img:/.test(s) || /^https?:\/\/\S+\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(s));

// Text or picture: "img:pics/cat.png" or a direct image URL becomes <img>
function content(s) {
  if (isImg(s)) return el('img', { src: s.replace(/^img:/, ''), alt: '', draggable: 'false' });
  return el('span', {}, String(s));
}

function flash(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// ---------- sound ----------
let ac, muted = false;
function tone(freqs, dur = 0.12, type = 'sine', vol = 0.15) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * dur;
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + dur);
    });
  } catch { /* no audio */ }
}
const sfx = {
  ok: () => tone([660, 880]),
  bad: () => tone([220, 160], 0.15, 'triangle', 0.25),
  win: () => tone([523, 659, 784, 1047], 0.14),
  tick: () => tone([900], 0.03, 'square', 0.04),
};

// ---------- shell ----------
const TYPE_NAMES = {
  quiz: 'Викторина', truefalse: 'Правда или ложь', match: 'Найди пару',
  flashcards: 'Карточки', anagram: 'Анаграмма', groupsort: 'Сортировка по группам', wheel: 'Колесо фортуны', whack: 'Бей крота',
};
const TYPE_HELP = {
  quiz: 'Выбери правильный ответ.',
  truefalse: 'Реши, верно утверждение или нет.',
  match: 'Нажми на слово слева, затем на его пару справа.',
  flashcards: 'Нажми на карточку, чтобы перевернуть. Отметь, знал ли ты ответ.',
  anagram: 'Собери слово из перемешанных букв.',
  groupsort: 'Перетащи (или нажми и выбери группу) каждый элемент в нужную группу.',
  wheel: 'Крути колесо!',
  whack: 'Бей крота, у которого неправильный ответ! Правильных не трогай.',
};

const stage = $('#stage');
let data, t0, timerId;

const G = {
  stage,
  score(text) { $('#score').textContent = text ?? ''; },
  progress(i, n) { $('#progress').style.width = n ? (100 * i / n) + '%' : '0'; },
  startTimer() {
    t0 = Date.now();
    clearInterval(timerId);
    const tick = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $('#timer').textContent = '⏱ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    tick();
    timerId = setInterval(tick, 500);
  },
  stopTimer() { clearInterval(timerId); },
  finish(ok, total, note) {
    G.stopTimer();
    G.progress(1, 1);
    const ratio = total ? ok / total : 1;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;
    if (stars >= 2) sfx.win();
    stage.replaceChildren(el('div', { class: 'card intro pop' },
      el('div', { class: 'stars' }, [1, 2, 3].map(n => el('span', { class: n <= stars ? '' : 'off' }, '⭐'))),
      el('h2', {}, ['Попробуй ещё!', 'Неплохо!', 'Хорошо!', 'Отлично!'][stars]),
      el('p', { class: 'big-q' }, `${ok} из ${total}`),
      el('p', { class: 'muted' }, ($('#timer').textContent || '') + (note ? ' · ' + note : '')),
      el('div', { class: 'row' }, el('button', { class: 'btn', onclick: intro }, '↻ Ещё раз')),
    ));
  },
};

function intro() {
  G.stopTimer();
  G.score('');
  G.progress(0, 0);
  $('#timer').textContent = '';
  stage.replaceChildren(el('div', { class: 'card intro pop' },
    el('div', { class: 'type' }, TYPE_NAMES[data.type] || data.type),
    el('h2', {}, data.title),
    el('p', { class: 'muted' }, data.instructions || TYPE_HELP[data.type] || ''),
    el('button', { class: 'btn', onclick: play }, '▶ Начать'),
  ));
}

function play() {
  stage.replaceChildren();
  if (data.type !== 'wheel') G.startTimer();
  GAMES[data.type](data, G);
}

// ---------- games ----------
const GAMES = {};

// items: [{ q, a, wrong: [...], img? }]
GAMES.quiz = (d, g, tf = false) => {
  const qs = d.shuffle === false ? d.items : shuffle(d.items);
  let i = 0, ok = 0;
  const show = () => {
    g.progress(i, qs.length);
    g.score(`✔ ${ok}`);
    if (i >= qs.length) return g.finish(ok, qs.length);
    const it = qs[i];
    const opts = tf ? ['Верно', 'Неверно'] : shuffle([it.a, ...it.wrong]);
    const right = tf ? (it.a ? 'Верно' : 'Неверно') : it.a;
    const box = el('div', { class: 'options' + (tf ? ' tf' : '') });
    opts.forEach((o, k) => {
      const b = el('button', { class: 'opt' },
        tf ? null : el('span', { class: 'key' }, String(k + 1)), content(tf ? (o === 'Верно' ? '✔ Верно' : '✘ Неверно') : o));
      b.onclick = async () => {
        box.querySelectorAll('.opt').forEach(x => { x.disabled = true; x.classList.add('dim'); });
        const good = o === right;
        b.classList.add(good ? 'right' : 'wrong');
        box.children[opts.indexOf(right)].classList.add('right');
        good ? (ok++, sfx.ok()) : sfx.bad();
        g.score(`✔ ${ok}`);
        await wait(good ? 800 : 1500);
        i++;
        show();
      };
      box.append(b);
    });
    stage.replaceChildren(
      el('div', { class: 'card pop' },
        el('div', { class: 'muted' }, `Вопрос ${i + 1} из ${qs.length}`),
        it.img ? el('img', { class: 'media', src: it.img, alt: '' }) : null,
        el('div', { class: 'big-q' }, tf ? it.s : it.q)),
      box);
  };
  show();
};

// items: [{ s: "утверждение", a: true|false }]
GAMES.truefalse = (d, g) => GAMES.quiz(d, g, true);

// items: [{ a, b }]
GAMES.match = (d, g) => {
  const pairs = d.items.map((p, id) => ({ ...p, id }));
  let sel = null, found = 0, mistakes = 0;
  const L = el('div', { class: 'col' }), R = el('div', { class: 'col' });
  const mk = (p, side) => {
    const t = el('button', { class: 'tile' }, content(p[side]));
    t.pid = p.id;
    t.side = side;
    t.onclick = () => {
      if (!sel || sel.side === side) {
        sel?.classList.remove('sel');
        sel = sel === t ? null : t;
        sel?.classList.add('sel');
        return;
      }
      if (sel.pid === t.pid) {
        [sel, t].forEach(x => { x.classList.remove('sel'); x.classList.add('done'); flash(x, 'pop'); });
        sfx.ok();
        found++;
        g.progress(found, pairs.length);
        g.score(`${found} / ${pairs.length}`);
        if (found === pairs.length) setTimeout(() => g.finish(Math.max(pairs.length - mistakes, 0), pairs.length, `ошибок: ${mistakes}`), 700);
      } else {
        mistakes++;
        sfx.bad();
        flash(t, 'shake');
        flash(sel, 'shake');
        sel.classList.remove('sel');
      }
      sel = null;
    };
    return t;
  };
  shuffle(pairs).forEach(p => L.append(mk(p, 'a')));
  shuffle(pairs).forEach(p => R.append(mk(p, 'b')));
  g.score(`0 / ${pairs.length}`);
  stage.append(el('div', { class: 'match' }, L, R));
};

// items: [{ front, back }]
GAMES.flashcards = (d, g) => {
  const cards = d.shuffle === false ? d.items : shuffle(d.items);
  let i = 0, know = 0;
  const show = () => {
    g.progress(i, cards.length);
    g.score(`👍 ${know}`);
    if (i >= cards.length) return g.finish(know, cards.length, 'карточек знал');
    const c = cards[i];
    const answer = el('div', { class: 'row', style: 'visibility:hidden' },
      el('button', { class: 'btn bad', onclick: () => { i++; show(); } }, '✘ Не знал'),
      el('button', { class: 'btn ok', onclick: () => { know++; sfx.ok(); i++; show(); } }, '✔ Знал'));
    const card = el('div', { class: 'flip pop' },
      el('div', { class: 'flip-inner' },
        el('div', { class: 'face' }, content(c.front), el('div', { class: 'hint' }, 'нажми, чтобы перевернуть')),
        el('div', { class: 'face back' }, content(c.back))));
    card.onclick = () => { card.classList.toggle('flipped'); answer.style.visibility = 'visible'; };
    stage.replaceChildren(el('div', { class: 'muted' }, `Карточка ${i + 1} из ${cards.length}`), card, answer);
  };
  show();
};

// items: [{ word, hint? }]
GAMES.anagram = (d, g) => {
  const words = d.shuffle === false ? d.items : shuffle(d.items);
  let i = 0, ok = 0;
  const show = () => {
    g.progress(i, words.length);
    g.score(`✔ ${ok}`);
    if (i >= words.length) return g.finish(ok, words.length);
    const it = words[i];
    const target = [...it.word.toUpperCase().replace(/\s+/g, '')];
    let mixed = shuffle(target);
    for (let k = 0; k < 10 && mixed.join('') === target.join('') && target.length > 1; k++) mixed = shuffle(target);
    let firstTry = true, done = false;
    const slots = el('div', { class: 'slots' });
    const letters = el('div', { class: 'letters' });
    const slotEls = target.map(() => el('button', { class: 'slot' }));
    slotEls.forEach(s => {
      s.onclick = () => {
        if (!s.tile || done) return;
        s.tile.classList.remove('used');
        s.tile = null;
        s.textContent = '';
        s.classList.remove('filled');
      };
      slots.append(s);
    });
    const check = async () => {
      if (slotEls.some(s => !s.tile)) return;
      if (slotEls.map(s => s.textContent).join('') === target.join('')) {
        done = true;
        slots.classList.add('right');
        sfx.ok();
        if (firstTry) ok++;
        g.score(`✔ ${ok}`);
        await wait(900);
        i++;
        show();
      } else {
        firstTry = false;
        sfx.bad();
        flash(slots, 'shake');
        await wait(500);
        slotEls.forEach(s => s.click());
      }
    };
    mixed.forEach(ch => {
      const t = el('button', { class: 'letter' }, ch);
      t.onclick = () => {
        const s = slotEls.find(x => !x.tile);
        if (!s || done) return;
        s.tile = t;
        s.textContent = ch;
        s.classList.add('filled');
        t.classList.add('used');
        check();
      };
      letters.append(t);
    });
    const skip = el('button', { class: 'btn ghost', onclick: async () => {
      if (done) return;
      done = true;
      slotEls.forEach((s, k) => { s.textContent = target[k]; s.classList.add('filled'); });
      letters.querySelectorAll('.letter').forEach(t => t.classList.add('used'));
      await wait(1400);
      i++;
      show();
    } }, 'Показать ответ');
    stage.replaceChildren(
      el('div', { class: 'card pop' },
        el('div', { class: 'muted' }, `Слово ${i + 1} из ${words.length}`),
        it.img ? el('img', { class: 'media', src: it.img, alt: '' }) : null,
        it.hint ? el('div', { class: 'big-q' }, it.hint) : null),
      slots, letters, skip);
  };
  show();
};

// groups: [{ name, items: [...] }]
GAMES.groupsort = (d, g) => {
  const colors = ['--c2', '--c1', '--c4', '--c5', '--c3', '--c8'];
  const items = shuffle(d.groups.flatMap((gr, gi) => gr.items.map(t => ({ t, gi }))));
  let left = items.length, mistakes = 0, sel = null;
  const zones = d.groups.map((gr, gi) => {
    const z = el('div', { class: 'zone' },
      el('div', { class: 'zone-title', style: `background:var(${colors[gi % colors.length]})` }, gr.name),
      el('div', { class: 'zone-items' }));
    z.gi = gi;
    z.onclick = () => sel && place(sel, z);
    return z;
  });
  const pool = el('div', { class: 'pool' });
  const place = (chip, z) => {
    chip.classList.remove('sel');
    sel = null;
    if (z.gi === chip.it.gi) {
      chip.classList.add('done');
      $('.zone-items', z).append(chip);
      flash(z, 'pop');
      sfx.ok();
      left--;
      g.progress(items.length - left, items.length);
      g.score(`${items.length - left} / ${items.length}`);
      if (!left) setTimeout(() => g.finish(Math.max(items.length - mistakes, 0), items.length, `ошибок: ${mistakes}`), 600);
    } else {
      mistakes++;
      sfx.bad();
      flash(chip, 'shake');
    }
  };
  items.forEach(it => {
    const chip = el('div', { class: 'chip' }, content(it.t));
    chip.it = it;
    draggable(chip, z => place(chip, z), () => {
      sel?.classList.remove('sel');
      sel = sel === chip ? null : chip;
      sel?.classList.add('sel');
    });
    pool.append(chip);
  });
  g.score(`0 / ${items.length}`);
  stage.append(el('div', { class: 'zones' }, zones), pool);
};

// Pointer drag with tap fallback; onDrop gets the .zone under the pointer
function draggable(node, onDrop, onTap) {
  node.addEventListener('pointerdown', e => {
    if (node.classList.contains('done')) return;
    const sx = e.clientX, sy = e.clientY;
    let dragging = false, over = null;
    node.setPointerCapture(e.pointerId);
    const zoneAt = ev => {
      node.style.visibility = 'hidden';
      const z = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.zone');
      node.style.visibility = '';
      return z;
    };
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!dragging && Math.hypot(dx, dy) > 6) { dragging = true; node.classList.add('dragging'); }
      if (!dragging) return;
      node.style.transform = `translate(${dx}px,${dy}px) rotate(3deg)`;
      const z = zoneAt(ev);
      if (z !== over) { over?.classList.remove('hover'); over = z; over?.classList.add('hover'); }
    };
    const up = ev => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      over?.classList.remove('hover');
      node.classList.remove('dragging');
      node.style.transform = '';
      if (!dragging) return onTap();
      const z = ev.type === 'pointerup' && zoneAt(ev);
      if (z) onDrop(z);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  });
}

// items: ["...", "..."]
GAMES.wheel = d => {
  const palette = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8']
    .map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim());
  let items = [...d.items], rot = 0, spinning = false;
  const canvas = el('canvas');
  const result = el('div', { class: 'wheel-result' });
  const removeBox = el('input', { type: 'checkbox' });
  const ctx = canvas.getContext('2d');
  const seg = () => 2 * Math.PI / items.length;

  const draw = () => {
    const size = canvas.clientWidth * devicePixelRatio;
    canvas.width = canvas.height = size;
    const r = size / 2;
    ctx.clearRect(0, 0, size, size);
    items.forEach((t, k) => {
      const a0 = rot + k * seg() - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r - 4, a0, a0 + seg());
      ctx.fillStyle = palette[k % palette.length] || '#888';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 * devicePixelRatio;
      ctx.stroke();
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(a0 + seg() / 2);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      // shrink the font, then truncate, so the label stays outside the hub
      const maxW = r * 0.7;
      let px = Math.min(28, 160 / items.length + 10), label = String(t);
      const setFont = () => { ctx.font = `800 ${px * devicePixelRatio}px Nunito, sans-serif`; };
      setFont();
      while (px > 13 && ctx.measureText(label).width > maxW) { px--; setFont(); }
      while (label.length > 1 && ctx.measureText(label).width > maxW) label = label.slice(0, -2) + '…';
      ctx.fillText(label, r - 18 * devicePixelRatio, 0);
      ctx.restore();
    });
    ctx.beginPath();
    ctx.arc(r, r, r * 0.09, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
  };
  const current = () => {
    const a = ((-rot) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    return Math.floor(a / seg()) % items.length;
  };

  const spin = () => {
    if (spinning || !items.length) return;
    spinning = true;
    result.textContent = '';
    const from = rot, delta = 2 * Math.PI * (5 + Math.random() * 3), dur = 4200, start = performance.now();
    let last = current();
    const frame = now => {
      const p = Math.min((now - start) / dur, 1);
      rot = from + delta * (1 - Math.pow(1 - p, 4));
      draw();
      const c = current();
      if (c !== last) { sfx.tick(); last = c; }
      if (p < 1) return requestAnimationFrame(frame);
      spinning = false;
      const k = current();
      result.textContent = '🎉 ' + items[k];
      flash(result, 'pop');
      sfx.win();
      if (removeBox.checked) setTimeout(() => { items.splice(k, 1); draw(); }, 1500);
    };
    requestAnimationFrame(frame);
  };

  canvas.onclick = spin;
  stage.append(
    el('div', { class: 'wheel-wrap' }, canvas, el('div', { class: 'wheel-pointer' })),
    result,
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: spin }, '🎡 Крутить'),
      el('button', { class: 'btn ghost', onclick: () => { items = [...d.items]; result.textContent = ''; draw(); } }, '↻ Сбросить')),
    el('label', { class: 'check' }, removeBox, 'Убирать выпавшие'));
  requestAnimationFrame(draw);
  addEventListener('resize', draw);
};

// Two modes:
//   colors: [{ name, hex }] — sign shows a colour word, the mole is painted; hit when they don't match
//   items: [{ text, ok }]   — sign shows text; hit the ones with ok:false
// Hit "wrong" ones by default; "hit": "right" flips it. "time" in seconds (default 45).
GAMES.whack = (d, g) => {
  const hitWrong = d.hit !== 'right';
  const time = (d.time || 45) * 1000;
  const moleSvg = color => `<svg viewBox="0 0 100 92">
    <ellipse cx="50" cy="62" rx="40" ry="44" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="2.5"/>
    <ellipse cx="50" cy="74" rx="24" ry="22" fill="#fff" opacity=".22"/>
    <circle cx="36" cy="44" r="8" fill="#fff" stroke="rgba(0,0,0,.3)"/><circle cx="64" cy="44" r="8" fill="#fff" stroke="rgba(0,0,0,.3)"/>
    <circle cx="37" cy="45" r="4" fill="#222"/><circle cx="63" cy="45" r="4" fill="#222"/>
    <ellipse cx="50" cy="58" rx="8" ry="6" fill="#ff7aa8" stroke="rgba(0,0,0,.3)"/>
    <rect x="45" y="65" width="10" height="7" rx="1.5" fill="#fff" stroke="rgba(0,0,0,.3)"/>
    <ellipse cx="24" cy="82" rx="9" ry="6" fill="#ffb3c8" stroke="rgba(0,0,0,.3)"/><ellipse cx="76" cy="82" rx="9" ry="6" fill="#ffb3c8" stroke="rgba(0,0,0,.3)"/>
  </svg>`;
  const pick = a => a[Math.random() * a.length | 0];
  const next = () => {
    if (d.colors) {
      const word = pick(d.colors);
      const same = Math.random() < 0.45;
      const paint = same ? word : pick(d.colors.filter(c => c !== word));
      return { sign: word.name, color: paint.hex, target: same !== hitWrong };
    }
    const it = pick(d.items);
    return { sign: it.text, color: it.color || '#8a6240', target: !!it.ok !== hitWrong };
  };

  let ok = 0, mistakes = 0, targets = 0, over = false, t0 = performance.now();
  const holes = Array.from({ length: 9 }, () => {
    const mole = el('div', { class: 'mole' });
    const h = el('div', { class: 'hole' }, el('div', { class: 'mole-box' }, mole), el('div', { class: 'pit' }));
    h.mole = mole;
    mole.addEventListener('pointerdown', e => whack(h, e));
    return h;
  });

  const whack = (h, e) => {
    const m = h.cur;
    if (!m || m.done || over) return;
    m.done = true;
    const hammer = el('div', { class: 'hammer', style: `left:${e.clientX}px;top:${e.clientY}px` }, '🔨');
    document.body.append(hammer);
    setTimeout(() => hammer.remove(), 300);
    h.mole.classList.add('hit', m.target ? 'good' : 'oops');
    if (m.target) { ok++; sfx.ok(); } else { mistakes++; sfx.bad(); flash(h, 'shake'); }
    g.score(`✔ ${ok}  ✘ ${mistakes}`);
    clearTimeout(h.timer);
    h.timer = setTimeout(() => hide(h), 450);
  };
  const hide = h => {
    h.mole.classList.remove('up');
    setTimeout(() => { h.cur = null; h.mole.className = 'mole'; }, 200);
  };
  const spawn = () => {
    if (over) return;
    const p = Math.min((performance.now() - t0) / time, 1);
    const free = holes.filter(h => !h.cur);
    if (free.length) {
      const h = pick(free);
      const m = h.cur = next();
      if (m.target) targets++;
      h.mole.innerHTML = '';
      h.mole.append(el('div', { class: 'sign' }, m.sign));
      h.mole.insertAdjacentHTML('beforeend', moleSvg(m.color));
      requestAnimationFrame(() => h.mole.classList.add('up'));
      h.timer = setTimeout(() => hide(h), 2200 - 900 * p);
    }
    setTimeout(spawn, 1100 - 500 * p);
  };

  g.stopTimer();
  const tick = setInterval(() => {
    const left = Math.max(0, Math.ceil((time - (performance.now() - t0)) / 1000));
    $('#timer').textContent = '⏳ ' + left;
    g.progress(time - left * 1000, time);
    if (left > 0) return;
    clearInterval(tick);
    over = true;
    $('#timer').textContent = '';
    holes.forEach(hide);
    setTimeout(() => g.finish(Math.max(ok - mistakes, 0), Math.max(targets, ok), `ошибок: ${mistakes}`), 600);
  }, 200);

  g.score('✔ 0  ✘ 0');
  stage.append(
    d.rule ? el('div', { class: 'whack-rule' }, d.rule) : null,
    el('div', { class: 'holes' }, holes));
  setTimeout(spawn, 500);
};

// ---------- themes & stickers ----------
const THEME_STICKERS = {
  default: ['⭐', '✏️', '📚', '🎈', '🌟', '🧩'],
  space: ['🚀', '🪐', '⭐', '🌙', '👾', '☄️', '🛸', '✨'],
  forest: ['🌲', '🍄', '🦊', '🍃', '🐿️', '🌼', '🦔', '🍂'],
  ocean: ['🐠', '🐙', '🐳', '🌊', '🐚', '🦀', '🫧', '🐬'],
  candy: ['🍭', '🍬', '🧁', '🍩', '🎀', '💖', '🍓', '🌈'],
  school: ['✏️', '📐', '📚', '🎒', '🖍️', '📏', '🔬', '🌍'],
  winter: ['❄️', '⛄', '🎄', '🧣', '🎁', '⭐', '☃️', '🦌'],
};

// "theme": name, "stickers": [emoji or img:...] (or [] to turn them off)
function decorate(d) {
  if (d.theme) document.documentElement.dataset.theme = d.theme;
  const list = d.stickers ?? THEME_STICKERS[d.theme] ?? THEME_STICKERS.default;
  if (!list.length) return;
  const box = el('div', { class: 'stickers' });
  for (let k = 0; k < 14; k++) {
    const s = list[k % list.length];
    const size = 28 + Math.random() * 40;
    box.append(el('span', {
      style: `left:${(k % 7) * 14 + Math.random() * 8}%;top:${k < 7 ? 6 + Math.random() * 30 : 60 + Math.random() * 32}%;` +
        `font-size:${size}px;width:${size}px;animation-delay:${-Math.random() * 6}s`,
    }, content(s)));
  }
  document.body.prepend(box);
}

// ---------- boot ----------
$('#mute').onclick = e => { muted = !muted; e.currentTarget.textContent = muted ? '🔇' : '🔊'; };
$('#fs').onclick = () => {
  try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch { }
};

// share pages under g/<slug>/ bake the slug into <html data-game>
const slug = new URLSearchParams(location.search).get('g') || document.documentElement.dataset.game || '';
// standalone files (canva/<slug>.html) carry the game inline
const inline = document.getElementById('game-data');
const load = () => inline
  ? Promise.resolve(JSON.parse(inline.textContent))
  : fetch(`games/${slug}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
if (!inline && !/^[\w-]+$/.test(slug)) {
  $('#title').textContent = 'Игра не найдена';
} else {
  load()
    .then(d => {
      if (!GAMES[d.type]) throw new Error('unknown type ' + d.type);
      data = d;
      decorate(d);
      document.title = d.title;
      $('#title').textContent = d.title;
      intro();
    })
    .catch(err => {
      $('#title').textContent = 'Игра не найдена';
      stage.replaceChildren(el('div', { class: 'card muted' }, 'Не удалось загрузить игру: ' + err.message));
    });
}

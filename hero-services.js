(() => {
  'use strict';
  const cover = document.querySelector('[data-service-cycle]');
  if (!cover) return;
  const scenes = Array.from(document.querySelectorAll('#services [data-cover-order]'))
    .sort((a, b) => Number(a.dataset.coverOrder) - Number(b.dataset.coverOrder))
    .map((card) => ({ ...card.dataset, title: card.querySelector('.service__title').textContent.trim() }));
  if (scenes.length < 2) return;

  const fields = [...cover.querySelectorAll('[data-service-field]')];
  const typed = fields.filter((el) => ['title', 'query'].includes(el.dataset.serviceField));
  const captions = fields.filter((el) => !typed.includes(el));
  const pauseButton = cover.querySelector('.campaign-art__pause');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const timing = { type: 48, erase: 24, empty: 130, read: 4600 };

  // Each card has two compositions. Both reflect the same position if a visitor rotates the device.
  for (const el of typed.filter((el) => el.dataset.serviceField === 'title')) {
    const caret = document.createElementNS(el.namespaceURI, 'tspan');
    caret.setAttribute('class', 'attribution-copy__caret');
    caret.setAttribute('dx', '2');
    caret.textContent = '|';
    el.append(caret);
  }

  let index = 0;
  let position = 0;
  let phase = 'type';
  let visible = !('IntersectionObserver' in window);
  let paused = false;
  let timer = null;
  let due = 0;
  let remaining = 0;

  function characterCount() {
    return Math.max(scenes[index].title.length, scenes[index].query.length);
  }
  function renderLetters() {
    const scene = scenes[index];
    const fraction = position / characterCount();
    for (const el of typed) {
      const value = scene[el.dataset.serviceField];
      const piece = value.slice(0, Math.round(fraction * value.length));
      if (el.firstChild.data !== piece) el.firstChild.data = piece;
    }
  }
  function renderCaptions() {
    for (const el of captions) el.textContent = scenes[index][el.dataset.serviceField];
  }
  function setPhase(next) {
    phase = next;
    cover.dataset.cyclePhase = next;
  }
  function schedule(ms) {
    remaining = ms;
    due = performance.now() + ms;
    timer = setTimeout(tick, ms);
  }
  function stopTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, due - performance.now());
  }
  function showComplete() {
    stopTimer();
    position = characterCount();
    renderLetters();
    setPhase('read');
    remaining = timing.read;
  }
  function tick() {
    timer = null;
    // Late callbacks should not stretch a word on a busy device. Keep the reading pause in full.
    const late = phase === 'read' ? 0 : Math.max(0, performance.now() - due);
    if (phase === 'read') setPhase('erase');
    const interval = timing[phase];
    const count = 1 + Math.floor(late / interval);
    const next = interval - (late % interval);
    if (phase === 'erase') {
      position = Math.max(0, position - count);
      renderLetters();
      if (position > 0) return schedule(next);
      index = (index + 1) % scenes.length;
      renderCaptions();
      setPhase('type');
      return schedule(timing.empty);
    }
    position = Math.min(characterCount(), position + count);
    renderLetters();
    if (position < characterCount()) return schedule(next);
    setPhase('read');
    schedule(timing.read);
  }
  function sync() {
    const playing = visible && !document.hidden && !paused && !reduced.matches;
    cover.classList.toggle('is-playing', playing);
    pauseButton.hidden = reduced.matches;
    if (!playing) return stopTimer();
    if (timer === null) schedule(remaining);
  }

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    cover.toggleAttribute('data-paused', paused);
    const label = paused ? 'Продолжить смену услуг' : 'Приостановить смену услуг';
    pauseButton.setAttribute('aria-label', label);
    pauseButton.title = label;
    if (paused) showComplete();
    sync();
  });
  function syncMotionPreference() {
    if (reduced.matches) showComplete();
    sync();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }).observe(cover);
  }
  reduced.addEventListener('change', syncMotionPreference);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', stopTimer);
  window.addEventListener('pageshow', sync);
  pauseButton.title = pauseButton.getAttribute('aria-label');
  renderCaptions();
  setPhase(phase);
  syncMotionPreference();
})();

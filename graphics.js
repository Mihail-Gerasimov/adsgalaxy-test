(() => {
  'use strict';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rule = document.querySelector('.reading-rule');
  const menuItems = [
    ['services', document.querySelectorAll('.nav-drop__btn')[0]],
    ['industries', document.querySelectorAll('.nav-drop__btn')[1]],
    ...Array.from(document.querySelectorAll('.header__nav > a[href^="#"]'), (link) => [
      link.hash.slice(1),
      link,
    ]),
  ];
  const sections = Array.from(document.querySelectorAll('main > section'));
  let readingFrame = 0;
  let currentSection;
  function updateReading() {
    readingFrame = 0;
    const progress = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    rule?.style.setProperty('--read', Math.min(1, Math.max(0, progress)));
    const edge = Math.min(180, window.innerHeight * 0.25);
    const seen = sections.filter((section) => section.getBoundingClientRect().top <= edge).pop();
    displayRoute();
    followChapters(window.scrollY);
    if (seen === currentSection) return;
    currentSection = seen;
    for (const [id, item] of menuItems) {
      if (item && id === seen?.id) item.setAttribute('aria-current', 'location');
      else item?.removeAttribute('aria-current');
    }
  }
  function scheduleReading() {
    if (!readingFrame) readingFrame = requestAnimationFrame(updateReading);
  }
  window.addEventListener('scroll', scheduleReading, { passive: true });
  window.addEventListener('resize', scheduleReading, { passive: true });

  const reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !motion.matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle('is-inview', entry.isIntersecting);
        }
      },
      { threshold: 0.065 },
    );
    reveals.forEach((element) => observer.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add('is-inview'));
  }

  const marquee = document.querySelector('.marquee');
  const track = marquee.querySelector('.marquee__track');
  const clients = track.firstElementChild;
  const repeat = clients.cloneNode(true);
  repeat.setAttribute('aria-hidden', 'true');
  repeat.inert = true;
  track.append(repeat);
  marquee.classList.add('is-ready');
  const pauseRibbon = document.querySelector('.marquee__pause');
  pauseRibbon.hidden = false;
  pauseRibbon.addEventListener('click', () => {
    const paused = marquee.classList.toggle('is-paused');
    pauseRibbon.setAttribute('aria-pressed', String(paused));
    pauseRibbon.setAttribute(
      'aria-label',
      paused ? 'Продолжить бегущую строку' : 'Приостановить бегущую строку',
    );
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => marquee.classList.toggle('is-offscreen', !e.isIntersecting)).observe(
      marquee,
    );
  }

  const route = document.querySelector('.process');
  const steps = Array.from(route.querySelectorAll('.process__step'));
  const circles = steps.map((step) => step.querySelector('.process__num'));
  const narrowRoute = matchMedia('(max-width:920px)');
  let geometry = null,
    hoverPosition = null;
  const bound = (n) => Math.max(0, Math.min(1, n));
  function measureRoute() {
    const rect = route.getBoundingClientRect();
    const centers = circles.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 };
    });
    const vertical = narrowRoute.matches;
    const axis = vertical ? 'y' : 'x';
    const start = centers[0];
    const length = Math.max(1, centers[centers.length - 1][axis] - start[axis]);
    geometry = { vertical, start, len: length, stops: centers.map((c) => (c[axis] - start[axis]) / length) };
    route.style.setProperty('--rail-x', start.x + 'px');
    route.style.setProperty('--rail-y', start.y + 'px');
    route.style.setProperty('--rail-length', length + 'px');
    displayRoute();
  }
  function displayRoute() {
    if (!geometry) return;
    if (motion.matches) {
      steps.forEach((step) => step.classList.remove('is-past', 'is-current'));
      return;
    }
    const rect = route.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const h = window.innerHeight;
    const { vertical, start, len, stops } = geometry;
    const fraction = bound(
      hoverPosition ??
        (vertical
          ? (h * 0.53 - rect.top - start.y) / len
          : (h * 0.78 - rect.top - start.y) / Math.max(150, h * 0.49)),
    );
    route.style.setProperty('--progress', fraction.toFixed(4));
    const nearest = stops.reduce(
      (best, s, i) => (Math.abs(fraction - s) < Math.abs(fraction - stops[best]) ? i : best),
      0,
    );
    steps.forEach((step, i) => {
      step.classList.toggle('is-current', nearest === i);
      step.classList.toggle('is-past', stops[i] < fraction - 0.025);
    });
  }
  route.addEventListener('pointermove', (e) => {
    if (!geometry || narrowRoute.matches || motion.matches || !['mouse', 'pen'].includes(e.pointerType))
      return;
    hoverPosition = bound((e.clientX - route.getBoundingClientRect().left - geometry.start.x) / geometry.len);
    displayRoute();
  });
  route.addEventListener('pointerleave', () => {
    hoverPosition = null;
    displayRoute();
  });
  if ('ResizeObserver' in window) {
    const routeSize = new ResizeObserver(measureRoute);
    routeSize.observe(route);
    circles.forEach((c) => routeSize.observe(c));
  } else window.addEventListener('resize', measureRoute);
  motion.addEventListener('change', measureRoute);
  narrowRoute.addEventListener('change', () => {
    hoverPosition = null;
    measureRoute();
  });
  document.fonts?.ready.then(measureRoute);

  const reader = document.querySelector('.editorial-copy');
  const chapterButtons = Array.from(reader.querySelectorAll('.chapter__switch'));
  const chapterPanels = chapterButtons.map((button) =>
    document.getElementById(button.getAttribute('aria-controls')),
  );
  const clips = chapterPanels.map((panel) => panel.querySelector('.chapter__clip'));
  const readingHeader = document.querySelector('.header');
  const spent = new Set();
  let chapter = 0,
    lastY = window.scrollY,
    manualAt = null;
  let heights = [],
    headerStarts = [],
    historyHeight = 0,
    releaseAnchor;

  function applyChapter(index) {
    chapter = index;
    historyHeight = Array.from(spent).reduce((sum, i) => sum + heights[i], 0);
    chapterButtons.forEach((button, i) => {
      const current = i === index;
      button.closest('.chapter').style.setProperty('--read-trail', (spent.has(i) ? heights[i] : 0) + 'px');
      button.setAttribute('aria-expanded', String(current));
      button.setAttribute('aria-disabled', String(current));
      chapterPanels[i].inert = !current;
      chapterPanels[i].setAttribute('aria-hidden', String(!current));
    });
  }
  function transitionTo(index) {
    if (index === chapter) return;
    clearTimeout(releaseAnchor);
    if (!motion.matches) {
      // Native anchoring must not counteract the height transfer while the user scrolls.
      document.documentElement.classList.add('reading-transition');
      releaseAnchor = setTimeout(() => document.documentElement.classList.remove('reading-transition'), 560);
    }
    applyChapter(index);
  }
  function measureChapters() {
    const sizes = clips.map((el) => el.getBoundingClientRect().height);
    let total = 0;
    const starts = chapterButtons.map((button) => {
      const start = total;
      const article = button.closest('.chapter');
      total +=
        button.getBoundingClientRect().height + (parseFloat(getComputedStyle(article).borderTopWidth) || 0);
      return start;
    });
    if (sizes.every((height, i) => height === heights[i]) && starts.every((y, i) => y === headerStarts[i]))
      return;
    heights = sizes;
    headerStarts = starts;
    reader.classList.remove('reader-ready');
    chapterPanels.forEach((panel, i) => panel.style.setProperty('--chapter-height', heights[i] + 'px'));
    reader.classList.add('reader-enhanced');
    applyChapter(chapter);
    // Flush the initial/reflowed geometry before enabling interpolation.
    reader.getBoundingClientRect();
    reader.classList.add('reader-ready');
  }
  function followChapters(y) {
    const direction = y - lastY;
    lastY = y;
    if (
      !direction ||
      !heights.length ||
      motion.matches ||
      document.documentElement.classList.contains('dialog-locked')
    )
      return;
    if (manualAt !== null && Math.abs(y - manualAt) < 65) return;
    manualAt = null;
    const frame = reader.getBoundingClientRect(),
      viewport = window.innerHeight;
    if (frame.top > viewport) {
      if (direction < 0 && (chapter || spent.size)) {
        spent.clear();
        reader.classList.remove('reader-ready');
        applyChapter(0);
        reader.getBoundingClientRect();
        reader.classList.add('reader-ready');
      }
      return;
    }
    if (frame.bottom <= 0) return;
    const line = Math.min(viewport * 0.46, readingHeader.getBoundingClientRect().height + 51);
    let index = chapter,
      history = historyHeight;
    // Heading positions in the settled layout are independent of the transition in progress.
    // Transfer the folding height into the passed article's trailing space. Its successor
    // stays under the reader's finger. The document's scroll offset is entirely native.
    if (direction > 0) {
      while (
        index < chapterButtons.length - 1 &&
        frame.top + history + headerStarts[index + 1] + heights[index] <= line
      ) {
        if (!spent.has(index)) {
          spent.add(index);
          history += heights[index];
        }
        index++;
      }
    } else {
      while (index > 0 && frame.top + history + headerStarts[index] > line + 32) {
        index--;
        if (spent.delete(index)) history -= heights[index];
      }
    }
    transitionTo(index);
  }
  chapterButtons.forEach((button, i) => {
    button.addEventListener('click', () => {
      if (i !== chapter) {
        // A direct selection is a local accordion change, independent of the scroll sequence.
        if (
          i > chapter &&
          button.getBoundingClientRect().top - heights[chapter] <
            readingHeader.getBoundingClientRect().bottom + 12
        )
          spent.add(chapter);
        for (const n of spent) if (n >= i) spent.delete(n);
        transitionTo(i);
      }
      manualAt = window.scrollY;
    });
    button.addEventListener('keydown', (e) => {
      const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: chapterButtons.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      chapterButtons[Math.max(0, Math.min(chapterButtons.length - 1, next))].focus();
    });
  });
  measureChapters();
  if ('ResizeObserver' in window) {
    const sizes = new ResizeObserver(measureChapters);
    [...clips, ...chapterButtons].forEach((el) => sizes.observe(el));
  } else window.addEventListener('resize', measureChapters);
  document.fonts?.ready.then(measureChapters);
  motion.addEventListener('change', () => {
    if (motion.matches) {
      spent.clear();
      applyChapter(chapter);
      document.documentElement.classList.remove('reading-transition');
    }
    lastY = window.scrollY;
  });

  measureRoute();
  updateReading();

  // Each mark has a 100 × 60 drawing area. Shared strokes keep this small set legible at mobile sizes.
  const signs = {
    search: {
      ink: ['M8 49H23L40 30L55 35L75 13', 'M61 13H76V28', 'M15 55H27L44 39'],
      thin: ['M5 35H20L38 16L53 21L64 8'],
    },
    target: {
      ink: ['M12 26V12H29M67 12H84V26M84 35V49H67M29 49H12V35', 'M58 30A10 10 0 1 1 38 30A10 10 0 1 1 58 30'],
      thin: ['M48 9V20M48 40V52M26 30H37M59 30H71'],
      dots: [[48, 30, 2.5]],
    },
    network: {
      ink: [
        'M9 30H37Q45 30 49 23L55 15Q59 10 67 10H87',
        'M34 30H88',
        'M35 30Q46 30 51 38L55 45Q59 50 67 50H87',
      ],
      thin: ['M9 35H29M9 25H29'],
      dots: [
        [87, 10, 3],
        [87, 30, 3],
        [87, 50, 3],
      ],
    },
    answer: {
      ink: ['M12 9H68V35H33L21 46V35H12Z', 'M72 20H85V46H73V55L60 46H39'],
      thin: ['M22 18H57M22 25H47'],
    },
    analytics: {
      ink: ['M11 48H84', 'M17 42V35H25V42M35 42V26H43V42M53 42V18H61V42M71 42V7H79V42'],
      thin: ['M13 25L33 17L47 18L64 7'],
    },
    build: {
      ink: ['M30 11L11 30L30 49', 'M65 11L84 30L65 49', 'M56 8L40 52'],
      thin: ['M36 14L20 30L36 46M60 16L74 30L60 44'],
    },
  };
  const ink = '#d9fa62';
  function stroke(ctx, path, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(new Path2D(path));
  }
  function paint(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(width * ratio),
      ph = Math.round(height * ratio);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    const kind = canvas.dataset.art;
    if (signs[kind]) {
      const scale = Math.min(pw / 100, ph / 60);
      ctx.setTransform(scale, 0, 0, scale, 0, (ph - 60 * scale) / 2);
      ctx.lineCap = 'square';
      ctx.lineJoin = 'round';
      const sign = signs[kind];
      sign.thin.forEach((path) => stroke(ctx, path, '#879276', 1.6));
      sign.ink.forEach((path) => stroke(ctx, path, ink, 2.9));
      for (const [x, y, r] of sign.dots || []) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = ink;
        ctx.fill();
      }
      return;
    }
    ctx.setTransform(pw / 400, 0, 0, ph / 220, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (kind === 'press') {
      for (let i = 0; i < 22; i++) {
        const v = i * 5.4;
        ctx.beginPath();
        ctx.moveTo(-22 + v, 251);
        ctx.bezierCurveTo(99 + v, 209, 143 + v * 1.21, 184 - v * 0.45, 185 + v * 1.46, 120 - v * 0.83);
        ctx.bezierCurveTo(209 + v * 1.42, 82 - v * 0.58, 253 + v * 1.2, 41 - v * 0.59, 428, 51 - v * 0.71);
        ctx.strokeStyle = i % 5 === 0 ? '#26330e' : '#53651e';
        ctx.lineWidth = i % 5 === 0 ? 2.6 : 1.35;
        ctx.stroke();
      }
    } else if (kind === 'registry') {
      for (let i = 0; i < 9; i++) {
        const t = i * 10.5,
          s = 37 + t;
        stroke(
          ctx,
          'M4 ' +
            (176 + t * 0.31) +
            ' H' +
            s +
            ' L' +
            (s + 74) +
            ' ' +
            (101 + t * 0.31) +
            ' H' +
            (233 + t * 0.45) +
            ' L' +
            (285 + t * 0.45) +
            ' ' +
            (48 + t * 0.31) +
            ' H391',
          i % 4 === 0 ? ink : '#65734a',
          i % 4 === 0 ? 2.9 : 1.6,
        );
      }
    }
  }
  const marks = Array.from(document.querySelectorAll('canvas[data-art]'));
  if ('Path2D' in window) {
    marks.forEach(paint);
    if ('ResizeObserver' in window) {
      const layout = new ResizeObserver((entries) => entries.forEach((entry) => paint(entry.target)));
      marks.forEach((mark) => layout.observe(mark));
    } else window.addEventListener('resize', () => marks.forEach(paint));
  }

  // Both forecast quantities use the same baseline and unit across all calculator inputs.
  const forecastBars = Array.from(document.querySelectorAll('[data-forecast-line]'));
  document.addEventListener('calculator-change', (event) => {
    const values = forecastBars.map((bar) =>
      Number(String(event.detail[bar.dataset.forecastLine]).replace(/\D/g, '')),
    );
    const max = Math.max(1, ...values);
    const power = 10 ** Math.floor(Math.log10(max));
    const upper = [1, 2, 5, 10].find((n) => n * power >= max) * power;
    forecastBars.forEach((bar, i) => bar.style.setProperty('--length', (100 * values[i]) / upper + '%'));
  });
})();

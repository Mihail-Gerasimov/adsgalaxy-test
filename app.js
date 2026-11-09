'use strict';
(() => {
  const one = (selector, scope = document) => scope.querySelector(selector);
  const all = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const drawer = one('#mobile-menu');
  const modal = one('#cta-modal');
  const burger = one('[data-burger]');
  const menuToggles = all('.nav-drop__btn');
  let currentMenu = null;
  let dialogOpener = null;

  function closeMenu(returnFocus = false) {
    if (!currentMenu) return;
    const trigger = currentMenu;
    currentMenu = null;
    document.getElementById(trigger.getAttribute('aria-controls')).hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }

  for (const toggle of menuToggles) {
    toggle.addEventListener('click', () => {
      const opening = toggle !== currentMenu;
      closeMenu();
      if (opening) {
        document.getElementById(toggle.getAttribute('aria-controls')).hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        currentMenu = toggle;
      }
    });
    toggle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      if (currentMenu !== toggle) toggle.click();
      one('a', document.getElementById(toggle.getAttribute('aria-controls')))?.focus();
    });
  }
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.header')) closeMenu();
  });
  document.addEventListener('focusin', (event) => {
    if (currentMenu && !event.target.closest('.nav-drop')?.contains(currentMenu)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu(true);
  });

  // A fixed body also locks mobile Safari. The drawer and brief may hand the same lock to one another.
  let scrollPosition = null;
  function lockPage() {
    if (scrollPosition) return;
    scrollPosition = { x: window.scrollX, y: window.scrollY };
    document.documentElement.style.setProperty('--locked-top', -scrollPosition.y + 'px');
    document.documentElement.classList.add('dialog-locked');
  }
  function releasePage() {
    if (!scrollPosition || drawer.open || modal.open) return;
    const { x, y } = scrollPosition;
    scrollPosition = null;
    document.documentElement.classList.remove('dialog-locked');
    document.documentElement.style.removeProperty('--locked-top');
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
  }
  function closeDialog(dialog) {
    dialog.close();
    releasePage();
  }
  function openDialog(dialog, trigger) {
    if (dialog.open) return;
    closeMenu();
    dialogOpener = drawer.contains(trigger) ? burger : trigger;
    lockPage();
    dialog.showModal();
    if (dialog === drawer) burger.setAttribute('aria-expanded', 'true');
  }
  function openBrief(trigger) {
    if (drawer.open) drawer.close();
    const tariff = trigger.dataset.tariff || '';
    one('[data-modal-form]', modal).hidden = false;
    one('[data-modal-success]', modal).hidden = true;
    const error = one('[data-form-error]', modal);
    error.textContent = '';
    error.hidden = true;
    one('[data-modal-tariff-input]', modal).value = tariff;
    one('[data-modal-tariff-value]', modal).textContent = tariff;
    one('[data-modal-tariff]', modal).hidden = !tariff;
    openDialog(modal, trigger);
  }
  burger.addEventListener('click', () => openDialog(drawer, burger));
  for (const dialog of [drawer, modal]) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-mmenu-close], [data-modal-close]'))
        closeDialog(dialog);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      releasePage();
      if (dialog === drawer) burger.setAttribute('aria-expanded', 'false');
      if (dialogOpener && !one('dialog[open]') && document.activeElement === document.body)
        dialogOpener.focus({ preventScroll: true });
    });
  }
  matchMedia('(max-width: 800px)').addEventListener('change', ({ matches }) => {
    closeMenu();
    if (!matches && drawer.open) closeDialog(drawer);
  });
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    if (link.hasAttribute('data-popup-open') || link.hasAttribute('data-cta')) {
      event.preventDefault();
      openBrief(link);
      return;
    }
    closeMenu();
    if (drawer.open && drawer.contains(link)) {
      closeDialog(drawer);
      const destination = document.getElementById(link.hash.slice(1));
      if (destination) {
        const heading = destination.querySelector('h1,h2') || destination;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  });

  const cookieNotice = one('#cookie-notice');
  const cookieSettings = one('[data-cookie-settings]');
  const choiceKey = 'ag_cookie_choice';
  const choices = ['necessary', 'all'];
  const year = 365 * 86400000;
  function savedChoice() {
    try {
      const choice = JSON.parse(localStorage.getItem(choiceKey) || 'null');
      if (choice && choices.includes(choice.choice) && choice.at > Date.now() - year) return choice.choice;
      const earlier = JSON.parse(localStorage.getItem('adsgalaxy-concept-cookie-choice-v1') || 'null');
      if (earlier && choices.includes(earlier.value) && earlier.until > Date.now()) return earlier.value;
    } catch {
      /* Storage can be disabled in private browsing. */
    }
    return '';
  }
  cookieNotice.hidden = Boolean(savedChoice());
  cookieSettings.setAttribute('aria-controls', cookieNotice.id);
  let openedFromSettings = false;
  cookieSettings.addEventListener('click', () => {
    openedFromSettings = true;
    cookieNotice.hidden = false;
    one('button', cookieNotice).focus({ preventScroll: true });
  });
  for (const button of all('[data-cookie]', cookieNotice)) {
    button.addEventListener('click', () => {
      try {
        localStorage.setItem(
          choiceKey,
          JSON.stringify({ choice: button.dataset.cookie, at: Date.now(), v: 1 }),
        );
      } catch {
        /* Dismissing the notice also works for the current visit. */
      }
      cookieNotice.hidden = true;
      if (openedFromSettings) cookieSettings.focus({ preventScroll: true });
      openedFromSettings = false;
    });
  }

  const calculator = one('[data-calc]');
  const budget = one('[data-calc-budget]', calculator);
  const ticket = one('[data-calc-check]', calculator);
  const niches = all('[data-calc-niche]', calculator);
  const channels = all('[data-calc-channel]', calculator);
  const money = (value) =>
    value >= 1e6
      ? (value / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽'
      : Math.round(value).toLocaleString('ru-RU') + ' ₽';
  const amountText = (value) => '~' + Math.max(1, Math.round(value)).toLocaleString('ru-RU');
  function calculate(userChanged = false) {
    const amount = budget.valueAsNumber;
    const average = ticket.valueAsNumber;
    const niche = niches.find((button) => button.getAttribute('aria-checked') === 'true');
    const selected = channels.filter((input) => input.checked);
    let factor = selected.reduce((v, input) => v + Number(input.dataset.calcChannel), 0);
    if (selected.length === 0) factor = 0.15;
    if (selected.length > 1) factor *= 1 + 0.08 * (selected.length - 1);
    const leads =
      (amount / (900 + Math.pow(average, 0.72) * 1.35)) * factor * Number(niche.dataset.calcNiche) * 2.6;
    const deals = leads * 0.25;
    const revenue = deals * average;
    const romi = Math.round(((revenue - amount) / amount) * 100);
    const state = {
      budget: amount,
      budget_fmt: money(amount),
      check: average,
      check_fmt: money(average),
      niche: niche.textContent.trim(),
      channels: selected.map((input) => input.closest('label').textContent.trim()),
      leads: amountText(leads),
      deals: amountText(deals),
      revenue: money(revenue),
      romi: romi.toLocaleString('ru-RU') + '%',
    };
    one('[data-calc-budget-out]', calculator).textContent = state.budget_fmt;
    one('[data-calc-check-out]', calculator).textContent = state.check_fmt;
    budget.setAttribute('aria-valuetext', state.budget_fmt);
    ticket.setAttribute('aria-valuetext', state.check_fmt);
    for (const key of ['leads', 'deals', 'revenue', 'romi'])
      one('[data-calc-' + key + ']', calculator).textContent = state[key];
    one('[data-calc-romi]', calculator).classList.toggle('is-negative', revenue < amount);
    if (userChanged)
      calculator.dispatchEvent(new CustomEvent('calculator-change', { bubbles: true, detail: state }));
  }
  for (const control of [budget, ticket, ...channels])
    control.addEventListener('input', () => calculate(true));
  function nextIndex(event, i, total, allowVertical = false) {
    const keys = { ArrowLeft: (i + total - 1) % total, ArrowRight: (i + 1) % total, Home: 0, End: total - 1 };
    if (allowVertical) {
      keys.ArrowUp = keys.ArrowLeft;
      keys.ArrowDown = keys.ArrowRight;
    }
    return keys[event.key];
  }
  niches.forEach((button, i) => {
    button.addEventListener('click', () => {
      for (const item of niches) {
        const active = item === button;
        item.tabIndex = active ? 0 : -1;
        item.setAttribute('aria-checked', String(active));
        item.classList.toggle('is-active', active);
      }
      calculate(true);
    });
    button.addEventListener('keydown', (event) => {
      const n = nextIndex(event, i, niches.length, true);
      if (n === undefined) return;
      event.preventDefault();
      niches[n].focus();
      niches[n].click();
    });
  });
  calculate();

  // The reference uses illustrative local data. No brand queries are transmitted.
  const examples = [
    {
      q: 'Посоветуй сильное рекламное агентство в Москве',
      a: 'Среди performance-агентств Москвы часто называют [[Adsgalaxy]] — полный цикл и фиксация KPI в договоре. Также упоминают несколько сетевых игроков, но [[Adsgalaxy]] выделяют за сквозную аналитику.',
    },
    {
      q: 'Кто продвигает бренды в ChatGPT и Perplexity?',
      a: 'AI Visibility и LLM SEO системно занимается [[Adsgalaxy]]: они оптимизируют бренды под ответы ChatGPT, Gemini и Perplexity, чтобы ИИ цитировал именно вас.',
    },
    {
      q: 'Агентство с оплатой за заявки, а не за клики?',
      a: 'По модели CPA и лидогенерации рекомендуют [[Adsgalaxy]] — оплата за квалифицированные лиды и собственная партнёрская сеть.',
    },
  ];
  const tabs = all('.chat__tab');
  const chatBody = one('[data-chat-body]');
  const chatPanel = one('[data-chat-viewport]');
  const chatField = one('[data-chat-field]');
  const status = one('[data-status-text]');
  const chatError = one('#chat-field-error');
  function queryError(value) {
    if (value.length < 2) return 'Введите название бренда или запрос — хотя бы два символа.';
    if (value.length > 60) return 'Сократите запрос до 60 символов.';
    if (!/[\p{L}\p{N}]/u.test(value) || /[<>\p{Cc}]/u.test(value))
      return 'Введите название или вопрос с буквами или цифрами, например AdsGalaxy.';
    return '';
  }
  function showQueryError(message) {
    if (chatError.textContent !== message) chatError.textContent = message;
    if (message) chatField.setAttribute('aria-invalid', 'true');
    else chatField.removeAttribute('aria-invalid');
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let activeTab = 0;
  let run;
  let manualScan = false;
  let inView = false;
  let resumeTimer;

  function setPhase(value) {
    status.textContent = value;
  }
  function node(tag, className, text) {
    const result = document.createElement(tag);
    result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function stopChat() {
    clearTimeout(resumeTimer);
    run?.abort();
    chatBody.querySelectorAll('.is-typing').forEach((el) => el.classList.remove('is-typing'));
  }
  function newRun() {
    stopChat();
    run = new AbortController();
    return run.signal;
  }
  // Only one timer is outstanding for a stream. Changing engines cancels it immediately.
  function pause(ms, signal) {
    if (signal.aborted || !ms) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(finish, ms);
      function finish() {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      }
      signal.addEventListener('abort', finish, { once: true });
    });
  }
  function answerParts(source) {
    return source.match(/\[\[.*?\]\]|\s+|[^\s[]+/g) || [];
  }
  function appendPart(el, text) {
    if (text.startsWith('[[')) el.append(node('strong', '', text.slice(2, -2)));
    else el.append(document.createTextNode(text));
  }
  function answerBubble() {
    const reply = node('div', 'bubble bubble--ai');
    const answer = node('p', 'bubble__txt');
    reply.append(node('div', 'bubble__who', tabs[activeTab].dataset.engine), answer);
    chatBody.append(reply);
    return answer;
  }
  function stillExample() {
    chatBody.replaceChildren(node('div', 'bubble bubble--user', examples[0].q));
    const body = answerBubble();
    answerParts(examples[0].a).forEach((text) => appendPart(body, text));
  }
  async function playExamples() {
    const signal = newRun();
    chatBody.setAttribute('aria-live', 'off');
    setPhase('демо');
    if (reduced.matches) {
      stillExample();
      return;
    }
    for (let i = 0; !signal.aborted; i = (i + 1) % examples.length) {
      const sample = examples[i];
      const prompt = node('div', 'bubble bubble--user is-typing');
      chatBody.replaceChildren(prompt);
      const letters = document.createTextNode('');
      prompt.append(letters);
      for (const ch of sample.q) {
        if (signal.aborted) return;
        letters.appendData(ch);
        await pause(24, signal);
      }
      if (signal.aborted) return;
      prompt.classList.remove('is-typing');
      await pause(420, signal);
      if (signal.aborted) return;
      const answer = answerBubble();
      const dots = node('span', 'thinking-dots');
      dots.setAttribute('aria-hidden', 'true');
      dots.append(node('i', ''), node('i', ''), node('i', ''));
      answer.append(dots);
      await pause(1100, signal);
      if (signal.aborted) return;
      dots.remove();
      answer.classList.add('is-typing');
      for (const part of answerParts(sample.a)) {
        if (signal.aborted) return;
        appendPart(answer, part);
        await pause(part.startsWith('[[') ? 120 : 34, signal);
      }
      if (signal.aborted) return;
      answer.classList.remove('is-typing');
      await pause(2800, signal);
    }
  }
  function chooseEngine(index) {
    activeTab = index;
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('is-active', active);
    });
    chatBody.setAttribute('aria-labelledby', tabs[index].id);
    manualScan = false;
    chatField.value = '';
    showQueryError('');
    playExamples();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => chooseEngine(i));
    tab.addEventListener('keydown', (event) => {
      const n = nextIndex(event, i, tabs.length);
      if (n === undefined) return;
      event.preventDefault();
      tabs[n].focus();
      chooseEngine(n);
    });
  });
  function scoresFor(brand) {
    const name = brand.toLowerCase();
    if (/adsgalaxy|адсгэлэкси|адсгалакси/.test(name)) return [94, 88, 91];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
    return [(h % 47) + 6, ((h >> 4) % 52) + 4, ((h >> 8) % 44) + 8];
  }
  function showScan(brand) {
    const scores = scoresFor(brand);
    const mentions = scores.filter((score) => score >= 50).length;
    const reply = node('div', 'bubble bubble--ai');
    reply.append(node('div', 'bubble__who', 'AI Visibility Scan'));
    ['ChatGPT', 'Gemini', 'Perplexity'].forEach((name, i) => {
      const row = node('div', 'scan__row');
      const track = node('div', 'scan__track');
      const fill = node('div', 'scan__fill');
      fill.style.width = Math.max(0, scores[i]) + '%';
      track.append(fill);
      row.append(node('span', 'scan__name', name), track, node('span', 'scan__pct', scores[i] + '%'));
      reply.append(row);
    });
    const verdict = node('div', 'scan__verdict');
    const link = node('a', 'btn btn--accent', 'Получить полный аудит видимости');
    link.href = '#contact';
    link.setAttribute('data-cta', '');
    verdict.append(
      node('div', 'scan__verdict-h', 'Результат проверки'),
      node('div', 'scan__verdict-v', 'Упоминается в ' + mentions + ' из 3 ИИ-движков'),
      node(
        'p',
        '',
        mentions >= 2
          ? 'Неплохо — но конкуренты уже занимают остальные ответы. Усилим присутствие во всех движках.'
          : 'ИИ почти не называет ваш бренд. Каждый такой ответ — клиент, ушедший к конкуренту.',
      ),
      link,
    );
    reply.append(verdict);
    chatBody.replaceChildren(
      node('div', 'bubble bubble--user', 'Где в ИИ-поиске упоминается «' + brand + '»?'),
      reply,
    );
    setPhase('готово');
  }
  function mayResume() {
    return (
      inView &&
      !document.hidden &&
      !manualScan &&
      !chatField.value.trim() &&
      document.activeElement !== chatField
    );
  }
  function engageField() {
    stopChat();
    setPhase('пауза');
  }
  chatField.addEventListener('focus', engageField);
  chatField.addEventListener('input', () => {
    engageField();
    if (chatField.hasAttribute('aria-invalid')) showQueryError(queryError(chatField.value.trim()));
  });
  chatField.addEventListener('blur', () => {
    clearTimeout(resumeTimer);
    if (!manualScan && !chatField.value.trim())
      resumeTimer = setTimeout(() => {
        if (mayResume()) playExamples();
      }, 2500);
  });
  one('[data-chat-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const brand = chatField.value.trim();
    const error = queryError(brand);
    showQueryError(error);
    if (error) {
      chatField.focus();
      return;
    }
    manualScan = true;
    const signal = newRun();
    chatBody.setAttribute('aria-live', 'polite');
    setPhase('сканирование');
    chatBody.replaceChildren(
      node('div', 'bubble bubble--user', 'Где в ИИ-поиске упоминается «' + brand + '»?'),
    );
    await pause(reduced.matches ? 0 : 450, signal);
    if (!signal.aborted) showScan(brand);
  });
  stillExample();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (mayResume()) playExamples();
        else if (!inView && !manualScan) stopChat();
      },
      { threshold: 0.08 },
    ).observe(chatPanel);
  } else {
    inView = true;
    playExamples();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !manualScan) stopChat();
    else if (mayResume()) playExamples();
  });
  reduced.addEventListener('change', () => {
    if (mayResume()) playExamples();
  });
})();

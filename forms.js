'use strict';
(() => {
  const config = (name) => document.querySelector('meta[name="adsgalaxy-' + name + '"]')?.content || '';
  const endpoint = config('lead-endpoint');
  const thanks = config('thanks');
  const forms = document.querySelectorAll('form[data-form], form[data-modal-form]');
  let calculatorState = null;
  document.addEventListener('calculator-change', (event) => {
    calculatorState = event.detail;
  });

  // Keep diacritics attached to their letter, including scripts that use combining marks.
  // One trailing space is useful while a visitor is typing the next word.
  function nameWhileEditing(raw) {
    const parts = raw.match(/\p{L}[\p{Mn}\p{Mc}]*|[ \u00a0\u202f]+/gu) || [];
    return parts
      .join('')
      .replace(/[ \u00a0\u202f]+/gu, ' ')
      .trimStart();
  }
  function filterNameInput(input) {
    const raw = input.value;
    const value = nameWhileEditing(raw);
    if (raw === value) return false;
    const start = nameWhileEditing(raw.slice(0, input.selectionStart)).length;
    const end = nameWhileEditing(raw.slice(0, input.selectionEnd)).length;
    const direction = input.selectionDirection;
    input.value = value;
    input.setSelectionRange(start, end, direction);
    return true;
  }
  function personalName(raw) {
    const value = raw.normalize('NFC').trim();
    if (!value) return { error: 'Введите имя буквами, например Анна.' };
    if (value.length > 100) return { error: 'Сократите имя до 100 символов.' };
    if (nameWhileEditing(value) !== value) return { error: 'Используйте буквы и пробел между словами.' };
    if ((value.match(/\p{L}/gu) || []).length < 2) return { error: 'Введите имя хотя бы из двух букв.' };
    return { value };
  }
  // URL supplies the browser's IDNA conversion. Validate each resulting DNS label as well.
  function isDomain(host) {
    const labels = host.split('.');
    return (
      host.length <= 253 &&
      labels.length >= 2 &&
      /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(labels.at(-1)) &&
      labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    );
  }
  function emailAddress(raw) {
    const at = raw.indexOf('@');
    if (at < 1 || at !== raw.lastIndexOf('@')) return '';
    const local = raw.slice(0, at),
      domain = raw.slice(at + 1);
    if (
      local.length > 64 ||
      !/^[a-z\d!#$%&'*+/=?^_\x60{|}~.-]+$/i.test(local) ||
      local.startsWith('.') ||
      local.endsWith('.') ||
      local.includes('..') ||
      !domain ||
      /[\s@:/?#%\\\p{Cf}]/u.test(domain)
    )
      return '';
    try {
      const { hostname } = new URL('https://' + domain);
      const address = local + '@' + hostname;
      return isDomain(hostname) && address.length <= 254 ? address : '';
    } catch {
      return '';
    }
  }
  function contactValue(raw) {
    const value = raw.trim();
    if (!value) return { error: 'Укажите email или ник в Telegram, например @ivan_petrov.' };
    if (value.length > 512) return { error: 'Укажите только адрес почты или профиль Telegram.' };
    if (value.includes('@') && !value.startsWith('@')) {
      const email = emailAddress(value);
      return email
        ? { value: email, email, telegram: '' }
        : { error: 'Проверьте адрес почты. Пример — ivan@company.ru.' };
    }
    const direct = value.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([^/?#]+)\/?$/i);
    const subdomain = value.match(/^(?:https?:\/\/)?([a-z0-9_]+)\.t\.me\/?$/i);
    const nick = direct?.[1] ?? subdomain?.[1] ?? (value.startsWith('@') ? value.slice(1) : '');
    // Four-letter collectible handles exist alongside ordinary five-to-32-character names.
    const serviceLink =
      direct &&
      /^(?:share|joinchat|addstickers|addemoji|addlist|proxy|socks|login|confirmphone|boost|invoice|giftcode)$/i.test(
        nick,
      );
    const handle = /^[a-z][a-z0-9_]{2,30}[a-z0-9]$/i;
    if (!serviceLink && handle.test(nick)) {
      const telegram = '@' + nick;
      return { value: telegram, email: '', telegram };
    }
    if (/^[+\d][\d ()+.-]*$/.test(value))
      return { error: 'Для ответа укажите email или Telegram, например @ivan_petrov.' };
    if (value.startsWith('@') || /(?:t\.me|telegram\.me)/i.test(value)) {
      return { error: 'Проверьте Telegram-ник или ссылку. Пример — @ivan_petrov или t.me/ivan_petrov.' };
    }
    if (handle.test(value))
      return { error: 'Для Telegram добавьте @ перед ником. Для почты укажите адрес целиком.' };
    return { error: 'Введите почту вида ivan@company.ru или Telegram-ник вида @ivan_petrov.' };
  }
  function companySite(raw) {
    const value = raw.trim();
    if (!value) return { value: '' };
    const error = 'Проверьте адрес сайта. Пример — company.ru или компания.рф.';
    if (/^https?:\/\/$/i.test(value)) return { error: 'Добавьте домен, например company.ru.' };
    if (value.length > 2048)
      return { error: 'Ссылка слишком длинная. Укажите адрес главной страницы сайта.' };
    if (/[\s<>\\"\p{Cc}\p{Cf}]/u.test(value) || /%(?![\da-f]{2})/i.test(value)) return { error };
    const hasScheme = /^https?:\/\//i.test(value);
    const candidate = hasScheme ? value : 'https://' + value;
    const authority = candidate.slice(candidate.indexOf('://') + 3).split(/[/?#]/, 1)[0];
    if (!/^[^:@%]+(?::\d{1,5})?$/.test(authority)) return { error };
    try {
      const url = new URL(candidate);
      if (
        !isDomain(url.hostname) ||
        url.username ||
        url.password ||
        url.port === '0' ||
        url.href.length > 2048
      )
        return { error };
      return { value: url.href };
    } catch {
      return { error };
    }
  }
  function inspect(input) {
    switch (input.name) {
      case 'name':
        return personalName(input.value);
      case 'contact':
        return contactValue(input.value);
      case 'site':
        return companySite(input.value);
      case 'consent':
        return input.checked ? { value: true } : { error: 'Отметьте согласие, чтобы отправить заявку.' };
    }
  }
  function setFieldError(form, input, message) {
    const slot = form.querySelector('[data-error-for="' + input.name + '"]');
    if (slot && slot.textContent !== message) slot.textContent = message;
    input.setCustomValidity(message);
    input.classList.toggle('is-invalid', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function calcText(calc) {
    if (!calc) return '';
    return [
      'Бюджет: ' + calc.budget_fmt,
      'Средний чек: ' + calc.check_fmt,
      'Ниша: ' + calc.niche,
      'Каналы: ' + (calc.channels.join(', ') || 'не выбраны'),
      '→ Лидов/мес: ' + calc.leads,
      '→ Сделок/мес: ' + calc.deals,
      '→ Выручка: ' + calc.revenue,
      '→ ROMI: ' + calc.romi,
    ].join('\n');
  }
  function acknowledgment(data) {
    return (
      data != null &&
      typeof data === 'object' &&
      (data.ok === true || data.success === true || data.data?.ok === true)
    );
  }
  function makeId() {
    return (
      globalThis.crypto?.randomUUID?.() ??
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)
    );
  }
  for (const form of forms) {
    form.noValidate = true;
    const modal = form.closest('dialog');
    const button = form.querySelector('button[type="submit"]');
    const buttonContent = [...button.childNodes].map((node) => node.cloneNode(true));
    const status = form.querySelector('[data-form-error]');
    const readySince = Date.now();
    const controls = ['name', 'contact', 'site', 'consent'].map((name) => form.elements.namedItem(name));
    const nameBox = form.elements.namedItem('name');
    const consentBox = form.elements.namedItem('consent');
    const consentHint = form.querySelector('[data-consent-hint]');
    const touched = new Set();
    let composing = null;
    let feedbackTimer;
    let pending = false;
    let attemptKey = '';
    let attemptId = '';
    function say(text) {
      status.textContent = text;
      status.hidden = !text;
    }
    function syncButton() {
      button.disabled =
        pending || composing !== null || controls.some((input) => Boolean(inspect(input).error));
      consentHint.hidden = consentBox.checked || consentBox.getAttribute('aria-invalid') === 'true';
    }
    function check(input, format = false) {
      const result = inspect(input);
      setFieldError(form, input, result.error || '');
      if (format && !result.error && input.type !== 'checkbox') {
        // Preserve readable international domains in the UI; the payload uses the normalized address.
        if (input.name === 'site' || result.email) input.value = input.value.trim();
        else input.value = result.value;
      }
      return result;
    }
    function changed(event) {
      const input = event.target;
      if (!controls.includes(input)) return;
      if (event.isComposing || composing === input) return;
      clearTimeout(feedbackTimer);
      const filtered = input === nameBox && filterNameInput(input);
      const error = inspect(input).error;
      // A paste is complete. Give someone entering an address a moment to finish typing.
      if (
        !error ||
        filtered ||
        touched.has(input) ||
        input.hasAttribute('aria-invalid') ||
        event.type === 'change' ||
        ['insertFromPaste', 'insertFromDrop'].includes(event.inputType)
      ) {
        setFieldError(form, input, error || '');
      } else if (input.value) {
        feedbackTimer = setTimeout(() => check(input), 550);
      }
      syncButton();
      say('');
    }
    nameBox.addEventListener('beforeinput', (event) => {
      if (
        event.isComposing ||
        composing === nameBox ||
        !event.cancelable ||
        !event.inputType.startsWith('insert')
      )
        return;
      const text = event.data ?? event.dataTransfer?.getData('text/plain');
      if (text && !/[\p{L}\p{Mn}\p{Mc} \u00a0\u202f]/u.test(text)) {
        event.preventDefault();
        check(nameBox);
      }
    });
    form.addEventListener('compositionstart', (event) => {
      if (!controls.includes(event.target)) return;
      clearTimeout(feedbackTimer);
      composing = event.target;
      syncButton();
    });
    form.addEventListener('compositionend', (event) => {
      composing = null;
      changed(event);
    });
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
    form.addEventListener('focusout', (event) => {
      if (!controls.includes(event.target) || event.target.type === 'checkbox' || composing === event.target)
        return;
      clearTimeout(feedbackTimer);
      touched.add(event.target);
      check(event.target, true);
      syncButton();
    });
    form.addEventListener('reset', () => {
      queueMicrotask(() => {
        clearTimeout(feedbackTimer);
        composing = null;
        touched.clear();
        for (const input of controls) setFieldError(form, input, '');
        say('');
        syncButton();
      });
    });
    modal?.addEventListener('close', () => {
      if (modal.open) return;
      clearTimeout(feedbackTimer);
      composing = null;
      consentBox.checked = false;
      touched.delete(consentBox);
      setFieldError(form, consentBox, '');
      syncButton();
    });
    window.addEventListener('pageshow', () => {
      filterNameInput(nameBox);
      syncButton();
    });
    syncButton();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (pending || composing !== null) return;
      clearTimeout(feedbackTimer);
      say('');
      let firstInvalid = null;
      const fields = {};
      for (const input of controls) {
        touched.add(input);
        const result = check(input, true);
        fields[input.name] = result;
        if (result.error && !firstInvalid) firstInvalid = input;
      }
      syncButton();
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }
      if (!endpoint) {
        say('Не удалось отправить. Напишите нам в Telegram.');
        return;
      }
      const field = (name) => (form.elements.namedItem(name)?.value ?? '').trim();
      if (field('ag_hp_email')) return;
      const now = new Date();
      const contact = fields.contact.value;
      const tariff = field('tariff');
      const calc = calculatorState;
      const details = calcText(calc);
      const consent = form.querySelector('.consent__text');
      const fillMs = now.getTime() - readySince;
      const name = fields.name.value;
      const site = fields.site.value;
      const signature = JSON.stringify([name, contact, site, tariff, calc]);
      // Keep the same lead ID when retrying the same fields after an uncertain response.
      if (attemptKey !== signature) {
        attemptKey = signature;
        attemptId = makeId();
      }
      const webPage = location.protocol !== 'file:';
      const payload = {
        lead_id: attemptId,
        form_type: modal ? (tariff ? 'Заявка на тариф' : 'Заявка (модальное окно)') : 'Заявка с формы',
        form_id: modal ? 'modal' : 'contact',
        name,
        contact,
        phone: '',
        email: fields.contact.email,
        telegram: fields.contact.telegram,
        site,
        tariff,
        comment: '',
        extra: {},
        section: (form.closest('section,dialog')?.querySelector('h2')?.textContent || '').trim(),
        date: now.toLocaleDateString('ru-RU'),
        time: now.toLocaleTimeString('ru-RU'),
        client_iso: now.toISOString(),
        tz_offset_min: now.getTimezoneOffset(),
        page_url: webPage ? location.origin + location.pathname : 'https://adsgalaxy.ru/',
        page_path: webPage ? location.pathname : '/',
        page_slug: 'index',
        page_name: 'Главная',
        page_title: document.title,
        source_host: webPage ? location.hostname : '',
        calc,
        calc_text: details,
        details,
        quiz_text: '',
        quiz_answers: [],
        consent: {
          given: form.elements.consent.checked,
          version: config('consent-version'),
          at: now.toISOString(),
          text: consent.textContent.trim().replace(/\s+/g, ' '),
          doc_url: consent.querySelector('a[href*="soglasie"]').href,
        },
        antispam: { hp: '', fill_ms: fillMs, too_fast: fillMs < 1500 },
      };
      pending = true;
      syncButton();
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Отправляем…';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json;charset=utf-8' },
          body: JSON.stringify(payload),
          signal: controller.signal,
          referrerPolicy: 'strict-origin-when-cross-origin',
        });
        if (!response.ok || !acknowledgment(await response.json())) throw new Error('Unconfirmed delivery');
        attemptKey = '';
        form.reset();
        if (thanks) {
          const target = new URL(thanks, document.baseURI);
          target.searchParams.set('t', modal && tariff ? 'tarif' : 'forma');
          location.assign(target.href);
          return;
        }
        if (modal) {
          form.hidden = true;
          modal.querySelector('[data-modal-success]').hidden = false;
        } else {
          for (const child of form.children) child.hidden = !child.hasAttribute('data-form-success');
        }
      } catch {
        say('Не удалось отправить. Попробуйте ещё раз.');
      } finally {
        clearTimeout(timeout);
        pending = false;
        syncButton();
        button.removeAttribute('aria-busy');
        button.replaceChildren(...buttonContent.map((node) => node.cloneNode(true)));
      }
    });
  }
})();

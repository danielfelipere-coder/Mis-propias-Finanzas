/* ============================================================================
   app.js — Controlador Modular, Vistas Interactivas, SVG Nativos y Excel (.xlsx)
   Mis Propias Finanzas · COP
   ============================================================================ */

(() => {
  'use strict';

  const D = window.MPFData;
  if (!D) {
    console.error('MPFData no está disponible. Asegúrate de cargar data.js antes de app.js.');
    return;
  }

  // ==========================================================================
  // 1. ESTADO GLOBAL Y PERSISTENCIA EN LOCALSTORAGE
  // ==========================================================================
  let state = D.createDefaultState();
  let donutCache = { cats: [], metrics: null };

  function loadState() {
    try {
      const raw = localStorage.getItem(D.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.profiles) return;

      const profileKeys = Object.keys(parsed.profiles);
      if (profileKeys.length === 0) return;

      // Garantizar integridad de cada perfil
      profileKeys.forEach((ced, idx) => {
        const p = parsed.profiles[ced];
        if (!p.data || !Array.isArray(p.data.incomes) || !Array.isArray(p.data.categories)) {
          p.data = D.createEmptyFinancialData();
        }
        if (!p.data.targets) p.data.targets = { ...D.DEFAULT_TARGETS };
        if (!Array.isArray(p.patrimonio)) {
          p.patrimonio = p.preset === 'daniel'
            ? D.createDanielPatrimonioData()
            : D.createEmptyPatrimonioData();
        }
        if (!Array.isArray(p.dailyExpenses)) {
          p.dailyExpenses = [];
        }
        if (!p.color) p.color = D.pickProfileColor(idx);
      });

      if (!parsed.groups || typeof parsed.groups !== 'object') {
        parsed.groups = {};
      }
      if (!parsed.activeCedula || !parsed.profiles[parsed.activeCedula]) {
        parsed.activeCedula = profileKeys[0];
      }
      if (parsed.activeGroupId && !parsed.groups[parsed.activeGroupId]) {
        const gKeys = Object.keys(parsed.groups);
        parsed.activeGroupId = gKeys[0] || null;
      }
      if (!parsed.activeTab) parsed.activeTab = 'dashboard';
      if (!parsed.patrimonioScope) parsed.patrimonioScope = 'personal';
      if (!parsed.patrimonioCategoryFilter) parsed.patrimonioCategoryFilter = 'all';
      if (!parsed.dailyScope) parsed.dailyScope = 'personal';
      if (!parsed.dailyFilterMonth) parsed.dailyFilterMonth = 'all';
      if (!parsed.dailyFilterCategory) parsed.dailyFilterCategory = 'all';

      state = parsed;
    } catch (err) {
      console.warn('No se pudo cargar localStorage, usando estado base:', err);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(D.STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('No se pudo guardar en localStorage:', err);
    }
  }

  function getActiveProfile() {
    return state.profiles[state.activeCedula];
  }

  function getCurrentData() {
    return getActiveProfile().data;
  }

  function getActiveGroup() {
    if (state.activeGroupId && state.groups[state.activeGroupId]) {
      return state.groups[state.activeGroupId];
    }
    const keys = Object.keys(state.groups);
    if (keys.length > 0) {
      state.activeGroupId = keys[0];
      return state.groups[keys[0]];
    }
    return null;
  }

  // ==========================================================================
  // 2. TOASTS Y TOOLTIP FLOTANTE COMPARTIDO
  // ==========================================================================
  function showToast(message, accent = 'var(--mint)') {
    const stack = document.getElementById('toastStack');
    if (!stack) return;

    // Mantener máximo 2 avisos compactos para nunca tapar contenido ni números
    while (stack.children.length >= 2) {
      stack.firstElementChild.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderColor = accent === 'var(--rose)'
      ? 'rgba(255, 51, 102, 0.45)'
      : (accent === 'var(--amber)' ? 'rgba(255, 184, 0, 0.45)' : 'rgba(0, 245, 160, 0.38)');

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = accent;

    const text = document.createElement('span');
    text.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Cerrar aviso');
    closeBtn.textContent = '✕';

    const dismiss = () => {
      if (!toast.isConnected) return;
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-4px)';
      toast.style.transition = 'all 0.16s ease';
      setTimeout(() => toast.remove(), 170);
    };

    closeBtn.addEventListener('click', dismiss);

    toast.appendChild(dot);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    stack.appendChild(toast);

    setTimeout(dismiss, 2400);
  }

  const tooltipEl = document.getElementById('floating-tooltip');
  let activeTooltipTarget = null;

  function renderTooltipContent(el) {
    const title = el.getAttribute('data-tip-title') || '';
    const color = el.getAttribute('data-tip-color') || '#00D9F5';
    const body = el.getAttribute('data-tip-body') || '';

    tooltipEl.textContent = '';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'tip-title';
    titleDiv.style.color = color;
    titleDiv.textContent = title;
    tooltipEl.appendChild(titleDiv);

    if (body) {
      body.split('|').forEach(line => {
        const p = document.createElement('div');
        p.className = 'tip-line';
        p.textContent = line.trim();
        tooltipEl.appendChild(p);
      });
    }
  }

  function positionTooltip(clientX, clientY) {
    const offset = 14;
    const rect = tooltipEl.getBoundingClientRect();
    let x = clientX + offset;
    let y = clientY - rect.height - 12;

    if (x + rect.width > window.innerWidth - 10) {
      x = clientX - rect.width - offset;
    }
    if (x < 10) x = 10;

    if (y < 10) y = clientY + offset + 4;
    if (y + rect.height > window.innerHeight - 10) {
      y = window.innerHeight - rect.height - 10;
    }

    tooltipEl.style.left = `${Math.round(x)}px`;
    tooltipEl.style.top = `${Math.round(y)}px`;
  }

  function hideTooltip() {
    activeTooltipTarget = null;
    tooltipEl.classList.remove('visible');
    tooltipEl.setAttribute('aria-hidden', 'true');
  }

  document.addEventListener('mouseover', (e) => {
    const target = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('[data-tip-title]')
      : null;
    if (target) {
      activeTooltipTarget = target;
      renderTooltipContent(target);
      tooltipEl.classList.add('visible');
      tooltipEl.setAttribute('aria-hidden', 'false');
      positionTooltip(e.clientX, e.clientY);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (activeTooltipTarget) positionTooltip(e.clientX, e.clientY);
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('[data-tip-title]')
      : null;
    if (!target) return;
    const related = e.relatedTarget && typeof e.relatedTarget.closest === 'function'
      ? e.relatedTarget.closest('[data-tip-title]')
      : null;
    if (related !== target) hideTooltip();
  });

  // Cerrar tooltip flotante al tocar fuera o desplazar en pantallas táctiles (iPhone/iPad)
  document.addEventListener('touchstart', (e) => {
    if (!activeTooltipTarget) return;
    const target = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('[data-tip-title]')
      : null;
    if (!target) hideTooltip();
  }, { passive: true });

  window.addEventListener('scroll', () => {
    if (activeTooltipTarget) hideTooltip();
  }, { passive: true });

  // ==========================================================================
  // 3. FALLBACK LIGHT-DISMISS PARA <dialog closedby="any"> (SAFARI / LEGACY)
  // ==========================================================================
  function setupDialogLightDismissFallback() {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    document.querySelectorAll('dialog[closedby="any"]').forEach(dialog => {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e, dialog)) dialog.close();
      });
    });
  }

  // ==========================================================================
  // 4. SISTEMA DE PERFILES Y LOGIN LOCAL MULTIUSUARIO
  // ==========================================================================
  function renderAuthScreen() {
    const profiles = Object.values(state.profiles);
    document.getElementById('authProfilesCountPill').textContent =
      `${profiles.length} ${profiles.length === 1 ? 'perfil registrado' : 'perfiles registrados'}`;

    const listEl = document.getElementById('authProfilesList');
    listEl.innerHTML = profiles.map(prof => {
      const m = D.computeMetrics(prof.data);
      const initials = D.getInitials(prof.name);
      const freeColor = m.freeCashFlow >= 0 ? 'var(--mint)' : 'var(--rose)';
      const badgeLabel = prof.preset ? 'Pre-cargado' : 'Local';

      return `
        <button type="button" class="profile-item-card" data-login-cedula="${D.escapeAttr(prof.cedula)}">
          <div class="profile-item-left">
            <div class="avatar-badge" style="background:${prof.color};">${D.escapeAttr(initials)}</div>
            <div style="min-width:0;">
              <div class="profile-item-name">${D.escapeAttr(prof.name)}</div>
              <div class="profile-item-meta mono">C.C. ${D.escapeAttr(D.formatCedulaDisplay(prof.cedula))} · ${badgeLabel}</div>
            </div>
          </div>
          <div class="profile-item-right">
            <span class="mono" style="font-size:12.5px; font-weight:800; color:#ffffff;">${D.formatCOP(m.totalIncome)}</span>
            <span class="mono" style="font-size:11px; font-weight:700; color:${freeColor};">Libre: ${D.formatCOP(m.freeCashFlow)}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function showAuthScreen() {
    hideTooltip();
    renderAuthScreen();
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
  }

  function enterAppWithProfile(cedula, toastMsg = null) {
    if (!state.profiles[cedula]) return;
    state.activeCedula = cedula;
    saveState();
    try {
      sessionStorage.setItem(D.SESSION_KEY, cedula);
    } catch (_) {}

    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    renderProfileSwitcher();
    switchTab(state.activeTab || 'dashboard');
    if (toastMsg) showToast(toastMsg);
  }

  function registerOrLoginProfile(rawName, rawCedula) {
    const name = String(rawName || '').trim();
    const cedula = D.normalizeCedula(rawCedula);

    if (!cedula || cedula.length < 4) {
      showToast('Ingresa una cédula válida (solo números, mínimo 4 dígitos)', 'var(--rose)');
      return null;
    }

    // Si la cédula ya existe, inicia sesión directamente (y actualiza nombre si se proporcionó diferente)
    if (state.profiles[cedula]) {
      const existing = state.profiles[cedula];
      enterAppWithProfile(cedula, `Bienvenido(a) de nuevo, ${existing.name}`);
      return existing;
    }

    if (!name) {
      showToast('Ingresa tu Nombre Completo para registrar una cuenta nueva', 'var(--rose)');
      return null;
    }

    const newProfile = {
      cedula,
      name,
      preset: null,
      color: D.pickProfileColor(Object.keys(state.profiles).length),
      createdAt: new Date().toISOString().slice(0, 10),
      data: D.createEmptyFinancialData(),
      patrimonio: D.createEmptyPatrimonioData(),
      dailyExpenses: []
    };

    state.profiles[cedula] = newProfile;
    saveState();
    enterAppWithProfile(cedula, `Perfil "${name}" creado y guardado localmente`);
    return newProfile;
  }

  function renderProfileSwitcher() {
    const active = getActiveProfile();
    const sel = document.getElementById('profileSelect');
    const profiles = Object.values(state.profiles);

    sel.innerHTML = profiles.map(p =>
      `<option value="${D.escapeAttr(p.cedula)}" ${p.cedula === active.cedula ? 'selected' : ''}>${D.escapeAttr(p.name)} (${D.formatCedulaDisplay(p.cedula)})</option>`
    ).join('');

    document.getElementById('activeProfileDot').style.background = active.color || 'var(--mint)';
    document.getElementById('brandUserSub').textContent =
      `${active.name} · C.C. ${D.formatCedulaDisplay(active.cedula)} · COP`;
  }

  // ==========================================================================
  // 5. COMPONENTES REUTILIZABLES: CUADRE CONTABLE, 5 PILARES Y GRÁFICAS SVG
  // ==========================================================================
  function renderCuadreWidget(badgeId, barId, legendId, m) {
    const badge = document.getElementById(badgeId);
    const bar = document.getElementById(barId);
    const legend = document.getElementById(legendId);

    if (m.totalIncome <= 0) {
      badge.className = 'pill pill-amber';
      badge.textContent = '⚠ Registra ingresos en el Editor para calcular el cuadre';
      bar.textContent = '';
      legend.textContent = '';
      return;
    }

    const totalPct = m.pillars.reduce((acc, p) => acc + p.realPct, 0) + m.freePct;
    if (m.freeCashFlow >= 0) {
      badge.className = 'pill pill-mint num';
      badge.textContent = `✓ Cuadre exacto: 5 Pilares (${D.formatCOP(m.totalExpenses)}) + Flujo Libre (${D.formatCOP(m.freeCashFlow)}) = ${D.formatCOP(m.totalIncome)} (${D.formatPct(totalPct)})`;
    } else {
      badge.className = 'pill pill-amber num';
      badge.textContent = `⚠ Déficit mensual: Egresos (${D.formatCOP(m.totalExpenses)}) exceden ingresos en ${D.formatCOP(Math.abs(m.freeCashFlow))}`;
    }

    const segments = [
      ...m.pillars.map(p => ({
        id: p.id,
        name: p.legendName,
        amount: p.amount,
        pct: p.realPct,
        color: p.color
      })),
      {
        id: 'flujo-libre',
        name: m.freeCashFlow >= 0 ? 'Flujo Libre' : 'Déficit',
        amount: m.freeCashFlow,
        pct: m.freePct,
        color: m.freeCashFlow >= 0 ? '#3B82F6' : '#FF3366'
      }
    ];

    const baseForWidth = m.freeCashFlow >= 0 ? m.totalIncome : m.totalExpenses;

    bar.textContent = '';
    segments.forEach(seg => {
      if (seg.amount <= 0) return;
      const widthPct = baseForWidth > 0 ? (seg.amount / baseForWidth) * 100 : 0;
      const div = document.createElement('div');
      div.className = 'stacked-seg';
      div.style.width = `${widthPct.toFixed(4)}%`;
      div.style.backgroundColor = seg.color;
      div.setAttribute('data-tip-title', seg.name);
      div.setAttribute('data-tip-color', seg.color);
      div.setAttribute('data-tip-body', `Monto: ${D.formatCOP(seg.amount)}|% de Ingresos: ${D.formatPct(seg.pct)}`);
      bar.appendChild(div);
    });

    legend.textContent = '';
    segments.forEach(seg => {
      const item = document.createElement('div');
      item.className = 'cuadre-legend-item';
      item.setAttribute('data-tip-title', seg.name);
      item.setAttribute('data-tip-color', seg.color);
      item.setAttribute('data-tip-body', `Monto mensual: ${D.formatCOP(seg.amount)}|Participación: ${D.formatPct(seg.pct)}`);

      item.innerHTML = `
        <div class="cuadre-leg-left">
          <span class="dot" style="background:${seg.color};"></span>
          <span class="cuadre-leg-name">${D.escapeAttr(seg.name)}</span>
        </div>
        <div class="cuadre-leg-right num">
          <strong style="color:#ffffff;">${D.formatPct(seg.pct)}</strong>
          <span style="color:var(--text-secondary); font-size:11.5px;">(${D.formatCOP(seg.amount)})</span>
        </div>
      `;
      legend.appendChild(item);
    });
  }

  function buildPillarCardsInto(gridId, prefix, m) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = m.pillars.map(p => {
      const maxScale = Math.max(p.realPct, p.meta, 15) * 1.25;
      const fillW = Math.min(100, Math.max(0, (p.realPct / maxScale) * 100));
      const tickL = Math.min(98, Math.max(2, (p.meta / maxScale) * 100));
      const stateColor = p.isGood ? 'var(--mint)' : 'var(--rose)';

      return `
        <div class="pillar-card" id="${prefix}card-${p.id}">
          <div>
            <div class="pillar-top">
              <div>
                <div class="pillar-title">${p.title}</div>
                <div class="pillar-cats" id="${prefix}cats-${p.id}">${D.escapeAttr(p.catsLabel)}</div>
              </div>
              <span id="${prefix}status-${p.id}" class="pill ${p.isGood ? 'pill-mint' : 'pill-rose'}">
                ${p.isGood ? 'ESTÁS BIEN' : 'DEBES MEJORAR'}
              </span>
            </div>

            <div class="pillar-main-metric" style="margin-top:14px;">
              <span id="${prefix}pct-${p.id}" class="pillar-pct mono" style="color:${stateColor};">${D.formatPct(p.realPct)}</span>
              <span id="${prefix}cop-${p.id}" class="pillar-cop mono">${D.formatCOP(p.amount)}</span>
            </div>

            <div class="pillar-track" style="margin-top:12px;">
              <div id="${prefix}fill-${p.id}" class="pillar-fill" style="width:${fillW.toFixed(2)}%; background:${stateColor};"></div>
              <div id="${prefix}tick-${p.id}" class="pillar-tick" style="left:${tickL.toFixed(2)}%;"
                data-tip-title="${D.escapeAttr(`Meta ${p.legendName}`)}"
                data-tip-color="#00D9F5"
                data-tip-body="${D.escapeAttr(`Condición: ${p.op} ${p.meta}%|Equivalente en COP: ${D.formatCOP(p.metaAmount)}`)}"></div>
            </div>

            <div id="${prefix}gap-${p.id}" class="pillar-gap num" style="margin-top:10px; color:${stateColor}; font-weight:600;">
              ${D.getPillarGapText(p)}
            </div>
          </div>

          <div class="meta-box">
            <div class="meta-box-row">
              <span class="meta-box-label">Meta (${p.op})</span>
              <div class="meta-num-shell">
                <input type="number" min="1" max="100" step="1" value="${p.meta}"
                  class="meta-num-input" id="${prefix}num-${p.id}" data-pillar-input="${p.id}" data-source="num" aria-label="Meta numérica ${p.legendName}" />
                <span style="font-size:12px; font-weight:800; color:var(--text-secondary);">%</span>
              </div>
            </div>
            <input type="range" min="1" max="70" step="1" value="${Math.min(70, Math.max(1, p.meta))}"
              id="${prefix}range-${p.id}" data-pillar-input="${p.id}" data-source="range"
              style="--thumb-color:${p.color};" aria-label="Deslizador meta ${p.legendName}" />
            <div class="meta-box-row" style="font-size:11px; color:var(--text-muted);">
              <span>1%</span>
              <span id="${prefix}metacop-${p.id}" class="mono">Tope: ${D.formatCOP(p.metaAmount)}</span>
              <span>70%</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function updatePillarCardsInPlace(prefix, m) {
    m.pillars.forEach(p => {
      const maxScale = Math.max(p.realPct, p.meta, 15) * 1.25;
      const fillW = Math.min(100, Math.max(0, (p.realPct / maxScale) * 100));
      const tickL = Math.min(98, Math.max(2, (p.meta / maxScale) * 100));
      const stateColor = p.isGood ? 'var(--mint)' : 'var(--rose)';

      const statusEl = document.getElementById(`${prefix}status-${p.id}`);
      if (!statusEl) return;
      statusEl.className = `pill ${p.isGood ? 'pill-mint' : 'pill-rose'}`;
      statusEl.textContent = p.isGood ? 'ESTÁS BIEN' : 'DEBES MEJORAR';

      const pctEl = document.getElementById(`${prefix}pct-${p.id}`);
      pctEl.textContent = D.formatPct(p.realPct);
      pctEl.style.color = stateColor;

      document.getElementById(`${prefix}cop-${p.id}`).textContent = D.formatCOP(p.amount);
      document.getElementById(`${prefix}cats-${p.id}`).textContent = p.catsLabel;

      const fillEl = document.getElementById(`${prefix}fill-${p.id}`);
      fillEl.style.width = `${fillW.toFixed(2)}%`;
      fillEl.style.background = stateColor;

      const tickEl = document.getElementById(`${prefix}tick-${p.id}`);
      tickEl.style.left = `${tickL.toFixed(2)}%`;
      tickEl.setAttribute('data-tip-body', `Condición: ${p.op} ${p.meta}%|Equivalente en COP: ${D.formatCOP(p.metaAmount)}`);

      const gapEl = document.getElementById(`${prefix}gap-${p.id}`);
      gapEl.textContent = D.getPillarGapText(p);
      gapEl.style.color = stateColor;

      document.getElementById(`${prefix}metacop-${p.id}`).textContent = `Tope: ${D.formatCOP(p.metaAmount)}`;

      const numEl = document.getElementById(`${prefix}num-${p.id}`);
      const rangeEl = document.getElementById(`${prefix}range-${p.id}`);
      if (document.activeElement !== numEl) numEl.value = p.meta;
      if (document.activeElement !== rangeEl) rangeEl.value = Math.min(70, Math.max(1, p.meta));
    });
  }

  function renderPillarsBarChartInto(wrapId, m) {
    const wrap = document.getElementById(wrapId);
    const W = 640;
    const H = 310;
    const padL = 48;
    const padR = 18;
    const padT = 34;
    const padB = 58;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const peak = Math.max(45, ...m.pillars.map(p => Math.max(p.realPct, p.meta)));
    const yMax = Math.ceil(peak / 10) * 10;
    const steps = 5;

    let gridSvg = '';
    for (let i = 0; i <= steps; i++) {
      const val = (yMax / steps) * i;
      const y = padT + plotH - (val / yMax) * plotH;
      gridSvg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"
          stroke="${i === 0 ? '#2D2D3F' : '#181824'}" stroke-width="1" />
        <text x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end"
          fill="#64748B" font-size="11" font-weight="600">${Math.round(val)}%</text>
      `;
    }

    const slotW = plotW / m.pillars.length;
    const barW = Math.min(34, slotW * 0.27);
    const gap = 8;

    let groupsSvg = '';
    m.pillars.forEach((p, idx) => {
      const cx = padL + slotW * idx + slotW / 2;
      const xReal = cx - barW - gap / 2;
      const xMeta = cx + gap / 2;

      const hReal = Math.max(3, (Math.min(p.realPct, yMax) / yMax) * plotH);
      const yReal = padT + plotH - hReal;

      const hMeta = Math.max(3, (Math.min(p.meta, yMax) / yMax) * plotH);
      const yMeta = padT + plotH - hMeta;

      const realColor = p.isGood ? '#00F5A0' : '#FF3366';
      const statusLabel = p.isGood ? 'ESTÁS BIEN' : 'DEBES MEJORAR';
      const tipBody = [
        `Real: ${D.formatPct(p.realPct)} (${D.formatCOP(p.amount)})`,
        `Meta (${p.op}): ${p.meta}% (${D.formatCOP(p.metaAmount)})`,
        `${statusLabel} — ${D.getPillarGapText(p)}`
      ].join('|');

      const line1 = D.escapeAttr(p.shortLines[0]);
      const line2 = D.escapeAttr(p.shortLines[1]);

      groupsSvg += `
        <g style="cursor:pointer;"
          data-tip-title="${D.escapeAttr(p.title)}"
          data-tip-color="${realColor}"
          data-tip-body="${D.escapeAttr(tipBody)}">
          <rect x="${(padL + slotW * idx + 4).toFixed(1)}" y="${padT}" width="${(slotW - 8).toFixed(1)}" height="${plotH}" fill="transparent" />

          <rect x="${xReal.toFixed(1)}" y="${yReal.toFixed(1)}" width="${barW.toFixed(1)}" height="${hReal.toFixed(1)}"
            rx="6" fill="${realColor}" />
          <text x="${(xReal + barW / 2).toFixed(1)}" y="${(yReal - 8).toFixed(1)}" text-anchor="middle"
            fill="${realColor}" font-size="10.5" font-weight="800">${p.realPct.toFixed(1).replace('.', ',')}%</text>

          <rect x="${xMeta.toFixed(1)}" y="${yMeta.toFixed(1)}" width="${barW.toFixed(1)}" height="${hMeta.toFixed(1)}"
            rx="6" fill="rgba(0, 217, 245, 0.18)" stroke="#00D9F5" stroke-width="1.6" />
          <text x="${(xMeta + barW / 2).toFixed(1)}" y="${(yMeta - 8).toFixed(1)}" text-anchor="middle"
            fill="#00D9F5" font-size="10.5" font-weight="700">${p.meta}%</text>

          <text x="${cx.toFixed(1)}" y="${(padT + plotH + 20).toFixed(1)}" text-anchor="middle"
            fill="#E2E8F0" font-size="11.5" font-weight="700">${line1}</text>
          ${line2 ? `<text x="${cx.toFixed(1)}" y="${(padT + plotH + 35).toFixed(1)}" text-anchor="middle" fill="#94A3B8" font-size="11" font-weight="600">${line2}</text>` : ''}
        </g>
      `;
    });

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Gráfica Real % vs Meta % de los 5 Pilares">
        ${gridSvg}
        ${groupsSvg}
      </svg>
    `;
  }

  // ==========================================================================
  // 6. GRÁFICA SVG DONA DE DISTRIBUCIÓN DE EGRESOS
  // ==========================================================================
  function polarToXY(cx, cy, r, deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(cx, cy, r, startDeg, endDeg) {
    const span = endDeg - startDeg;
    if (span >= 359.95) {
      const p1 = polarToXY(cx, cy, r, 0);
      const p2 = polarToXY(cx, cy, r, 180);
      return `M ${p1.x} ${p1.y} A ${r} ${r} 0 1 1 ${p2.x} ${p2.y} A ${r} ${r} 0 1 1 ${p1.x} ${p1.y}`;
    }
    const s = polarToXY(cx, cy, r, endDeg);
    const e = polarToXY(cx, cy, r, startDeg);
    const large = span > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  function renderDonutChart(data, m) {
    const svgWrap = document.getElementById('donutSvgWrap');
    const legendWrap = document.getElementById('donutLegendGrid');

    const activeCats = data.categories
      .map(c => ({
        id: c.id,
        name: c.name,
        color: c.color,
        total: m.catTotals[c.id] || 0,
        pctIncome: m.totalIncome > 0 ? ((m.catTotals[c.id] || 0) / m.totalIncome) * 100 : 0,
        pctExpenses: m.totalExpenses > 0 ? ((m.catTotals[c.id] || 0) / m.totalExpenses) * 100 : 0
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);

    donutCache = { cats: activeCats, metrics: m };

    if (activeCats.length === 0) {
      svgWrap.innerHTML = `
        <svg viewBox="0 0 240 240">
          <circle cx="120" cy="120" r="84" fill="none" stroke="#1E1E2A" stroke-width="24" />
          <text x="120" y="114" text-anchor="middle" fill="#64748B" font-size="11" font-weight="700">SIN EGRESOS</text>
          <text x="120" y="135" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="800">$ 0</text>
        </svg>
      `;
      legendWrap.innerHTML = '<div style="grid-column:1/-1; font-size:12px; color:var(--text-secondary);">No hay categorías con egresos activos.</div>';
      return;
    }

    const cx = 120, cy = 120, r = 84;
    let angle = 0;
    let slicesSvg = '';

    activeCats.forEach(cat => {
      const sweep = (cat.total / m.totalExpenses) * 360;
      const gap = activeCats.length > 1 ? 1.5 : 0;
      const a0 = angle + gap / 2;
      const a1 = angle + Math.max(0.8, sweep - gap / 2);
      angle += sweep;

      const tipBody = `Monto: ${D.formatCOP(cat.total)}|% de Ingresos: ${D.formatPct(cat.pctIncome)}|% de Egresos: ${D.formatPct(cat.pctExpenses)}`;

      slicesSvg += `
        <path id="donut-slice-${cat.id}" d="${arcPath(cx, cy, r, a0, a1)}"
          fill="none" stroke="${cat.color}" stroke-width="24" stroke-linecap="butt"
          style="cursor:pointer; transition: stroke-width 0.15s ease, opacity 0.15s ease;"
          data-donut-cat="${cat.id}"
          data-tip-title="${D.escapeAttr(cat.name)}"
          data-tip-color="${cat.color}"
          data-tip-body="${D.escapeAttr(tipBody)}" />
      `;
    });

    svgWrap.innerHTML = `
      <svg viewBox="0 0 240 240" aria-label="Dona de Distribución de Egresos">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#14141D" stroke-width="24" />
        ${slicesSvg}
        <text id="donutCenterLabel" x="${cx}" y="${cy - 18}" text-anchor="middle" fill="#94A3B8" font-size="10" font-weight="700">TOTAL EGRESOS</text>
        <text id="donutCenterVal" x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="800">${D.formatCOP(m.totalExpenses)}</text>
        <text id="donutCenterSub" x="${cx}" y="${cy + 24}" text-anchor="middle" fill="#00D9F5" font-size="10.5" font-weight="700">${activeCats.length} categorías activas</text>
      </svg>
    `;

    legendWrap.innerHTML = activeCats.map(cat => {
      const tipBody = `Monto: ${D.formatCOP(cat.total)}|% de Ingresos: ${D.formatPct(cat.pctIncome)}|% de Egresos: ${D.formatPct(cat.pctExpenses)}`;
      return `
        <div class="donut-item" id="donut-leg-${cat.id}"
          data-donut-cat="${cat.id}"
          data-tip-title="${D.escapeAttr(cat.name)}"
          data-tip-color="${cat.color}"
          data-tip-body="${D.escapeAttr(tipBody)}">
          <div class="donut-item-left">
            <span class="dot" style="background:${cat.color};"></span>
            <span class="donut-item-name">${D.escapeAttr(cat.name)}</span>
          </div>
          <div class="donut-item-right num">
            <span class="donut-item-pct">${D.formatPct(cat.pctIncome, 1)}</span>
            <span class="donut-item-cop">${D.formatCOP(cat.total)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function setDonutHighlight(catId) {
    const { cats, metrics } = donutCache;
    if (!metrics) return;

    const lbl = document.getElementById('donutCenterLabel');
    const val = document.getElementById('donutCenterVal');
    const sub = document.getElementById('donutCenterSub');

    if (!catId) {
      cats.forEach(c => {
        const slice = document.getElementById(`donut-slice-${c.id}`);
        const leg = document.getElementById(`donut-leg-${c.id}`);
        if (slice) { slice.setAttribute('stroke-width', '24'); slice.style.opacity = '1'; }
        if (leg) leg.classList.remove('highlighted');
      });
      if (lbl && val && sub) {
        lbl.textContent = 'TOTAL EGRESOS';
        lbl.setAttribute('fill', '#94A3B8');
        val.textContent = D.formatCOP(metrics.totalExpenses);
        sub.textContent = `${cats.length} categorías activas`;
        sub.setAttribute('fill', '#00D9F5');
      }
      return;
    }

    const cat = cats.find(c => c.id === catId);
    if (!cat) return;

    cats.forEach(c => {
      const slice = document.getElementById(`donut-slice-${c.id}`);
      const leg = document.getElementById(`donut-leg-${c.id}`);
      const isMatch = c.id === catId;
      if (slice) {
        slice.setAttribute('stroke-width', isMatch ? '29' : '22');
        slice.style.opacity = isMatch ? '1' : '0.28';
      }
      if (leg) leg.classList.toggle('highlighted', isMatch);
    });

    if (lbl && val && sub) {
      lbl.textContent = cat.name.length > 18 ? cat.name.slice(0, 17) + '…' : cat.name;
      lbl.setAttribute('fill', cat.color);
      val.textContent = D.formatCOP(cat.total);
      sub.textContent = `${D.formatPct(cat.pctIncome)} de ingresos`;
      sub.setAttribute('fill', '#E2E8F0');
    }
  }

  // ==========================================================================
  // 7. GRÁFICAS SVG DE PATRIMONIO (ACTIVOS VS PASIVOS & RUBROS)
  // ==========================================================================
  function renderPatrimonioBalanceSvg(wrapId, pm) {
    const wrap = document.getElementById(wrapId);
    const W = 560;
    const H = 290;
    const padL = 74;
    const padR = 24;
    const padT = 36;
    const padB = 52;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const bars = [
      {
        label: 'Activos Totales',
        value: pm.totalActivos,
        color: '#00F5A0',
        tip: `Activos Totales: ${D.formatCOP(pm.totalActivos)}|Rubros con saldo: ${pm.activeRows}`
      },
      {
        label: 'Deudas Totales',
        value: pm.totalDeudas,
        color: '#FF3366',
        tip: `Deudas Totales: ${D.formatCOP(pm.totalDeudas)}|Endeudamiento: ${D.formatPct(pm.debtRatioPct)}`
      },
      {
        label: 'Patrimonio Neto',
        value: pm.patrimonioNeto,
        color: pm.patrimonioNeto >= 0 ? '#00D9F5' : '#FF3366',
        tip: `Patrimonio Neto Real: ${D.formatCOP(pm.patrimonioNeto)}|Fórmula: Activos − Deudas (${D.formatPct(pm.equityRatioPct)})`
      }
    ];

    const maxAbs = Math.max(10000000, ...bars.map(b => Math.abs(b.value)));
    const hasNeg = pm.patrimonioNeto < 0;

    // Escala Y limpia: si hay patrimonio negativo, reserva zona inferior; si todo >= 0, base en 0
    const yMax = Math.ceil((maxAbs * 1.15) / 10000000) * 10000000;
    const yMin = hasNeg ? -Math.ceil((Math.abs(pm.patrimonioNeto) * 1.25) / 10000000) * 10000000 : 0;
    const span = yMax - yMin;

    const yAt = (v) => padT + ((yMax - v) / span) * plotH;
    const yZero = yAt(0);

    let gridSvg = '';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = yMin + (span / steps) * i;
      const y = yAt(val);
      gridSvg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"
          stroke="${Math.abs(val) < 1 ? '#2D2D3F' : '#181824'}" stroke-width="1" />
        <text x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end"
          fill="#64748B" font-size="10.5" font-weight="600">${D.formatCOPShort(val)}</text>
      `;
    }

    if (hasNeg) {
      gridSvg += `<line x1="${padL}" y1="${yZero.toFixed(1)}" x2="${W - padR}" y2="${yZero.toFixed(1)}" stroke="#475569" stroke-width="1.4" />`;
    }

    const slotW = plotW / bars.length;
    const barW = Math.min(76, slotW * 0.48);

    let barsSvg = '';
    bars.forEach((b, idx) => {
      const cx = padL + slotW * idx + slotW / 2;
      const x = cx - barW / 2;
      const yVal = yAt(b.value);
      const yTop = Math.min(yVal, yZero);
      const h = Math.max(4, Math.abs(yZero - yVal));
      const labelY = b.value >= 0 ? yTop - 10 : yTop + h + 15;

      barsSvg += `
        <g style="cursor:pointer;"
          data-tip-title="${D.escapeAttr(b.label)}"
          data-tip-color="${b.color}"
          data-tip-body="${D.escapeAttr(b.tip)}">
          <rect x="${(padL + slotW * idx + 8).toFixed(1)}" y="${padT}" width="${(slotW - 16).toFixed(1)}" height="${plotH}" fill="transparent" />
          <rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
            rx="8" fill="${b.color}" fill-opacity="0.9" />
          <text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"
            fill="${b.color}" font-size="11.5" font-weight="800">${D.formatCOPShort(b.value)}</text>
          <text x="${cx.toFixed(1)}" y="${(H - 18).toFixed(1)}" text-anchor="middle"
            fill="#E2E8F0" font-size="11.5" font-weight="700">${D.escapeAttr(b.label)}</text>
        </g>
      `;
    });

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Balance Patrimonial Activos vs Pasivos">
        ${gridSvg}
        ${barsSvg}
      </svg>
    `;
  }

  function renderPatrimonioCategoriesSvg(wrapId, pm) {
    const wrap = document.getElementById(wrapId);
    const cats = pm.categoryList.filter(c => c.activos > 0 || c.deudas > 0);

    if (cats.length === 0) {
      wrap.innerHTML = `
        <svg viewBox="0 0 560 220" aria-label="Sin datos patrimoniales">
          <text x="280" y="105" text-anchor="middle" fill="#64748B" font-size="13" font-weight="700">Sin rubros con saldo registrado</text>
          <text x="280" y="128" text-anchor="middle" fill="#94A3B8" font-size="11.5">Ingresa valores comerciales o deudas en la tabla inferior</text>
        </svg>
      `;
      return;
    }

    const W = 560;
    const rowH = 44;
    const padT = 14;
    const padB = 14;
    const H = Math.max(220, padT + padB + cats.length * rowH);
    const labelW = 148;
    const rightValW = 112;
    const barAreaW = W - labelW - rightValW - 20;
    const maxVal = Math.max(1, ...cats.map(c => Math.max(c.activos, c.deudas)));

    let rowsSvg = '';
    cats.forEach((c, idx) => {
      const y = padT + idx * rowH;
      const wAct = c.activos > 0 ? Math.max(4, (c.activos / maxVal) * barAreaW) : 0;
      const wDeb = c.deudas > 0 ? Math.max(4, (c.deudas / maxVal) * barAreaW) : 0;
      const netColor = c.neto >= 0 ? '#00F5A0' : '#FF3366';

      const tipBody = [
        `Activos: ${D.formatCOP(c.activos)}`,
        `Deudas: ${D.formatCOP(c.deudas)}`,
        `Patrimonio Neto: ${D.formatCOP(c.neto)}`
      ].join('|');

      rowsSvg += `
        <g style="cursor:pointer;"
          data-tip-title="${D.escapeAttr(c.label)}"
          data-tip-color="${c.color}"
          data-tip-body="${D.escapeAttr(tipBody)}">
          <rect x="0" y="${y}" width="${W}" height="${rowH - 4}" rx="8" fill="rgba(255,255,255,0.015)" />
          <text x="${labelW - 10}" y="${y + 23}" text-anchor="end" fill="#E2E8F0" font-size="11.5" font-weight="700">${D.escapeAttr(c.label.length > 21 ? c.label.slice(0, 20) + '…' : c.label)}</text>

          <rect x="${labelW}" y="${y + 8}" width="${barAreaW}" height="10" rx="5" fill="#14141D" />
          ${wAct > 0 ? `<rect x="${labelW}" y="${y + 8}" width="${wAct.toFixed(1)}" height="10" rx="5" fill="${c.color}" />` : ''}

          <rect x="${labelW}" y="${y + 22}" width="${barAreaW}" height="10" rx="5" fill="#14141D" />
          ${wDeb > 0 ? `<rect x="${labelW}" y="${y + 22}" width="${wDeb.toFixed(1)}" height="10" rx="5" fill="#FF3366" />` : ''}

          <text x="${W - 8}" y="${y + 17}" text-anchor="end" fill="${netColor}" font-size="11" font-weight="800">${D.formatCOPShort(c.neto)}</text>
          <text x="${W - 8}" y="${y + 31}" text-anchor="end" fill="#64748B" font-size="9.5" font-weight="600">Neto rubro</text>
        </g>
      `;
    });

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Activos vs Deudas por Categoría Patrimonial">
        ${rowsSvg}
      </svg>
    `;
  }

  // ==========================================================================
  // 8. VISTA 1: DASHBOARD & 5 PILARES
  // ==========================================================================
  function renderDashboard(rebuildPillarCards = true) {
    const data = getCurrentData();
    const m = D.computeMetrics(data);

    // 1. Top 4 KPI Cards
    document.getElementById('kpi-income').textContent = D.formatCOP(m.totalIncome);
    document.getElementById('kpi-income-sub').textContent =
      `${m.activeIncomes} ${m.activeIncomes === 1 ? 'fuente activa' : 'fuentes activas'} de ${data.incomes.length}`;

    document.getElementById('kpi-expenses').textContent = D.formatCOP(m.totalExpenses);
    document.getElementById('kpi-exp-pill').textContent = `${D.formatPct(m.committedPct)} COMPROMETIDO`;
    document.getElementById('kpi-exp-bar').style.width = `${Math.min(100, Math.max(0, m.committedPct))}%`;

    const freeEl = document.getElementById('kpi-free');
    const freePill = document.getElementById('kpi-free-pill');
    const freeSub = document.getElementById('kpi-free-sub');
    freeEl.textContent = D.formatCOP(m.freeCashFlow);
    if (m.freeCashFlow >= 0) {
      freeEl.style.color = 'var(--cyan)';
      freePill.className = 'pill pill-cobalt num';
      freePill.textContent = `${D.formatPct(m.freePct)} DISPONIBLE`;
      freeSub.textContent = 'Disponible mensual para ahorrar o invertir';
    } else {
      freeEl.style.color = 'var(--rose)';
      freePill.className = 'pill pill-rose num';
      freePill.textContent = `${D.formatPct(m.freePct)} DÉFICIT`;
      freeSub.textContent = 'Tus egresos superan tus ingresos mensuales';
    }

    document.getElementById('kpi-pillars-count').textContent = `${m.passedCount} / 5 Pilares`;
    const scorePill = document.getElementById('kpi-score-pill');
    scorePill.textContent = `SCORE ${m.score}/100`;
    scorePill.className = `pill num ${m.score >= 75 ? 'pill-mint' : (m.score >= 55 ? 'pill-purple' : 'pill-rose')}`;
    document.getElementById('kpi-pillars-sub').textContent =
      m.passedCount === 5 ? 'Todos tus pilares cumplen la meta' : `${5 - m.passedCount} pilares por optimizar`;

    // 2. Cuadre Contable 100%
    renderCuadreWidget('cuadreBadge', 'cuadreStackedBar', 'cuadreLegendGrid', m);

    // 3. Los 5 Pilares Financieros
    if (rebuildPillarCards || document.getElementById('pillarsGrid').children.length !== 5) {
      buildPillarCardsInto('pillarsGrid', 'p', m);
    } else {
      updatePillarCardsInPlace('p', m);
    }

    // 4. Gráficas SVG Nativas
    renderPillarsBarChartInto('pillarsBarSvg', m);
    renderDonutChart(data, m);

    // 5. Lectura Ejecutiva Dinámica
    renderExecutiveInsights(data, m);
  }

  function renderExecutiveInsights(data, m) {
    const grid = document.getElementById('insightsGrid');
    const pAhorro = m.pillars[0];
    const pViv = m.pillars[1];
    const pDeuda = m.pillars[2];
    const pPers = m.pillars[3];
    const pProt = m.pillars[4];

    const freePos = Math.max(0, m.freeCashFlow);
    const totalPotSave = pAhorro.amount + freePos;
    const totalPotPct = m.totalIncome > 0 ? (totalPotSave / m.totalIncome) * 100 : 0;
    const missingAfterFree = Math.max(0, pAhorro.metaAmount - totalPotSave);

    const card1 = `
      <div class="insight-card">
        <div class="insight-title" style="color:var(--mint);">
          <span class="dot" style="background:var(--mint);"></span> Potencial de Ahorro e Inversión
        </div>
        <div class="insight-body num">
          Destinas <strong style="color:#fff;">${D.formatCOP(pAhorro.amount)}</strong> (${D.formatPct(pAhorro.realPct)}).
          Al sumar tu flujo libre de <strong style="color:#fff;">${D.formatCOP(freePos)}</strong>, llegarías a
          <strong style="color:var(--mint);">${D.formatCOP(totalPotSave)} (${D.formatPct(totalPotPct)})</strong>.
          ${missingAfterFree > 0
            ? `Aún faltarían <strong style="color:var(--rose);">${D.formatCOP(missingAfterFree)}</strong> para tu meta de ${pAhorro.meta}%.`
            : `Superarías tu meta vigente de <strong style="color:var(--mint);">${pAhorro.meta}%</strong>.`}
        </div>
      </div>
    `;

    // Card 2: Si existe arriendo/gasto de Propiedad 2 (ej. La Quinta), muestra su balance; si no, resumen Vivienda
    const quintaIncomeRow = data.incomes.find(i =>
      (i.note || '').toLowerCase().includes('quinta') ||
      (i.name || '').toLowerCase().includes('quinta')
    );
    const quintaIncome = quintaIncomeRow ? (Number(quintaIncomeRow.amount) || 0) : 0;
    const quintaExpense = (m.catTotals.propiedad2 || 0) + (m.catTotals.servicios2 || 0);

    let card2;
    if (quintaIncome > 0 || quintaExpense > 0) {
      const quintaNet = quintaIncome - quintaExpense;
      card2 = `
        <div class="insight-card">
          <div class="insight-title" style="color:var(--cyan);">
            <span class="dot" style="background:var(--cyan);"></span> Balance Propiedad 2 (La Quinta)
          </div>
          <div class="insight-body num">
            Recibes <strong style="color:#fff;">${D.formatCOP(quintaIncome)}</strong> de arriendo frente a
            <strong style="color:#fff;">${D.formatCOP(quintaExpense)}</strong> en hipoteca, administración y servicios.
            ${quintaNet < 0
              ? `Requiere un aporte neto mensual de <strong style="color:var(--amber);">${D.formatCOP(Math.abs(quintaNet))}</strong> desde tus otros ingresos.`
              : `Genera un flujo neto a favor de <strong style="color:var(--mint);">${D.formatCOP(quintaNet)}</strong> cada mes.`}
          </div>
        </div>
      `;
    } else {
      card2 = `
        <div class="insight-card">
          <div class="insight-title" style="color:var(--cyan);">
            <span class="dot" style="background:var(--cyan);"></span> Eficiencia de Vivienda y Servicios
          </div>
          <div class="insight-body num">
            Tus gastos de vivienda y servicios suman <strong style="color:#fff;">${D.formatCOP(pViv.amount)} (${D.formatPct(pViv.realPct)})</strong>
            frente a tu meta de <strong style="color:var(--cyan);">&lt; ${pViv.meta}%</strong>.
            ${D.getPillarGapText(pViv)}.
          </div>
        </div>
      `;
    }

    const debtExcess = Math.max(0, pDeuda.amount - pDeuda.metaAmount);
    const card3 = `
      <div class="insight-card">
        <div class="insight-title" style="color:var(--rose);">
          <span class="dot" style="background:var(--rose);"></span> Deuda vs. Nómina
        </div>
        <div class="insight-body num">
          Tu pilar de Deuda suma <strong style="color:#fff;">${D.formatCOP(pDeuda.amount)} (${D.formatPct(pDeuda.realPct)})</strong>:
          <strong style="color:#fff;">${D.formatCOP(pDeuda.nominaAmt)} (${D.formatPct(pDeuda.nominaPct)})</strong> en descuentos de nómina y
          <strong style="color:#fff;">${D.formatCOP(pDeuda.deudasAmt)} (${D.formatPct(pDeuda.deudasPct)})</strong> en cuotas financieras.
          ${debtExcess > 0
            ? `Necesitas reducir <strong style="color:var(--rose);">${D.formatCOP(debtExcess)}</strong> para bajar del tope de ${pDeuda.meta}%.`
            : `Estás dentro de tu meta de deuda (<strong style="color:var(--mint);">&lt; ${pDeuda.meta}%</strong>).`}
        </div>
      </div>
    `;

    const topPersonal = data.categories
      .filter(c => c.pillar === 'personales')
      .map(c => ({ name: c.name, total: m.catTotals[c.id] || 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    const topText = topPersonal.length > 0
      ? topPersonal.map(c => `${c.name.charAt(0) + c.name.slice(1).toLowerCase()} (${D.formatCOP(c.total)})`).join(', ')
      : 'sin rubros activos';

    const card4 = `
      <div class="insight-card">
        <div class="insight-title" style="color:var(--amber);">
          <span class="dot" style="background:var(--amber);"></span> Gastos Personales &amp; Protección
        </div>
        <div class="insight-body num">
          Gastos Personales está en <strong style="color:#fff;">${D.formatPct(pPers.realPct)}</strong> (${D.getPillarGapText(pPers).toLowerCase()});
          líderes: <strong style="color:#fff;">${D.escapeAttr(topText)}</strong>.
          En Protección destinas <strong style="color:var(--purple);">${D.formatCOP(pProt.amount)} (${D.formatPct(pProt.realPct)})</strong>: ${D.getPillarGapText(pProt).toLowerCase()}.
        </div>
      </div>
    `;

    grid.innerHTML = card1 + card2 + card3 + card4;
  }

  // ==========================================================================
  // 9. VISTA 2: EDITOR DE VARIABLES (12 INGRESOS + 15 CATEGORÍAS / 102 VARS)
  // ==========================================================================
  function renderEditor() {
    renderEditorIncomes();
    renderEditorCategories();
  }

  function renderEditorIncomes() {
    const data = getCurrentData();
    const m = D.computeMetrics(data);

    document.getElementById('editorTotalIncome').textContent = D.formatCOP(m.totalIncome);
    document.getElementById('incomesCountPill').textContent = `${m.activeIncomes} activas / ${data.incomes.length}`;
    document.getElementById('incomesChevron').classList.toggle('open', data.incomesExpanded !== false);

    const wrap = document.getElementById('incomesListWrap');
    if (data.incomesExpanded === false) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');

    wrap.innerHTML = data.incomes.map((inc, idx) => {
      const isZero = (Number(inc.amount) || 0) === 0;
      const pct = m.totalIncome > 0 ? ((Number(inc.amount) || 0) / m.totalIncome) * 100 : 0;
      return `
        <div class="var-row">
          <input type="text" class="cell-input" value="${D.escapeAttr(inc.name)}"
            data-edit-type="income" data-idx="${idx}" data-field="name" aria-label="Nombre ingreso ${idx + 1}" />
          <input type="text" class="cell-input cell-note" value="${D.escapeAttr(inc.note)}"
            placeholder="Nota descriptiva..."
            data-edit-type="income" data-idx="${idx}" data-field="note" aria-label="Nota ingreso ${idx + 1}" />
          <div class="row-controls">
            <div class="money-shell">
              <span class="money-prefix">$</span>
              <input type="number" step="any" class="money-input ${isZero ? 'is-zero' : ''}"
                value="${inc.amount}"
                data-edit-type="income" data-idx="${idx}" data-field="amount" aria-label="Monto ingreso ${idx + 1}" />
            </div>
            <span class="pct-pill mono" id="inc-pct-${idx}">${D.formatPct(pct, 1)}</span>
            ${data.incomes.length > 1
              ? `<button type="button" class="icon-del" data-action="del-income" data-idx="${idx}" title="Eliminar ingreso">✕</button>`
              : `<span style="width:28px;"></span>`}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderEditorCategories() {
    const data = getCurrentData();
    const m = D.computeMetrics(data);
    const query = (document.getElementById('editorSearchInput').value || '').toLowerCase().trim();

    const filterBtn = document.getElementById('btnFilterActive');
    filterBtn.textContent = state.onlyActiveVars
      ? `Solo activas (> $0): ${m.activeVars}`
      : `Todas las variables (${m.totalVars})`;
    filterBtn.className = state.onlyActiveVars ? 'btn btn-mint' : 'btn';

    const wrap = document.getElementById('categoriesListWrap');
    wrap.innerHTML = data.categories.map((cat, catIdx) => {
      const catSum = m.catTotals[cat.id] || 0;
      const catPct = m.totalIncome > 0 ? (catSum / m.totalIncome) * 100 : 0;
      const activeInCat = cat.items.filter(it => (Number(it.amount) || 0) > 0).length;
      const pInfo = D.PILLAR_INFO[cat.pillar] || D.PILLAR_INFO.personales;

      const matched = cat.items
        .map((item, itemIdx) => ({ item, itemIdx }))
        .filter(({ item }) => {
          if (state.onlyActiveVars && (Number(item.amount) || 0) <= 0) return false;
          if (!query) return true;
          return (
            cat.name.toLowerCase().includes(query) ||
            (item.name || '').toLowerCase().includes(query) ||
            (item.note || '').toLowerCase().includes(query)
          );
        });

      if ((state.onlyActiveVars || query) && matched.length === 0) return '';
      const isOpen = query ? true : !!cat.expanded;

      return `
        <div class="accordion-card">
          <div class="kpi-strip" style="background:${cat.color};"></div>
          <div class="accordion-head" data-action="toggle-cat" data-cat-idx="${catIdx}">
            <div class="accordion-head-left">
              <span class="chevron ${isOpen ? 'open' : ''}">▶</span>
              <span style="font-size:13.5px; font-weight:800; color:#ffffff;">${D.escapeAttr(cat.name)}</span>
              <span class="pill ${pInfo.pillClass}">${pInfo.label}</span>
              <span style="font-size:11.5px; color:var(--text-muted);">${activeInCat} activas / ${cat.items.length}</span>
            </div>
            <div class="accordion-head-right">
              <span id="cat-pct-${cat.id}" class="mono" style="font-size:12px; color:var(--text-secondary);">${D.formatPct(catPct)}</span>
              <span id="cat-sum-${cat.id}" class="mono" style="font-size:14.5px; font-weight:800; color:${catSum > 0 ? '#ffffff' : 'var(--text-muted)'};">${D.formatCOP(catSum)}</span>
              <button type="button" class="btn btn-cyan btn-sm" data-action="add-var" data-cat-idx="${catIdx}">+ Variable</button>
            </div>
          </div>

          ${isOpen ? `
            <div class="var-table">
              ${matched.map(({ item, itemIdx }) => {
                const amt = Number(item.amount) || 0;
                const rowPct = m.totalIncome > 0 ? (amt / m.totalIncome) * 100 : 0;
                return `
                  <div class="var-row">
                    <input type="text" class="cell-input" value="${D.escapeAttr(item.name)}"
                      data-edit-type="expense" data-cat-idx="${catIdx}" data-item-idx="${itemIdx}" data-field="name" />
                    <input type="text" class="cell-input cell-note" value="${D.escapeAttr(item.note)}"
                      placeholder="+ Agregar nota..."
                      data-edit-type="expense" data-cat-idx="${catIdx}" data-item-idx="${itemIdx}" data-field="note" />
                    <div class="row-controls">
                      <div class="money-shell">
                        <span class="money-prefix">$</span>
                        <input type="number" step="any" class="money-input ${amt === 0 ? 'is-zero' : ''}"
                          value="${item.amount}"
                          data-edit-type="expense" data-cat-idx="${catIdx}" data-item-idx="${itemIdx}" data-field="amount" />
                      </div>
                      <span class="pct-pill mono" id="var-pct-${catIdx}-${itemIdx}">${D.formatPct(rowPct, 1)}</span>
                      <button type="button" class="icon-del" data-action="del-var" data-cat-idx="${catIdx}" data-item-idx="${itemIdx}" title="Eliminar variable">✕</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function updateEditorLiveSummary() {
    const data = getCurrentData();
    const m = D.computeMetrics(data);

    document.getElementById('editorTotalIncome').textContent = D.formatCOP(m.totalIncome);
    document.getElementById('incomesCountPill').textContent = `${m.activeIncomes} activas / ${data.incomes.length}`;

    data.incomes.forEach((inc, idx) => {
      const el = document.getElementById(`inc-pct-${idx}`);
      if (el) {
        const pct = m.totalIncome > 0 ? ((Number(inc.amount) || 0) / m.totalIncome) * 100 : 0;
        el.textContent = D.formatPct(pct, 1);
      }
    });

    data.categories.forEach((cat, catIdx) => {
      const sumEl = document.getElementById(`cat-sum-${cat.id}`);
      const pctEl = document.getElementById(`cat-pct-${cat.id}`);
      const total = m.catTotals[cat.id] || 0;
      const pct = m.totalIncome > 0 ? (total / m.totalIncome) * 100 : 0;
      if (sumEl) {
        sumEl.textContent = D.formatCOP(total);
        sumEl.style.color = total > 0 ? '#ffffff' : 'var(--text-muted)';
      }
      if (pctEl) pctEl.textContent = D.formatPct(pct);

      cat.items.forEach((item, itemIdx) => {
        const rEl = document.getElementById(`var-pct-${catIdx}-${itemIdx}`);
        if (rEl) {
          const rPct = m.totalIncome > 0 ? ((Number(item.amount) || 0) / m.totalIncome) * 100 : 0;
          rEl.textContent = D.formatPct(rPct, 1);
        }
      });
    });

    const filterBtn = document.getElementById('btnFilterActive');
    filterBtn.textContent = state.onlyActiveVars
      ? `Solo activas (> $0): ${m.activeVars}`
      : `Todas las variables (${m.totalVars})`;
  }

  // ==========================================================================
  // 10. VISTA 3: MÓDULO DE PATRIMONIO PERSONAL Y FAMILIAR
  // ==========================================================================
  function getPatrimonioContext() {
    const profile = getActiveProfile();
    const activeGroup = getActiveGroup();
    const isGroup = state.patrimonioScope === 'group' && !!activeGroup;

    if (isGroup) {
      const consolidated = D.computeGroupConsolidated(activeGroup, state.profiles);
      if (consolidated) {
        return {
          isGroup: true,
          label: `Consolidado Familiar: ${activeGroup.name}`,
          pm: consolidated.patrimonio,
          editable: false
        };
      }
    }

    return {
      isGroup: false,
      label: `Patrimonio Personal de ${profile.name}`,
      pm: D.computePatrimonioMetrics(profile.patrimonio),
      editable: true
    };
  }

  function updatePatrimonioSummaryAndCharts(pm) {
    document.getElementById('patKpiActivos').textContent = D.formatCOP(pm.totalActivos);
    document.getElementById('patKpiRowsPill').textContent = `${pm.activeRows} activos / ${pm.totalRows}`;

    document.getElementById('patKpiDeudas').textContent = D.formatCOP(pm.totalDeudas);
    document.getElementById('patKpiDebtPill').textContent = `${D.formatPct(pm.debtRatioPct)} PASIVO`;

    const netEl = document.getElementById('patKpiNeto');
    const netPill = document.getElementById('patKpiNetPill');
    netEl.textContent = D.formatCOP(pm.patrimonioNeto);
    if (pm.patrimonioNeto >= 0) {
      netEl.style.color = 'var(--cyan)';
      netPill.className = 'pill pill-cyan num';
      netPill.textContent = `${D.formatPct(pm.equityRatioPct)} PROPIO`;
    } else {
      netEl.style.color = 'var(--rose)';
      netPill.className = 'pill pill-rose num';
      netPill.textContent = `PATRIMONIO NEGATIVO`;
    }

    document.getElementById('patKpiRatio').textContent = D.formatPct(pm.debtRatioPct);
    document.getElementById('patKpiRatioBar').style.width = `${Math.min(100, Math.max(0, pm.debtRatioPct))}%`;

    // Verificar coherencia matemática
    const diffCheck = Math.abs((pm.totalActivos - pm.totalDeudas) - pm.patrimonioNeto);
    document.getElementById('patFormulaCheck').textContent = diffCheck < 0.01
      ? `✓ ${D.formatCOP(pm.totalActivos)} − ${D.formatCOP(pm.totalDeudas)} = ${D.formatCOP(pm.patrimonioNeto)}`
      : '⚠ Revisar valores';

    renderPatrimonioBalanceSvg('patBalanceSvg', pm);
    renderPatrimonioCategoriesSvg('patCategoriesSvg', pm);
  }

  function renderPatrimonio() {
    const activeGroup = getActiveGroup();
    if (state.patrimonioScope === 'group' && !activeGroup) {
      state.patrimonioScope = 'personal';
    }

    const ctx = getPatrimonioContext();
    const { pm, isGroup, editable } = ctx;

    // Toggle Personal vs Consolidado Familiar
    document.querySelectorAll('[data-pat-scope]').forEach(btn => {
      const sc = btn.getAttribute('data-pat-scope');
      btn.classList.toggle('active', sc === state.patrimonioScope);
      if (sc === 'group') {
        btn.textContent = activeGroup ? `Familiar (${activeGroup.name})` : 'Familiar (sin grupo)';
        btn.disabled = !activeGroup;
        btn.style.opacity = activeGroup ? '1' : '0.45';
      }
    });

    document.getElementById('patScopeSubtitle').textContent = ctx.label;
    document.getElementById('btnAddPatrimonioRow').classList.toggle('hidden', !editable);
    document.getElementById('patOwnerColHead').classList.toggle('hidden', !isGroup);
    document.getElementById('patActionsColHead').classList.toggle('hidden', !editable);
    document.getElementById('patTableHint').textContent = editable
      ? 'Edita el valor comercial y la deuda de cada rubro; el patrimonio neto (Valor − Deuda) se recalcula al instante'
      : 'Vista consolidada de todos los integrantes del grupo familiar. Cambia a "Personal" para editar tus propios rubros.';

    updatePatrimonioSummaryAndCharts(pm);

    // Filter chips
    const chipsWrap = document.getElementById('patFilterChips');
    chipsWrap.innerHTML = [
      `<button type="button" class="chip-btn ${state.patrimonioCategoryFilter === 'all' ? 'active' : ''}" data-pat-filter="all">Todos (${pm.totalRows})</button>`,
      `<button type="button" class="chip-btn ${state.patrimonioCategoryFilter === 'active' ? 'active' : ''}" data-pat-filter="active">Con saldo (${pm.activeRows})</button>`,
      ...D.PATRIMONIO_CATEGORIES.map(c =>
        `<button type="button" class="chip-btn ${state.patrimonioCategoryFilter === c.id ? 'active' : ''}" data-pat-filter="${c.id}">${D.escapeAttr(c.label)}</button>`
      )
    ].join('');

    // Filtrar filas manteniendo el índice real en el perfil
    const filtered = pm.rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => {
        if (state.patrimonioCategoryFilter === 'all') return true;
        if (state.patrimonioCategoryFilter === 'active') return row.valor !== 0 || row.deuda !== 0;
        return row.category === state.patrimonioCategoryFilter;
      });

    const catOptionsHtml = (selected) => D.PATRIMONIO_CATEGORIES.map(c =>
      `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${D.escapeAttr(c.label)}</option>`
    ).join('');

    const tbody = document.getElementById('patTableBody');
    tbody.innerHTML = filtered.map(({ row, idx }) => {
      const catMeta = D.PATRIMONIO_CATEGORIES.find(c => c.id === row.category) || D.PATRIMONIO_CATEGORIES[6];
      const netColor = row.neto > 0 ? 'var(--mint)' : (row.neto < 0 ? 'var(--rose)' : 'var(--text-muted)');
      const pctAct = pm.totalActivos > 0 ? (row.valor / pm.totalActivos) * 100 : 0;

      if (!editable) {
        return `
          <tr class="num">
            <td><span class="pill pill-cobalt">${D.escapeAttr(row.ownerName || '')}</span></td>
            <td><span class="pill ${catMeta.pillClass}">${D.escapeAttr(catMeta.label)}</span></td>
            <td style="font-weight:700; color:#ffffff;">${D.escapeAttr(row.name)}</td>
            <td class="text-right mono" style="color:${row.valor > 0 ? 'var(--mint)' : 'var(--text-muted)'};">${D.formatCOP(row.valor)}</td>
            <td class="text-right mono" style="color:${row.deuda > 0 ? 'var(--rose)' : 'var(--text-muted)'};">${D.formatCOP(row.deuda)}</td>
            <td class="text-right mono" style="font-weight:800; color:${netColor};">${D.formatCOP(row.neto)}</td>
            <td class="text-right mono" style="color:var(--text-secondary);">${D.formatPct(pctAct)}</td>
          </tr>
        `;
      }

      return `
        <tr class="num">
          <td>
            <select class="cat-select-inline" data-pat-idx="${idx}" data-pat-field="category" aria-label="Categoría rubro ${idx + 1}">
              ${catOptionsHtml(row.category)}
            </select>
          </td>
          <td>
            <input type="text" class="cell-input" value="${D.escapeAttr(row.name)}"
              data-pat-idx="${idx}" data-pat-field="name" aria-label="Descripción rubro ${idx + 1}" />
          </td>
          <td class="text-right">
            <div class="money-shell">
              <span class="money-prefix">$</span>
              <input type="number" step="any" class="money-input ${row.valor === 0 ? 'is-zero' : ''}"
                value="${row.valor}"
                data-pat-idx="${idx}" data-pat-field="valor" aria-label="Valor comercial ${idx + 1}" />
            </div>
          </td>
          <td class="text-right">
            <div class="money-shell">
              <span class="money-prefix">$</span>
              <input type="number" step="any" class="money-input ${row.deuda === 0 ? 'is-zero' : ''}"
                value="${row.deuda}"
                data-pat-idx="${idx}" data-pat-field="deuda" aria-label="Deuda ${idx + 1}" />
            </div>
          </td>
          <td class="text-right mono" id="pat-net-${idx}" style="font-weight:800; color:${netColor};">
            ${D.formatCOP(row.neto)}
          </td>
          <td class="text-right mono" id="pat-pct-${idx}" style="color:var(--text-secondary);">
            ${D.formatPct(pctAct)}
          </td>
          <td class="text-right">
            <button type="button" class="icon-del" data-action="del-pat-row" data-pat-idx="${idx}" title="Eliminar rubro">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    const subAct = filtered.reduce((a, x) => a + x.row.valor, 0);
    const subDeb = filtered.reduce((a, x) => a + x.row.deuda, 0);
    const subNet = subAct - subDeb;
    const isFiltered = state.patrimonioCategoryFilter !== 'all';

    document.getElementById('patTableFoot').innerHTML = `
      <tr class="num">
        ${isGroup ? '<td></td>' : ''}
        <td colspan="2">${isFiltered ? 'SUBTOTAL FILTRADO (TOTAL GLOBAL ARRIBA)' : 'TOTAL PATRIMONIO NETO REAL'}</td>
        <td class="text-right mono" id="patFootActivos" style="color:var(--mint);">${D.formatCOP(subAct)}</td>
        <td class="text-right mono" id="patFootDeudas" style="color:var(--rose);">${D.formatCOP(subDeb)}</td>
        <td class="text-right mono" id="patFootNeto" style="color:${subNet >= 0 ? 'var(--cyan)' : 'var(--rose)'};">${D.formatCOP(subNet)}</td>
        <td class="text-right mono">${pm.totalActivos > 0 ? D.formatPct((subAct / pm.totalActivos) * 100) : '0,00%'}</td>
        ${editable ? '<td></td>' : ''}
      </tr>
    `;
  }

  function updatePatrimonioLiveAfterEdit() {
    const profile = getActiveProfile();
    const pm = D.computePatrimonioMetrics(profile.patrimonio);
    updatePatrimonioSummaryAndCharts(pm);

    pm.rows.forEach((row, idx) => {
      const netEl = document.getElementById(`pat-net-${idx}`);
      const pctEl = document.getElementById(`pat-pct-${idx}`);
      if (netEl) {
        netEl.textContent = D.formatCOP(row.neto);
        netEl.style.color = row.neto > 0 ? 'var(--mint)' : (row.neto < 0 ? 'var(--rose)' : 'var(--text-muted)');
      }
      if (pctEl) {
        const pctAct = pm.totalActivos > 0 ? (row.valor / pm.totalActivos) * 100 : 0;
        pctEl.textContent = D.formatPct(pctAct);
      }
    });

    const filtered = pm.rows.filter(row => {
      if (state.patrimonioCategoryFilter === 'all') return true;
      if (state.patrimonioCategoryFilter === 'active') return row.valor !== 0 || row.deuda !== 0;
      return row.category === state.patrimonioCategoryFilter;
    });
    const subAct = filtered.reduce((a, r) => a + r.valor, 0);
    const subDeb = filtered.reduce((a, r) => a + r.deuda, 0);
    const subNet = subAct - subDeb;

    const fa = document.getElementById('patFootActivos');
    const fd = document.getElementById('patFootDeudas');
    const fn = document.getElementById('patFootNeto');
    if (fa) fa.textContent = D.formatCOP(subAct);
    if (fd) fd.textContent = D.formatCOP(subDeb);
    if (fn) {
      fn.textContent = D.formatCOP(subNet);
      fn.style.color = subNet >= 0 ? 'var(--cyan)' : 'var(--rose)';
    }
  }

  // ==========================================================================
  // 11. VISTA 4: GRUPOS FAMILIARES ("GASTOS DEL HOGAR")
  // ==========================================================================
  function renderGroupView(rebuildPillarCards = true) {
    const groups = Object.values(state.groups);
    const sel = document.getElementById('groupSelect');
    const emptyEl = document.getElementById('groupEmptyState');
    const contentEl = document.getElementById('groupContentWrap');
    const btnAddMem = document.getElementById('btnAddMember');
    const btnDelGrp = document.getElementById('btnDeleteGroup');

    if (groups.length === 0) {
      sel.innerHTML = '<option value="">Sin grupos creados</option>';
      emptyEl.classList.remove('hidden');
      contentEl.classList.add('hidden');
      btnAddMem.disabled = true;
      btnDelGrp.disabled = true;
      return;
    }

    btnAddMem.disabled = false;
    btnDelGrp.disabled = false;
    emptyEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    const activeGroup = getActiveGroup();
    sel.innerHTML = groups.map(g =>
      `<option value="${D.escapeAttr(g.id)}" ${g.id === activeGroup.id ? 'selected' : ''}>${D.escapeAttr(g.name)} (${g.memberCedulas.length})</option>`
    ).join('');

    const cons = D.computeGroupConsolidated(activeGroup, state.profiles);
    if (!cons) return;

    const m = cons.metrics;
    const pm = cons.patrimonio;

    document.getElementById('groupActiveTitle').textContent = activeGroup.name;
    document.getElementById('groupMembersBadge').textContent =
      `${cons.members.length} ${cons.members.length === 1 ? 'integrante' : 'integrantes'}`;

    // Etiquetas de integrantes con botón para desvincular
    document.getElementById('groupMemberTags').innerHTML = cons.members.map(mem => `
      <span class="member-tag">
        <span class="dot" style="background:${mem.color};"></span>
        <span>${D.escapeAttr(mem.name)}</span>
        <span class="mono" style="font-size:11px; color:var(--text-secondary);">C.C. ${D.formatCedulaDisplay(mem.cedula)}</span>
        ${cons.members.length > 1
          ? `<button type="button" class="member-tag-remove" data-action="remove-group-member" data-cedula="${D.escapeAttr(mem.cedula)}" title="Desvincular del grupo">✕</button>`
          : ''}
      </span>
    `).join('');

    // Barra visual de aporte porcentual a ingresos
    document.getElementById('groupIncomeTotalMini').textContent = D.formatCOP(m.totalIncome);
    const contribBar = document.getElementById('groupContribBar');
    contribBar.textContent = '';
    cons.members.forEach(mem => {
      if (mem.metrics.totalIncome <= 0) return;
      const seg = document.createElement('div');
      seg.className = 'stacked-seg';
      seg.style.width = `${mem.incomeSharePct.toFixed(4)}%`;
      seg.style.backgroundColor = mem.color;
      seg.setAttribute('data-tip-title', `Aporte de ${mem.name}`);
      seg.setAttribute('data-tip-color', mem.color);
      seg.setAttribute('data-tip-body',
        `Ingresos: ${D.formatCOP(mem.metrics.totalIncome)} (${D.formatPct(mem.incomeSharePct)})|Egresos: ${D.formatCOP(mem.metrics.totalExpenses)} (${D.formatPct(mem.expenseSharePct)})|Flujo Libre: ${D.formatCOP(mem.metrics.freeCashFlow)}`
      );
      contribBar.appendChild(seg);
    });

    // Tarjetas de aporte por integrante
    document.getElementById('groupMembersGrid').innerHTML = cons.members.map(mem => `
      <div class="member-card">
        <div class="member-card-head">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div class="avatar-badge" style="width:32px; height:32px; font-size:12px; background:${mem.color};">${D.escapeAttr(D.getInitials(mem.name))}</div>
            <div style="min-width:0;">
              <div style="font-size:13.5px; font-weight:800; color:#fff;">${D.escapeAttr(mem.name)}</div>
              <div class="mono" style="font-size:11px; color:var(--text-muted);">C.C. ${D.formatCedulaDisplay(mem.cedula)}</div>
            </div>
          </div>
          <span class="pill pill-mint num">${D.formatPct(mem.incomeSharePct)} aporte</span>
        </div>

        <div class="member-stats num">
          <div class="member-stat-box">
            <div class="member-stat-lbl">Ingresos</div>
            <div class="member-stat-val mono" style="color:var(--mint);">${D.formatCOP(mem.metrics.totalIncome)}</div>
            <div class="member-stat-sub">${D.formatPct(mem.incomeSharePct)} del hogar</div>
          </div>
          <div class="member-stat-box">
            <div class="member-stat-lbl">Egresos</div>
            <div class="member-stat-val mono" style="color:var(--rose);">${D.formatCOP(mem.metrics.totalExpenses)}</div>
            <div class="member-stat-sub">${D.formatPct(mem.expenseSharePct)} del hogar</div>
          </div>
          <div class="member-stat-box">
            <div class="member-stat-lbl">Flujo Libre</div>
            <div class="member-stat-val mono" style="color:${mem.metrics.freeCashFlow >= 0 ? 'var(--cyan)' : 'var(--rose)'};">${D.formatCOP(mem.metrics.freeCashFlow)}</div>
            <div class="member-stat-sub">${D.formatPct(mem.freeSharePct)} del excedente</div>
          </div>
          <div class="member-stat-box">
            <div class="member-stat-lbl">Patrimonio Neto</div>
            <div class="member-stat-val mono" style="color:${mem.patrimonio.patrimonioNeto >= 0 ? '#ffffff' : 'var(--rose)'};">${D.formatCOP(mem.patrimonio.patrimonioNeto)}</div>
            <div class="member-stat-sub">Activos: ${D.formatCOPShort(mem.patrimonio.totalActivos)}</div>
          </div>
        </div>
      </div>
    `).join('');

    // 4 KPIs Consolidados del Hogar
    document.getElementById('grp-kpi-income').textContent = D.formatCOP(m.totalIncome);
    document.getElementById('grp-kpi-income-sub').textContent =
      `Consolidado de ${cons.members.map(x => x.name).join(' + ')}`;

    document.getElementById('grp-kpi-expenses').textContent = D.formatCOP(m.totalExpenses);
    document.getElementById('grp-kpi-exp-pill').textContent = `${D.formatPct(m.committedPct)} COMPROMETIDO`;
    document.getElementById('grp-kpi-exp-bar').style.width = `${Math.min(100, Math.max(0, m.committedPct))}%`;

    const gFreeEl = document.getElementById('grp-kpi-free');
    const gFreePill = document.getElementById('grp-kpi-free-pill');
    gFreeEl.textContent = D.formatCOP(m.freeCashFlow);
    if (m.freeCashFlow >= 0) {
      gFreeEl.style.color = 'var(--cyan)';
      gFreePill.className = 'pill pill-cobalt num';
      gFreePill.textContent = `${D.formatPct(m.freePct)} DISPONIBLE`;
    } else {
      gFreeEl.style.color = 'var(--rose)';
      gFreePill.className = 'pill pill-rose num';
      gFreePill.textContent = `${D.formatPct(m.freePct)} DÉFICIT`;
    }

    document.getElementById('grp-kpi-pillars-count').textContent = `${m.passedCount} / 5 Pilares`;
    const gScorePill = document.getElementById('grp-kpi-score-pill');
    gScorePill.textContent = `SCORE ${m.score}/100`;
    gScorePill.className = `pill num ${m.score >= 75 ? 'pill-mint' : (m.score >= 55 ? 'pill-purple' : 'pill-rose')}`;
    document.getElementById('grp-kpi-pillars-sub').textContent =
      m.passedCount === 5 ? 'El hogar cumple los 5 pilares' : `${5 - m.passedCount} pilares del hogar por optimizar`;

    // Cuadre Contable del Hogar
    renderCuadreWidget('grpCuadreBadge', 'grpCuadreBar', 'grpCuadreLegend', m);

    // 5 Pilares del Hogar
    if (rebuildPillarCards || document.getElementById('groupPillarsGrid').children.length !== 5) {
      buildPillarCardsInto('groupPillarsGrid', 'gp', m);
    } else {
      updatePillarCardsInPlace('gp', m);
    }

    // Gráficas SVG del Hogar
    renderPillarsBarChartInto('groupPillarsBarSvg', m);

    document.getElementById('groupPatNetPill').textContent = `Neto: ${D.formatCOP(pm.patrimonioNeto)}`;
    document.getElementById('groupPatSub').textContent =
      `Activos ${D.formatCOP(pm.totalActivos)} − Deudas ${D.formatCOP(pm.totalDeudas)} · Endeudamiento ${D.formatPct(pm.debtRatioPct)}`;
    renderPatrimonioBalanceSvg('groupPatBalanceSvg', pm);

    // Tabla Consolidada de las 15 Categorías por Integrante
    const thead = document.getElementById('groupCatTableHead');
    thead.innerHTML = `
      <tr>
        <th>Categoría (15 rubros)</th>
        <th>Pilar</th>
        ${cons.members.map(mem => `<th class="text-right">${D.escapeAttr(mem.name)}</th>`).join('')}
        <th class="text-right">Total Hogar</th>
        <th class="text-right">% Ing. Hogar</th>
      </tr>
    `;

    const tbody = document.getElementById('groupCatTableBody');
    tbody.innerHTML = cons.consolidatedData.categories.map(cat => {
      const pInfo = D.PILLAR_INFO[cat.pillar] || D.PILLAR_INFO.personales;
      const totalCat = m.catTotals[cat.id] || 0;
      const pctCat = m.totalIncome > 0 ? (totalCat / m.totalIncome) * 100 : 0;

      const memberCols = cons.members.map(mem => {
        const val = mem.metrics.catTotals[cat.id] || 0;
        return `<td class="text-right mono" style="color:${val > 0 ? '#E2E8F0' : 'var(--text-muted)'};">${D.formatCOP(val)}</td>`;
      }).join('');

      return `
        <tr class="num">
          <td style="font-weight:700; color:#ffffff;">
            <span class="dot" style="background:${cat.color}; margin-right:7px;"></span>${D.escapeAttr(cat.name)}
          </td>
          <td><span class="pill ${pInfo.pillClass}">${pInfo.label}</span></td>
          ${memberCols}
          <td class="text-right mono" style="font-weight:800; color:${totalCat > 0 ? '#ffffff' : 'var(--text-muted)'};">${D.formatCOP(totalCat)}</td>
          <td class="text-right mono" style="color:var(--cyan); font-weight:700;">${D.formatPct(pctCat)}</td>
        </tr>
      `;
    }).join('');

    const tfoot = document.getElementById('groupCatTableFoot');
    tfoot.innerHTML = `
      <tr class="num">
        <td colspan="2">TOTAL EGRESOS CONSOLIDADOS DEL HOGAR</td>
        ${cons.members.map(mem => `<td class="text-right mono">${D.formatCOP(mem.metrics.totalExpenses)}</td>`).join('')}
        <td class="text-right mono" style="color:var(--rose);">${D.formatCOP(m.totalExpenses)}</td>
        <td class="text-right mono" style="color:var(--rose);">${D.formatPct(m.committedPct)}</td>
      </tr>
      <tr class="num">
        <td colspan="2">FLUJO LIBRE CONSOLIDADO DEL HOGAR</td>
        ${cons.members.map(mem => `<td class="text-right mono" style="color:var(--mint);">${D.formatCOP(mem.metrics.freeCashFlow)}</td>`).join('')}
        <td class="text-right mono" style="color:var(--mint);">${D.formatCOP(m.freeCashFlow)}</td>
        <td class="text-right mono" style="color:var(--mint);">${D.formatPct(m.freePct)}</td>
      </tr>
    `;
  }

  // ==========================================================================
  // 12. VISTA 5: SIMULADOR WHAT-IF & PROYECCIÓN SVG AVANZADA
  // ==========================================================================
  function simulateCompoundPath({ initialCapital, monthlyBase, annualBonus, escalationPct, rateEA, inflationPct, years }) {
    const initCap = Math.max(0, Number(initialCapital) || 0);
    const basePmt = Math.max(0, Number(monthlyBase) || 0);
    const bonusYear = Math.max(0, Number(annualBonus) || 0);
    const escRate = Math.max(0, Number(escalationPct) || 0) / 100;
    const rMonthly = Math.pow(1 + (Math.max(0, Number(rateEA) || 0) / 100), 1 / 12) - 1;
    const infRate = Math.max(0, Number(inflationPct) || 0) / 100;

    let balance = initCap;
    let contributed = initCap;
    const points = [{
      year: 0,
      nominal: balance,
      real: balance,
      contributed,
      yieldEarned: 0
    }];

    for (let y = 1; y <= years; y++) {
      const yearMonthlyPmt = basePmt * Math.pow(1 + escRate, y - 1);
      for (let mo = 1; mo <= 12; mo++) {
        const semiBonus = (mo === 6 || mo === 12) ? (bonusYear / 2) : 0;
        balance = balance * (1 + rMonthly) + yearMonthlyPmt + semiBonus;
        contributed += yearMonthlyPmt + semiBonus;
      }
      const deflator = Math.pow(1 + infRate, y);
      points.push({
        year: y,
        nominal: balance,
        real: deflator > 0 ? balance / deflator : balance,
        contributed,
        yieldEarned: Math.max(0, balance - contributed)
      });
    }
    return points;
  }

  let simManualMonthly = null;

  function formatCOPNumberOnly(val) {
    return D.formatCOP(val).replace(/^\$\s*/, '');
  }

  function parseSimMonthlyInput(raw) {
    const cleaned = String(raw ?? '').replace(/\s+/g, '').replace(/\$/g, '');
    if (!cleaned) return 0;
    // Si tiene coma decimal colombiana (ej. 1.290.968,67), quita puntos de miles y cambia coma por punto
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/\./g, '');
    const num = parseFloat(normalized);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.min(10000000, num);
  }

  function renderSimulator() {
    const data = getCurrentData();
    const m = D.computeMetrics(data);

    const freePct = Math.max(0, Math.min(100, Number(document.getElementById('simFreePct').value) || 0));
    const cutAmt = Math.max(0, Math.min(10000000, Number(document.getElementById('simCutAmtNum').value) || 0));
    const extraMonthly = Math.max(0, Math.min(10000000, Number(document.getElementById('simExtraMonthlyNum').value) || 0));
    const initCap = Math.max(0, Number(document.getElementById('simInitCapNum').value) || 0);
    const annualBonus = Math.max(0, Number(document.getElementById('simAnnualBonusNum').value) || 0);
    const escalationPct = Math.max(0, Math.min(15, Number(document.getElementById('simEscalation').value) || 0));
    const rateEA = Math.max(0, Math.min(25, Number(document.getElementById('simRateEA').value) || 0));
    const inflationPct = Math.max(0, Math.min(15, Number(document.getElementById('simInflation').value) || 0));
    const years = Math.max(1, Math.min(20, Number(document.getElementById('simYears').value) || 5));

    const baseAhorro = m.pillars[0].amount;
    const baseVivienda = m.pillars[1].amount;
    const baseDeudaTotal = m.pillars[2].amount;
    const baseDeudaCuotas = m.pillars[2].deudasAmt;
    const basePers = m.pillars[3].amount;
    const baseProt = m.pillars[4].amount;
    const freePos = Math.max(0, m.freeCashFlow);

    const extraFromFree = freePos * (freePct / 100);
    const appliedDebtCut = Math.min(cutAmt, baseDeudaCuotas);
    const appliedPersCut = Math.min(Math.max(0, cutAmt - appliedDebtCut), basePers);
    const appliedVivCut = Math.min(Math.max(0, cutAmt - appliedDebtCut - appliedPersCut), baseVivienda);
    const effectiveCut = appliedDebtCut + appliedPersCut + appliedVivCut;

    const simIncome = m.totalIncome + extraMonthly;
    const autoAhorro = baseAhorro + extraFromFree + effectiveCut + extraMonthly;
    const isManualMonthly = simManualMonthly !== null;
    const simAhorro = isManualMonthly ? Math.max(0, Math.min(10000000, simManualMonthly)) : autoAhorro;
    const simVivienda = Math.max(0, baseVivienda - appliedVivCut);
    const simDeuda = Math.max(0, baseDeudaTotal - appliedDebtCut);
    const simPers = Math.max(0, basePers - appliedPersCut);

    // Readouts de controles
    document.getElementById('simValFree').textContent = `${freePct}%`;
    document.getElementById('simHintFree').textContent = `+${D.formatCOP(extraFromFree)} / mes desde tu flujo libre (${D.formatCOP(freePos)})`;

    if (effectiveCut > 0) {
      const parts = [];
      if (appliedDebtCut > 0) parts.push(`-${D.formatCOP(appliedDebtCut)} Deudas`);
      if (appliedPersCut > 0) parts.push(`-${D.formatCOP(appliedPersCut)} G. Pers.`);
      if (appliedVivCut > 0) parts.push(`-${D.formatCOP(appliedVivCut)} Vivienda`);
      document.getElementById('simHintCut').textContent = `Aplicado (${D.formatCOP(effectiveCut)}): ${parts.join(' · ')}`;
    } else {
      document.getElementById('simHintCut').textContent = 'Hasta $ 10.000.000/mes · Reduce primero cuotas de deuda y luego gastos';
    }

    document.getElementById('simHintExtra').textContent = extraMonthly > 0
      ? `Nuevo ingreso simulado: ${D.formatCOP(simIncome)} (+${D.formatCOP(extraMonthly)} directo a ahorro/inversión)`
      : 'Hasta $ 10.000.000/mes · Simula ingresos adicionales o inversión mensual extra';

    document.getElementById('simHintInit').textContent = initCap > 0
      ? `Partiendo con ${D.formatCOP(initCap)} invertidos desde hoy`
      : 'Base inicial invertida desde el mes 0';

    document.getElementById('simValEscalation').textContent = `${escalationPct}% / año`;
    document.getElementById('simValRate').textContent = `${rateEA.toFixed(1).replace('.', ',')}% E.A.`;
    document.getElementById('simValInflation').textContent = `${inflationPct.toFixed(1).replace('.', ',')}% IPC`;
    document.getElementById('simValYears').textContent = `${years} ${years === 1 ? 'año' : 'años'}`;

    // Proyección compuesta mes a mes (Actual vs Simulado)
    const baseSeries = simulateCompoundPath({
      initialCapital: initCap,
      monthlyBase: baseAhorro,
      annualBonus: 0,
      escalationPct: 0,
      rateEA,
      inflationPct,
      years
    });

    const simSeries = simulateCompoundPath({
      initialCapital: initCap,
      monthlyBase: simAhorro,
      annualBonus,
      escalationPct,
      rateEA,
      inflationPct,
      years
    });

    const p1Sim = simSeries[1] || simSeries[0];
    const p1Base = baseSeries[1] || baseSeries[0];
    const pNSim = simSeries[years];

    const pctSim = (v) => (simIncome > 0 ? (v / simIncome) * 100 : 0);

    // Renta pasiva mensual estimada al final del horizonte
    const rMonthly = Math.pow(1 + rateEA / 100, 1 / 12) - 1;
    const passiveNominal = pNSim.nominal * rMonthly;
    const realAnnualRate = ((1 + rateEA / 100) / (1 + inflationPct / 100)) - 1;
    const rMonthlyReal = realAnnualRate > 0 ? (Math.pow(1 + realAnnualRate, 1 / 12) - 1) : 0;
    const passiveRealToday = pNSim.real * rMonthlyReal;

    const monthlyInputEl = document.getElementById('simKpiMonthlyInput');
    const monthlyRangeEl = document.getElementById('simKpiMonthlyRange');
    const autoBtnEl = document.getElementById('btnSimMonthlyAuto');
    if (document.activeElement !== monthlyInputEl) {
      monthlyInputEl.value = formatCOPNumberOnly(simAhorro);
    }
    if (document.activeElement !== monthlyRangeEl) {
      monthlyRangeEl.value = Math.min(10000000, Math.max(0, Math.round(simAhorro)));
    }
    autoBtnEl.classList.toggle('hidden', !isManualMonthly);

    document.getElementById('simKpiMonthlySub').textContent =
      `${D.formatPct(pctSim(simAhorro))} de tus ingresos${annualBonus > 0 ? ` + ${D.formatCOPShort(annualBonus)}/año` : ''} (Meta ≥ ${data.targets.ahorro}%)`;

    document.getElementById('simKpi1Y').textContent = D.formatCOP(p1Sim.nominal);
    document.getElementById('simKpi1YSub').textContent = `vs Actual: ${D.formatCOP(p1Base.nominal)}`;

    document.getElementById('simKpiNYLabel').textContent = `Patrimonio Simulado a ${years} ${years === 1 ? 'Año' : 'Años'}`;
    document.getElementById('simKpiNY').textContent = D.formatCOP(pNSim.nominal);
    document.getElementById('simKpiNYSub').textContent = `Aportes: ${D.formatCOP(pNSim.contributed)} + Rend.: ${D.formatCOP(pNSim.yieldEarned)}`;
    document.getElementById('simKpiNYReal').textContent = inflationPct > 0
      ? `Poder adquisitivo hoy (IPC ${inflationPct.toFixed(1).replace('.', ',')}%): ${D.formatCOP(pNSim.real)}`
      : `Sin descuento por inflación (IPC 0,0%)`;

    document.getElementById('simKpiPassiveLabel').textContent = `Renta Pasiva Mensual (Año ${years})`;
    document.getElementById('simKpiPassive').textContent = D.formatCOP(passiveNominal);
    document.getElementById('simKpiPassiveSub').textContent = realAnnualRate > 0
      ? `Real hoy (descontando IPC): ${D.formatCOP(passiveRealToday)} / mes`
      : `Tasa real ≤ 0% (rendimiento no supera IPC)`;

    document.getElementById('simChartSub').textContent =
      `Horizonte ${years} ${years === 1 ? 'año' : 'años'} · ${rateEA.toFixed(1).replace('.', ',')}% E.A. · IPC ${inflationPct.toFixed(1).replace('.', ',')}% (${D.formatCOP(baseAhorro)} vs ${D.formatCOP(simAhorro)} / mes)`;

    renderSimulatorChartSVG(baseSeries, simSeries, rateEA, inflationPct, years);

    const rows = [
      { name: '1. Ahorro e Inversión', meta: `≥ ${data.targets.ahorro}%`, base: m.pillars[0].realPct, sim: pctSim(simAhorro), ok: simIncome > 0 && pctSim(simAhorro) >= data.targets.ahorro },
      { name: '2. Vivienda',           meta: `< ${data.targets.vivienda}%`, base: m.pillars[1].realPct, sim: pctSim(simVivienda), ok: simIncome > 0 && pctSim(simVivienda) < data.targets.vivienda },
      { name: '3. Deuda',              meta: `< ${data.targets.deuda}%`, base: m.pillars[2].realPct, sim: pctSim(simDeuda), ok: simIncome > 0 && pctSim(simDeuda) < data.targets.deuda },
      { name: '4. Gastos Personales',  meta: `< ${data.targets.personales}%`, base: m.pillars[3].realPct, sim: pctSim(simPers), ok: simIncome > 0 && pctSim(simPers) < data.targets.personales },
      { name: '5. Protección',         meta: `> ${data.targets.proteccion}%`, base: m.pillars[4].realPct, sim: pctSim(baseProt), ok: simIncome > 0 && pctSim(baseProt) > data.targets.proteccion }
    ];

    document.getElementById('simPillarsTableBody').innerHTML = rows.map(r => `
      <tr class="num">
        <td style="font-weight:700; color:#ffffff;">${r.name}</td>
        <td style="color:var(--text-secondary);">${r.meta}</td>
        <td style="color:var(--text-secondary);">${D.formatPct(r.base)}</td>
        <td style="font-weight:800; color:${r.ok ? 'var(--mint)' : 'var(--rose)'};">${D.formatPct(r.sim)}</td>
        <td class="text-right">
          <span class="pill ${r.ok ? 'pill-mint' : 'pill-rose'}">${r.ok ? 'ESTÁS BIEN' : 'DEBES MEJORAR'}</span>
        </td>
      </tr>
    `).join('');
  }

  function renderSimulatorChartSVG(baseSeries, simSeries, rateEA, inflationPct, years) {
    const wrap = document.getElementById('simChartSvg');
    const W = 680;
    const H = 300;
    const padL = 74;
    const padR = 26;
    const padT = 24;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const rawMax = Math.max(
      5000000,
      ...baseSeries.map(p => p.nominal),
      ...simSeries.map(p => p.nominal)
    );
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const yMax = Math.ceil((rawMax * 1.08) / (magnitude / 2)) * (magnitude / 2);

    const xAt = (yr) => padL + (yr / years) * plotW;
    const yAt = (v) => padT + plotH - (v / yMax) * plotH;

    let gridSvg = '';
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const val = (yMax / yTicks) * i;
      const y = yAt(val);
      const lbl = val === 0 ? '$ 0' : D.formatCOPShort(val);
      gridSvg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"
          stroke="${i === 0 ? '#2D2D3F' : '#181824'}" stroke-width="1" />
        <text x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end"
          fill="#64748B" font-size="10.5" font-weight="600">${lbl}</text>
      `;
    }

    const simLine = simSeries.map((p, y) => `${y === 0 ? 'M' : 'L'} ${xAt(y).toFixed(1)} ${yAt(p.nominal).toFixed(1)}`).join(' ');
    const simArea = `${simLine} L ${xAt(years).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
    const realLine = simSeries.map((p, y) => `${y === 0 ? 'M' : 'L'} ${xAt(y).toFixed(1)} ${yAt(p.real).toFixed(1)}`).join(' ');
    const baseLine = baseSeries.map((p, y) => `${y === 0 ? 'M' : 'L'} ${xAt(y).toFixed(1)} ${yAt(p.nominal).toFixed(1)}`).join(' ');

    const labelStep = years > 12 ? 2 : 1;
    const hitW = Math.max(18, Math.min(40, plotW / (years + 1)));

    let nodesSvg = '';
    for (let y = 0; y <= years; y++) {
      const x = xAt(y);
      const sp = simSeries[y];
      const bp = baseSeries[y];
      const diff = sp.nominal - bp.nominal;
      const xLabel = years > 10 ? `A${y}` : `Año ${y}`;
      const showLabel = y === 0 || y === years || y % labelStep === 0;

      const tipLines = [
        `Simulado Nominal: ${D.formatCOP(sp.nominal)}`,
        inflationPct > 0 ? `Poder Adquisitivo Hoy: ${D.formatCOP(sp.real)}` : null,
        `Actual (Base): ${D.formatCOP(bp.nominal)}`,
        `Aportes: ${D.formatCOP(sp.contributed)} · Rend.: ${D.formatCOP(sp.yieldEarned)}`,
        `Ventaja acumulada: +${D.formatCOP(Math.max(0, diff))}`
      ].filter(Boolean).join('|');

      nodesSvg += `
        <g style="cursor:pointer;"
          data-tip-title="Año ${y} · ${rateEA.toFixed(1).replace('.', ',')}% E.A."
          data-tip-color="#00F5A0"
          data-tip-body="${D.escapeAttr(tipLines)}">
          <line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}"
            stroke="rgba(255,255,255,0.04)" stroke-dasharray="3 3" />
          <rect x="${(x - hitW / 2).toFixed(1)}" y="${padT}" width="${hitW.toFixed(1)}" height="${plotH}" fill="transparent" />
          <circle cx="${x.toFixed(1)}" cy="${yAt(bp.nominal).toFixed(1)}" r="3.6" fill="#00D9F5" stroke="#000000" stroke-width="1.3" />
          ${inflationPct > 0 ? `<circle cx="${x.toFixed(1)}" cy="${yAt(sp.real).toFixed(1)}" r="3.6" fill="#FFB800" stroke="#000000" stroke-width="1.3" />` : ''}
          <circle cx="${x.toFixed(1)}" cy="${yAt(sp.nominal).toFixed(1)}" r="4.8" fill="#00F5A0" stroke="#000000" stroke-width="1.8" />
          ${showLabel ? `<text x="${x.toFixed(1)}" y="${H - 14}" text-anchor="middle" fill="#CBD5E1" font-size="10.5" font-weight="700">${xLabel}</text>` : ''}
        </g>
      `;
    }

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Proyección Patrimonial Actual vs Simulado">
        <defs>
          <linearGradient id="simGlowArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00F5A0" stop-opacity="0.28" />
            <stop offset="100%" stop-color="#00F5A0" stop-opacity="0.01" />
          </linearGradient>
        </defs>
        ${gridSvg}
        <path d="${simArea}" fill="url(#simGlowArea)" />
        <path d="${baseLine}" fill="none" stroke="#00D9F5" stroke-width="2.2" stroke-dasharray="6 5" />
        ${inflationPct > 0 ? `<path d="${realLine}" fill="none" stroke="#FFB800" stroke-width="2.2" stroke-dasharray="3 4" />` : ''}
        <path d="${simLine}" fill="none" stroke="#00F5A0" stroke-width="3" />
        ${nodesSvg}
      </svg>
    `;
  }

  // ==========================================================================
  // 12B. VISTA 2B: CONTROL DIARIO (TIPO EXCEL) — VOZ, BORRADO, MATRIZ Y SYNC
  // ==========================================================================
  const dailyCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  const dailyUndoStack = [];
  let lastRenderedDailyRows = [];
  let lastAddedDailyId = null;
  let activeSpeechRec = null;
  let activeSpeechMode = null;
  let activeMediaRecorder = null;
  let activeMediaStream = null;
  let activeAudioCtx = null;
  let activeMeterRaf = null;
  let activeRecordMode = null;
  let activeRecordCancel = false;
  let cachedSpeechEngineInfo = null;
  let lastVoiceMode = 'add';
  let armedMacDictationMode = null; // 'add' | 'delete' | null
  let macDictationAutoTimer = null;
  let pendingVoiceDeleteAction = null;
  let dailyUndoBannerTimer = null;

  function ensureDailyArray(profile) {
    if (!profile) return [];
    if (!Array.isArray(profile.dailyExpenses)) profile.dailyExpenses = [];
    return profile.dailyExpenses;
  }

  function getDailyContext() {
    const profile = getActiveProfile();
    const activeGroup = getActiveGroup();
    const isGroup = state.dailyScope === 'group' && !!activeGroup;
    const categories = getCurrentData().categories;

    if (isGroup) {
      const entries = [];
      activeGroup.memberCedulas.forEach(ced => {
        const prof = state.profiles[ced];
        if (!prof) return;
        ensureDailyArray(prof).forEach(item => {
          entries.push({
            ...item,
            ownerCedula: prof.cedula,
            ownerName: prof.name,
            ownerColor: prof.color || '#00D9F5'
          });
        });
      });
      entries.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      return {
        isGroup: true,
        label: `Consolidado Familiar: ${activeGroup.name} · Edición en línea sincronizada por integrante`,
        entries,
        categories,
        groupName: activeGroup.name
      };
    }

    const list = ensureDailyArray(profile).map(item => ({
      ...item,
      ownerCedula: profile.cedula,
      ownerName: profile.name,
      ownerColor: profile.color || '#00F5A0'
    }));

    return {
      isGroup: false,
      label: `Perfil activo: ${profile.name} · Guardado automático local por celda`,
      entries: list,
      categories,
      groupName: null
    };
  }

  function findEntryRef(ownerCedula, entryId) {
    const prof = state.profiles[ownerCedula] || getActiveProfile();
    if (!prof) return null;
    const list = ensureDailyArray(prof);
    const idx = list.findIndex(e => e.id === entryId);
    if (idx === -1) return null;
    return { profile: prof, list, idx, entry: list[idx] };
  }

  function captureDailySnapshot(cedulas) {
    const snap = {};
    cedulas.forEach(ced => {
      const p = state.profiles[ced];
      if (p) snap[ced] = JSON.parse(JSON.stringify(ensureDailyArray(p)));
    });
    return snap;
  }

  function pushDailyUndo(snapshotObj) {
    dailyUndoStack.push(snapshotObj);
    if (dailyUndoStack.length > 25) dailyUndoStack.shift();
    updateDailyUndoButtons();
  }

  function updateDailyUndoButtons() {
    const btnToolbar = document.getElementById('btnDailyUndoToolbar');
    if (btnToolbar) {
      btnToolbar.disabled = dailyUndoStack.length === 0;
      btnToolbar.textContent = dailyUndoStack.length > 0
        ? `↺ Deshacer (${dailyUndoStack.length})`
        : '↺ Deshacer';
    }
  }

  function showDailyUndoBanner(message, isSync = false) {
    const banner = document.getElementById('dailyUndoBanner');
    const msgEl = document.getElementById('dailyUndoMessage');
    if (!banner || !msgEl) return;
    msgEl.textContent = message;
    banner.classList.toggle('is-sync', isSync);
    banner.classList.remove('hidden');
    if (dailyUndoBannerTimer) clearTimeout(dailyUndoBannerTimer);
    dailyUndoBannerTimer = setTimeout(() => {
      banner.classList.add('hidden');
    }, 15000);
  }

  function hideDailyUndoBanner() {
    const banner = document.getElementById('dailyUndoBanner');
    if (banner) banner.classList.add('hidden');
    if (dailyUndoBannerTimer) {
      clearTimeout(dailyUndoBannerTimer);
      dailyUndoBannerTimer = null;
    }
  }

  function performDailyUndo() {
    if (dailyUndoStack.length === 0) {
      showToast('No hay acciones recientes para deshacer', 'var(--amber)');
      return;
    }
    const snap = dailyUndoStack.pop();
    if (snap.type === 'daily') {
      Object.entries(snap.previousByCedula || {}).forEach(([ced, arr]) => {
        if (state.profiles[ced]) state.profiles[ced].dailyExpenses = arr;
      });
      saveState();
      renderDailyView();
      setDailyVoiceStatus(`↺ Deshecho: ${snap.description}`, '');
      showToast(`Deshecho: ${snap.description}`);
    } else if (snap.type === 'sync') {
      const prof = state.profiles[snap.targetCedula];
      if (prof && snap.previousCategories) {
        prof.data.categories = snap.previousCategories;
        saveState();
        renderDashboard(true);
        renderDailyView();
        setDailyVoiceStatus(`↺ Sincronización revertida: ${snap.description}`, '');
        showToast('Promedios revertidos al estado anterior del modelo');
      }
    }
    hideDailyUndoBanner();
    updateDailyUndoButtons();
  }

  function setDailyVoiceStatus(text, statusClass = '') {
    const el = document.getElementById('dailyVoiceStatus');
    if (!el) return;
    el.className = `excel-voice-status${statusClass ? ' ' + statusClass : ''}`;
    el.textContent = text;
  }

  function getDateSortValue(entry) {
    const m = Math.max(1, Math.min(12, Number(entry.month) || 1));
    if (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      const day = Number(entry.date.slice(8, 10)) || 0;
      const yr = Number(entry.date.slice(0, 4)) || 2026;
      return yr * 10000 + m * 100 + day;
    }
    return 2026 * 10000 + m * 100;
  }

  function populateDailyCategoryFilter() {
    const sel = document.getElementById('dailyFilterCategory');
    if (!sel) return;
    const cats = getCurrentData().categories;
    const current = state.dailyFilterCategory || 'all';
    sel.innerHTML = [
      '<option value="all">Todas las 15 categorías</option>',
      ...cats.map(c => `<option value="${D.escapeAttr(c.id)}" ${c.id === current ? 'selected' : ''}>${D.escapeAttr(c.name)}</option>`)
    ].join('');
  }

  function updateDailyKpisAndMatrix(ctx = null, filteredEntries = null) {
    const context = ctx || getDailyContext();
    const matrix = D.computeDailyMatrix(context.entries, context.categories);
    const vis = filteredEntries || lastRenderedDailyRows;

    const visTotal = vis.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    document.getElementById('dailyKpiCount').textContent = `${vis.length} / ${context.entries.length}`;
    document.getElementById('dailyKpiTotal').textContent = D.formatCOP(matrix.grandTotal);
    document.getElementById('dailyKpiMonths').textContent = `${matrix.grandActiveMonths} / 12`;
    document.getElementById('dailyKpiRealAvg').textContent = D.formatCOP(matrix.grandRealMonthlyAvg);

    const summaryEl = document.getElementById('dailyFilteredSummary');
    if (summaryEl) {
      summaryEl.textContent = `${vis.length} ${vis.length === 1 ? 'fila' : 'filas'} · Subtotal visible: ${D.formatCOP(visTotal)}`;
    }

    const footTotalEl = document.getElementById('dailyFootSubtotal');
    if (footTotalEl) footTotalEl.textContent = D.formatCOP(visTotal);

    renderDailyMatrix(matrix);
  }

  function renderDailyMatrix(matrix) {
    const onlyActive = !!document.getElementById('chkMatrixOnlyActive')?.checked;
    const tbody = document.getElementById('dailyMatrixBody');
    const tfoot = document.getElementById('dailyMatrixFoot');
    if (!tbody || !tfoot) return;

    const visibleRows = onlyActive ? matrix.rows.filter(r => r.total > 0) : matrix.rows;

    if (visibleRows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="16" class="excel-empty-cell">No hay categorías con gasto registrado aún. Dicta o agrega gastos arriba para poblar la matriz Ene–Dic.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = visibleRows.map(r => {
        const dimClass = r.total === 0 ? 'excel-matrix-row-dim' : '';
        const monthCells = r.months.map(val =>
          `<td class="text-right ${val > 0 ? 'matrix-val-pos' : 'matrix-val-zero'}">${val > 0 ? D.formatCOP(val) : '—'}</td>`
        ).join('');
        return `
          <tr class="num ${dimClass}">
            <th scope="row" class="matrix-sticky-col">
              <span class="dot" style="background:${r.color}; margin-right:7px;"></span>${D.escapeAttr(r.categoryName)}
            </th>
            ${monthCells}
            <td class="text-right matrix-col-total">${r.total > 0 ? D.formatCOP(r.total) : '$ 0'}</td>
            <td class="text-right matrix-col-active">${r.activeMonths}</td>
            <td class="text-right matrix-col-avg">${r.realMonthlyAvg > 0 ? D.formatCOP(r.realMonthlyAvg) : '$ 0'}</td>
          </tr>
        `;
      }).join('');
    }

    const grandMonthCells = matrix.grandMonths.map(val =>
      `<td class="text-right mono" style="color:${val > 0 ? '#ffffff' : 'var(--text-muted)'};">${val > 0 ? D.formatCOP(val) : '—'}</td>`
    ).join('');

    tfoot.innerHTML = `
      <tr class="num">
        <th scope="row" class="matrix-sticky-col" style="color:var(--mint);">TOTAL GENERAL POR MES</th>
        ${grandMonthCells}
        <td class="text-right mono matrix-col-total">${D.formatCOP(matrix.grandTotal)}</td>
        <td class="text-right mono matrix-col-active">${matrix.grandActiveMonths}</td>
        <td class="text-right mono matrix-col-avg"
          data-tip-title="Promedio Mensual Real"
          data-tip-color="#00F5A0"
          data-tip-body="${D.escapeAttr(`Fórmula General: ${D.formatCOP(matrix.grandTotal)} / ${matrix.grandActiveMonths} meses activos|Suma de promedios por categoría: ${D.formatCOP(matrix.sumOfCategoryRealAvgs)}`)}">
          ${D.formatCOP(matrix.grandRealMonthlyAvg)}
        </td>
      </tr>
    `;
  }

  function renderDailyView() {
    const activeGroup = getActiveGroup();
    if (state.dailyScope === 'group' && !activeGroup) {
      state.dailyScope = 'personal';
    }

    const ctx = getDailyContext();
    const { isGroup, entries, categories } = ctx;

    // Actualizar toggle de alcance Personal vs Consolidado Familiar
    document.querySelectorAll('[data-daily-scope]').forEach(btn => {
      const sc = btn.getAttribute('data-daily-scope');
      btn.classList.toggle('active', sc === state.dailyScope);
      if (sc === 'group') {
        btn.textContent = activeGroup ? `Consolidado (${activeGroup.name})` : 'Consolidado (sin grupo)';
        btn.disabled = !activeGroup;
        btn.style.opacity = activeGroup ? '1' : '0.45';
      }
    });

    document.getElementById('dailyScopeSubtitle').textContent = ctx.label;
    document.getElementById('dailyOwnerColHead').classList.toggle('hidden', !isGroup);

    // Sincronizar selects de filtro
    const mSel = document.getElementById('dailyFilterMonth');
    if (mSel) mSel.value = state.dailyFilterMonth || 'all';
    populateDailyCategoryFilter();

    const searchQ = D.normalizeText(document.getElementById('dailyFilterSearch')?.value || '');
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    // Filtrar filas
    const filtered = entries.filter(item => {
      if (state.dailyFilterMonth && state.dailyFilterMonth !== 'all') {
        if (String(item.month) !== String(state.dailyFilterMonth)) return false;
      }
      if (state.dailyFilterCategory && state.dailyFilterCategory !== 'all') {
        if (item.categoryId !== state.dailyFilterCategory) return false;
      }
      if (searchQ) {
        const catName = catMap[item.categoryId]?.name || '';
        const haystack = D.normalizeText(`${item.concept} ${item.note} ${catName} ${item.ownerName} ${D.getMonthMeta(item.month).full}`);
        if (!haystack.includes(searchQ)) return false;
      }
      return true;
    });

    lastRenderedDailyRows = filtered;

    // Limpiar indicador de ordenamiento cuando se re-renderiza completo
    const dailyTable = document.getElementById('dailyExpensesTable');
    if (dailyTable) {
      dailyTable.classList.toggle('has-owner', isGroup);
    }
    if (dailyTable?.tHead?.rows[0]) {
      for (const th of dailyTable.tHead.rows[0].cells) {
        th.removeAttribute('aria-sort');
      }
    }

    const monthOptionsHtml = (selected) => D.MONTHS_ES.map(m =>
      `<option value="${m.num}" ${m.num === Number(selected) ? 'selected' : ''}>${m.short}</option>`
    ).join('');

    const catOptionsHtml = (selected) => categories.map(c =>
      `<option value="${D.escapeAttr(c.id)}" ${c.id === selected ? 'selected' : ''}>${D.escapeAttr(c.name)}</option>`
    ).join('');

    const tbody = document.getElementById('dailyTableBody');
    const colCount = isGroup ? 8 : 7;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr data-empty-row="1">
          <td colspan="${colCount}" class="excel-empty-cell">
            ${entries.length === 0
              ? 'Tu hoja de Control Diario está vacía. Escribe o dicta arriba (ej. "450.000 pesos mercado mes de septiembre") o haz clic en "+ Nueva Fila".'
              : 'Ningún registro coincide con los filtros actuales. Haz clic en "Limpiar Filtros" para ver todos tus gastos.'}
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = filtered.map((item, idx) => {
        const rowNum = idx + 1;
        const catObj = catMap[item.categoryId] || categories[categories.length - 1];
        const amt = Number(item.amount) || 0;
        const flashClass = item.id === lastAddedDailyId ? ' excel-row-flash' : '';
        const dateVal = getDateSortValue(item);

        return `
          <tr class="num${flashClass}" data-entry-id="${D.escapeAttr(item.id)}" data-owner-cedula="${D.escapeAttr(item.ownerCedula)}">
            <td class="excel-cell-index mono" data-value="${rowNum}">${rowNum}</td>
            ${isGroup ? `
              <td class="excel-cell-owner" data-value="${D.escapeAttr(item.ownerName)}">
                <span class="excel-owner-tag">
                  <span class="dot" style="background:${item.ownerColor};"></span>
                  <span>${D.escapeAttr(item.ownerName)}</span>
                </span>
              </td>
            ` : ''}
            <td data-value="${dateVal}">
              <div class="excel-cell-date-wrap">
                <select class="excel-cell-select excel-cell-month" data-daily-field="month" aria-label="Mes fila ${rowNum}">
                  ${monthOptionsHtml(item.month)}
                </select>
                <input type="date" class="excel-cell-input excel-cell-date" value="${D.escapeAttr(item.date || '')}"
                  data-daily-field="date" aria-label="Fecha exacta fila ${rowNum}" />
              </div>
            </td>
            <td data-value="${D.escapeAttr(catObj.name)}">
              <div class="excel-cell-cat-wrap">
                <span class="dot" data-cat-dot="1" style="background:${catObj.color};"></span>
                <select class="excel-cell-select" data-daily-field="categoryId" aria-label="Categoría fila ${rowNum}">
                  ${catOptionsHtml(item.categoryId)}
                </select>
              </div>
            </td>
            <td data-value="${D.escapeAttr(item.concept)}">
              <input type="text" class="excel-cell-input" value="${D.escapeAttr(item.concept)}"
                placeholder="Concepto / Detalle..." data-daily-field="concept" aria-label="Concepto fila ${rowNum}" />
            </td>
            <td data-value="${amt}">
              <div class="excel-cell-amount-wrap">
                <span class="excel-cell-currency" aria-hidden="true">$</span>
                <input type="number" step="any" min="0" class="excel-cell-input excel-cell-amount ${amt === 0 ? 'is-zero' : ''}"
                  value="${amt}" data-daily-field="amount" aria-label="Valor COP fila ${rowNum}" />
              </div>
            </td>
            <td data-value="${D.escapeAttr(item.note)}">
              <input type="text" class="excel-cell-input excel-cell-note" value="${D.escapeAttr(item.note)}"
                placeholder="Nota..." data-daily-field="note" aria-label="Nota fila ${rowNum}" />
            </td>
            <td class="excel-cell-actions">
              <button type="button" class="excel-row-del" data-daily-action="delete-row" title="Eliminar fila #${rowNum}" aria-label="Eliminar fila ${rowNum}">✕</button>
            </td>
          </tr>
        `;
      }).join('');
    }
    lastAddedDailyId = null;

    const subtotal = filtered.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const labelColspan = isGroup ? 5 : 4;
    document.getElementById('dailyTableFoot').innerHTML = `
      <tr class="num">
        <td colspan="${labelColspan}" style="color:var(--text-secondary);">
          SUBTOTAL TABLA VISIBLE (${filtered.length} ${filtered.length === 1 ? 'registro' : 'registros'})
        </td>
        <td id="dailyFootSubtotal" class="text-right mono" style="color:var(--cyan);">${D.formatCOP(subtotal)}</td>
        <td colspan="2" style="color:var(--text-muted); font-size:11px; font-weight:600;">Guardado automático activo</td>
      </tr>
    `;

    updateDailyKpisAndMatrix(ctx, filtered);
    updateDailyUndoButtons();
    refreshMicPermissionStatus();
  }

  // Ordenamiento DOM in-place (sortable-table: moveBefore + Intl.Collator + aria-sort)
  function sortDailyTableBy(button) {
    const table = document.getElementById('dailyExpensesTable');
    const tbody = document.getElementById('dailyTableBody');
    const status = document.getElementById('dailySortStatus');
    if (!table || !tbody || !button) return;

    const rows = [...tbody.rows].filter(r => !r.hasAttribute('data-empty-row'));
    if (rows.length === 0) return;

    const th = button.closest('th');
    if (!th) return;
    const direction = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';

    for (const header of table.tHead.rows[0].cells) {
      header.removeAttribute('aria-sort');
    }
    th.setAttribute('aria-sort', direction);

    const colIdx = th.cellIndex;
    const type = th.dataset.type || 'text';
    const factor = direction === 'ascending' ? 1 : -1;

    const keyed = rows.map(row => {
      const cell = row.cells[colIdx];
      const raw = cell ? (cell.dataset.value ?? cell.textContent.trim()) : '';
      return { row, val: type === 'number' ? (parseFloat(raw) || 0) : String(raw) };
    });

    keyed.sort((a, b) => (
      type === 'number'
        ? factor * (a.val - b.val)
        : factor * dailyCollator.compare(a.val, b.val)
    ));

    const orderedRows = keyed.map(k => k.row);
    const applyOrder = () => {
      for (const row of orderedRows) {
        if (typeof tbody.moveBefore === 'function') {
          tbody.moveBefore(row, null);
        } else {
          tbody.appendChild(row);
        }
      }
    };

    applyOrder();

    // Sincronizar el índice visual # y el orden en lastRenderedDailyRows para que "borrar fila N" coincida exactamente
    const byKey = new Map();
    lastRenderedDailyRows.forEach(item => byKey.set(`${item.ownerCedula}::${item.id}`, item));
    const reorderedData = [];

    orderedRows.forEach((tr, i) => {
      const newNum = i + 1;
      const idxCell = tr.cells[0];
      if (idxCell) {
        idxCell.textContent = String(newNum);
        idxCell.dataset.value = String(newNum);
      }
      const key = `${tr.dataset.ownerCedula}::${tr.dataset.entryId}`;
      if (byKey.has(key)) reorderedData.push(byKey.get(key));
    });
    if (reorderedData.length === lastRenderedDailyRows.length) {
      lastRenderedDailyRows = reorderedData;
    }

    if (status) {
      const dirLabel = direction === 'ascending' ? 'ascendente' : 'descendente';
      status.textContent = `Ordenado por ${button.textContent.trim()}, ${dirLabel}, ${orderedRows.length} filas`;
    }
  }

  // Resolución inteligente de fila objetivo para comandos de borrado por voz/texto
  function resolveDailyDeleteTarget(parsed) {
    const ctx = getDailyContext();
    const visible = lastRenderedDailyRows;
    const all = ctx.entries;

    // 1. Por número de fila (#) en la tabla visible
    if (parsed.rowNumber) {
      const idx = parsed.rowNumber - 1;
      if (idx >= 0 && idx < visible.length) {
        return { item: visible[idx], rowNum: parsed.rowNumber };
      }
      if (idx >= 0 && idx < all.length) {
        return { item: all[idx], rowNum: parsed.rowNumber };
      }
      return null;
    }

    // 2. Último registro agregado
    if (parsed.mode === 'last' || (parsed.isLast && parsed.queryTokens.length === 0 && !parsed.month)) {
      const pool = visible.length > 0 ? visible : all;
      if (pool.length === 0) return null;
      let latest = pool[pool.length - 1];
      let latestRowNum = pool.length;
      let maxTs = Number(latest.createdAt) || 0;
      pool.forEach((it, i) => {
        const ts = Number(it.createdAt) || 0;
        if (ts >= maxTs) {
          maxTs = ts;
          latest = it;
          latestRowNum = i + 1;
        }
      });
      return { item: latest, rowNum: latestRowNum };
    }

    // 3. Búsqueda por concepto, categoría y/o mes
    const catMap = {};
    ctx.categories.forEach(c => { catMap[c.id] = c.name; });

    const scorePool = (pool) => {
      let best = null;
      let bestScore = 0;
      pool.forEach((it, i) => {
        if (parsed.month && Number(it.month) !== Number(parsed.month)) return;
        const conceptNorm = D.normalizeText(it.concept);
        const noteNorm = D.normalizeText(it.note);
        const catNorm = D.normalizeText(catMap[it.categoryId] || '');
        const fullHay = `${conceptNorm} ${noteNorm} ${catNorm}`;

        let score = 0;
        if (parsed.queryTokens.length > 0) {
          let matchedTokens = 0;
          parsed.queryTokens.forEach(tok => {
            const stem = tok.length > 5 ? tok.slice(0, -1) : tok;
            if (conceptNorm.includes(tok)) { score += 30; matchedTokens++; }
            else if (stem.length >= 4 && conceptNorm.includes(stem)) { score += 22; matchedTokens++; }
            else if (fullHay.includes(tok)) { score += 14; matchedTokens++; }
            else if (stem.length >= 4 && fullHay.includes(stem)) { score += 10; matchedTokens++; }
          });
          if (matchedTokens === 0 && parsed.categoryId && it.categoryId === parsed.categoryId) {
            score += 12;
          }
          if (score === 0) return;
        } else if (parsed.categoryId) {
          if (it.categoryId !== parsed.categoryId) return;
          score += 18;
        } else if (parsed.month) {
          score += 10;
        }

        if (parsed.month && Number(it.month) === Number(parsed.month)) score += 15;
        if (parsed.categoryId && it.categoryId === parsed.categoryId) score += 8;

        // Desempate por el más reciente
        if (score > bestScore || (score === bestScore && best && (Number(it.createdAt) || 0) >= (Number(best.item.createdAt) || 0))) {
          bestScore = score;
          best = { item: it, rowNum: i + 1 };
        }
      });
      return best;
    };

    return scorePool(visible) || scorePool(all);
  }

  function executeDailyDeletePlan(plan) {
    const ref = findEntryRef(plan.ownerCedula, plan.entryId);
    if (!ref) {
      showToast('No se encontró el registro para borrar', 'var(--rose)');
      return;
    }

    const prevSnap = captureDailySnapshot([ref.profile.cedula]);
    const monthLabel = D.getMonthMeta(ref.entry.month).short;

    if (plan.actionType === 'clear-cell') {
      const fieldNames = {
        amount: 'Valor ($ COP)',
        note: 'Nota',
        concept: 'Concepto',
        date: 'Fecha',
        categoryId: 'Categoría'
      };
      if (plan.field === 'amount') ref.entry.amount = 0;
      else if (plan.field === 'note') ref.entry.note = '';
      else if (plan.field === 'concept') ref.entry.concept = '';
      else if (plan.field === 'date') ref.entry.date = '';
      else if (plan.field === 'categoryId') ref.entry.categoryId = 'otros_gastos';

      const desc = `Casilla "${fieldNames[plan.field] || plan.field}" limpiada en fila #${plan.rowNum} (${ref.entry.concept || 'Sin concepto'} · ${monthLabel})`;
      pushDailyUndo({ type: 'daily', description: desc, previousByCedula: prevSnap });
      saveState();
      renderDailyView();
      setDailyVoiceStatus(`✓ ${desc}`, 'status-delete');
      showDailyUndoBanner(desc, false);
      showToast(desc, 'var(--amber)');
      return;
    }

    // Eliminar fila completa
    const removed = ref.list.splice(ref.idx, 1)[0];
    const desc = `Fila #${plan.rowNum} eliminada: "${removed.concept || 'Sin concepto'}" · ${monthLabel} · ${D.formatCOP(removed.amount)}`;
    pushDailyUndo({ type: 'daily', description: desc, previousByCedula: prevSnap });
    saveState();
    renderDailyView();
    setDailyVoiceStatus(`✓ ${desc}`, 'status-delete');
    showDailyUndoBanner(desc, false);
    showToast(`Eliminado: ${removed.concept || 'Fila #' + plan.rowNum}`, 'var(--rose)');
  }

  function processDailyCommand(rawText, { forceDeleteMode = false, fromVoice = false } = {}) {
    const text = String(rawText || '').trim();
    if (!text) return;

    const fallbackMonth = (state.dailyFilterMonth && state.dailyFilterMonth !== 'all')
      ? Number(state.dailyFilterMonth)
      : (new Date().getMonth() + 1);

    const parsed = D.parseDailyQuickEntry(text, {
      categories: getCurrentData().categories,
      fallbackMonth,
      forceDeleteMode
    });

    if (parsed.kind === 'empty') return;

    if (parsed.kind === 'delete') {
      const target = resolveDailyDeleteTarget(parsed);
      if (!target) {
        const msg = `No se encontró ninguna fila coincidente para: "${text}"`;
        setDailyVoiceStatus(msg, 'status-warn');
        showToast(msg, 'var(--amber)');
        return;
      }

      const monthLabel = D.getMonthMeta(target.item.month).full;
      const plan = {
        actionType: parsed.mode === 'clear-cell' ? 'clear-cell' : 'delete-row',
        field: parsed.field,
        ownerCedula: target.item.ownerCedula,
        entryId: target.item.id,
        rowNum: target.rowNum
      };

      const askConfirm = fromVoice && !!document.getElementById('chkVoiceDeleteConfirm')?.checked;
      if (askConfirm) {
        pendingVoiceDeleteAction = plan;
        const fieldLabel = { amount: 'el valor (a $ 0)', note: 'la nota', concept: 'el concepto', date: 'la fecha', categoryId: 'la categoría' }[plan.field] || 'la casilla';
        document.getElementById('dlgVoiceDelText').textContent = plan.actionType === 'clear-cell'
          ? `¿Limpiar ${fieldLabel} de la fila #${target.rowNum} ("${target.item.concept}" · ${monthLabel} · ${D.formatCOP(target.item.amount)})?`
          : `¿Eliminar la fila #${target.rowNum}: "${target.item.concept}" (${monthLabel} · ${D.formatCOP(target.item.amount)})?`;
        document.getElementById('dialogVoiceDeleteConfirm').showModal();
      } else {
        executeDailyDeletePlan(plan);
      }

      const inp = document.getElementById('dailyQuickInput');
      if (inp) inp.value = '';
      return;
    }

    // --- AGREGAR NUEVO GASTO ---
    const prof = getActiveProfile();
    const list = ensureDailyArray(prof);
    const newEntry = {
      id: `dx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: parsed.date || '',
      month: parsed.month,
      categoryId: parsed.categoryId,
      concept: parsed.concept,
      amount: parsed.amount,
      note: parsed.note || '',
      createdAt: Date.now()
    };

    list.push(newEntry);
    lastAddedDailyId = newEntry.id;

    // Si algún filtro activo ocultaría la fila recién creada, limpiarlo para que sea visible de inmediato
    if (state.dailyFilterMonth !== 'all' && Number(state.dailyFilterMonth) !== newEntry.month) {
      state.dailyFilterMonth = 'all';
    }
    if (state.dailyFilterCategory !== 'all' && state.dailyFilterCategory !== newEntry.categoryId) {
      state.dailyFilterCategory = 'all';
    }
    const searchEl = document.getElementById('dailyFilterSearch');
    if (searchEl && searchEl.value.trim()) searchEl.value = '';

    saveState();
    renderDailyView();

    const catObj = getCurrentData().categories.find(c => c.id === newEntry.categoryId);
    const mShort = D.getMonthMeta(newEntry.month).short;
    const msg = `✓ Registrado: "${newEntry.concept}" · ${mShort} · ${catObj ? catObj.name : newEntry.categoryId} · ${D.formatCOP(newEntry.amount)}`;
    setDailyVoiceStatus(msg, 'status-listening');
    showToast(msg);

    const inp = document.getElementById('dailyQuickInput');
    if (inp) inp.value = '';
  }

  // Web Speech API (es-CO / es-ES) + Permisos macOS Electron + Respaldo Dictado macOS en barra fx
  function updateMicPermissionBadge(status) {
    const badge = document.getElementById('dailyMicPermBadge');
    const settingsBtn = document.getElementById('btnVoiceOpenSettings');
    if (!badge) return;

    const map = {
      granted: { text: 'MIC · CONCEDIDO', cls: 'is-ok' },
      'not-determined': { text: 'MIC · SIN SOLICITAR', cls: 'is-warn' },
      denied: { text: 'MIC · DENEGADO', cls: 'is-err' },
      restricted: { text: 'MIC · RESTRINGIDO', cls: 'is-err' },
      unavailable: { text: 'MIC · NO DETECTADO', cls: 'is-err' },
      unknown: { text: 'MIC · VERIFICAR', cls: 'is-warn' }
    };
    const info = map[status] || map.unknown;
    badge.textContent = info.text;
    badge.className = `excel-mic-badge mono ${info.cls}`;

    if (settingsBtn) {
      const showSettings = Boolean(window.MPFElectron?.isElectron) && (status === 'denied' || status === 'restricted');
      settingsBtn.classList.toggle('hidden', !showSettings);
    }
  }

  async function refreshMicPermissionStatus() {
    try {
      if (window.MPFElectron && typeof window.MPFElectron.getMicPermissionStatus === 'function') {
        const status = await window.MPFElectron.getMicPermissionStatus();
        updateMicPermissionBadge(status);
        if (typeof window.MPFElectron.getSpeechEngineInfo === 'function') {
          cachedSpeechEngineInfo = await window.MPFElectron.getSpeechEngineInfo();
          const badge = document.getElementById('dailyMicPermBadge');
          if (badge && cachedSpeechEngineInfo) {
            if (cachedSpeechEngineInfo.whisperAvailable) {
              badge.textContent = 'VOZ · WHISPER LOCAL';
              badge.className = 'excel-mic-badge mono is-ok';
            } else if (cachedSpeechEngineInfo.macSpeechReady && status === 'granted') {
              badge.textContent = 'VOZ · MACOS NATIVO';
              badge.className = 'excel-mic-badge mono is-ok';
            } else if (status === 'denied' || status === 'restricted') {
              badge.textContent = 'MIC · DENEGADO';
              badge.className = 'excel-mic-badge mono is-err';
            } else {
              badge.textContent = 'VOZ · DICTADO MACOS (fx)';
              badge.className = 'excel-mic-badge mono is-cyan';
            }
          }
        }
        return status;
      }
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        const res = await navigator.permissions.query({ name: 'microphone' });
        const mapped = res.state === 'granted' ? 'granted' : (res.state === 'denied' ? 'denied' : 'not-determined');
        updateMicPermissionBadge(mapped);
        return mapped;
      }
    } catch (_) {}
    updateMicPermissionBadge('unknown');
    return 'unknown';
  }

  async function ensureMicrophoneAccess() {
    // 1. Si corre en Electron (macOS), solicitar acceso nativo vía IPC antes de abrir micrófono
    if (window.MPFElectron && typeof window.MPFElectron.requestMicPermission === 'function') {
      try {
        const res = await window.MPFElectron.requestMicPermission();
        updateMicPermissionBadge(res.status || (res.granted ? 'granted' : 'denied'));
        if (!res.granted) {
          return { granted: false, status: res.status || 'denied', reason: 'Permiso de micrófono no concedido en macOS.' };
        }
      } catch (err) {
        updateMicPermissionBadge('unknown');
      }
    }

    // 2. Verificar captura real de audio con getUserMedia (dispara permiso en navegador y confirma hardware)
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        updateMicPermissionBadge('granted');
        return { granted: true, status: 'granted', reason: '' };
      } catch (err) {
        const name = err?.name || 'Error';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          updateMicPermissionBadge('denied');
          return { granted: false, status: 'denied', reason: `Permiso denegado (${name}).` };
        }
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          updateMicPermissionBadge('unavailable');
          return { granted: false, status: 'unavailable', reason: `No se detectó micrófono (${name}).` };
        }
        return { granted: false, status: 'unknown', reason: `No se pudo abrir el micrófono (${name}).` };
      }
    }

    return { granted: true, status: 'unknown', reason: '' };
  }

  function clearMacDictationTimer() {
    if (macDictationAutoTimer) {
      clearTimeout(macDictationAutoTimer);
      macDictationAutoTimer = null;
    }
  }

  function disarmMacDictationMode() {
    clearMacDictationTimer();
    armedMacDictationMode = null;
    const row = document.querySelector('.excel-formula-row');
    const cancelBtn = document.getElementById('btnVoiceCancelDictation');
    if (row) row.classList.remove('is-dictation-add', 'is-dictation-delete');
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }

  function armMacDictationMode(mode, reasonPrefix = '', { showSpeechSettings = false } = {}) {
    stopActiveSpeech();
    clearMacDictationTimer();
    armedMacDictationMode = mode === 'delete' ? 'delete' : 'add';
    lastVoiceMode = armedMacDictationMode;

    const row = document.querySelector('.excel-formula-row');
    const fallbackBar = document.getElementById('dailyVoiceFallbackActions');
    const tagEl = document.getElementById('dailyVoiceErrorTag');
    const speechBtn = document.getElementById('btnVoiceOpenSpeechSettings');
    const cancelBtn = document.getElementById('btnVoiceCancelDictation');
    const inp = document.getElementById('dailyQuickInput');

    if (row) {
      row.classList.toggle('is-dictation-add', armedMacDictationMode === 'add');
      row.classList.toggle('is-dictation-delete', armedMacDictationMode === 'delete');
    }
    if (tagEl) {
      tagEl.textContent = armedMacDictationMode === 'delete' ? 'DICTADO MACOS · BORRAR' : 'DICTADO MACOS · GASTO';
    }
    if (speechBtn) speechBtn.classList.toggle('hidden', !showSpeechSettings);
    if (fallbackBar) fallbackBar.classList.remove('hidden');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    const modeTitle = armedMacDictationMode === 'delete' ? 'BORRAR POR VOZ' : 'DICTAR GASTO';
    const example = armedMacDictationMode === 'delete'
      ? '"borrar fila 1", "eliminar mercado de septiembre" o "limpiar nota de la fila 2"'
      : '"450.000 pesos mercado mes de septiembre" o "gasolina 200 mil octubre"';

    const prefix = reasonPrefix ? `${reasonPrefix} ` : '';
    setDailyVoiceStatus(
      `${prefix}🎙 Dictado nativo de macOS listo (${modeTitle}) en la barra fx: presiona Fn dos veces (o 🎙 en tu teclado) y dicta ${example}. Se ejecutará automáticamente al pausar o al presionar Enter.`,
      armedMacDictationMode === 'delete' ? 'status-delete' : 'status-listening'
    );

    if (inp) {
      inp.focus();
      if (inp.value) inp.select();
    }
  }

  function handleMacDictationLiveInput() {
    if (!armedMacDictationMode) return;
    const inp = document.getElementById('dailyQuickInput');
    const text = (inp?.value || '').trim();
    clearMacDictationTimer();

    if (!text) return;

    const modeLabel = armedMacDictationMode === 'delete' ? 'BORRAR' : 'GASTO';
    setDailyVoiceStatus(
      `🎙 Transcripción en vivo (${modeLabel}): "${text}" · Presiona Enter o haz una pausa breve para ejecutar.`,
      armedMacDictationMode === 'delete' ? 'status-delete' : 'status-listening'
    );

    // Evaluar si la frase ya es accionable para auto-ejecución limpia tras pausa del dictado de macOS
    const fallbackMonth = (state.dailyFilterMonth && state.dailyFilterMonth !== 'all')
      ? Number(state.dailyFilterMonth)
      : (new Date().getMonth() + 1);
    const preview = D.parseDailyQuickEntry(text, {
      categories: getCurrentData().categories,
      fallbackMonth,
      forceDeleteMode: armedMacDictationMode === 'delete'
    });

    const isReadyToAutoRun = (
      (preview.kind === 'add' && preview.amount > 0 && preview.concept.length >= 2) ||
      (preview.kind === 'delete' && (preview.rowNumber || preview.mode === 'last' || preview.queryTokens.length > 0 || preview.month))
    );

    if (isReadyToAutoRun) {
      macDictationAutoTimer = setTimeout(() => {
        const finalVal = (inp?.value || '').trim();
        const runMode = armedMacDictationMode;
        if (!finalVal || !runMode) return;
        disarmMacDictationMode();
        processDailyCommand(finalVal, { forceDeleteMode: runMode === 'delete', fromVoice: true });
      }, 1700);
    }
  }

  // Codificador PCM WAV 16 kHz Mono 16-bit (compatible directo con whisper.cpp y macOS SFSpeechRecognizer)
  function encodeAudioBufferToWav16kMono(audioBuffer) {
    const srcRate = audioBuffer.sampleRate || 48000;
    const dstRate = 16000;
    const chCount = Math.max(1, audioBuffer.numberOfChannels || 1);
    const srcLen = audioBuffer.length;

    // 1. Mezclar a mono
    const mono = new Float32Array(srcLen);
    for (let c = 0; c < chCount; c++) {
      const chData = audioBuffer.getChannelData(c);
      for (let i = 0; i < srcLen; i++) mono[i] += chData[i] / chCount;
    }

    // 2. Remuestrear a 16 kHz con interpolación lineal
    const ratio = srcRate / dstRate;
    const dstLen = Math.max(1, Math.round(srcLen / ratio));
    const resampled = new Float32Array(dstLen);
    for (let i = 0; i < dstLen; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = mono[Math.min(srcLen - 1, idx)] || 0;
      const s1 = mono[Math.min(srcLen - 1, idx + 1)] || s0;
      resampled[i] = s0 + (s1 - s0) * frac;
    }

    // 3. Escribir encabezado RIFF/WAVE de 44 bytes + muestras Int16
    const dataBytes = dstLen * 2;
    const buf = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buf);
    const writeAscii = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);          // Subchunk1Size (PCM)
    view.setUint16(20, 1, true);           // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true);           // NumChannels (1 = Mono)
    view.setUint32(24, dstRate, true);     // SampleRate (16000)
    view.setUint32(28, dstRate * 2, true); // ByteRate
    view.setUint16(32, 2, true);           // BlockAlign
    view.setUint16(34, 16, true);          // BitsPerSample
    writeAscii(36, 'data');
    view.setUint32(40, dataBytes, true);

    let off = 44;
    for (let i = 0; i < dstLen; i++) {
      const clamped = Math.max(-1, Math.min(1, resampled[i]));
      view.setInt16(off, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
      off += 2;
    }
    return new Uint8Array(buf);
  }

  function cleanupAudioMeterAndStream() {
    if (activeMeterRaf) {
      cancelAnimationFrame(activeMeterRaf);
      activeMeterRaf = null;
    }
    if (activeAudioCtx) {
      try { activeAudioCtx.close(); } catch (_) {}
      activeAudioCtx = null;
    }
    if (activeMediaStream) {
      try { activeMediaStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      activeMediaStream = null;
    }
    const meterWrap = document.getElementById('dailyAudioMeterWrap');
    const meterFill = document.getElementById('dailyAudioMeterFill');
    if (meterWrap) meterWrap.classList.add('hidden');
    if (meterFill) meterFill.style.width = '4%';
  }

  function resetVoiceButtonsUi() {
    const btnAdd = document.getElementById('btnVoiceAdd');
    const btnDel = document.getElementById('btnVoiceDelete');
    const lblAdd = document.getElementById('btnVoiceAddLabel');
    const lblDel = document.getElementById('btnVoiceDeleteLabel');
    if (btnAdd) btnAdd.classList.remove('is-listening');
    if (btnDel) btnDel.classList.remove('is-listening');
    if (lblAdd) lblAdd.textContent = 'Dictar Gasto';
    if (lblDel) lblDel.textContent = 'Comando por Voz: Borrar';
  }

  function stopElectronAudioCapture(cancel = false) {
    activeRecordCancel = Boolean(cancel);
    if (activeMediaRecorder && activeMediaRecorder.state === 'recording') {
      try { activeMediaRecorder.stop(); } catch (_) {}
    } else {
      cleanupAudioMeterAndStream();
      activeMediaRecorder = null;
      activeRecordMode = null;
      resetVoiceButtonsUi();
    }
  }

  function stopActiveSpeech() {
    if (activeMediaRecorder) {
      stopElectronAudioCapture(true);
    }
    if (activeSpeechRec) {
      try { activeSpeechRec.onend = null; activeSpeechRec.onerror = null; activeSpeechRec.abort(); } catch (_) {}
      activeSpeechRec = null;
    }
    activeSpeechMode = null;
    resetVoiceButtonsUi();
  }

  function showVoiceFallbackPanel(errTag, detailMessage, { autoArmMac = false, mode = 'add', showSpeechSettings = false } = {}) {
    const panel = document.getElementById('dailyVoiceFallbackActions');
    const tagEl = document.getElementById('dailyVoiceErrorTag');
    const speechBtn = document.getElementById('btnVoiceOpenSpeechSettings');
    if (tagEl) tagEl.textContent = errTag;
    if (speechBtn) speechBtn.classList.toggle('hidden', !showSpeechSettings);
    if (panel) panel.classList.remove('hidden');

    if (autoArmMac) {
      armMacDictationMode(mode, detailMessage);
    } else {
      setDailyVoiceStatus(detailMessage, 'status-warn');
      document.getElementById('dailyQuickInput')?.focus();
    }
  }

  // Captura de audio real con getUserMedia + MediaRecorder → IPC Main (whisper.cpp / macOS Speech local)
  // Con preflight limpio: si no hay motor local listo en macOS, activa de inmediato Dictado macOS en la barra fx sin errores técnicos
  async function startElectronAudioCapture(mode) {
    const targetMode = mode === 'delete' ? 'delete' : 'add';
    lastVoiceMode = targetMode;

    // Si ya estaba grabando en el mismo modo, detener y transcribir de inmediato
    if (activeMediaRecorder && activeMediaRecorder.state === 'recording') {
      if (activeRecordMode === targetMode) {
        stopElectronAudioCapture(false);
        return;
      }
      stopElectronAudioCapture(true);
    }
    disarmMacDictationMode();

    // 0. Preflight instantáneo: verificar si hay whisper.cpp o SFSpeechRecognizer listo antes de grabar
    if (window.MPFElectron && typeof window.MPFElectron.getSpeechEngineInfo === 'function') {
      try {
        cachedSpeechEngineInfo = await window.MPFElectron.getSpeechEngineInfo();
        if (cachedSpeechEngineInfo && !cachedSpeechEngineInfo.hasReadyLocalEngine) {
          const deniedSpeech = cachedSpeechEngineInfo.macSpeechAuthStatus === 'denied' ||
                               cachedSpeechEngineInfo.macSpeechAuthStatus === 'restricted';
          armMacDictationMode(targetMode, '', { showSpeechSettings: deniedSpeech });
          return;
        }
      } catch (_) {
        armMacDictationMode(targetMode);
        return;
      }
    }

    // 1. Solicitar permiso de micrófono en macOS si hace falta
    setDailyVoiceStatus('Verificando micrófono en macOS...', '');
    if (window.MPFElectron && typeof window.MPFElectron.requestMicPermission === 'function') {
      const micRes = await window.MPFElectron.requestMicPermission();
      updateMicPermissionBadge(micRes.status || (micRes.granted ? 'granted' : 'denied'));
      if (!micRes.granted) {
        armMacDictationMode(targetMode, 'El micrófono requiere permiso en macOS.');
        return;
      }
    }

    // 2. Capturar audio real del micrófono con getUserMedia
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      updateMicPermissionBadge('granted');
    } catch (err) {
      console.warn('getUserMedia fallback a Dictado macOS:', err);
      const name = err?.name || '';
      updateMicPermissionBadge(name === 'NotAllowedError' ? 'denied' : 'unavailable');
      armMacDictationMode(targetMode, 'No se pudo abrir el micrófono directo.');
      return;
    }

    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const chosenMime = (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function')
      ? mimeCandidates.find(m => MediaRecorder.isTypeSupported(m))
      : '';

    const chunks = [];
    let recorder;
    try {
      recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
    } catch (err) {
      console.warn('MediaRecorder fallback a Dictado macOS:', err);
      stream.getTracks().forEach(t => t.stop());
      armMacDictationMode(targetMode);
      return;
    }

    activeMediaStream = stream;
    activeMediaRecorder = recorder;
    activeRecordMode = targetMode;
    activeRecordCancel = false;

    const isDeleteBtn = targetMode === 'delete';
    const btn = document.getElementById(isDeleteBtn ? 'btnVoiceDelete' : 'btnVoiceAdd');
    const lbl = document.getElementById(isDeleteBtn ? 'btnVoiceDeleteLabel' : 'btnVoiceAddLabel');
    if (btn) btn.classList.add('is-listening');
    if (lbl) lbl.textContent = '⏹ Detener y Transcribir';

    const meterWrap = document.getElementById('dailyAudioMeterWrap');
    const meterFill = document.getElementById('dailyAudioMeterFill');
    const meterLbl = document.getElementById('dailyAudioMeterLabel');
    if (meterWrap) {
      meterWrap.classList.toggle('is-delete', isDeleteBtn);
      meterWrap.classList.remove('hidden');
    }

    const fallbackPanel = document.getElementById('dailyVoiceFallbackActions');
    if (fallbackPanel) fallbackPanel.classList.add('hidden');

    setDailyVoiceStatus(
      isDeleteBtn
        ? '🎙 Grabando comando de borrado (audio real) · Habla ahora (ej. "borrar fila 1", "limpiar nota de la fila 2") y haz una pausa o pulsa Detener.'
        : '🎙 Grabando gasto (audio real) · Habla ahora (ej. "450.000 pesos mercado mes de septiembre") y haz una pausa o pulsa Detener.',
      isDeleteBtn ? 'status-delete' : 'status-listening'
    );

    // 3. Medidor en vivo + detección inteligente de silencio para detener automáticamente al terminar de hablar
    const startedAt = performance.now();
    let speechDetectedAt = 0;
    let lastVoiceActivityAt = startedAt;
    const MAX_RECORD_MS = 14000;
    const SILENCE_AUTOSTOP_MS = 1750;
    const MIN_SPEECH_HOLD_MS = 320;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        activeAudioCtx = new AudioCtx();
        const source = activeAudioCtx.createMediaStreamSource(stream);
        const analyser = activeAudioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const pcmData = new Float32Array(analyser.fftSize);

        const tickMeter = () => {
          if (!activeMediaRecorder || activeMediaRecorder.state !== 'recording') return;
          const now = performance.now();
          const elapsedMs = now - startedAt;

          analyser.getFloatTimeDomainData(pcmData);
          let sumSq = 0;
          for (let i = 0; i < pcmData.length; i++) sumSq += pcmData[i] * pcmData[i];
          const rms = Math.sqrt(sumSq / pcmData.length);
          const pct = Math.min(100, Math.max(4, Math.round(rms * 420)));

          if (meterFill) meterFill.style.width = `${pct}%`;
          if (meterLbl) meterLbl.textContent = `● GRABANDO ${(elapsedMs / 1000).toFixed(1)}s`;

          if (rms > 0.022) {
            if (!speechDetectedAt) speechDetectedAt = now;
            lastVoiceActivityAt = now;
          }

          const spokeEnough = speechDetectedAt > 0 && (lastVoiceActivityAt - speechDetectedAt >= MIN_SPEECH_HOLD_MS || elapsedMs >= 1400);
          const silentLongEnough = spokeEnough && (now - lastVoiceActivityAt >= SILENCE_AUTOSTOP_MS);

          if (silentLongEnough || elapsedMs >= MAX_RECORD_MS) {
            stopElectronAudioCapture(false);
            return;
          }
          activeMeterRaf = requestAnimationFrame(tickMeter);
        };
        activeMeterRaf = requestAnimationFrame(tickMeter);
      }
    } catch (_) {}

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.onstop = async () => {
      const wasCancelled = activeRecordCancel;
      const runMode = activeRecordMode || targetMode;
      cleanupAudioMeterAndStream();
      activeMediaRecorder = null;
      activeRecordMode = null;
      resetVoiceButtonsUi();

      if (wasCancelled) return;

      if (chunks.length === 0) {
        showVoiceFallbackPanel(
          'SIN AUDIO CAPTURADO',
          'La grabación quedó vacía. Reintenta hablando cerca del micrófono o usa Dictado macOS en la barra fx.',
          { autoArmMac: false, mode: runMode }
        );
        return;
      }

      setDailyVoiceStatus('⏳ Procesando y transcribiendo audio localmente en macOS...', '');

      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || chosenMime || 'audio/webm' });
        const rawArr = await blob.arrayBuffer();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const decodeCtx = new AudioCtx();
        let audioBuffer;
        try {
          audioBuffer = await decodeCtx.decodeAudioData(rawArr.slice(0));
        } finally {
          try { await decodeCtx.close(); } catch (_) {}
        }

        const wavBytes = encodeAudioBufferToWav16kMono(audioBuffer);
        const res = await window.MPFElectron.transcribeAudio({
          wavBytes,
          lang: 'es-CO',
          mode: runMode
        });

        if (res && res.ok && res.text) {
          const inp = document.getElementById('dailyQuickInput');
          if (inp) inp.value = res.text;
          const engineLabel = res.engine === 'whisper.cpp'
            ? 'whisper.cpp local'
            : (res.onDevice ? `macOS Speech local (${res.locale})` : `macOS Speech (${res.locale})`);
          setDailyVoiceStatus(
            `✓ Transcrito [${engineLabel}]: "${res.text}"`,
            runMode === 'delete' ? 'status-delete' : 'status-listening'
          );
          processDailyCommand(res.text, { forceDeleteMode: runMode === 'delete', fromVoice: true });
          return;
        }

        const errCode = res?.errorCode || 'transcribe_failed';
        console.warn('Transcripción local no completada, activando Dictado macOS:', errCode, res?.error);
        const isSpeechAuthErr = String(errCode).startsWith('speech_auth_');
        const friendlyPrefix = errCode === 'no_speech'
          ? 'No se escuchó habla clara en la grabación.'
          : (isSpeechAuthErr ? 'Activa Reconocimiento de Voz en macOS o dicta directamente:' : '');
        armMacDictationMode(runMode, friendlyPrefix, { showSpeechSettings: isSpeechAuthErr });
      } catch (err) {
        console.warn('Error al decodificar/transcribir audio, activando Dictado macOS:', err);
        armMacDictationMode(runMode);
      }
    };

    recorder.start(250);
  }

  async function startVoiceRecognition(mode, langOverride = 'es-CO') {
    lastVoiceMode = mode === 'delete' ? 'delete' : 'add';

    // En Electron (macOS), usar captura real getUserMedia + MediaRecorder → transcripción local vía ipcMain
    if (window.MPFElectron && typeof window.MPFElectron.transcribeAudio === 'function') {
      await startElectronAudioCapture(lastVoiceMode);
      return;
    }

    const SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (activeSpeechRec && activeSpeechMode === mode) {
      stopActiveSpeech();
      setDailyVoiceStatus('Dictado detenido.', '');
      return;
    }
    if (activeSpeechRec) stopActiveSpeech();
    disarmMacDictationMode();

    // 1. Verificar / solicitar permiso real de micrófono primero
    setDailyVoiceStatus('Verificando permiso de micrófono...', '');
    const micCheck = await ensureMicrophoneAccess();
    if (!micCheck.granted) {
      showVoiceFallbackPanel(
        `PERMISO: ${String(micCheck.status || 'DENEGADO').toUpperCase()}`,
        `${micCheck.reason} Habilita el micrófono o usa Dictado macOS / barra fx.`,
        { autoArmMac: false, mode: lastVoiceMode }
      );
      return;
    }

    // 2. Comprobar soporte de SpeechRecognition / webkitSpeechRecognition
    if (!SpeechCtor) {
      showVoiceFallbackPanel(
        'SIN WEB SPEECH API',
        'Este entorno no expone SpeechRecognition (permiso de micrófono concedido)',
        { autoArmMac: true, mode: lastVoiceMode }
      );
      return;
    }

    try {
      const rec = new SpeechCtor();
      rec.lang = langOverride;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      activeSpeechRec = rec;
      activeSpeechMode = lastVoiceMode;

      const isDeleteBtn = lastVoiceMode === 'delete';
      const btn = document.getElementById(isDeleteBtn ? 'btnVoiceDelete' : 'btnVoiceAdd');
      const lbl = document.getElementById(isDeleteBtn ? 'btnVoiceDeleteLabel' : 'btnVoiceAddLabel');
      if (btn) btn.classList.add('is-listening');
      if (lbl) lbl.textContent = isDeleteBtn ? 'Escuchando borrado...' : 'Escuchando gasto...';

      setDailyVoiceStatus(
        isDeleteBtn
          ? `● ESCUCHANDO BORRADO (${langOverride}) · Di "borrar fila 1", "eliminar mercado de septiembre" o "limpiar nota de la fila 2"...`
          : `● ESCUCHANDO GASTO (${langOverride}) · Di "450.000 pesos mercado mes de septiembre" o "gasolina 200 mil octubre"...`,
        isDeleteBtn ? 'status-delete' : 'status-listening'
      );

      let finalTranscript = '';
      let hadError = false;

      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) finalTranscript += `${chunk} `;
          else interim += chunk;
        }
        const preview = (finalTranscript + interim).trim();
        const inp = document.getElementById('dailyQuickInput');
        if (inp && preview) inp.value = preview;
        if (preview) {
          setDailyVoiceStatus(
            `🎙 Transcripción en vivo (${langOverride}): "${preview}"`,
            isDeleteBtn ? 'status-delete' : 'status-listening'
          );
        }
      };

      rec.onerror = (event) => {
        hadError = true;
        const errCode = event.error || 'unknown';
        stopActiveSpeech();

        // Fallback automático de idioma: es-CO -> es-ES
        if (errCode === 'language-not-supported' && langOverride === 'es-CO') {
          startVoiceRecognition(lastVoiceMode, 'es-ES');
          return;
        }

        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          updateMicPermissionBadge('denied');
          showVoiceFallbackPanel(
            `ERROR: ${errCode.toUpperCase()}`,
            `Permiso/servicio de voz bloqueado (${errCode}). Reintenta o abre Permisos de Micrófono en macOS.`,
            { autoArmMac: false, mode: lastVoiceMode }
          );
          return;
        }

        if (errCode === 'audio-capture') {
          updateMicPermissionBadge('unavailable');
          showVoiceFallbackPanel(
            'ERROR: AUDIO-CAPTURE',
            'No se pudo capturar audio del micrófono. Verifica tu dispositivo de entrada en macOS y reintenta.',
            { autoArmMac: false, mode: lastVoiceMode }
          );
          return;
        }

        if (errCode === 'no-speech') {
          showVoiceFallbackPanel(
            'SIN VOZ DETECTADA',
            'No se detectó voz (no-speech). Reintenta hablando cerca del micrófono o usa Dictado macOS en la barra fx.',
            { autoArmMac: false, mode: lastVoiceMode }
          );
          return;
        }

        if (errCode === 'network') {
          const isElec = Boolean(window.MPFElectron?.isElectron);
          const why = isElec
            ? 'Error "network": Electron/Chromium no incluye clave de nube de Google Speech (micrófono concedido)'
            : 'Error "network": Sin conexión con el servicio de voz del navegador (micrófono concedido)';
          showVoiceFallbackPanel('MOTOR WEB SPEECH: NETWORK', why, {
            autoArmMac: true,
            mode: lastVoiceMode
          });
          return;
        }

        showVoiceFallbackPanel(
          `ERROR VOZ: ${errCode.toUpperCase()}`,
          `Fallo del motor de voz (${errCode})`,
          { autoArmMac: true, mode: lastVoiceMode }
        );
      };

      rec.onend = () => {
        const spoken = finalTranscript.trim();
        const runMode = activeSpeechMode || lastVoiceMode;
        stopActiveSpeech();
        if (!hadError && spoken) {
          const panel = document.getElementById('dailyVoiceFallbackActions');
          if (panel) panel.classList.add('hidden');
          processDailyCommand(spoken, { forceDeleteMode: runMode === 'delete', fromVoice: true });
        }
      };

      rec.start();
    } catch (err) {
      stopActiveSpeech();
      showVoiceFallbackPanel(
        'ERROR AL INICIAR VOZ',
        `No se pudo iniciar SpeechRecognition (${err?.message || 'desconocido'})`,
        { autoArmMac: true, mode: lastVoiceMode }
      );
    }
  }

  // Sincronización de Promedios Mensuales Reales con el Modelo Principal (Punto 5)
  function openDailySyncDialog() {
    const profile = getActiveProfile();
    const entries = ensureDailyArray(profile);
    const matrix = D.computeDailyMatrix(entries, profile.data.categories);
    const activeRows = matrix.rows.filter(r => r.realMonthlyAvg > 0);

    if (activeRows.length === 0) {
      showToast(`No hay gastos registrados en ${profile.name} para calcular promedios mensuales`, 'var(--amber)');
      return;
    }

    document.getElementById('dlgDailySyncSub').textContent =
      `Perfil destino: ${profile.name}. Selecciona la variable exacta para cada categoría con promedio real > $ 0 y recalcula tus 5 Pilares y gráficas.`;

    const listEl = document.getElementById('dailySyncList');
    listEl.innerHTML = activeRows.map(row => {
      const cat = profile.data.categories.find(c => c.id === row.categoryId);
      if (!cat) return '';
      const suggestedItemId = D.suggestModelVariableForCategory(cat, row.entries);
      const roundedAvg = Math.round(row.realMonthlyAvg);

      const optionsHtml = cat.items.map(it => {
        const curAmt = Number(it.amount) || 0;
        const label = `${it.name}${curAmt > 0 ? ` (Actual: ${D.formatCOP(curAmt)})` : ''}`;
        return `<option value="${D.escapeAttr(it.id)}" ${it.id === suggestedItemId ? 'selected' : ''}>${D.escapeAttr(label)}</option>`;
      }).join('');

      return `
        <div class="excel-sync-row" data-sync-cat="${D.escapeAttr(cat.id)}" data-sync-avg="${roundedAvg}" data-sync-months="${row.activeMonths}">
          <input type="checkbox" checked aria-label="Aplicar promedio de ${D.escapeAttr(cat.name)}" />
          <div>
            <div style="font-weight:800; color:#ffffff; display:flex; align-items:center; gap:6px;">
              <span class="dot" style="background:${cat.color};"></span>
              <span>${D.escapeAttr(cat.name)}</span>
            </div>
            <div class="mono" style="font-size:10.5px; color:var(--text-secondary); margin-top:2px;">
              ${row.activeMonths} ${row.activeMonths === 1 ? 'mes activo' : 'meses activos'} · Suma ${D.formatCOP(row.total)}
            </div>
          </div>
          <div class="mono" style="font-weight:800; color:var(--mint); text-align:right;">
            ${D.formatCOP(roundedAvg)}/mes
          </div>
          <select class="excel-sync-select" aria-label="Variable destino en ${D.escapeAttr(cat.name)}">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');

    document.getElementById('dialogDailySync').showModal();
  }

  function applyDailySyncSelection() {
    const profile = getActiveProfile();
    const rows = document.querySelectorAll('#dailySyncList .excel-sync-row');
    const prevCategories = JSON.parse(JSON.stringify(profile.data.categories));

    let appliedCount = 0;
    const appliedNames = [];

    rows.forEach(rowEl => {
      const checked = rowEl.querySelector('input[type="checkbox"]')?.checked;
      if (!checked) return;
      const catId = rowEl.getAttribute('data-sync-cat');
      const avgVal = Number(rowEl.getAttribute('data-sync-avg')) || 0;
      const activeMonths = Number(rowEl.getAttribute('data-sync-months')) || 1;
      const itemId = rowEl.querySelector('select')?.value;

      const cat = profile.data.categories.find(c => c.id === catId);
      const item = cat?.items.find(it => it.id === itemId);
      if (!cat || !item) return;

      item.amount = avgVal;
      if (!item.note || item.note.startsWith('Promedio Control Diario')) {
        item.note = `Promedio Control Diario (${activeMonths} ${activeMonths === 1 ? 'mes' : 'meses'})`;
      }
      appliedCount++;
      appliedNames.push(`${cat.name} → ${item.name}`);
    });

    if (appliedCount === 0) {
      showToast('No seleccionaste ninguna categoría para aplicar', 'var(--amber)');
      return;
    }

    pushDailyUndo({
      type: 'sync',
      targetCedula: profile.cedula,
      description: `${appliedCount} promedios aplicados al modelo (${appliedNames.slice(0, 2).join(', ')}${appliedNames.length > 2 ? '…' : ''})`,
      previousCategories: prevCategories
    });

    saveState();
    // Recalcular Dashboard (5 Pilares y gráficas SVG) inmediatamente
    renderDashboard(true);
    const updatedM = D.computeMetrics(profile.data);
    const summaryMsg = `✓ ${appliedCount} ${appliedCount === 1 ? 'promedio aplicado' : 'promedios aplicados'} al modelo de ${profile.name} · Nuevos Egresos: ${D.formatCOP(updatedM.totalExpenses)} · Score ${updatedM.score}/100 (${updatedM.passedCount}/5 Pilares)`;
    setDailyVoiceStatus(summaryMsg, 'status-listening');
    showDailyUndoBanner(summaryMsg, true);
    showToast(`5 Pilares recalculados · Score ${updatedM.score}/100`);
  }

  // ==========================================================================
  // 13. EXPORTACIÓN REAL A EXCEL (.xlsx) CON SHEETJS LOCAL (COP Y %)
  // ==========================================================================
  function exportExcelWorkbook() {
    if (typeof window.XLSX === 'undefined') {
      showToast('No se cargó la librería SheetJS local (xlsx.full.min.js)', 'var(--rose)');
      return;
    }

    const XLSX = window.XLSX;
    const COP_FMT = '$ #,##0';
    const PCT_FMT = '0.00%';

    const profile = getActiveProfile();
    const data = profile.data;
    const m = D.computeMetrics(data);
    const pm = D.computePatrimonioMetrics(profile.patrimonio);
    const activeGroup = getActiveGroup();

    const wb = XLSX.utils.book_new();
    const today = new Date().toISOString().slice(0, 10);

    const numCell = (val, fmt = COP_FMT) => ({ t: 'n', v: Number(val) || 0, z: fmt });
    const formulaCell = (formula, cachedVal, fmt = COP_FMT) => ({ t: 'n', f: formula, v: Number(cachedVal) || 0, z: fmt });

    // ------------------------------------------------------------------------
    // HOJA 1: "Flujo de Caja"
    // ------------------------------------------------------------------------
    const fcRows = [
      [`MIS PROPIAS FINANZAS — FLUJO DE CAJA (${profile.name.toUpperCase()})`, '', '', '', '', ''],
      [`Titular: ${profile.name}`, `Cédula: ${D.formatCedulaDisplay(profile.cedula)}`, `Fecha: ${today}`, '', '', ''],
      [],
      ['RESUMEN EJECUTIVO', 'MONTO (COP)', '% INGRESOS', '', '', ''],
      ['Ingresos Totales', numCell(m.totalIncome), numCell(m.totalIncome > 0 ? 1 : 0, PCT_FMT)],
      ['Total Egresos', numCell(m.totalExpenses), numCell(m.committedPct / 100, PCT_FMT)],
      ['Flujo Libre Mensual', numCell(m.freeCashFlow), numCell(m.freePct / 100, PCT_FMT)],
      [],
      ['FUENTES DE INGRESO MENSUAL (12 RENGLONES)', '', '', '', '', ''],
      ['#', 'Fuente de Ingreso', 'Nota', 'Monto Mensual (COP)', '% de Ingresos', 'Estado']
    ];

    data.incomes.forEach((inc, i) => {
      const amt = Number(inc.amount) || 0;
      const share = m.totalIncome > 0 ? amt / m.totalIncome : 0;
      fcRows.push([
        i + 1,
        inc.name,
        inc.note || '',
        numCell(amt),
        numCell(share, PCT_FMT),
        amt > 0 ? 'Activo' : 'Sin movimiento'
      ]);
    });
    fcRows.push(['', 'TOTAL INGRESOS', '', numCell(m.totalIncome), numCell(m.totalIncome > 0 ? 1 : 0, PCT_FMT), '']);
    fcRows.push([]);
    fcRows.push(['DETALLE DE EGRESOS — 15 CATEGORÍAS (102 VARIABLES)', '', '', '', '', '']);
    fcRows.push(['Categoría', 'Pilar', 'Variable', 'Nota', 'Monto Mensual (COP)', '% de Ingresos']);

    data.categories.forEach(cat => {
      const pLabel = (D.PILLAR_INFO[cat.pillar] || D.PILLAR_INFO.personales).label;
      cat.items.forEach(item => {
        const amt = Number(item.amount) || 0;
        const share = m.totalIncome > 0 ? amt / m.totalIncome : 0;
        fcRows.push([
          cat.name,
          pLabel,
          item.name,
          item.note || '',
          numCell(amt),
          numCell(share, PCT_FMT)
        ]);
      });
      const catSum = m.catTotals[cat.id] || 0;
      const catShare = m.totalIncome > 0 ? catSum / m.totalIncome : 0;
      fcRows.push([
        `SUBTOTAL ${cat.name}`,
        pLabel,
        '',
        '',
        numCell(catSum),
        numCell(catShare, PCT_FMT)
      ]);
    });

    fcRows.push(['TOTAL EGRESOS', '', '', '', numCell(m.totalExpenses), numCell(m.committedPct / 100, PCT_FMT)]);
    fcRows.push(['FLUJO LIBRE MENSUAL', '', '', '', numCell(m.freeCashFlow), numCell(m.freePct / 100, PCT_FMT)]);

    const wsFlujo = XLSX.utils.aoa_to_sheet(fcRows);
    wsFlujo['!cols'] = [
      { wch: 28 }, { wch: 22 }, { wch: 30 }, { wch: 32 }, { wch: 20 }, { wch: 16 }
    ];
    wsFlujo['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    XLSX.utils.book_append_sheet(wb, wsFlujo, 'Flujo de Caja');

    // ------------------------------------------------------------------------
    // HOJA 2: "5 Pilares"
    // ------------------------------------------------------------------------
    const pilRows = [
      [`DIAGNÓSTICO DE LOS 5 PILARES FINANCIEROS — ${profile.name.toUpperCase()}`, '', '', '', '', '', '', ''],
      [`Score Global: ${m.score} / 100`, `Pilares Cumplidos: ${m.passedCount} / 5`, `Ingresos Base:`, numCell(m.totalIncome), '', '', '', ''],
      [],
      ['Pilar Financiero', 'Categorías Incluidas', 'Monto Real (COP)', '% Real', 'Condición', 'Meta %', 'Tope Meta (COP)', 'Estado']
    ];

    m.pillars.forEach(p => {
      pilRows.push([
        p.title,
        p.catsLabel,
        numCell(p.amount),
        numCell(p.realPct / 100, PCT_FMT),
        `${p.op} ${p.meta}%`,
        numCell(p.meta / 100, PCT_FMT),
        numCell(p.metaAmount),
        p.isGood ? 'ESTÁS BIEN' : 'DEBES MEJORAR'
      ]);
    });

    pilRows.push([]);
    pilRows.push(['CUADRE CONTABLE 100%', '', 'MONTO (COP)', '% INGRESOS', '', '', '', '']);
    m.pillars.forEach(p => {
      pilRows.push([p.legendName, p.catsLabel, numCell(p.amount), numCell(p.realPct / 100, PCT_FMT)]);
    });
    pilRows.push(['Flujo Libre Mensual', 'Ingresos − Total Egresos', numCell(m.freeCashFlow), numCell(m.freePct / 100, PCT_FMT)]);
    pilRows.push(['TOTAL CUADRE CONTABLE', 'Suma 5 Pilares + Flujo Libre', numCell(m.totalIncome), numCell(m.totalIncome > 0 ? 1 : 0, PCT_FMT)]);

    const wsPilares = XLSX.utils.aoa_to_sheet(pilRows);
    wsPilares['!cols'] = [
      { wch: 26 }, { wch: 42 }, { wch: 20 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 20 }, { wch: 18 }
    ];
    wsPilares['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    XLSX.utils.book_append_sheet(wb, wsPilares, '5 Pilares');

    // ------------------------------------------------------------------------
    // HOJA 3: "Patrimonio" (con fórmulas reales =C{r}-D{r} sin ABS)
    // ------------------------------------------------------------------------
    const patRows = [
      [`PATRIMONIO NETO REAL — ${profile.name.toUpperCase()}`, '', '', '', '', ''],
      ['Fórmula exacta por fila: Patrimonio Neto = Valor Comercial - Deuda (sin valor absoluto)', '', '', '', '', ''],
      [],
      ['Categoría', 'Descripción del Rubro', 'Valor Comercial (COP)', 'Deuda (COP)', 'Patrimonio Neto (COP)', '% del Activo']
    ];

    const firstDataRow = 5; // 1-indexed Excel row
    pm.rows.forEach((row, i) => {
      const r = firstDataRow + i;
      const catMeta = D.PATRIMONIO_CATEGORIES.find(c => c.id === row.category) || D.PATRIMONIO_CATEGORIES[6];
      const pctAct = pm.totalActivos > 0 ? row.valor / pm.totalActivos : 0;
      patRows.push([
        catMeta.label,
        row.name,
        numCell(row.valor),
        numCell(row.deuda),
        formulaCell(`C${r}-D${r}`, row.neto),
        numCell(pctAct, PCT_FMT)
      ]);
    });

    const lastDataRow = firstDataRow + pm.rows.length - 1;
    const totalRowIdx = lastDataRow + 1;
    patRows.push([
      'TOTAL PATRIMONIO',
      '',
      formulaCell(`SUM(C${firstDataRow}:C${lastDataRow})`, pm.totalActivos),
      formulaCell(`SUM(D${firstDataRow}:D${lastDataRow})`, pm.totalDeudas),
      formulaCell(`C${totalRowIdx}-D${totalRowIdx}`, pm.patrimonioNeto),
      numCell(pm.totalActivos > 0 ? 1 : 0, PCT_FMT)
    ]);
    patRows.push([]);
    patRows.push(['Nivel de Endeudamiento (Deudas / Activos)', '', '', '', numCell(pm.debtRatioPct / 100, PCT_FMT), '']);
    patRows.push(['Participación Patrimonial Propia (Neto / Activos)', '', '', '', numCell(pm.equityRatioPct / 100, PCT_FMT), '']);

    const wsPat = XLSX.utils.aoa_to_sheet(patRows);
    wsPat['!cols'] = [
      { wch: 26 }, { wch: 34 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 15 }
    ];
    wsPat['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
    ];
    XLSX.utils.book_append_sheet(wb, wsPat, 'Patrimonio');

    // ------------------------------------------------------------------------
    // HOJA 4: "Consolidado Hogar" (si existe grupo familiar activo)
    // ------------------------------------------------------------------------
    if (activeGroup) {
      const cons = D.computeGroupConsolidated(activeGroup, state.profiles);
      if (cons) {
        const gm = cons.metrics;
        const gpm = cons.patrimonio;
        const grpRows = [
          [`CONSOLIDADO HOGAR — ${activeGroup.name.toUpperCase()}`, '', '', '', '', '', '', ''],
          [`Integrantes: ${cons.members.map(x => x.name).join(' + ')}`, `Fecha: ${today}`, `Score Hogar: ${gm.score}/100`, '', '', '', '', ''],
          [],
          ['RESUMEN CONSOLIDADO DEL HOGAR', 'MONTO (COP)', '% INGRESOS HOGAR'],
          ['Ingresos Totales del Hogar', numCell(gm.totalIncome), numCell(gm.totalIncome > 0 ? 1 : 0, PCT_FMT)],
          ['Egresos Totales del Hogar', numCell(gm.totalExpenses), numCell(gm.committedPct / 100, PCT_FMT)],
          ['Flujo Libre del Hogar', numCell(gm.freeCashFlow), numCell(gm.freePct / 100, PCT_FMT)],
          ['Activos Totales del Hogar', numCell(gpm.totalActivos), ''],
          ['Deudas Totales del Hogar', numCell(gpm.totalDeudas), numCell(gpm.debtRatioPct / 100, PCT_FMT)],
          ['Patrimonio Neto Real del Hogar', numCell(gpm.patrimonioNeto), numCell(gpm.equityRatioPct / 100, PCT_FMT)],
          [],
          ['APORTE PORCENTUAL POR INTEGRANTE'],
          ['Integrante', 'Cédula', 'Ingresos (COP)', '% Aporte Ing.', 'Egresos (COP)', '% Aporte Egr.', 'Flujo Libre (COP)', 'Patrimonio Neto (COP)']
        ];

        cons.members.forEach(mem => {
          grpRows.push([
            mem.name,
            D.formatCedulaDisplay(mem.cedula),
            numCell(mem.metrics.totalIncome),
            numCell(mem.incomeSharePct / 100, PCT_FMT),
            numCell(mem.metrics.totalExpenses),
            numCell(mem.expenseSharePct / 100, PCT_FMT),
            numCell(mem.metrics.freeCashFlow),
            numCell(mem.patrimonio.patrimonioNeto)
          ]);
        });

        grpRows.push([
          'TOTAL HOGAR',
          '',
          numCell(gm.totalIncome),
          numCell(gm.totalIncome > 0 ? 1 : 0, PCT_FMT),
          numCell(gm.totalExpenses),
          numCell(gm.totalExpenses > 0 ? 1 : 0, PCT_FMT),
          numCell(gm.freeCashFlow),
          numCell(gpm.patrimonioNeto)
        ]);

        grpRows.push([]);
        grpRows.push(['LOS 5 PILARES FINANCIEROS DEL HOGAR']);
        grpRows.push(['Pilar', 'Monto Hogar (COP)', '% Real Hogar', 'Condición', 'Meta %', 'Tope Meta (COP)', 'Estado']);
        gm.pillars.forEach(p => {
          grpRows.push([
            p.title,
            numCell(p.amount),
            numCell(p.realPct / 100, PCT_FMT),
            `${p.op} ${p.meta}%`,
            numCell(p.meta / 100, PCT_FMT),
            numCell(p.metaAmount),
            p.isGood ? 'ESTÁS BIEN' : 'DEBES MEJORAR'
          ]);
        });

        grpRows.push([]);
        grpRows.push(['DESGLOSE DE LAS 15 CATEGORÍAS POR INTEGRANTE']);
        grpRows.push([
          'Categoría',
          'Pilar',
          ...cons.members.map(mem => `${mem.name} (COP)`),
          'Total Hogar (COP)',
          '% Ing. Hogar'
        ]);

        cons.consolidatedData.categories.forEach(cat => {
          const pInfo = D.PILLAR_INFO[cat.pillar] || D.PILLAR_INFO.personales;
          const catSum = gm.catTotals[cat.id] || 0;
          const catShare = gm.totalIncome > 0 ? catSum / gm.totalIncome : 0;
          grpRows.push([
            cat.name,
            pInfo.label,
            ...cons.members.map(mem => numCell(mem.metrics.catTotals[cat.id] || 0)),
            numCell(catSum),
            numCell(catShare, PCT_FMT)
          ]);
        });

        grpRows.push([
          'TOTAL EGRESOS HOGAR',
          '',
          ...cons.members.map(mem => numCell(mem.metrics.totalExpenses)),
          numCell(gm.totalExpenses),
          numCell(gm.committedPct / 100, PCT_FMT)
        ]);

        const wsGroup = XLSX.utils.aoa_to_sheet(grpRows);
        wsGroup['!cols'] = [
          { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 16 },
          { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 22 }
        ];
        wsGroup['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
        XLSX.utils.book_append_sheet(wb, wsGroup, 'Consolidado Hogar');
      }
    }

    // ------------------------------------------------------------------------
    // HOJA 5: "Registro_Gastos_Diarios" (con fórmulas SUM y AVERAGE)
    // ------------------------------------------------------------------------
    const dailyCtx = getDailyContext();
    const dailyEntries = dailyCtx.entries;
    const catNameMap = {};
    data.categories.forEach(c => { catNameMap[c.id] = c.name; });

    const regRows = [
      [`CONTROL DIARIO — REGISTRO DE GASTOS (${dailyCtx.isGroup ? dailyCtx.groupName.toUpperCase() : profile.name.toUpperCase()})`, '', '', '', '', '', '', ''],
      [`Titular / Alcance: ${dailyCtx.isGroup ? dailyCtx.groupName : profile.name}`, `Fecha exportación: ${today}`, `Registros: ${dailyEntries.length}`, '', '', '', '', ''],
      [],
      ['#', 'Fecha', 'Mes', 'Categoría', 'Concepto / Detalle', 'Valor ($ COP)', 'Nota', 'Integrante']
    ];

    const regFirstRow = 5;
    dailyEntries.forEach((entry, idx) => {
      const mMeta = D.getMonthMeta(entry.month);
      regRows.push([
        idx + 1,
        entry.date || `${mMeta.full}`,
        mMeta.short,
        catNameMap[entry.categoryId] || 'OTROS GASTOS',
        entry.concept || '',
        numCell(entry.amount),
        entry.note || '',
        entry.ownerName || profile.name
      ]);
    });

    if (dailyEntries.length > 0) {
      const regLastRow = regFirstRow + dailyEntries.length - 1;
      const sumDaily = dailyEntries.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
      const avgDaily = sumDaily / dailyEntries.length;
      regRows.push([
        '',
        'TOTAL GASTOS DIARIOS',
        '',
        '',
        '',
        formulaCell(`SUM(F${regFirstRow}:F${regLastRow})`, sumDaily),
        '',
        ''
      ]);
      regRows.push([
        '',
        'PROMEDIO POR REGISTRO',
        '',
        '',
        '',
        formulaCell(`AVERAGE(F${regFirstRow}:F${regLastRow})`, avgDaily),
        '',
        ''
      ]);
    } else {
      regRows.push(['', 'Sin gastos diarios registrados aún', '', '', '', numCell(0), '', '']);
    }

    const wsDaily = XLSX.utils.aoa_to_sheet(regRows);
    wsDaily['!cols'] = [
      { wch: 6 }, { wch: 15 }, { wch: 10 }, { wch: 24 },
      { wch: 30 }, { wch: 20 }, { wch: 28 }, { wch: 18 }
    ];
    wsDaily['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Registro_Gastos_Diarios');

    // ------------------------------------------------------------------------
    // HOJA 6: "Promedios_Mensuales" (Matriz Ene-Dic con fórmulas SUM y AVERAGE)
    // ------------------------------------------------------------------------
    const dailyMatrix = D.computeDailyMatrix(dailyEntries, data.categories);
    const promRows = [
      [`MATRIZ DE CONSOLIDADO Y PROMEDIOS MENSUALES — ${dailyCtx.isGroup ? dailyCtx.groupName.toUpperCase() : profile.name.toUpperCase()}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['Fórmulas exactas: Total = SUM(Ene:Dic) | Meses Activos = COUNTIF(>0) | Promedio Mensual Real = Suma / Meses Activos | Promedio 12m = AVERAGE(Ene:Dic)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [],
      ['Categoría', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Total (COP)', 'Meses Activos', 'Promedio Mensual Real (COP)', 'Promedio 12 Meses (COP)']
    ];

    const matFirstRow = 5;
    dailyMatrix.rows.forEach((row, idx) => {
      const r = matFirstRow + idx;
      promRows.push([
        row.categoryName,
        ...row.months.map(v => numCell(v)),
        formulaCell(`SUM(B${r}:M${r})`, row.total),
        formulaCell(`COUNTIF(B${r}:M${r},">0")`, row.activeMonths, '0'),
        formulaCell(`IF(O${r}>0,N${r}/O${r},0)`, row.realMonthlyAvg),
        formulaCell(`AVERAGE(B${r}:M${r})`, row.annualAvg12)
      ]);
    });

    const matLastRow = matFirstRow + dailyMatrix.rows.length - 1;
    const matTotalRow = matLastRow + 1;
    const monthColLetters = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

    promRows.push([
      'TOTAL GENERAL POR MES',
      ...monthColLetters.map((col, mIdx) =>
        formulaCell(`SUM(${col}${matFirstRow}:${col}${matLastRow})`, dailyMatrix.grandMonths[mIdx])
      ),
      formulaCell(`SUM(N${matFirstRow}:N${matLastRow})`, dailyMatrix.grandTotal),
      formulaCell(`COUNTIF(B${matTotalRow}:M${matTotalRow},">0")`, dailyMatrix.grandActiveMonths, '0'),
      formulaCell(`IF(O${matTotalRow}>0,N${matTotalRow}/O${matTotalRow},0)`, dailyMatrix.grandRealMonthlyAvg),
      formulaCell(`AVERAGE(B${matTotalRow}:M${matTotalRow})`, dailyMatrix.grandAnnualAvg12)
    ]);

    promRows.push([
      'SUMA DE PROMEDIOS POR CATEGORÍA',
      '', '', '', '', '', '', '', '', '', '', '', '',
      '',
      '',
      formulaCell(`SUM(P${matFirstRow}:P${matLastRow})`, dailyMatrix.sumOfCategoryRealAvgs),
      formulaCell(`SUM(Q${matFirstRow}:Q${matLastRow})`, dailyMatrix.grandAnnualAvg12)
    ]);

    const wsProm = XLSX.utils.aoa_to_sheet(promRows);
    wsProm['!cols'] = [
      { wch: 24 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 22 }
    ];
    wsProm['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } }
    ];
    XLSX.utils.book_append_sheet(wb, wsProm, 'Promedios_Mensuales');

    const safeName = profile.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]+/g, '_');
    const filename = `Mis_Propias_Finanzas_${safeName}_${today}.xlsx`;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // En iOS (Safari / modo independiente), ofrecer hoja nativa de compartir (AirDrop a Mac / Archivos) con respaldo directo
    if (isIOS && !window.MPFElectron?.isElectron && typeof navigator.share === 'function' && typeof File === 'function') {
      try {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const xlsxFile = new File([wbout], filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        if (!navigator.canShare || navigator.canShare({ files: [xlsxFile] })) {
          navigator.share({
            files: [xlsxFile],
            title: filename
          }).then(() => {
            showToast(`Excel compartido: ${filename}`);
          }).catch((err) => {
            if (err && err.name === 'AbortError') return;
            XLSX.writeFile(wb, filename);
            showToast(`Excel exportado: ${filename}`);
          });
          return;
        }
      } catch (_) {
        // Fallback automático a descarga estándar abajo
      }
    }

    XLSX.writeFile(wb, filename);
    showToast(`Excel exportado: ${filename}`);
  }

  // ==========================================================================
  // 14. NAVEGACIÓN ENTRE VISTAS
  // ==========================================================================
  const TABS = ['dashboard', 'editor', 'daily', 'patrimonio', 'group', 'simulator'];

  function switchTab(tabId) {
    if (!TABS.includes(tabId)) tabId = 'dashboard';
    state.activeTab = tabId;
    hideTooltip();
    if (tabId !== 'daily') {
      stopActiveSpeech();
      disarmMacDictationMode();
    }

    TABS.forEach(id => {
      document.getElementById(`view-${id}`).classList.toggle('hidden', id !== tabId);
      const navBtn = document.getElementById(`nav-${id}`);
      if (navBtn) {
        navBtn.classList.toggle('active', id === tabId);
        navBtn.setAttribute('aria-current', id === tabId ? 'page' : 'false');
        if (id === tabId && window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
          navBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    });

    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches && window.scrollY > 120) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    saveState();
    renderActiveView();
  }

  function renderActiveView() {
    if (state.activeTab === 'dashboard') renderDashboard(true);
    else if (state.activeTab === 'editor') renderEditor();
    else if (state.activeTab === 'daily') renderDailyView();
    else if (state.activeTab === 'patrimonio') renderPatrimonio();
    else if (state.activeTab === 'group') renderGroupView(true);
    else if (state.activeTab === 'simulator') renderSimulator();
  }

  // ==========================================================================
  // 15. LISTENERS Y DELEGACIÓN DE EVENTOS
  // ==========================================================================
  function bindEvents() {
    // --- Pantalla de Login / Acceso ---
    document.getElementById('authLoginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('authFullName');
      const cedInput = document.getElementById('authCedula');
      const ok = registerOrLoginProfile(nameInput.value, cedInput.value);
      if (ok) {
        nameInput.value = '';
        cedInput.value = '';
      }
    });

    document.getElementById('authProfilesList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-login-cedula]');
      if (!btn) return;
      const ced = btn.getAttribute('data-login-cedula');
      const prof = state.profiles[ced];
      if (prof) enterAppWithProfile(ced, `Sesión activa: ${prof.name}`);
    });

    // --- Topbar: Navegación, Selector de Perfil, Exportar Excel y Restaurar ---
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    document.getElementById('btnGoEditor').addEventListener('click', () => switchTab('editor'));

    document.getElementById('profileSelect').addEventListener('change', (e) => {
      const ced = e.target.value;
      if (!state.profiles[ced]) return;
      state.activeCedula = ced;
      // Mantener coherencia de alcance en Control Diario si el nuevo perfil no pertenece al grupo activo
      const curGroup = getActiveGroup();
      if (state.dailyScope === 'group' && (!curGroup || !curGroup.memberCedulas.includes(ced))) {
        const matchingGroup = Object.values(state.groups).find(g => Array.isArray(g.memberCedulas) && g.memberCedulas.includes(ced));
        if (matchingGroup) state.activeGroupId = matchingGroup.id;
        else state.dailyScope = 'personal';
      }
      saveState();
      try { sessionStorage.setItem(D.SESSION_KEY, ced); } catch (_) {}
      renderProfileSwitcher();
      renderActiveView();
      showToast(`Perfil activo: ${state.profiles[ced].name}`);
    });

    document.getElementById('btnShowLogin').addEventListener('click', () => {
      try { sessionStorage.removeItem(D.SESSION_KEY); } catch (_) {}
      showAuthScreen();
    });

    document.getElementById('btnExportExcel').addEventListener('click', exportExcelWorkbook);
    const mobileExportBtn = document.getElementById('btnMobileExportExcel');
    if (mobileExportBtn) {
      mobileExportBtn.addEventListener('click', exportExcelWorkbook);
    }

    // --- Dialog: Crear Nuevo Perfil ---
    const dlgNewProfile = document.getElementById('dialogNewProfile');
    document.getElementById('btnNewProfile').addEventListener('click', () => {
      document.getElementById('inputNewProfileName').value = '';
      document.getElementById('inputNewProfileCedula').value = '';
      dlgNewProfile.showModal();
    });

    dlgNewProfile.addEventListener('close', () => {
      const action = dlgNewProfile.returnValue;
      dlgNewProfile.returnValue = '';
      if (action !== 'confirm') return;
      const name = document.getElementById('inputNewProfileName').value;
      const ced = document.getElementById('inputNewProfileCedula').value;
      registerOrLoginProfile(name, ced);
    });

    // --- Dialog: Restaurar Datos del Perfil Activo ---
    const dlgRestore = document.getElementById('dialogRestore');
    document.getElementById('btnRestore').addEventListener('click', () => {
      const prof = getActiveProfile();
      const desc = document.getElementById('dlgRestoreText');
      if (prof.preset === 'daniel') {
        desc.textContent = 'Se restaurarán los datos auditados de Daniel: Ingresos $ 7.993.559, Egresos $ 7.524.090,33, Patrimonio Neto Real $ 116.346.650 y metas 15% / 40% / 20% / 35% / 10%.';
      } else if (prof.preset === 'daniela') {
        desc.textContent = 'Se restaurarán los datos auditados de Daniela: Ingresos $ 8.740.000, Egresos $ 7.830.500, Flujo Libre $ 909.500 y metas 15% / 40% / 20% / 35% / 10%.';
      } else {
        desc.textContent = `Se restablecerá el perfil "${prof.name}" a la plantilla limpia de 12 ingresos, 15 categorías (102 variables) y patrimonio en $ 0.`;
      }
      dlgRestore.showModal();
    });

    dlgRestore.addEventListener('close', () => {
      const action = dlgRestore.returnValue;
      dlgRestore.returnValue = '';
      if (action !== 'confirm') return;
      const prof = getActiveProfile();
      if (prof.preset === 'daniel') {
        prof.data = D.createDanielFinancialData();
        prof.patrimonio = D.createDanielPatrimonioData();
      } else if (prof.preset === 'daniela') {
        prof.data = D.createDanielaFinancialData();
        prof.patrimonio = D.createEmptyPatrimonioData();
      } else {
        prof.data = D.createEmptyFinancialData();
        prof.patrimonio = D.createEmptyPatrimonioData();
      }
      saveState();
      renderActiveView();
      showToast(`Datos base de ${prof.name} restaurados`);
    });

    // --- Dashboard: Restaurar metas + Sliders de 5 Pilares + Hover Dona ---
    document.getElementById('btnRestoreTargets').addEventListener('click', () => {
      getCurrentData().targets = { ...D.DEFAULT_TARGETS };
      saveState();
      renderDashboard(true);
      showToast('Metas restauradas: 15% / 40% / 20% / 35% / 10%');
    });

    document.getElementById('pillarsGrid').addEventListener('input', (e) => {
      const el = e.target.closest('[data-pillar-input]');
      if (!el) return;
      const pillarId = el.getAttribute('data-pillar-input');
      const source = el.getAttribute('data-source');
      let val = parseFloat(el.value);
      if (!Number.isFinite(val)) val = 1;
      val = Math.max(1, Math.min(100, val));

      getCurrentData().targets[pillarId] = val;
      if (source === 'range') {
        const numEl = document.getElementById(`pnum-${pillarId}`);
        if (numEl) numEl.value = val;
      } else {
        const rangeEl = document.getElementById(`prange-${pillarId}`);
        if (rangeEl) rangeEl.value = Math.min(70, Math.max(1, val));
      }
      saveState();
      renderDashboard(false);
    });

    document.getElementById('view-dashboard').addEventListener('mouseover', (e) => {
      const item = e.target.closest('[data-donut-cat]');
      if (item) setDonutHighlight(item.getAttribute('data-donut-cat'));
    });

    document.getElementById('view-dashboard').addEventListener('mouseout', (e) => {
      const item = e.target.closest('[data-donut-cat]');
      if (!item) return;
      const next = e.relatedTarget ? e.relatedTarget.closest('[data-donut-cat]') : null;
      if (!next) setDonutHighlight(null);
    });

    // --- Editor de Variables ---
    document.getElementById('editorSearchInput').addEventListener('input', renderEditorCategories);

    document.getElementById('btnFilterActive').addEventListener('click', () => {
      state.onlyActiveVars = !state.onlyActiveVars;
      saveState();
      renderEditorCategories();
    });

    document.getElementById('btnExpandAll').addEventListener('click', () => {
      const data = getCurrentData();
      data.incomesExpanded = true;
      data.categories.forEach(c => { c.expanded = true; });
      saveState();
      renderEditor();
    });

    document.getElementById('btnCollapseAll').addEventListener('click', () => {
      const data = getCurrentData();
      data.incomesExpanded = false;
      data.categories.forEach(c => { c.expanded = false; });
      saveState();
      renderEditor();
    });

    document.getElementById('view-editor').addEventListener('click', (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.getAttribute('data-action');
      const data = getCurrentData();

      if (action === 'add-income') {
        e.stopPropagation();
        data.incomesExpanded = true;
        data.incomes.push({
          id: `inc-${Date.now()}`,
          name: `Ingresos mensuales ${data.incomes.length + 1}`,
          amount: 0,
          note: ''
        });
        saveState();
        renderEditorIncomes();
        showToast('Nueva fuente de ingreso agregada');
        return;
      }

      if (action === 'toggle-incomes') {
        data.incomesExpanded = data.incomesExpanded === false;
        saveState();
        renderEditorIncomes();
        return;
      }

      if (action === 'del-income') {
        const idx = Number(actionEl.getAttribute('data-idx'));
        data.incomes.splice(idx, 1);
        saveState();
        renderEditor();
        showToast('Ingreso eliminado');
        return;
      }

      if (action === 'add-var') {
        e.stopPropagation();
        const catIdx = Number(actionEl.getAttribute('data-cat-idx'));
        const cat = data.categories[catIdx];
        cat.expanded = true;
        cat.items.push({
          id: `${cat.id}-${Date.now()}`,
          name: 'Nueva variable',
          amount: 0,
          note: ''
        });
        saveState();
        renderEditorCategories();
        showToast(`Variable agregada en ${cat.name}`);
        return;
      }

      if (action === 'toggle-cat') {
        const catIdx = Number(actionEl.getAttribute('data-cat-idx'));
        data.categories[catIdx].expanded = !data.categories[catIdx].expanded;
        saveState();
        renderEditorCategories();
        return;
      }

      if (action === 'del-var') {
        const catIdx = Number(actionEl.getAttribute('data-cat-idx'));
        const itemIdx = Number(actionEl.getAttribute('data-item-idx'));
        data.categories[catIdx].items.splice(itemIdx, 1);
        saveState();
        renderEditorCategories();
        showToast('Variable eliminada');
      }
    });

    document.getElementById('view-editor').addEventListener('input', (e) => {
      const el = e.target.closest('[data-edit-type]');
      if (!el) return;
      const type = el.getAttribute('data-edit-type');
      const field = el.getAttribute('data-field');
      const data = getCurrentData();

      if (type === 'income') {
        const idx = Number(el.getAttribute('data-idx'));
        if (field === 'amount') {
          const num = parseFloat(el.value);
          data.incomes[idx].amount = Number.isFinite(num) ? num : 0;
          el.classList.toggle('is-zero', data.incomes[idx].amount === 0);
        } else {
          data.incomes[idx][field] = el.value;
        }
      } else if (type === 'expense') {
        const catIdx = Number(el.getAttribute('data-cat-idx'));
        const itemIdx = Number(el.getAttribute('data-item-idx'));
        if (field === 'amount') {
          const num = parseFloat(el.value);
          data.categories[catIdx].items[itemIdx].amount = Number.isFinite(num) ? num : 0;
          el.classList.toggle('is-zero', data.categories[catIdx].items[itemIdx].amount === 0);
        } else {
          data.categories[catIdx].items[itemIdx][field] = el.value;
        }
      }

      saveState();
      updateEditorLiveSummary();
    });

    // --- Control Diario (Tipo Excel): Ingreso Rápido, Voz, Tabla Editable, Ordenamiento, Matriz y Sync ---
    document.getElementById('dailyScopeToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-daily-scope]');
      if (!btn || btn.disabled) return;
      state.dailyScope = btn.getAttribute('data-daily-scope');
      saveState();
      renderDailyView();
    });

    const submitDailyQuickBar = () => {
      const inp = document.getElementById('dailyQuickInput');
      const wasDeleteArmed = armedMacDictationMode === 'delete';
      const wasArmed = Boolean(armedMacDictationMode);
      disarmMacDictationMode();
      processDailyCommand(inp.value, { forceDeleteMode: wasDeleteArmed, fromVoice: wasArmed });
    };

    document.getElementById('btnDailyQuickSubmit').addEventListener('click', submitDailyQuickBar);

    const dailyQuickInputEl = document.getElementById('dailyQuickInput');
    dailyQuickInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitDailyQuickBar();
      } else if (e.key === 'Escape' && armedMacDictationMode) {
        disarmMacDictationMode();
        setDailyVoiceStatus('Modo dictado macOS cancelado.', '');
      }
    });
    dailyQuickInputEl.addEventListener('input', handleMacDictationLiveInput);
    dailyQuickInputEl.addEventListener('compositionend', handleMacDictationLiveInput);

    document.getElementById('btnVoiceAdd').addEventListener('click', () => startVoiceRecognition('add'));
    document.getElementById('btnVoiceDelete').addEventListener('click', () => startVoiceRecognition('delete'));

    document.getElementById('btnVoiceRetryMic').addEventListener('click', () => {
      startVoiceRecognition(lastVoiceMode || 'add', 'es-CO');
    });
    document.getElementById('btnVoiceMacDictationAdd').addEventListener('click', () => {
      armMacDictationMode('add');
    });
    document.getElementById('btnVoiceMacDictationDel').addEventListener('click', () => {
      armMacDictationMode('delete');
    });
    document.getElementById('btnVoiceCancelDictation').addEventListener('click', () => {
      disarmMacDictationMode();
      setDailyVoiceStatus('Dictado macOS finalizado. Puedes seguir usando la barra fx o el micrófono.', '');
    });
    document.getElementById('btnVoiceOpenSettings').addEventListener('click', () => {
      if (window.MPFElectron && typeof window.MPFElectron.openMicPrivacySettings === 'function') {
        window.MPFElectron.openMicPrivacySettings();
      }
    });
    document.getElementById('btnVoiceOpenSpeechSettings').addEventListener('click', () => {
      if (window.MPFElectron && typeof window.MPFElectron.openSpeechPrivacySettings === 'function') {
        window.MPFElectron.openSpeechPrivacySettings();
      }
    });
    document.getElementById('btnVoiceStopNow').addEventListener('click', () => {
      stopElectronAudioCapture(false);
    });

    document.getElementById('btnDailyUndoBanner').addEventListener('click', performDailyUndo);
    document.getElementById('btnDailyUndoToolbar').addEventListener('click', performDailyUndo);
    document.getElementById('btnDailyUndoDismiss').addEventListener('click', hideDailyUndoBanner);

    document.getElementById('dailyFilterMonth').addEventListener('change', (e) => {
      state.dailyFilterMonth = e.target.value;
      saveState();
      renderDailyView();
    });

    document.getElementById('dailyFilterCategory').addEventListener('change', (e) => {
      state.dailyFilterCategory = e.target.value;
      saveState();
      renderDailyView();
    });

    document.getElementById('dailyFilterSearch').addEventListener('input', renderDailyView);

    document.getElementById('btnDailyClearFilters').addEventListener('click', () => {
      state.dailyFilterMonth = 'all';
      state.dailyFilterCategory = 'all';
      const s = document.getElementById('dailyFilterSearch');
      if (s) s.value = '';
      saveState();
      renderDailyView();
    });

    document.getElementById('chkMatrixOnlyActive').addEventListener('change', () => {
      updateDailyKpisAndMatrix();
    });

    document.getElementById('btnDailyAddRow').addEventListener('click', () => {
      const prof = getActiveProfile();
      const list = ensureDailyArray(prof);
      const defaultMonth = (state.dailyFilterMonth && state.dailyFilterMonth !== 'all')
        ? Number(state.dailyFilterMonth)
        : (new Date().getMonth() + 1);
      const defaultCat = (state.dailyFilterCategory && state.dailyFilterCategory !== 'all')
        ? state.dailyFilterCategory
        : 'alimentacion';
      const todayIso = new Date().toISOString().slice(0, 10);
      const entry = {
        id: `dx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: defaultMonth === (new Date().getMonth() + 1) ? todayIso : '',
        month: defaultMonth,
        categoryId: defaultCat,
        concept: '',
        amount: 0,
        note: '',
        createdAt: Date.now()
      };
      list.push(entry);
      lastAddedDailyId = entry.id;
      saveState();
      renderDailyView();
      const newRowInput = document.querySelector(`tr[data-entry-id="${entry.id}"] input[data-daily-field="concept"]`);
      if (newRowInput) newRowInput.focus();
    });

    // Edición en línea celda por celda con guardado automático y actualización viva de la matriz
    const handleDailyCellMutation = (el) => {
      const tr = el.closest('tr[data-entry-id]');
      if (!tr) return;
      const entryId = tr.dataset.entryId;
      const ownerCed = tr.dataset.ownerCedula;
      const field = el.getAttribute('data-daily-field');
      const ref = findEntryRef(ownerCed, entryId);
      if (!ref) return;

      const td = el.closest('td');
      const catMap = {};
      getCurrentData().categories.forEach(c => { catMap[c.id] = c; });

      if (field === 'amount') {
        const num = parseFloat(el.value);
        ref.entry.amount = Number.isFinite(num) && num >= 0 ? num : 0;
        el.classList.toggle('is-zero', ref.entry.amount === 0);
        if (td) td.dataset.value = String(ref.entry.amount);
      } else if (field === 'month') {
        const mNum = Math.max(1, Math.min(12, Number(el.value) || 1));
        ref.entry.month = mNum;
        if (ref.entry.date && /^\d{4}-\d{2}-\d{2}$/.test(ref.entry.date)) {
          const yr = Number(ref.entry.date.slice(0, 4)) || new Date().getFullYear();
          const origDay = Number(ref.entry.date.slice(8, 10)) || 1;
          const maxDay = new Date(yr, mNum, 0).getDate();
          const clampedDay = Math.min(origDay, maxDay);
          ref.entry.date = `${yr}-${String(mNum).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
          const dateInp = tr.querySelector('input[data-daily-field="date"]');
          if (dateInp) dateInp.value = ref.entry.date;
        }
        if (td) td.dataset.value = String(getDateSortValue(ref.entry));
      } else if (field === 'date') {
        ref.entry.date = el.value || '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(ref.entry.date)) {
          const mNum = Math.max(1, Math.min(12, Number(ref.entry.date.slice(5, 7)) || 1));
          ref.entry.month = mNum;
          const mSel = tr.querySelector('select[data-daily-field="month"]');
          if (mSel) mSel.value = String(mNum);
        }
        if (td) td.dataset.value = String(getDateSortValue(ref.entry));
      } else if (field === 'categoryId') {
        ref.entry.categoryId = el.value;
        const catObj = catMap[el.value];
        const dot = tr.querySelector('[data-cat-dot]');
        if (dot && catObj) dot.style.background = catObj.color;
        if (td && catObj) td.dataset.value = catObj.name;
      } else if (field === 'concept' || field === 'note') {
        ref.entry[field] = el.value;
        if (td) td.dataset.value = el.value;
      }

      // Actualizar copia en lastRenderedDailyRows para que subtotal y comandos de voz reflejen el cambio vivo
      const visMatch = lastRenderedDailyRows.find(r => r.id === entryId && r.ownerCedula === ownerCed);
      if (visMatch) Object.assign(visMatch, ref.entry);

      saveState();
      updateDailyKpisAndMatrix();
    };

    const dailyTbody = document.getElementById('dailyTableBody');
    dailyTbody.addEventListener('input', (e) => {
      const el = e.target.closest('[data-daily-field]');
      if (!el || el.tagName === 'SELECT') return;
      handleDailyCellMutation(el);
    });

    dailyTbody.addEventListener('change', (e) => {
      const el = e.target.closest('[data-daily-field]');
      if (!el) return;
      handleDailyCellMutation(el);
    });

    // Navegación tipo Excel con Enter (baja a la misma columna de la siguiente fila)
    dailyTbody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const el = e.target.closest('[data-daily-field]');
      if (!el) return;
      e.preventDefault();
      const field = el.getAttribute('data-daily-field');
      const nextTr = el.closest('tr')?.nextElementSibling;
      const nextInput = nextTr?.querySelector(`[data-daily-field="${field}"]`);
      if (nextInput) nextInput.focus();
      else el.blur();
    });

    // Eliminación manual por fila con soporte Undo
    dailyTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-daily-action="delete-row"]');
      if (!btn) return;
      const tr = btn.closest('tr[data-entry-id]');
      if (!tr) return;
      const rowNum = Number(tr.cells[0]?.textContent) || 1;
      executeDailyDeletePlan({
        actionType: 'delete-row',
        field: null,
        ownerCedula: tr.dataset.ownerCedula,
        entryId: tr.dataset.entryId,
        rowNum
      });
    });

    // Ordenamiento por columna mediante Invoker Commands + fallback feature-detected
    const dailyTable = document.getElementById('dailyExpensesTable');
    dailyTable.addEventListener('command', (event) => {
      if (event.command === '--sort') sortDailyTableBy(event.source);
    });
    if (!('commandForElement' in HTMLButtonElement.prototype)) {
      dailyTable.tHead.querySelectorAll('button[command="--sort"]').forEach(btn => {
        btn.addEventListener('click', () => sortDailyTableBy(btn));
      });
    }

    // Sincronización con el Modelo Principal (Punto 5)
    document.getElementById('btnDailySyncModelTop').addEventListener('click', openDailySyncDialog);
    document.getElementById('btnDailySyncModelMatrix').addEventListener('click', openDailySyncDialog);

    const dlgDailySync = document.getElementById('dialogDailySync');
    dlgDailySync.addEventListener('close', () => {
      const action = dlgDailySync.returnValue;
      dlgDailySync.returnValue = '';
      if (action === 'confirm') applyDailySyncSelection();
    });

    // Confirmación rápida de borrado por voz (cuando el usuario activa el check)
    const dlgVoiceDel = document.getElementById('dialogVoiceDeleteConfirm');
    dlgVoiceDel.addEventListener('close', () => {
      const action = dlgVoiceDel.returnValue;
      dlgVoiceDel.returnValue = '';
      const plan = pendingVoiceDeleteAction;
      pendingVoiceDeleteAction = null;
      if (action === 'confirm' && plan) executeDailyDeletePlan(plan);
    });

    // Atajo Ctrl+Z / Cmd+Z en Control Diario para deshacer último borrado/sync
    document.addEventListener('keydown', (e) => {
      if (state.activeTab !== 'daily') return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (dailyUndoStack.length > 0) {
          e.preventDefault();
          performDailyUndo();
        }
      }
    });

    // --- Módulo de Patrimonio ---
    document.getElementById('patScopeToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pat-scope]');
      if (!btn || btn.disabled) return;
      state.patrimonioScope = btn.getAttribute('data-pat-scope');
      saveState();
      renderPatrimonio();
    });

    document.getElementById('patFilterChips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pat-filter]');
      if (!btn) return;
      state.patrimonioCategoryFilter = btn.getAttribute('data-pat-filter');
      saveState();
      renderPatrimonio();
    });

    document.getElementById('btnAddPatrimonioRow').addEventListener('click', () => {
      const prof = getActiveProfile();
      const cat = (state.patrimonioCategoryFilter !== 'all' && state.patrimonioCategoryFilter !== 'active')
        ? state.patrimonioCategoryFilter
        : 'efectivo';
      prof.patrimonio.push({
        id: `pat-${Date.now()}`,
        category: cat,
        name: 'Nuevo rubro patrimonial',
        valor: 0,
        deuda: 0
      });
      if (state.patrimonioCategoryFilter === 'active') state.patrimonioCategoryFilter = 'all';
      saveState();
      renderPatrimonio();
      showToast('Nuevo rubro patrimonial agregado');
    });

    document.getElementById('patTableBody').addEventListener('input', (e) => {
      const el = e.target.closest('[data-pat-idx]');
      if (!el) return;
      const idx = Number(el.getAttribute('data-pat-idx'));
      const field = el.getAttribute('data-pat-field');
      const row = getActiveProfile().patrimonio[idx];
      if (!row) return;

      if (field === 'valor' || field === 'deuda') {
        const num = parseFloat(el.value);
        row[field] = Number.isFinite(num) ? num : 0;
        el.classList.toggle('is-zero', row[field] === 0);
      } else {
        row[field] = el.value;
      }

      saveState();
      updatePatrimonioLiveAfterEdit();
    });

    document.getElementById('patTableBody').addEventListener('change', (e) => {
      const el = e.target.closest('select[data-pat-field="category"]');
      if (!el) return;
      const idx = Number(el.getAttribute('data-pat-idx'));
      const row = getActiveProfile().patrimonio[idx];
      if (!row) return;
      row.category = el.value;
      saveState();
      renderPatrimonio();
    });

    document.getElementById('patTableBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="del-pat-row"]');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-pat-idx'));
      getActiveProfile().patrimonio.splice(idx, 1);
      saveState();
      renderPatrimonio();
      showToast('Rubro patrimonial eliminado');
    });

    // --- Grupos Familiares ("Gastos del Hogar") ---
    document.getElementById('groupSelect').addEventListener('change', (e) => {
      const id = e.target.value;
      if (!state.groups[id]) return;
      state.activeGroupId = id;
      saveState();
      renderGroupView(true);
    });

    const dlgNewGroup = document.getElementById('dialogNewGroup');
    const openNewGroupDialog = () => {
      document.getElementById('inputNewGroupName').value = '';
      document.getElementById('inputNewGroupExtraCedulas').value = '';
      const list = document.getElementById('newGroupMembersChecklist');
      const profiles = Object.values(state.profiles);
      list.innerHTML = profiles.map(p => `
        <label class="check-member-row">
          <span class="check-member-left">
            <input type="checkbox" value="${D.escapeAttr(p.cedula)}" ${p.cedula === state.activeCedula ? 'checked' : ''} />
            <span class="dot" style="background:${p.color};"></span>
            <span style="font-size:13px; font-weight:700; color:#fff;">${D.escapeAttr(p.name)}</span>
          </span>
          <span class="mono" style="font-size:11.5px; color:var(--text-secondary);">C.C. ${D.formatCedulaDisplay(p.cedula)}</span>
        </label>
      `).join('');
      dlgNewGroup.showModal();
    };

    document.getElementById('btnNewGroup').addEventListener('click', openNewGroupDialog);
    document.getElementById('btnNewGroupEmpty').addEventListener('click', openNewGroupDialog);

    dlgNewGroup.addEventListener('close', () => {
      const action = dlgNewGroup.returnValue;
      dlgNewGroup.returnValue = '';
      if (action !== 'confirm') return;

      const name = document.getElementById('inputNewGroupName').value.trim();
      if (!name) {
        showToast('Ingresa un nombre para el grupo familiar', 'var(--rose)');
        return;
      }

      const selectedSet = new Set();
      document.querySelectorAll('#newGroupMembersChecklist input[type="checkbox"]:checked').forEach(cb => {
        selectedSet.add(cb.value);
      });

      const extraRaw = document.getElementById('inputNewGroupExtraCedulas').value.trim();
      if (extraRaw) {
        extraRaw.split(/[,;\s]+/).forEach(token => {
          const clean = D.normalizeCedula(token);
          if (clean && state.profiles[clean]) selectedSet.add(clean);
        });
      }

      const memberCedulas = Array.from(selectedSet);
      if (memberCedulas.length < 2) {
        showToast('Selecciona o vincula al menos 2 perfiles registrados por cédula', 'var(--rose)');
        return;
      }

      const id = `grp-${Date.now()}`;
      state.groups[id] = {
        id,
        name,
        memberCedulas,
        targets: { ...D.DEFAULT_TARGETS },
        createdAt: new Date().toISOString().slice(0, 10)
      };
      state.activeGroupId = id;
      saveState();
      renderGroupView(true);
      showToast(`Grupo "${name}" creado con ${memberCedulas.length} integrantes`);
    });

    const dlgAddMember = document.getElementById('dialogAddMember');
    document.getElementById('btnAddMember').addEventListener('click', () => {
      const activeGroup = getActiveGroup();
      if (!activeGroup) return;
      const inp = document.getElementById('inputMemberCedula');
      inp.value = '';
      const dl = document.getElementById('registeredCedulasList');
      dl.innerHTML = Object.values(state.profiles)
        .filter(p => !activeGroup.memberCedulas.includes(p.cedula))
        .map(p => `<option value="${D.escapeAttr(p.cedula)}">${D.escapeAttr(p.name)} — C.C. ${D.formatCedulaDisplay(p.cedula)}</option>`)
        .join('');
      dlgAddMember.showModal();
    });

    dlgAddMember.addEventListener('close', () => {
      const action = dlgAddMember.returnValue;
      dlgAddMember.returnValue = '';
      if (action !== 'confirm') return;

      const activeGroup = getActiveGroup();
      if (!activeGroup) return;

      const ced = D.normalizeCedula(document.getElementById('inputMemberCedula').value);
      if (!ced || !state.profiles[ced]) {
        showToast('No existe un perfil registrado con esa cédula. Créalo primero en "+ Perfil".', 'var(--rose)');
        return;
      }
      if (activeGroup.memberCedulas.includes(ced)) {
        showToast(`${state.profiles[ced].name} ya hace parte de este grupo`, 'var(--amber)');
        return;
      }

      activeGroup.memberCedulas.push(ced);
      saveState();
      renderGroupView(true);
      showToast(`${state.profiles[ced].name} vinculado(a) a "${activeGroup.name}"`);
    });

    document.getElementById('btnDeleteGroup').addEventListener('click', () => {
      const activeGroup = getActiveGroup();
      if (!activeGroup) return;
      const name = activeGroup.name;
      delete state.groups[activeGroup.id];
      const remaining = Object.keys(state.groups);
      state.activeGroupId = remaining[0] || null;
      saveState();
      renderGroupView(true);
      showToast(`Grupo "${name}" eliminado`, 'var(--rose)');
    });

    document.getElementById('groupMemberTags').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="remove-group-member"]');
      if (!btn) return;
      const ced = btn.getAttribute('data-cedula');
      const activeGroup = getActiveGroup();
      if (!activeGroup || activeGroup.memberCedulas.length <= 1) return;
      activeGroup.memberCedulas = activeGroup.memberCedulas.filter(c => c !== ced);
      saveState();
      renderGroupView(true);
      showToast('Integrante desvinculado del grupo');
    });

    document.getElementById('btnRestoreGroupTargets').addEventListener('click', () => {
      const activeGroup = getActiveGroup();
      if (!activeGroup) return;
      activeGroup.targets = { ...D.DEFAULT_TARGETS };
      saveState();
      renderGroupView(true);
      showToast('Metas del hogar restauradas: 15% / 40% / 20% / 35% / 10%');
    });

    document.getElementById('groupPillarsGrid').addEventListener('input', (e) => {
      const el = e.target.closest('[data-pillar-input]');
      if (!el) return;
      const activeGroup = getActiveGroup();
      if (!activeGroup) return;
      const pillarId = el.getAttribute('data-pillar-input');
      const source = el.getAttribute('data-source');
      let val = parseFloat(el.value);
      if (!Number.isFinite(val)) val = 1;
      val = Math.max(1, Math.min(100, val));

      if (!activeGroup.targets) activeGroup.targets = { ...D.DEFAULT_TARGETS };
      activeGroup.targets[pillarId] = val;

      if (source === 'range') {
        const numEl = document.getElementById(`gpnum-${pillarId}`);
        if (numEl) numEl.value = val;
      } else {
        const rangeEl = document.getElementById(`gprange-${pillarId}`);
        if (rangeEl) rangeEl.value = Math.min(70, Math.max(1, val));
      }
      saveState();
      renderGroupView(false);
    });

    // --- Simulador What-If ---
    const monthlyInputEl = document.getElementById('simKpiMonthlyInput');
    const monthlyRangeEl = document.getElementById('simKpiMonthlyRange');

    monthlyRangeEl.addEventListener('input', () => {
      const val = Math.max(0, Math.min(10000000, Number(monthlyRangeEl.value) || 0));
      simManualMonthly = val;
      monthlyInputEl.value = formatCOPNumberOnly(val);
      renderSimulator();
    });

    monthlyInputEl.addEventListener('focus', () => {
      const val = parseSimMonthlyInput(monthlyInputEl.value);
      monthlyInputEl.value = val === 0 ? '' : String(Math.round(val * 100) / 100).replace('.', ',');
      if (typeof monthlyInputEl.select === 'function') monthlyInputEl.select();
    });

    monthlyInputEl.addEventListener('input', () => {
      const val = parseSimMonthlyInput(monthlyInputEl.value);
      simManualMonthly = val;
      monthlyRangeEl.value = Math.min(10000000, Math.max(0, Math.round(val)));
      renderSimulator();
    });

    monthlyInputEl.addEventListener('blur', () => {
      const val = parseSimMonthlyInput(monthlyInputEl.value);
      if (simManualMonthly !== null) simManualMonthly = val;
      monthlyInputEl.value = formatCOPNumberOnly(val);
      renderSimulator();
    });

    document.getElementById('btnSimMonthlyAuto').addEventListener('click', () => {
      simManualMonthly = null;
      renderSimulator();
      showToast('Nuevo Ahorro Mensual en modo automático');
    });

    const syncSimPair = (rangeId, numId, maxNum, resetsManual = false) => {
      const rangeEl = document.getElementById(rangeId);
      const numEl = document.getElementById(numId);
      const rangeMax = Number(rangeEl.max) || maxNum;

      rangeEl.addEventListener('input', () => {
        if (resetsManual) simManualMonthly = null;
        numEl.value = rangeEl.value;
        renderSimulator();
      });

      numEl.addEventListener('input', () => {
        if (resetsManual) simManualMonthly = null;
        let v = parseFloat(numEl.value);
        if (!Number.isFinite(v) || v < 0) v = 0;
        if (v > maxNum) {
          v = maxNum;
          numEl.value = maxNum;
        }
        rangeEl.value = Math.min(rangeMax, v);
        renderSimulator();
      });
    };

    syncSimPair('simCutAmt', 'simCutAmtNum', 10000000, true);
    syncSimPair('simExtraMonthly', 'simExtraMonthlyNum', 10000000, true);
    syncSimPair('simInitCap', 'simInitCapNum', 1000000000, false);
    syncSimPair('simAnnualBonus', 'simAnnualBonusNum', 100000000, false);

    document.getElementById('simFreePct').addEventListener('input', () => {
      simManualMonthly = null;
      renderSimulator();
    });

    ['simEscalation', 'simRateEA', 'simInflation', 'simYears'].forEach(id => {
      document.getElementById(id).addEventListener('input', renderSimulator);
    });

    document.getElementById('btnUseLiquidPat').addEventListener('click', () => {
      const pm = D.computePatrimonioMetrics(getActiveProfile().patrimonio);
      const liquid = Math.max(0,
        (pm.byCategory.efectivo ? pm.byCategory.efectivo.activos : 0) +
        (pm.byCategory.inversiones ? pm.byCategory.inversiones.activos : 0)
      );
      document.getElementById('simInitCapNum').value = liquid;
      document.getElementById('simInitCap').value = Math.min(200000000, liquid);
      renderSimulator();
      showToast(`Capital inicial cargado desde Patrimonio líquido: ${D.formatCOP(liquid)}`);
    });

    document.getElementById('btnResetSim').addEventListener('click', () => {
      simManualMonthly = null;
      document.getElementById('simFreePct').value = 100;
      document.getElementById('simCutAmt').value = 300000;
      document.getElementById('simCutAmtNum').value = 300000;
      document.getElementById('simExtraMonthly').value = 0;
      document.getElementById('simExtraMonthlyNum').value = 0;
      document.getElementById('simInitCap').value = 0;
      document.getElementById('simInitCapNum').value = 0;
      document.getElementById('simAnnualBonus').value = 0;
      document.getElementById('simAnnualBonusNum').value = 0;
      document.getElementById('simEscalation').value = 0;
      document.getElementById('simRateEA').value = 11;
      document.getElementById('simInflation').value = 5;
      document.getElementById('simYears').value = 5;
      renderSimulator();
      showToast('Simulador reiniciado');
    });
  }

  // ==========================================================================
  // 16. INICIALIZACIÓN
  // ==========================================================================
  function init() {
    loadState();
    saveState();
    setupDialogLightDismissFallback();
    bindEvents();

    let sessionCedula = null;
    try {
      sessionCedula = sessionStorage.getItem(D.SESSION_KEY);
    } catch (_) {}

    if (sessionCedula && state.profiles[sessionCedula]) {
      enterAppWithProfile(sessionCedula);
    } else {
      showAuthScreen();
    }

    // Registrar Service Worker solo en orígenes seguros (HTTPS / localhost) fuera de Electron
    if (
      'serviceWorker' in navigator &&
      !window.MPFElectron?.isElectron &&
      (window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1')
    ) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  init();
})();

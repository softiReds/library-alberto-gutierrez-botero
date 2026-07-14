/* =====================================================================
   Panel Admin — Reportes (js)
   GET /site-visits, GET /reports/catalog y GET /reports/attendance,
   vía apiFetch. Módulo de solo lectura: no crea ni edita nada, solo
   visualiza lo que ya existe en los demás módulos.
   ===================================================================== */
(function () {
  'use strict';

  const token = window.BAGBAuth && window.BAGBAuth.getToken();
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const AGE_RANGE_ORDER = ['0-5', '6-15', '16-30', '31-50', '51-99'];

  const COLORS = {
    purple: '#4A1942',
    orange: '#F4791E',
    green: '#1E8E3E',
    pink: '#E14F82',
    blue: '#3E6FE0',
  };
  const GENDER_COLORS = { Femenino: COLORS.pink, Masculino: COLORS.blue };
  const FALLBACK_COLORS = [COLORS.orange, COLORS.purple, COLORS.green];

  /* ============ API — apiFetch agrega el token y parsea errores ============ */

  const api = {
    async siteVisits() {
      return window.BAGBApi.apiFetch('/site-visits');
    },
    async catalogReport(month, year) {
      return window.BAGBApi.apiFetch(`/reports/catalog?month=${month}&year=${year}`);
    },
    async attendanceReport(month, year) {
      return window.BAGBApi.apiFetch(`/reports/attendance?month=${month}&year=${year}`);
    }
  };

  /* ============ Utilidades ============ */

  function niceCeiling(value) {
    if (value <= 0) return 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const steps = [1, 2, 2.5, 5, 10];
    for (const step of steps) {
      const candidate = step * magnitude;
      if (candidate >= value) return candidate;
    }
    return Math.ceil(value / magnitude) * magnitude;
  }

  function formatNow() {
    const now = new Date();
    const day = now.getDate();
    const month = MONTHS_LONG[now.getMonth()].toLowerCase();
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12; if (hours === 0) hours = 12;
    return `${day} de ${month} de ${year} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  }

  /* ============ Selects de mes / año ============ */

  function buildRecentMonthOptions(count) {
    const now = new Date();
    const options = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      options.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTHS_LONG[m - 1]} ${y}` });
    }
    return options;
  }

  function buildRecentYears(count) {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 0; i < count; i++) years.push(currentYear - i);
    return years;
  }

  function fillMonthSelect(selectEl) {
    selectEl.innerHTML = '';
    buildRecentMonthOptions(12).forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      selectEl.appendChild(el);
    });
    selectEl.selectedIndex = 0;
  }

  function fillYearSelect(selectEl) {
    selectEl.innerHTML = '';
    buildRecentYears(5).forEach(y => {
      const el = document.createElement('option');
      el.value = y;
      el.textContent = y;
      selectEl.appendChild(el);
    });
    selectEl.selectedIndex = 0;
  }

  /* ============ Gráficas SVG ============ */

  function emptyMessage(container, text) {
    container.innerHTML = `<div class="chart-empty">${text}</div>`;
  }

  // Barras agrupadas. series: [{name, color, data:[...]}] alineado con categories.
  function renderGroupedBarChart(container, categories, series, opts = {}) {
    if (categories.length === 0) { emptyMessage(container, 'No hay datos para este período.'); return; }
    const width = opts.width || 640, height = opts.height || 220;
    const padL = 34, padB = 26, padT = 10, padR = 8;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const maxVal = Math.max(1, ...series.flatMap(s => s.data));
    const niceMax = niceCeiling(maxVal);
    const ticks = 5;
    const groupW = chartW / categories.length;
    const barW = groupW / (series.length + 1);

    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

    for (let i = 0; i <= ticks; i++) {
      const val = niceMax - (niceMax / ticks) * i;
      const y = padT + (chartH / ticks) * i;
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="chart-axis-label">${Math.round(val)}</text>`;
    }

    categories.forEach((cat, ci) => {
      series.forEach((s, si) => {
        const val = s.data[ci] || 0;
        const barH = (val / niceMax) * chartH;
        const x = padL + ci * groupW + si * barW + barW * 0.12;
        const y = padT + chartH - barH;
        // s.colors permite un color distinto por categoría dentro de la
        // misma serie (ej. "Consultas en sala" vs. "Libros prestados"),
        // en vez del único s.color aplicado a todas las barras.
        const fill = (Array.isArray(s.colors) ? s.colors[ci] : null) || s.color;
        svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.76).toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${fill}"/>`;
      });
      const xLabel = padL + ci * groupW + groupW / 2;
      svg += `<text x="${xLabel.toFixed(1)}" y="${height - 8}" text-anchor="middle" class="chart-axis-label">${cat}</text>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderAreaLineChart(container, labels, data, opts = {}) {
    if (labels.length === 0) { emptyMessage(container, 'No hay datos para este período.'); return; }
    const width = opts.width || 640, height = opts.height || 240;
    const padL = 34, padB = 24, padT = 12, padR = 10;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const color = opts.color || COLORS.purple;
    const maxVal = Math.max(1, ...data);
    const niceMax = niceCeiling(maxVal);
    const ticks = 5;
    const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;

    function xy(i) {
      const x = padL + i * stepX;
      const y = padT + chartH - (data[i] / niceMax) * chartH;
      return [x, y];
    }

    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

    for (let i = 0; i <= ticks; i++) {
      const val = niceMax - (niceMax / ticks) * i;
      const y = padT + (chartH / ticks) * i;
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="chart-axis-label">${Math.round(val)}</text>`;
    }

    const points = data.map((_, i) => xy(i));
    const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const areaPath = linePath + ` L${points[points.length - 1][0].toFixed(1)},${(padT + chartH).toFixed(1)} L${points[0][0].toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

    svg += `<path d="${areaPath}" fill="${color}" opacity="0.12" stroke="none"/>`;
    svg += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.2"/>`;
    points.forEach(([x, y]) => {
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}"/>`;
    });

    labels.forEach((label, i) => {
      const [x] = xy(i);
      svg += `<text x="${x.toFixed(1)}" y="${height - 6}" text-anchor="middle" class="chart-axis-label">${label}</text>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderLegend(container, items) {
    container.innerHTML = items.map(it => `
      <span class="chart-legend__item">
        <span class="chart-legend__dot" style="background:${it.color}"></span>${it.name}
      </span>
    `).join('');
  }

  function renderDonutChart(container, segments, opts = {}) {
    const size = opts.size || 150;
    const stroke = opts.stroke || 22;
    const r = (size - stroke) / 2;
    const cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const realTotal = segments.reduce((a, s) => a + s.value, 0);
    const divTotal = realTotal || 1;

    let offset = 0;
    let svg = `<svg viewBox="0 0 ${size} ${size}">`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>`;
    if (realTotal > 0) {
      segments.forEach(seg => {
        const frac = seg.value / divTotal;
        const dash = frac * circumference;
        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
          stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"
          transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += dash;
      });
    }
    svg += `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="18" fill="var(--maroon-900)">${realTotal}</text>`;
    svg += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" fill="var(--muted)">Acciones</text>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  /* ============ Card: visitas a la página pública (GET /site-visits) ============ */

  async function initVisitsCard() {
    try {
      const data = await api.siteVisits();
      document.getElementById('statVisitsTotal').textContent = data.total_visits.toLocaleString('es-CO');
    } catch (err) {
      console.error('No se pudo cargar el contador de visitas.', err);
      document.getElementById('statVisitsTotal').textContent = '–';
    }
    // GET /site-visits no devuelve una marca de tiempo de última
    // actualización — esto refleja cuándo se consultó el dato, no
    // cuándo cambió el contador por última vez.
    document.getElementById('statVisitsUpdated').textContent = `Datos consultados el ${formatNow()}`;
  }

  /* ============ Card: asistencia por edad y género (GET /attendance) ============ */

  function ageRangeBucket(age) {
    if (age <= 5) return '0-5';
    if (age <= 15) return '6-15';
    if (age <= 30) return '16-30';
    if (age <= 50) return '31-50';
    return '51-99';
  }

  async function fetchAllAttendance(from, to) {
    const pageSize = 200;
    let page = 1;
    let all = [];
    while (true) {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), from, to });
      const data = await window.BAGBApi.apiFetch(`/attendance?${params.toString()}`);
      all = all.concat(data.data);
      if (all.length >= data.total || data.data.length === 0) break;
      page++;
    }
    return all;
  }

  async function renderAgeGenderChart(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const container = document.getElementById('chartAgeGender');
    const legendEl = document.getElementById('legendAgeGender');

    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let records;
    try {
      records = await fetchAllAttendance(from, to);
    } catch (err) {
      console.error('No se pudo cargar el reporte de asistencia.', err);
      emptyMessage(container, 'No se pudo cargar el reporte.');
      legendEl.innerHTML = '';
      return;
    }

    const genderOrder = ['Femenino', 'Masculino', 'Otro'];
    const genderNames = genderOrder.filter(g => records.some(r => r.gender === g));

    const series = genderNames.map((g, i) => ({
      name: g,
      color: GENDER_COLORS[g] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      data: AGE_RANGE_ORDER.map(range => records.filter(r => r.gender === g && ageRangeBucket(r.age) === range).length)
    }));

    renderGroupedBarChart(container, AGE_RANGE_ORDER, series, { height: 220 });
    renderLegend(legendEl, genderNames.map((g, i) => ({ name: g, color: GENDER_COLORS[g] || FALLBACK_COLORS[i % FALLBACK_COLORS.length] })));
  }

  function initAgeGenderCard() {
    const select = document.getElementById('selectAgeGenderMonth');
    fillMonthSelect(select);
    select.addEventListener('change', () => renderAgeGenderChart(select.value));
    renderAgeGenderChart(select.value);
  }

  /* ============ Card: asistencia total por mes (12 llamadas, una por mes) ============ */

  async function renderAttendanceYearChart(year) {
    const container = document.getElementById('chartAttendanceYear');

    const monthPromises = [];
    for (let m = 1; m <= 12; m++) {
      monthPromises.push(
        api.attendanceReport(m, Number(year))
          .then(d => d.total_visits)
          .catch(err => {
            console.error(`No se pudo cargar la asistencia de ${MONTHS_LONG[m - 1]} ${year}.`, err);
            return null; // un mes que falla no debe tumbar el gráfico completo
          })
      );
    }
    const results = await Promise.all(monthPromises);
    const counts = results.map(v => v ?? 0);

    renderAreaLineChart(container, MONTHS_SHORT, counts, { color: COLORS.purple });
  }

  function initAttendanceYearCard() {
    const select = document.getElementById('selectAttendanceYear');
    fillYearSelect(select);
    select.addEventListener('change', () => renderAttendanceYearChart(select.value));
    renderAttendanceYearChart(select.value);
  }

  /* ============ Card: libros prestados en el mes (GET /reports/catalog) ============ */

  async function renderLoansMonthCard(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const chartEl = document.getElementById('chartLoansMonth');

    let data;
    try {
      data = await api.catalogReport(month, year);
    } catch (err) {
      console.error('No se pudo cargar el reporte de catálogo.', err);
      document.getElementById('statLoansMonth').textContent = '–';
      emptyMessage(chartEl, 'No se pudo cargar el reporte.');
      return;
    }

    document.getElementById('statLoansMonth').textContent = data.loans_count.toLocaleString('es-CO');
    document.getElementById('loansMonthTitle').textContent = `Libros prestados en ${MONTHS_LONG[month - 1]} ${year}`;
    emptyMessage(chartEl, 'El backend solo expone el total del mes, no un desglose diario.');

    return data;
  }

  function initLoansMonthCard() {
    const select = document.getElementById('selectLoansMonth');
    fillMonthSelect(select);
    select.addEventListener('change', () => renderLoansMonthCard(select.value));
    renderLoansMonthCard(select.value);
  }

  /* ============ Card: libros perdidos (snapshot actual, no por mes) ============ */

  async function initLostBooksCard() {
    const tbody = document.getElementById('lostBooksBody');
    const toggleBtn = document.getElementById('lostBooksToggle');
    toggleBtn.hidden = true; // no hay listado detallado que expandir

    const now = new Date();
    let data;
    try {
      data = await api.catalogReport(now.getMonth() + 1, now.getFullYear());
    } catch (err) {
      console.error('No se pudo cargar el reporte de catálogo.', err);
      document.getElementById('statLostTotal').textContent = '–';
      tbody.innerHTML = `<tr><td colspan="3" class="chart-empty">No se pudo cargar el reporte.</td></tr>`;
      return;
    }

    document.getElementById('statLostTotal').textContent = data.lost_books_count.toLocaleString('es-CO');
    tbody.innerHTML = `<tr><td colspan="3" class="chart-empty">El backend solo expone el total de libros perdidos, no el detalle por libro.</td></tr>`;
  }

  /* ============ Card: consultas en sala vs. libros prestados  ============ */

  async function renderCompareChart(monthNum, year) {
    const chartEl = document.getElementById('chartCompare');
    const legendEl = document.getElementById('legendCompare');

    let data;
    try {
      data = await api.attendanceReport(monthNum, year);
    } catch (err) {
      console.error('No se pudo cargar el reporte de asistencia.', err);
      emptyMessage(chartEl, 'No se pudo cargar el reporte.');
      legendEl.innerHTML = '';
      return;
    }

    const totalReading = data.in_house_reading_count;
    const totalLoans = data.loans_count;

    document.getElementById('statCompareReading').textContent = totalReading.toLocaleString('es-CO');
    document.getElementById('statCompareLoans').textContent = totalLoans.toLocaleString('es-CO');

    const categories = ['Consultas en sala', 'Libros prestados'];
    const series = [{ name: 'Total del mes', colors: [COLORS.green, COLORS.purple], data: [totalReading, totalLoans] }];
    renderGroupedBarChart(chartEl, categories, series, { height: 200 });
    renderLegend(legendEl, [
      { name: 'Consultas en sala', color: COLORS.green },
      { name: 'Libros prestados', color: COLORS.purple }
    ]);

    renderDonutChart(document.getElementById('chartDonut'), [
      { name: 'Libros prestados', value: totalLoans, color: COLORS.purple },
      { name: 'Consultas en sala', value: totalReading, color: COLORS.green }
    ]);

    const total = totalLoans + totalReading || 1;
    const legendItems = [
      { name: 'Libros prestados', value: totalLoans, color: COLORS.purple },
      { name: 'Consultas en sala', value: totalReading, color: COLORS.green }
    ];
    document.getElementById('donutLegend').innerHTML = legendItems.map(it => `
      <div class="donut-legend__item">
        <span class="donut-legend__dot" style="background:${it.color}"></span>
        <span>
          <span class="donut-legend__pct">${((it.value / total) * 100).toFixed(1)}%</span><br>
          <span class="donut-legend__label">${it.name} (${it.value})</span>
        </span>
      </div>
    `).join('');
  }

  function initCompareCard() {
    const monthSelect = document.getElementById('selectCompareMonth');
    const yearSelect = document.getElementById('selectCompareYear');

    monthSelect.innerHTML = MONTHS_LONG.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
    fillYearSelect(yearSelect);

    const now = new Date();
    monthSelect.value = now.getMonth() + 1;

    function update() {
      renderCompareChart(Number(monthSelect.value), Number(yearSelect.value));
    }
    monthSelect.addEventListener('change', update);
    yearSelect.addEventListener('change', update);
    update();
  }

  /* ============ Cerrar sesión ============ */

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.BAGBAuth.logout();
  });

  /* ============ Init ============ */

  async function init() {
    await Promise.all([
      initVisitsCard(),
      Promise.resolve(initAgeGenderCard()),
      Promise.resolve(initAttendanceYearCard()),
      Promise.resolve(initLoansMonthCard()),
      initLostBooksCard(),
      Promise.resolve(initCompareCard())
    ]);
  }

  init();
})();

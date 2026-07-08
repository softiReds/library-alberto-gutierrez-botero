/* =====================================================================
   Panel Admin — Reportes (js)
   Fuentes de datos: data/attendance.json, data/loans.json,
   data/inhousereading.json, data/catalog.json
   "Visitas a la página pública" usa un número fijo (no requiere JSON).
   ===================================================================== */
(function(){

  const DATA_PATH = (window.CONFIG && window.CONFIG.DATA_PATH) || 'data/';
  const MOCK_TOTAL_VISITS = 12458;

  const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const COLORS = {
    purple:'#4A1942',
    orange:'#F4791E',
    green:'#1E8E3E',
    pink:'#E14F82',
    blue:'#3E6FE0',
  };

  /* ============ UTILIDADES ============ */

  function toArray(json, ...keys){
    if(Array.isArray(json)) return json;
    if(json && typeof json === 'object'){
      for(const k of keys){
        if(Array.isArray(json[k])) return json[k];
      }
      const firstArray = Object.values(json).find(v => Array.isArray(v));
      if(firstArray) return firstArray;
    }
    return [];
  }

  async function fetchJSON(filename, ...keys){
    try{
      const res = await fetch(DATA_PATH + filename);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      return toArray(json, ...keys);
    }catch(err){
      console.warn('No se pudo cargar', filename, err);
      return [];
    }
  }

  // Parsea "YYYY-MM-DD" (o con hora) evitando desfases de zona horaria.
  function parseDate(str){
    if(!str) return null;
    const datePart = String(str).slice(0,10);
    const [y,m,d] = datePart.split('-').map(Number);
    if(!y || !m || !d) return null;
    return new Date(y, m-1, d);
  }

  function ymKey(date){
    return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0');
  }

  function ageBucket(age){
    const n = Number(age);
    if(!isFinite(n)) return null;
    if(n <= 12) return '0-12';
    if(n <= 17) return '13-17';
    if(n <= 25) return '18-25';
    if(n <= 35) return '26-35';
    if(n <= 45) return '36-45';
    if(n <= 60) return '46-60';
    return '60+';
  }
  const AGE_BUCKETS = ['0-12','13-17','18-25','26-35','36-45','46-60','60+'];

  function niceCeiling(value){
    if(value <= 0) return 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const steps = [1,2,2.5,5,10];
    for(const step of steps){
      const candidate = step * magnitude;
      if(candidate >= value) return candidate;
    }
    return Math.ceil(value/magnitude)*magnitude;
  }

  function formatUpdatedNow(){
    const now = new Date();
    const day = now.getDate();
    const month = MONTHS_LONG[now.getMonth()].toLowerCase();
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2,'0');
    const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12; if(hours === 0) hours = 12;
    return `Última actualización: ${day} de ${month} de ${year} ${String(hours).padStart(2,'0')}:${minutes} ${ampm}`;
  }

  function el(html){
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  /* ============ SELECTS DE MES / AÑO ============ */

  // dates: array de objetos Date. Devuelve claves "YYYY-MM" únicas, orden descendente.
  function buildMonthKeys(dates){
    const set = new Set(dates.filter(Boolean).map(ymKey));
    return Array.from(set).sort().reverse();
  }
  function buildYearKeys(dates){
    const set = new Set(dates.filter(Boolean).map(d => d.getFullYear()));
    return Array.from(set).sort((a,b)=>b-a);
  }

  function fillMonthSelect(selectEl, monthKeys){
    selectEl.innerHTML = '';
    if(monthKeys.length === 0){
      const now = new Date();
      monthKeys = [ymKey(now)];
    }
    monthKeys.forEach(key => {
      const [y,m] = key.split('-').map(Number);
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${MONTHS_LONG[m-1]} ${y}`;
      selectEl.appendChild(opt);
    });
    selectEl.selectedIndex = 0;
  }

  function fillYearSelect(selectEl, years){
    selectEl.innerHTML = '';
    if(years.length === 0) years = [new Date().getFullYear()];
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      selectEl.appendChild(opt);
    });
    selectEl.selectedIndex = 0;
  }

  /* ============ GRÁFICAS SVG ============ */

  function emptyMessage(container, text){
    container.innerHTML = `<div class="chart-empty">${text}</div>`;
  }

  // Barras agrupadas. series: [{name, color, data:[...]}] alineado con categories.
  function renderGroupedBarChart(container, categories, series, opts={}){
    if(categories.length === 0){ emptyMessage(container,'No hay datos para este período.'); return; }
    const width = opts.width || 640, height = opts.height || 260;
    const padL = 34, padB = 26, padT = 10, padR = 8;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const maxVal = Math.max(1, ...series.flatMap(s => s.data));
    const niceMax = niceCeiling(maxVal);
    const ticks = 5;
    const groupW = chartW / categories.length;
    const barW = groupW / (series.length + 1);

    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

    for(let i=0;i<=ticks;i++){
      const val = niceMax - (niceMax/ticks)*i;
      const y = padT + (chartH/ticks)*i;
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width-padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
      svg += `<text x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end" class="chart-axis-label">${Math.round(val)}</text>`;
    }

    categories.forEach((cat, ci) => {
      series.forEach((s, si) => {
        const val = s.data[ci] || 0;
        const barH = (val/niceMax) * chartH;
        const x = padL + ci*groupW + si*barW + barW*0.12;
        const y = padT + chartH - barH;
        svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW*0.76).toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${s.color}"/>`;
      });
      const xLabel = padL + ci*groupW + groupW/2;
      svg += `<text x="${xLabel.toFixed(1)}" y="${height-8}" text-anchor="middle" class="chart-axis-label">${cat}</text>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  // Línea/área para una sola serie con puntos. labels: eje X (día o mes).
  function renderAreaLineChart(container, labels, data, opts={}){
    if(labels.length === 0){ emptyMessage(container,'No hay datos para este período.'); return; }
    const width = opts.width || 640, height = opts.height || 240;
    const padL = 34, padB = 24, padT = 12, padR = 10;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const color = opts.color || COLORS.purple;
    const maxVal = Math.max(1, ...data);
    const niceMax = niceCeiling(maxVal);
    const ticks = 5;
    const stepX = labels.length > 1 ? chartW/(labels.length-1) : 0;
    const labelEvery = opts.labelEvery || 1;

    function xy(i){
      const x = padL + i*stepX;
      const y = padT + chartH - (data[i]/niceMax)*chartH;
      return [x,y];
    }

    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

    for(let i=0;i<=ticks;i++){
      const val = niceMax - (niceMax/ticks)*i;
      const y = padT + (chartH/ticks)*i;
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width-padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
      svg += `<text x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end" class="chart-axis-label">${Math.round(val)}</text>`;
    }

    const points = data.map((_,i) => xy(i));
    const linePath = points.map((p,i) => (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const areaPath = linePath + ` L${points[points.length-1][0].toFixed(1)},${(padT+chartH).toFixed(1)} L${points[0][0].toFixed(1)},${(padT+chartH).toFixed(1)} Z`;

    svg += `<path d="${areaPath}" fill="${color}" opacity="0.12" stroke="none"/>`;
    svg += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.2"/>`;
    points.forEach(([x,y],i) => {
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}"/>`;
    });

    labels.forEach((label,i) => {
      if(i % labelEvery === 0 || i === labels.length-1){
        const [x] = xy(i);
        svg += `<text x="${x.toFixed(1)}" y="${height-6}" text-anchor="middle" class="chart-axis-label">${label}</text>`;
      }
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  // Multi-línea sin área, con leyenda externa. series: [{name,color,data}]
  function renderMultiLineChart(container, labels, series, opts={}){
    if(labels.length === 0){ emptyMessage(container,'No hay datos para este período.'); return; }
    const width = opts.width || 640, height = opts.height || 240;
    const padL = 34, padB = 24, padT = 12, padR = 10;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const maxVal = Math.max(1, ...series.flatMap(s=>s.data));
    const niceMax = niceCeiling(maxVal);
    const ticks = 5;
    const stepX = labels.length > 1 ? chartW/(labels.length-1) : 0;
    const labelEvery = opts.labelEvery || 1;

    function xy(data,i){
      const x = padL + i*stepX;
      const y = padT + chartH - (data[i]/niceMax)*chartH;
      return [x,y];
    }

    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

    for(let i=0;i<=ticks;i++){
      const val = niceMax - (niceMax/ticks)*i;
      const y = padT + (chartH/ticks)*i;
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width-padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
      svg += `<text x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end" class="chart-axis-label">${Math.round(val)}</text>`;
    }

    series.forEach(s => {
      const points = s.data.map((_,i) => xy(s.data,i));
      const linePath = points.map((p,i) => (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      svg += `<path d="${linePath}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
      points.forEach(([x,y]) => {
        svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="${s.color}"/>`;
      });
    });

    labels.forEach((label,i) => {
      if(i % labelEvery === 0 || i === labels.length-1){
        const x = padL + i*stepX;
        svg += `<text x="${x.toFixed(1)}" y="${height-6}" text-anchor="middle" class="chart-axis-label">${label}</text>`;
      }
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderLegend(container, items){
    container.innerHTML = items.map(it => `
      <span class="chart-legend__item">
        <span class="chart-legend__dot" style="background:${it.color}"></span>${it.name}
      </span>
    `).join('');
  }

  function renderDonutChart(container, segments, opts={}){
    const size = opts.size || 150;
    const stroke = opts.stroke || 22;
    const r = (size - stroke) / 2;
    const cx = size/2, cy = size/2;
    const circumference = 2 * Math.PI * r;
    const realTotal = segments.reduce((a,s)=>a+s.value,0);
    const divTotal = realTotal || 1; // solo para evitar dividir entre 0 al calcular proporciones

    let offset = 0;
    let svg = `<svg viewBox="0 0 ${size} ${size}">`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>`;
    if(realTotal > 0){
      segments.forEach(seg => {
        const frac = seg.value/divTotal;
        const dash = frac * circumference;
        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
          stroke-dasharray="${dash.toFixed(2)} ${(circumference-dash).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"
          transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += dash;
      });
    }
    svg += `<text x="${cx}" y="${cy-3}" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="18" fill="var(--maroon-900)">${realTotal}</text>`;
    svg += `<text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="9" fill="var(--muted)">Acciones</text>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  /* ============ CARGA DE DATOS ============ */

  let ATTENDANCE = [];
  let LOANS = [];
  let READINGS = [];
  let CATALOG_MAP = new Map();

  async function loadAllData(){
    const [attendanceRaw, loansRaw, readingsRaw, catalogRaw] = await Promise.all([
      fetchJSON('attendance.json', 'attendance', 'records'),
      fetchJSON('loans.json', 'loans', 'records'),
      fetchJSON('inhousereading.json', 'inhousereading', 'readings', 'records'),
      fetchJSON('catalog.json', 'books', 'catalog'),
    ]);

    ATTENDANCE = attendanceRaw.map(r => ({...r, _date: parseDate(r.visit_date)})).filter(r => r._date);
    LOANS = loansRaw.map(r => ({...r, _loanDate: parseDate(r.loan_date), _dueDate: parseDate(r.due_date), _returnDate: parseDate(r.return_date)})).filter(r => r._loanDate);
    READINGS = readingsRaw.map(r => ({...r, _date: parseDate(r.reading_date)})).filter(r => r._date);

    CATALOG_MAP = new Map(catalogRaw.map(b => [String(b.id), b]));
  }

  function bookTitle(bookId){
    const book = CATALOG_MAP.get(String(bookId));
    return book ? (book.title || 'Sin título') : 'Libro no encontrado';
  }

  /* ============ CARD: VISITAS (mock) ============ */

  function initVisitsCard(){
    document.getElementById('statVisitsTotal').textContent = MOCK_TOTAL_VISITS.toLocaleString('es-CO');
    document.getElementById('statVisitsUpdated').textContent = formatUpdatedNow();
  }

  /* ============ CARD: ASISTENCIA POR EDAD Y GÉNERO ============ */

  function renderAgeGenderChart(monthKey){
    const filtered = ATTENDANCE.filter(r => ymKey(r._date) === monthKey);
    const genders = Array.from(new Set(filtered.map(r => r.gender).filter(Boolean)));
    const palette = {Femenino: COLORS.pink, Masculino: COLORS.blue};
    const fallbackColors = [COLORS.orange, COLORS.purple, COLORS.green];

    const series = genders.map((g,i) => ({
      name: g,
      color: palette[g] || fallbackColors[i % fallbackColors.length],
      data: AGE_BUCKETS.map(bucket => filtered.filter(r => r.gender === g && ageBucket(r.age) === bucket).length),
    }));

    renderLegend(document.getElementById('legendAgeGender'), series);
    renderGroupedBarChart(document.getElementById('chartAgeGender'), AGE_BUCKETS, series);
  }

  function initAgeGenderCard(){
    const select = document.getElementById('selectAgeGenderMonth');
    const monthKeys = buildMonthKeys(ATTENDANCE.map(r => r._date));
    fillMonthSelect(select, monthKeys);
    select.addEventListener('change', () => renderAgeGenderChart(select.value));
    renderAgeGenderChart(select.value);
  }

  /* ============ CARD: ASISTENCIA TOTAL POR MES ============ */

  function renderAttendanceYearChart(year){
    const counts = new Array(12).fill(0);
    ATTENDANCE.forEach(r => {
      if(r._date.getFullYear() === Number(year)) counts[r._date.getMonth()]++;
    });
    renderAreaLineChart(document.getElementById('chartAttendanceYear'), MONTHS_SHORT, counts, {color: COLORS.purple});
  }

  function initAttendanceYearCard(){
    const select = document.getElementById('selectAttendanceYear');
    const years = buildYearKeys(ATTENDANCE.map(r => r._date));
    fillYearSelect(select, years);
    select.addEventListener('change', () => renderAttendanceYearChart(select.value));
    renderAttendanceYearChart(select.value);
  }

  /* ============ CARD: LIBROS PRESTADOS EN EL MES ============ */

  function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }

  function renderLoansMonthChart(monthKey){
    const [y,m] = monthKey.split('-').map(Number);
    const nDays = daysInMonth(y, m-1);
    const counts = new Array(nDays).fill(0);
    let total = 0;
    LOANS.forEach(r => {
      if(ymKey(r._loanDate) === monthKey){
        counts[r._loanDate.getDate()-1]++;
        total++;
      }
    });
    const labels = counts.map((_,i) => i+1);
    document.getElementById('statLoansMonth').textContent = total.toLocaleString('es-CO');
    document.getElementById('loansMonthTitle').textContent = `Libros prestados en ${MONTHS_LONG[m-1]} ${y}`;
    renderAreaLineChart(document.getElementById('chartLoansMonth'), labels, counts, {color: COLORS.purple, labelEvery: 3, height: 200});
  }

  function initLoansMonthCard(){
    const select = document.getElementById('selectLoansMonth');
    const monthKeys = buildMonthKeys(LOANS.map(r => r._loanDate));
    fillMonthSelect(select, monthKeys);
    select.addEventListener('change', () => renderLoansMonthChart(select.value));
    renderLoansMonthChart(select.value);
  }

  /* ============ CARD: LIBROS PERDIDOS (NO DEVUELTOS) ============ */

  function getOverdueLoans(){
    const today = new Date(); today.setHours(0,0,0,0);
    return LOANS
      .filter(r => !r._returnDate && r._dueDate && r._dueDate < today)
      .map(r => ({
        ...r,
        _daysLate: Math.floor((today - r._dueDate) / 86400000),
      }))
      .sort((a,b) => b._daysLate - a._daysLate);
  }

  function formatDateEs(date){
    return String(date.getDate()).padStart(2,'0') + '/' + String(date.getMonth()+1).padStart(2,'0') + '/' + date.getFullYear();
  }

  function initLostBooksCard(){
    const overdue = getOverdueLoans();
    document.getElementById('statLostTotal').textContent = overdue.length.toLocaleString('es-CO');

    const tbody = document.getElementById('lostBooksBody');
    const toggleBtn = document.getElementById('lostBooksToggle');
    let expanded = false;

    function draw(){
      const rows = expanded ? overdue : overdue.slice(0,5);
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${bookTitle(r.book_id)}</td>
          <td>${formatDateEs(r._loanDate)}</td>
          <td class="lost-days">${r._daysLate} días</td>
        </tr>
      `).join('') || `<tr><td colspan="3" class="chart-empty">No hay libros perdidos.</td></tr>`;
    }

    draw();

    if(overdue.length > 5){
      toggleBtn.hidden = false;
      toggleBtn.textContent = 'Ver todos los libros perdidos';
      toggleBtn.addEventListener('click', () => {
        expanded = !expanded;
        toggleBtn.textContent = expanded ? 'Ver menos' : 'Ver todos los libros perdidos';
        draw();
      });
    }
  }

  /* ============ CARD: CONSULTAS EN SALA VS. LIBROS PRESTADOS ============ */

  function renderCompareChart(monthNum, year){
    const nDays = daysInMonth(year, monthNum-1);
    const readingCounts = new Array(nDays).fill(0);
    const loanCounts = new Array(nDays).fill(0);

    READINGS.forEach(r => {
      if(r._date.getFullYear() === year && r._date.getMonth() === monthNum-1) readingCounts[r._date.getDate()-1]++;
    });
    LOANS.forEach(r => {
      if(r._loanDate.getFullYear() === year && r._loanDate.getMonth() === monthNum-1) loanCounts[r._loanDate.getDate()-1]++;
    });

    const totalReading = readingCounts.reduce((a,b)=>a+b,0);
    const totalLoans = loanCounts.reduce((a,b)=>a+b,0);

    document.getElementById('statCompareReading').textContent = totalReading.toLocaleString('es-CO');
    document.getElementById('statCompareLoans').textContent = totalLoans.toLocaleString('es-CO');

    const series = [
      {name:'Consultas en sala', color: COLORS.green, data: readingCounts},
      {name:'Libros prestados', color: COLORS.purple, data: loanCounts},
    ];
    renderLegend(document.getElementById('legendCompare'), series);
    const labels = readingCounts.map((_,i)=>i+1);
    renderMultiLineChart(document.getElementById('chartCompare'), labels, series, {labelEvery:3});

    renderDonutChart(document.getElementById('chartDonut'), [
      {name:'Libros prestados', value: totalLoans, color: COLORS.purple},
      {name:'Consultas en sala', value: totalReading, color: COLORS.green},
    ]);

    const total = totalLoans + totalReading || 1;
    const legendItems = [
      {name:'Libros prestados', value: totalLoans, color: COLORS.purple},
      {name:'Consultas en sala', value: totalReading, color: COLORS.green},
    ];
    document.getElementById('donutLegend').innerHTML = legendItems.map(it => `
      <div class="donut-legend__item">
        <span class="donut-legend__dot" style="background:${it.color}"></span>
        <span>
          <span class="donut-legend__pct">${((it.value/total)*100).toFixed(1)}%</span><br>
          <span class="donut-legend__label">${it.name} (${it.value})</span>
        </span>
      </div>
    `).join('');
  }

  function initCompareCard(){
    const monthSelect = document.getElementById('selectCompareMonth');
    const yearSelect = document.getElementById('selectCompareYear');

    const allDates = [...READINGS.map(r=>r._date), ...LOANS.map(r=>r._loanDate)];
    const years = buildYearKeys(allDates);
    fillYearSelect(yearSelect, years);

    monthSelect.innerHTML = MONTHS_LONG.map((name,i) => `<option value="${i+1}">${name}</option>`).join('');

    // Por defecto, seleccionar el mes/año más reciente con datos.
    const monthKeys = buildMonthKeys(allDates);
    if(monthKeys.length){
      const [defY, defM] = monthKeys[0].split('-').map(Number);
      monthSelect.value = defM;
      yearSelect.value = defY;
    }

    function update(){
      renderCompareChart(Number(monthSelect.value), Number(yearSelect.value));
    }
    monthSelect.addEventListener('change', update);
    yearSelect.addEventListener('change', update);
    update();
  }

  /* ============ INIT ============ */

  async function init(){
    initVisitsCard();
    await loadAllData();
    initAgeGenderCard();
    initAttendanceYearCard();
    initLoansMonthCard();
    initLostBooksCard();
    initCompareCard();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
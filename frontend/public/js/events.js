// =====================================================================
// Talleres y eventos — lista + calendario interactivo
// =====================================================================

const EVENTS_URL = 'data/events.json';

const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
const NUM_COLORS = 3;
const MAX_VISIBLE_EVENTS = 6;

let EVENTS = [];
let calYear, calMonth;
let selectedDateKey = null;

const listEl = document.getElementById('eventsFullList');
const gridEl = document.getElementById('calendarGrid');
const monthSelect = document.getElementById('calMonth');
const yearSelect = document.getElementById('calYear');
const filterSelect = document.getElementById('eventsFilter');

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function toDate(ev) {
  return new Date(`${ev.date}T00:00:00`);
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const mm = String(m).padStart(2, '0');
  if (h === 12 && m === 0) return '12:00 m.';
  if (h === 0 && m === 0) return `12:${mm} a.m.`;
  const period = h < 12 ? 'a.m.' : 'p.m.';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mm} ${period}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Carga de eventos
// ---------------------------------------------------------------------
async function loadEvents() {
  try {
    const res = await fetch(EVENTS_URL);
    if (!res.ok) throw new Error('No se pudo cargar events.json');
    const data = await res.json();
    EVENTS = [...data]
      .sort((a, b) => toDate(a) - toDate(b))
      .map((ev, i) => ({ ...ev, colorIndex: i % NUM_COLORS }));
  } catch (err) {
    console.error(err);
    EVENTS = [];
  }

  renderEventsList();
  renderCalendar();
}

// ---------------------------------------------------------------------
// Lista de eventos
// ---------------------------------------------------------------------
function getFilteredEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (filterSelect.value) {
    case 'month':
      return EVENTS.filter(ev => {
        const d = toDate(ev);
        return d.getFullYear() === calYear && d.getMonth() === calMonth;
      });
    case 'all':
      return EVENTS;
    case 'upcoming':
    default:
      return EVENTS.filter(ev => toDate(ev) >= today);
  }
}

function renderEventsList() {
  listEl.innerHTML = '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = getFilteredEvents();

  if (!events.length) {
    const msgs = {
      month: 'No hay eventos programados para este mes.',
      all: 'Aún no hay eventos programados.',
      upcoming: 'No hay eventos próximos por ahora. ¡Vuelve pronto!'
    };
    listEl.innerHTML = `<li class="events-empty">${msgs[filterSelect.value] || msgs.upcoming}</li>`;
    limitListHeight();
    return;
  }

  events.forEach((ev, i) => {
    const d = toDate(ev);
    const li = document.createElement('li');
    li.className = `event-color-${ev.colorIndex}`;
    li.dataset.date = ev.date;
    if (d < today) li.classList.add('is-past');

    li.innerHTML = `
      <span class="event-date">
        <strong>${d.getDate()}</strong>${MESES_LARGO[d.getMonth()].slice(0, 3).toUpperCase()}
      </span>
      <span class="event-body">
        <strong>${escapeHtml(ev.title)}</strong>
        <span class="event-time">${formatTime12h(ev.start_time)} - ${formatTime12h(ev.end_time)}</span>
        ${ev.location ? `
        <span class="event-place">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>
          ${escapeHtml(ev.location)}
        </span>` : ''}
      </span>
      <svg class="event-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6"/></svg>
    `;

    li.addEventListener('click', () => {
      calYear = d.getFullYear();
      calMonth = d.getMonth();
      selectedDateKey = ev.date;
      renderCalendar();
      highlightListItems(ev.date);
    });

    listEl.appendChild(li);
    makeReveal(li, i);
  });

  limitListHeight();
}

function limitListHeight() {
  const items = listEl.querySelectorAll('li:not(.events-empty)');

  if (items.length <= MAX_VISIBLE_EVENTS) {
    listEl.style.maxHeight = '';
    return;
  }

  let height = 0;
  for (let i = 0; i < MAX_VISIBLE_EVENTS; i++) {
    height += items[i].offsetHeight;
  }
  height += items[MAX_VISIBLE_EVENTS].offsetHeight * 0.4;

  listEl.style.maxHeight = `${height}px`;
}

function highlightListItems(date) {
  listEl.querySelectorAll('li').forEach(li => {
    li.classList.toggle('is-highlighted', li.dataset.date === date);
  });
  const first = listEl.querySelector(`li[data-date="${date}"]`);
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------
function buildMonthYearSelects() {
  monthSelect.innerHTML = MESES_LARGO
    .map((m, i) => `<option value="${i}">${m}</option>`)
    .join('');

  const years = new Set(EVENTS.map(ev => toDate(ev).getFullYear()));
  years.add(new Date().getFullYear());
  years.add(calYear);
  const sorted = [...years].sort((a, b) => a - b);
  const min = Math.min(...sorted) - 1;
  const max = Math.max(...sorted) + 1;

  let opts = '';
  for (let y = min; y <= max; y++) opts += `<option value="${y}">${y}</option>`;
  yearSelect.innerHTML = opts;
}

function eventsByDay(year, month) {
  const map = new Map();
  EVENTS.forEach(ev => {
    const d = toDate(ev);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(ev);
    }
  });
  return map;
}

function renderCalendar() {
  buildMonthYearSelects();
  monthSelect.value = calMonth;
  yearSelect.value = calYear;

  gridEl.innerHTML = '';

  DIAS_SEMANA.forEach(d => {
    const el = document.createElement('span');
    el.className = 'cal-weekday';
    el.textContent = d;
    gridEl.appendChild(el);
  });

  const firstOfMonth = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7;

  const today = new Date();
  const isTodayMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

  const dayEvents = eventsByDay(calYear, calMonth);
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let cell = 0; cell < totalCells; cell++) {
    const dayNum = cell - startOffset + 1;
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

    const btn = document.createElement(inMonth && dayEvents.has(dayNum) ? 'button' : 'div');
    btn.className = 'cal-day';

    const num = document.createElement('span');
    num.className = 'cal-day__num';

    if (!inMonth) {
      btn.classList.add('cal-day--muted');
      num.textContent = dayNum < 1 ? daysInPrev + dayNum : dayNum - daysInMonth;
      btn.setAttribute('aria-hidden', 'true');
    } else {
      num.textContent = dayNum;

      if (isTodayMonth && today.getDate() === dayNum) {
        btn.classList.add('cal-day--today');
      }

      const evs = dayEvents.get(dayNum);
      if (evs) {
        const ev = evs[0];
        const key = dateKey(calYear, calMonth, dayNum);

        btn.type = 'button';
        btn.classList.add('cal-day--event', `cal-day--ev-${ev.colorIndex}`);
        btn.setAttribute('aria-label', `${dayNum} de ${MESES_LARGO[calMonth]}: ${evs.map(e => e.title).join(', ')}`);
        btn.title = evs.map(e => e.title).join('\n');

        if (selectedDateKey === key) btn.classList.add('cal-day--selected');

        const dot = document.createElement('span');
        dot.className = 'cal-day__dot';

        btn.addEventListener('click', () => {
          selectedDateKey = key;
          gridEl.querySelectorAll('.cal-day--selected').forEach(d => d.classList.remove('cal-day--selected'));
          btn.classList.add('cal-day--selected');
          highlightListItems(key);
        });

        btn.appendChild(num);
        btn.appendChild(dot);
        gridEl.appendChild(btn);
        continue;
      }
    }

    btn.appendChild(num);
    gridEl.appendChild(btn);
  }
}

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
  if (filterSelect.value === 'month') renderEventsList();
}

// ---------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------
document.getElementById('calPrev').addEventListener('click', () => changeMonth(-1));
document.getElementById('calNext').addEventListener('click', () => changeMonth(1));

monthSelect.addEventListener('change', () => {
  calMonth = Number(monthSelect.value);
  renderCalendar();
  if (filterSelect.value === 'month') renderEventsList();
});

yearSelect.addEventListener('change', () => {
  calYear = Number(yearSelect.value);
  renderCalendar();
  if (filterSelect.value === 'month') renderEventsList();
});

filterSelect.addEventListener('change', renderEventsList);

document.getElementById('navSearchToggle').addEventListener('click', () => {
  window.location.href = 'index.html#catalogo';
});

// ---------------------------------------------------------------------
// Botón flotante de sugerencias
// ---------------------------------------------------------------------
const fab = document.getElementById('suggestionFab');
const modal = document.getElementById('suggestionModal');
const modalClose = document.getElementById('suggestionClose');
const suggestionForm = document.getElementById('suggestionForm');

fab.addEventListener('click', () => { modal.hidden = false; });
modalClose.addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

suggestionForm.addEventListener('submit', e => {
  e.preventDefault();
  alert('¡Gracias por tu sugerencia! La tendremos en cuenta.');
  suggestionForm.reset();
  modal.hidden = true;
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
const now = new Date();
calYear = now.getFullYear();
calMonth = now.getMonth();

initStaticReveals();
loadEvents();
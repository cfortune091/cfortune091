/* ============================================================
   CJI Arkansas Training Map — map.js
   ============================================================ */

// ── Constants ────────────────────────────────────────────────

const TOPO_URL    = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json';
const STORAGE_KEY  = 'cji_training_map_v1';
const SETTINGS_KEY = 'cji_settings_v1';

const AR_COUNTIES = {
  '05001':'Arkansas',   '05003':'Ashley',      '05005':'Baxter',
  '05007':'Benton',     '05009':'Boone',        '05011':'Bradley',
  '05013':'Calhoun',    '05015':'Carroll',      '05017':'Chicot',
  '05019':'Clark',      '05021':'Clay',         '05023':'Cleburne',
  '05025':'Cleveland',  '05027':'Columbia',     '05029':'Conway',
  '05031':'Craighead',  '05033':'Crawford',     '05035':'Crittenden',
  '05037':'Cross',      '05039':'Dallas',       '05041':'Desha',
  '05043':'Drew',       '05045':'Faulkner',     '05047':'Franklin',
  '05049':'Fulton',     '05051':'Garland',      '05053':'Grant',
  '05055':'Greene',     '05057':'Hempstead',    '05059':'Hot Spring',
  '05061':'Howard',     '05063':'Independence', '05065':'Izard',
  '05067':'Jackson',    '05069':'Jefferson',    '05071':'Johnson',
  '05073':'Lafayette',  '05075':'Lawrence',     '05077':'Lee',
  '05079':'Lincoln',    '05081':'Little River', '05083':'Logan',
  '05085':'Lonoke',     '05087':'Madison',      '05089':'Marion',
  '05091':'Miller',     '05093':'Mississippi',  '05095':'Monroe',
  '05097':'Montgomery', '05099':'Nevada',       '05101':'Newton',
  '05103':'Ouachita',   '05105':'Perry',        '05107':'Phillips',
  '05109':'Pike',       '05111':'Poinsett',     '05113':'Polk',
  '05115':'Pope',       '05117':'Prairie',      '05119':'Pulaski',
  '05121':'Randolph',   '05123':'St. Francis',  '05125':'Saline',
  '05127':'Scott',      '05129':'Searcy',       '05131':'Sebastian',
  '05133':'Sevier',     '05135':'Sharp',        '05137':'Stone',
  '05139':'Union',      '05141':'Van Buren',    '05143':'Washington',
  '05145':'White',      '05147':'Woodruff',     '05149':'Yell'
};

const COUNTY_NAMES = Object.values(AR_COUNTIES).sort();

const DEFAULT_SETTINGS = {
  departments: [
    { name: 'DEC',       color: '#1B4F8A' },
    { name: 'Forensics', color: '#6B3FA0' },
    { name: 'LEMD',      color: '#B85C00' },
    { name: 'ACSS',      color: '#1A7A4A' },
    { name: 'VAWA',      color: '#A0304A' }
  ],
  statuses: [
    { name: 'Scheduled',   color: '#2563EB', active: true  },
    { name: 'In Progress', color: '#D97706', active: true  },
    { name: 'Completed',   color: '#16A34A', active: false },
    { name: 'Cancelled',   color: '#9CA3AF', active: false }
  ]
};

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

// ── Settings helpers ──────────────────────────────────────────

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    const saved = JSON.parse(raw);
    return {
      departments: Array.isArray(saved.departments) ? saved.departments : DEFAULT_SETTINGS.departments,
      statuses:    Array.isArray(saved.statuses)    ? saved.statuses    : DEFAULT_SETTINGS.statuses
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch (e) { console.warn('localStorage write failed:', e); }
}

function getDepts()           { return settings.departments; }
function getStatuses()        { return settings.statuses; }
function getDeptColor(name)   { const d = settings.departments.find(d => d.name === name); return d ? d.color : '#888888'; }
function getStatusColor(name) { const s = settings.statuses.find(s => s.name === name);    return s ? s.color : '#9CA3AF'; }

function lightenColor(hex, amount = 0.82) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgb(${Math.round(r+(255-r)*amount)},${Math.round(g+(255-g)*amount)},${Math.round(b+(255-b)*amount)})`;
}

function injectDynamicStyles() {
  let el = document.getElementById('dynamic-styles');
  if (!el) { el = document.createElement('style'); el.id = 'dynamic-styles'; document.head.appendChild(el); }
  const rules = [];
  settings.departments.forEach(d => {
    const key = cssKey(d.name);
    rules.push(`.badge-dept-${key}{background:${lightenColor(d.color)};color:${d.color}}`);
    rules.push(`.pill.dept-${key}.active{background:${d.color};color:#fff;border-color:${d.color}}`);
  });
  settings.statuses.forEach(s => {
    const key = cssKey(s.name);
    rules.push(`.badge-status-${key}{background:${lightenColor(s.color)};color:${s.color}}`);
    rules.push(`.pill.status-${key}.active{background:${s.color};color:#fff;border-color:${s.color}}`);
  });
  el.textContent = rules.join('\n');
}

// ── State ────────────────────────────────────────────────────

const state = {
  classes:        [],
  filters:        { dept: null, status: null, year: null },
  selectedCounty: null,
  activeTab:      'overview',
  arFeatures:     [],
  pathGen:        null,
  editingId:      null
};

// ── Utilities ────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cssKey(str) {
  return String(str || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
}

function parseLocalDate(str) {
  if (!str) return null;
  const parts = String(str).slice(0,10).split('-');
  if (parts.length < 3) return null;
  return new Date(+parts[0], +parts[1]-1, +parts[2]);
}

function fmtDate(str) {
  if (!str) return '—';
  const d = parseLocalDate(str);
  if (!d || isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function getYear(dateStr) {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  return d ? d.getFullYear() : null;
}

function getFiscalYear(dateStr) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  return d.getMonth() >= 6 ? `FY${d.getFullYear()+1}` : `FY${d.getFullYear()}`;
}

function isActive(status) {
  const s = settings.statuses.find(s => s.name === status);
  return s ? !!s.active : false;
}

function ensureFields(cls) {
  cls.year       = getYear(cls.startDate);
  cls.fiscalYear = getFiscalYear(cls.startDate);
  cls.active     = isActive(cls.status);
  return cls;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Data persistence ─────────────────────────────────────────

function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.classes)); }
  catch (e) { console.warn('localStorage write failed:', e); }
}

function loadData() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}

// ── Filter logic ─────────────────────────────────────────────

function getFilteredClasses() {
  return state.classes.filter(c => {
    if (state.filters.dept   && c.department !== state.filters.dept)           return false;
    if (state.filters.status && c.status      !== state.filters.status)        return false;
    if (state.filters.year   && String(c.year) !== String(state.filters.year)) return false;
    if (state.selectedCounty && c.county      !== state.selectedCounty)        return false;
    return true;
  });
}

function getUniqueYears() {
  const years = [...new Set(state.classes.map(c => c.year).filter(y => y != null))].sort();
  return years.map(String);
}

// ── Map drawing ───────────────────────────────────────────────

async function initMap() {
  const us = await d3.json(TOPO_URL);

  state.arFeatures = topojson.feature(us, us.objects.counties).features
    .filter(f => String(f.id).padStart(5,'0').startsWith('05'))
    .map(f => { f.id = String(f.id).padStart(5,'0'); return f; });

  const container = document.getElementById('map-container');
  const W = container.clientWidth  || 700;
  const H = container.clientHeight || 500;

  const svg = d3.select('#map')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const arCollection = { type: 'FeatureCollection', features: state.arFeatures };
  const projection = d3.geoIdentity().reflectY(true)
    .fitExtent([[20,20],[W-20,H-20]], arCollection);
  state.pathGen = d3.geoPath().projection(projection);

  const defs = svg.append('defs');
  state.arFeatures.forEach(f => {
    defs.append('clipPath').attr('id', `clip-${f.id}`)
      .append('path').datum(f).attr('d', state.pathGen);
  });

  svg.append('g').attr('id', 'county-fills');

  const bordersG = svg.append('g').attr('id', 'county-borders');
  state.arFeatures.forEach(f => {
    bordersG.append('path').datum(f).attr('d', state.pathGen)
      .attr('fill','none').attr('stroke','white').attr('stroke-width',0.7).attr('pointer-events','none');
  });

  const arMerged = topojson.merge(
    us,
    us.objects.counties.geometries.filter(g => String(g.id).padStart(5,'0').startsWith('05'))
  );
  svg.append('path').datum(arMerged).attr('d', state.pathGen)
    .attr('fill','none').attr('stroke','#1B3A6B').attr('stroke-width',2.5).attr('pointer-events','none');

  const hitG = svg.append('g').attr('id', 'county-hits');
  state.arFeatures.forEach(f => {
    hitG.append('path').datum(f).attr('d', state.pathGen)
      .attr('fill','transparent').attr('data-fips', f.id).attr('class','county-hit')
      .on('mouseenter', (evt,d) => onCountyHover(evt,d))
      .on('mousemove',  evt    => moveTooltip(evt))
      .on('mouseleave', ()     => hideTooltip())
      .on('click',      (evt,d) => onCountyClick(d));
  });
}

function redrawFills() {
  if (!state.pathGen || !state.arFeatures.length) return;

  const filtered = getFilteredClasses();
  const byCounty = {};
  filtered.forEach(c => { if (!byCounty[c.county]) byCounty[c.county] = []; byCounty[c.county].push(c); });

  const fillsG = d3.select('#county-fills');
  fillsG.selectAll('*').remove();

  state.arFeatures.forEach(f => {
    const name = AR_COUNTIES[f.id];
    if (!name) return;
    const classes  = byCounty[name] || [];
    const centroid = state.pathGen.centroid(f);
    if (!centroid || isNaN(centroid[0]) || isNaN(centroid[1])) return;

    const [[x0,y0],[x1,y1]] = state.pathGen.bounds(f);
    const r = Math.sqrt((x1-x0)**2 + (y1-y0)**2) * 1.5;

    if (classes.length === 0) {
      fillsG.append('path').datum(f).attr('d', state.pathGen)
        .attr('fill','#D1D5DB').attr('pointer-events','none');
    } else {
      const deptCounts = {};
      classes.forEach(c => { deptCounts[c.department] = (deptCounts[c.department] || 0) + 1; });
      const entries = Object.entries(deptCounts);

      if (entries.length === 1) {
        fillsG.append('path').datum(f).attr('d', state.pathGen)
          .attr('fill', getDeptColor(entries[0][0])).attr('pointer-events','none');
      } else {
        const pieData = entries.map(([dept, count]) => ({ dept, count }));
        const pie = d3.pie().value(d => d.count).sort(null)(pieData);
        const arc = d3.arc().innerRadius(0).outerRadius(r);
        pie.forEach(slice => {
          fillsG.append('path')
            .attr('transform', `translate(${centroid[0]},${centroid[1]})`)
            .attr('d', arc(slice))
            .attr('fill', getDeptColor(slice.data.dept))
            .attr('clip-path', `url(#clip-${f.id})`)
            .attr('pointer-events','none');
        });
      }
    }

    if (state.selectedCounty === name) {
      fillsG.append('path').datum(f).attr('d', state.pathGen)
        .attr('fill','none').attr('stroke','#C8A84B').attr('stroke-width',3).attr('pointer-events','none');
    }
  });
}

// ── Tooltip ───────────────────────────────────────────────────

function onCountyHover(evt, feature) {
  const name = AR_COUNTIES[feature.id];
  if (!name) return;
  const classes = getFilteredClasses().filter(c => c.county === name);
  const tip = document.getElementById('tooltip');
  let html = `<div class="tooltip-county">${escHtml(name)} County</div>`;
  if (classes.length === 0) {
    const q = (state.filters.dept || state.filters.status || state.filters.year) ? ' matching current filters' : '';
    html += `<div style="font-size:11px;color:var(--text-muted)">No classes${q}</div>`;
  } else {
    classes.slice(0, 4).forEach(c => {
      html += `<div class="tooltip-class">
        <div class="tooltip-class-title">${escHtml(c.classTitle)}</div>
        <div class="tooltip-class-meta">${escHtml(c.department)} · ${escHtml(c.status)} · ${fmtDate(c.startDate)}</div>
      </div>`;
    });
    if (classes.length > 4) html += `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">+${classes.length-4} more</div>`;
  }
  tip.innerHTML = html;
  tip.classList.add('visible');
  moveTooltip(evt);
}

function moveTooltip(evt) {
  const tip = document.getElementById('tooltip');
  const x = evt.clientX + 14, y = evt.clientY - 10;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = (x + tw > window.innerWidth  - 10 ? x - tw - 28 : x) + 'px';
  tip.style.top  = (y + th > window.innerHeight - 10 ? y - th      : y) + 'px';
}

function hideTooltip() { document.getElementById('tooltip').classList.remove('visible'); }

// ── County click ──────────────────────────────────────────────

function onCountyClick(feature) {
  const name = AR_COUNTIES[feature.id];
  if (!name) return;
  state.selectedCounty = state.selectedCounty === name ? null : name;
  if (state.selectedCounty) switchTab('classes');
  redrawFills();
  renderSidePanel();
  updatePills();
}

// ── Filter bar ────────────────────────────────────────────────

function setupFilterBar() {
  const deptBar = document.getElementById('dept-pills');
  deptBar.innerHTML = '';
  getDepts().forEach(dep => {
    const dept = dep.name;
    const btn  = document.createElement('button');
    btn.className    = `pill dept-${cssKey(dept)}`;
    btn.dataset.dept = dept;
    btn.textContent  = dept;
    btn.onclick = () => {
      state.filters.dept   = state.filters.dept === dept ? null : dept;
      state.selectedCounty = null;
      updatePills(); redrawFills(); renderSidePanel();
    };
    deptBar.appendChild(btn);
  });

  const statusBar = document.getElementById('status-pills');
  statusBar.innerHTML = '';
  getStatuses().forEach(s => {
    const status = s.name;
    const btn    = document.createElement('button');
    btn.className      = `pill status-${cssKey(status)}`;
    btn.dataset.status = status;
    btn.textContent    = status;
    btn.onclick = () => {
      state.filters.status = state.filters.status === status ? null : status;
      state.selectedCounty = null;
      updatePills(); redrawFills(); renderSidePanel();
    };
    statusBar.appendChild(btn);
  });
}

function rebuildYearPills() {
  const yearBar = document.getElementById('year-pills');
  yearBar.innerHTML = '';
  getUniqueYears().forEach(yr => {
    const btn = document.createElement('button');
    btn.className    = 'pill';
    btn.dataset.year = yr;
    btn.textContent  = yr;
    btn.onclick = () => {
      state.filters.year   = state.filters.year === yr ? null : yr;
      state.selectedCounty = null;
      updatePills(); redrawFills(); renderSidePanel();
    };
    yearBar.appendChild(btn);
  });
  updatePills();
}

function updatePills() {
  document.querySelectorAll('#dept-pills .pill').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.dept === state.filters.dept));
  document.querySelectorAll('#status-pills .pill').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.status === state.filters.status));
  document.querySelectorAll('#year-pills .pill').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.year === state.filters.year));
  const hasFilter = state.filters.dept || state.filters.status || state.filters.year || state.selectedCounty;
  document.getElementById('clear-filters-btn').style.opacity = hasFilter ? '1' : '0.4';
}

function clearFilters() {
  state.filters        = { dept: null, status: null, year: null };
  state.selectedCounty = null;
  updatePills(); redrawFills(); renderSidePanel();
}

// ── Side panel tabs ───────────────────────────────────────────

function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(pane =>
    pane.classList.toggle('active', pane.id === `tab-${name}`));
  renderSidePanel();
}

function renderSidePanel() {
  if      (state.activeTab === 'overview') renderOverview();
  else if (state.activeTab === 'classes')  renderClasses();
  else if (state.activeTab === 'gaps')     renderGaps();
}

// ── Overview tab ──────────────────────────────────────────────

function renderOverview() {
  const filtered = getFilteredClasses();
  const total    = filtered.length;
  const covered  = new Set(filtered.map(c => c.county)).size;
  const active   = filtered.filter(c => isActive(c.status)).length;
  const pct      = Math.round((covered / 75) * 100);

  const deptMap = {};
  getDepts().forEach(d => { deptMap[d.name] = 0; });
  filtered.forEach(c => { if (deptMap[c.department] !== undefined) deptMap[c.department]++; });
  const maxDept = Math.max(...Object.values(deptMap), 1);

  const statusMap = {};
  getStatuses().forEach(s => { statusMap[s.name] = 0; });
  filtered.forEach(c => { if (statusMap[c.status] !== undefined) statusMap[c.status]++; });

  const coverColor = pct >= 75 ? '#16A34A' : pct >= 40 ? '#D97706' : '#DC2626';

  document.getElementById('tab-overview').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total Classes</div>
        <div class="stat-value">${total}</div>
        <div class="stat-sub">${state.selectedCounty ? state.selectedCounty+' Co.' : (state.filters.dept||state.filters.status||state.filters.year) ? 'filtered' : 'all data'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active</div>
        <div class="stat-value" style="color:#2563EB">${active}</div>
        <div class="stat-sub">Scheduled + In&nbsp;Progress</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Counties Reached</div>
        <div class="stat-value">${covered}</div>
        <div class="stat-sub">of 75 AR counties</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Coverage</div>
        <div class="stat-value" style="color:${coverColor}">${pct}%</div>
        <div class="stat-sub">county coverage</div>
      </div>
    </div>

    <div class="coverage-section">
      <div class="coverage-header">
        <span style="font-weight:600">County Coverage</span>
        <span style="color:var(--text-muted)">${covered} / 75</span>
      </div>
      <div class="coverage-bar">
        <div class="coverage-fill" style="width:${pct}%;background:${coverColor}"></div>
      </div>
    </div>

    <div class="section-sep"></div>

    <div class="legend-section">
      <div class="legend-title">By Department</div>
      ${getDepts().map(dep => `
        <div class="legend-item">
          <div class="legend-swatch" style="background:${dep.color}"></div>
          <span>${escHtml(dep.name)}</span>
          <div class="legend-bar">
            <div class="legend-bar-fill" style="width:${Math.round((deptMap[dep.name]||0)/maxDept*100)}%;background:${dep.color}"></div>
          </div>
          <span class="legend-count">${deptMap[dep.name]||0}</span>
        </div>`).join('')}
    </div>

    <div class="section-sep"></div>

    <div class="legend-section">
      <div class="legend-title">By Status</div>
      ${getStatuses().map(s => `
        <div class="legend-item">
          <div class="legend-swatch" style="background:${s.color}"></div>
          <span>${escHtml(s.name)}</span>
          <span class="legend-count" style="margin-left:auto">${statusMap[s.name]||0}</span>
        </div>`).join('')}
    </div>
  `;
}

// ── Classes tab ───────────────────────────────────────────────

function renderClasses() {
  const filtered = getFilteredClasses();
  const sorted   = [...filtered].sort((a,b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.localeCompare(b.startDate);
  });

  const headerLabel = state.selectedCounty ? `${escHtml(state.selectedCounty)} County` : 'All Classes';

  let html = `<div class="class-list-header">
    <span style="font-weight:600">${headerLabel}${state.selectedCounty ? ` <button class="btn btn-sm" style="margin-left:6px;font-size:11px;padding:2px 8px" onclick="clearFilters()">× clear</button>` : ''}</span>
    <span class="class-count">${sorted.length} class${sorted.length!==1?'es':''}</span>
  </div>`;

  if (sorted.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">📍</div><div class="empty-state-text">No classes match the current filters.<br>Try clearing filters or adding a class.</div></div>`;
  } else {
    sorted.forEach(cls => {
      const deptKey   = cssKey(cls.department || '');
      const statusKey = cssKey(cls.status || '');
      const startFmt  = fmtDate(cls.startDate);
      const endFmt    = fmtDate(cls.endDate);
      const dateRange = cls.startDate
        ? (cls.endDate && cls.endDate !== cls.startDate ? `${startFmt} – ${endFmt}` : startFmt)
        : '—';
      html += `<div class="class-item">
        <div class="class-item-header">
          <div class="class-title">${escHtml(cls.classTitle||'(Untitled)')}</div>
          <div class="class-actions">
            <button class="icon-btn" title="Edit" onclick="openEditModal('${escHtml(cls.id)}')">✎</button>
            <button class="icon-btn danger" title="Delete" onclick="deleteClass('${escHtml(cls.id)}')">🗑</button>
          </div>
        </div>
        <div class="class-county">📍 ${escHtml(cls.county||'')} County</div>
        <div class="class-meta">
          ${cls.department ? `<span class="badge badge-dept-${deptKey}">${escHtml(cls.department)}</span>` : ''}
          ${cls.status     ? `<span class="badge badge-status-${statusKey}">${escHtml(cls.status)}</span>` : ''}
          <span style="font-size:11px;color:var(--text-muted)">${escHtml(dateRange)}</span>
          ${cls.instructor ? `<span style="font-size:11px;color:var(--text-muted)">· ${escHtml(cls.instructor)}</span>` : ''}
        </div>
        ${cls.venue ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">🏛 ${escHtml(cls.venue)}</div>` : ''}
        ${cls.enrollment||cls.maxSeats ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">👥 ${cls.enrollment||0}/${cls.maxSeats||'?'} seats</div>` : ''}
      </div>`;
    });
  }

  document.getElementById('tab-classes').innerHTML = html;
}

// ── Gaps tab ──────────────────────────────────────────────────

function renderGaps() {
  const filtered      = getFilteredClasses();
  const activeCovered = new Set(filtered.filter(c => isActive(c.status)).map(c => c.county));
  const gaps          = COUNTY_NAMES.filter(n => !activeCovered.has(n));
  const gapColor      = gaps.length > 50 ? '#DC2626' : gaps.length > 25 ? '#D97706' : '#16A34A';
  const filterNote    = (state.filters.dept||state.filters.status||state.filters.year) ? ' under current filters' : '';

  document.getElementById('tab-gaps').innerHTML = `
    <div class="gaps-header">Counties with no active classes${escHtml(filterNote)}.</div>
    <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:${gapColor}">${gaps.length} of 75 counties uncovered</div>
    ${gaps.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">All counties have active classes!</div></div>`
      : gaps.map((n,i) => `<div class="gap-county">${i+1}. ${escHtml(n)} County</div>`).join('')}
  `;
}

// ── Class modal ───────────────────────────────────────────────

function populateFormDropdowns() {
  const deptSel   = document.getElementById('f-department');
  const curDept   = deptSel.value;
  deptSel.innerHTML = '<option value="">Select department…</option>';
  getDepts().forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name; opt.textContent = d.name;
    deptSel.appendChild(opt);
  });
  if (curDept) deptSel.value = curDept;

  const statusSel = document.getElementById('f-status');
  const curStatus = statusSel.value;
  statusSel.innerHTML = '<option value="">Select status…</option>';
  getStatuses().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name; opt.textContent = s.name;
    statusSel.appendChild(opt);
  });
  if (curStatus) statusSel.value = curStatus;
}

function openAddModal() {
  state.editingId = null;
  document.getElementById('modal-title').textContent = 'Add Training Class';
  clearModalForm();
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('f-county').focus();
}

function openEditModal(id) {
  const cls = state.classes.find(c => c.id === id);
  if (!cls) return;
  state.editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Training Class';
  ['county','classTitle','department','status','startDate','endDate','instructor','venue','enrollment','maxSeats','notes']
    .forEach(f => { const el = document.getElementById(`f-${f}`); if (el) el.value = cls[f] != null ? cls[f] : ''; });
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.editingId = null;
}

function clearModalForm() {
  ['county','classTitle','department','status','startDate','endDate','instructor','venue','enrollment','maxSeats','notes']
    .forEach(f => { const el = document.getElementById(`f-${f}`); if (el) el.value = ''; });
}

function submitModal() {
  const county     = document.getElementById('f-county').value.trim();
  const classTitle = document.getElementById('f-classTitle').value.trim();
  const dept       = document.getElementById('f-department').value;
  const status     = document.getElementById('f-status').value;

  if (!county)     { showToast('Please select a county.'); return; }
  if (!classTitle) { showToast('Please enter a class title.'); return; }
  if (!dept)       { showToast('Please select a department.'); return; }
  if (!status)     { showToast('Please select a status.'); return; }

  const cls = ensureFields({
    id:         state.editingId || generateId(),
    county, classTitle,
    department: dept,
    status,
    startDate:  document.getElementById('f-startDate').value  || '',
    endDate:    document.getElementById('f-endDate').value    || '',
    instructor: document.getElementById('f-instructor').value.trim(),
    venue:      document.getElementById('f-venue').value.trim(),
    enrollment: parseInt(document.getElementById('f-enrollment').value) || 0,
    maxSeats:   parseInt(document.getElementById('f-maxSeats').value)   || 0,
    notes:      document.getElementById('f-notes').value.trim(),
  });

  if (state.editingId) {
    const idx = state.classes.findIndex(c => c.id === state.editingId);
    if (idx > -1) state.classes[idx] = cls;
    showToast('Class updated.');
  } else {
    state.classes.push(cls);
    showToast('Class added.');
  }

  saveData(); closeModal(); rebuildYearPills(); redrawFills(); renderSidePanel();
}

function deleteClass(id) {
  if (!confirm('Remove this class? This cannot be undone.')) return;
  state.classes = state.classes.filter(c => c.id !== id);
  saveData(); rebuildYearPills(); redrawFills(); renderSidePanel();
  showToast('Class removed.');
}

// ── Settings modal ────────────────────────────────────────────

function openSettingsModal() {
  renderSettingsTab('departments');
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettingsModal() {
  document.getElementById('settings-overlay').classList.remove('open');
}

function renderSettingsTab(tab) {
  document.querySelectorAll('.settings-tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.settingsTab === tab));

  const isDepts = tab === 'departments';
  const items   = isDepts ? settings.departments : settings.statuses;

  let html = '<div class="settings-list">';
  items.forEach((item, i) => {
    const inUse = state.classes.some(c => isDepts ? c.department === item.name : c.status === item.name);
    const thing = isDepts ? 'department' : 'status';
    html += `<div class="settings-row">
      <input type="color" class="settings-color-input" value="${escHtml(item.color)}"
             oninput="updateSettingsProp('${tab}',${i},'color',this.value)">
      <input type="text" class="form-input settings-name-input" value="${escHtml(item.name)}"
             oninput="updateSettingsProp('${tab}',${i},'name',this.value)" placeholder="Name">
      ${!isDepts ? `<label class="settings-active-label" title="Count as active for coverage calculations">
          <input type="checkbox" ${item.active?'checked':''} onchange="updateSettingsProp('${tab}',${i},'active',this.checked)"> Active
        </label>` : ''}
      <button class="icon-btn${inUse?' ':' danger'}" style="${inUse?'opacity:0.35;cursor:not-allowed':''}"
              title="${inUse?`In use — remove classes with this ${thing} first`:'Delete'}"
              onclick="${inUse?`showToast('Remove all classes using this ${thing} first')`:`deleteSettingsItem('${tab}',${i})`}">🗑</button>
    </div>`;
  });
  html += `</div>
  <button class="btn btn-sm" onclick="addSettingsItem('${tab}')" style="margin-top:10px">+ Add ${isDepts?'Department':'Status'}</button>`;

  document.getElementById('settings-tab-content').innerHTML = html;
}

function updateSettingsProp(tab, index, field, value) {
  const arr = tab === 'departments' ? settings.departments : settings.statuses;
  if (arr[index]) arr[index][field] = value;
}

function addSettingsItem(tab) {
  if (tab === 'departments') {
    settings.departments.push({ name: '', color: '#888888' });
  } else {
    settings.statuses.push({ name: '', color: '#888888', active: false });
  }
  renderSettingsTab(tab);
  const inputs = document.querySelectorAll('.settings-name-input');
  if (inputs.length) inputs[inputs.length-1].focus();
}

function deleteSettingsItem(tab, index) {
  const arr = tab === 'departments' ? settings.departments : settings.statuses;
  arr.splice(index, 1);
  renderSettingsTab(tab);
}

function saveSettingsAndClose() {
  const depts    = settings.departments;
  const statuses = settings.statuses;

  if (!depts.length)    { showToast('At least one department is required.'); return; }
  if (!statuses.length) { showToast('At least one status is required.'); return; }

  for (const d of depts) {
    if (!d.name.trim()) { showToast('Department names cannot be empty.'); return; }
  }
  if (new Set(depts.map(d => d.name)).size !== depts.length) {
    showToast('Department names must be unique.'); return;
  }
  for (const s of statuses) {
    if (!s.name.trim()) { showToast('Status names cannot be empty.'); return; }
  }
  if (new Set(statuses.map(s => s.name)).size !== statuses.length) {
    showToast('Status names must be unique.'); return;
  }

  persistSettings();
  injectDynamicStyles();
  setupFilterBar();
  populateFormDropdowns();
  rebuildYearPills();
  redrawFills();
  renderSidePanel();
  closeSettingsModal();
  showToast('Settings saved.');
}

// ── XLSX import ───────────────────────────────────────────────

function handleFileInput(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true });
      const ws   = wb.Sheets['Classes'] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });

      let added = 0, updated = 0;

      rows.forEach(row => {
        const county     = String(row['County']      || '').trim();
        const classTitle = String(row['Class Title'] || '').trim();
        if (!county || !classTitle) return;
        if (!COUNTY_NAMES.includes(county)) return;

        const toDateStr = v => {
          if (!v) return '';
          if (v instanceof Date) return v.toISOString().slice(0,10);
          return String(v).slice(0,10);
        };

        const startDate = toDateStr(row['Start Date']);
        const dept      = String(row['Department'] || '').trim();
        const status    = String(row['Status']     || '').trim();

        const existing = state.classes.find(
          c => c.county === county && c.classTitle === classTitle && c.startDate === startDate
        );

        const cls = ensureFields({
          id:         existing ? existing.id : generateId(),
          county, classTitle,
          department: getDepts().some(d => d.name === dept)     ? dept   : getDepts()[0]?.name || '',
          status:     getStatuses().some(s => s.name === status) ? status : getStatuses()[0]?.name || '',
          startDate,
          endDate:    toDateStr(row['End Date']),
          instructor: String(row['Instructor']       || '').trim(),
          venue:      String(row['Venue / Location'] || row['Venue'] || '').trim(),
          enrollment: parseInt(row['Enrollment'])    || 0,
          maxSeats:   parseInt(row['Max Seats'])     || 0,
          notes:      String(row['Notes']            || '').trim(),
        });

        if (existing) {
          const idx = state.classes.findIndex(c => c.id === existing.id);
          state.classes[idx] = cls; updated++;
        } else {
          state.classes.push(cls); added++;
        }
      });

      saveData(); rebuildYearPills(); redrawFills(); renderSidePanel();
      showToast(`Imported: ${added} added, ${updated} updated.`);
    } catch (err) {
      console.error(err);
      showToast('Error reading file. Check the format and try again.');
    }
  };
  reader.readAsArrayBuffer(file);
  evt.target.value = '';
}

// ── XLSX export ───────────────────────────────────────────────

function exportToExcel() {
  if (state.classes.length === 0) { showToast('No data to export.'); return; }
  const headers = ['County','Class Title','Department','Status','Start Date','End Date',
                   'Instructor','Venue / Location','Enrollment','Max Seats','Notes','Year','Fiscal Year','Active'];
  const rows = state.classes.map(c => [
    c.county, c.classTitle, c.department, c.status,
    c.startDate, c.endDate, c.instructor, c.venue,
    c.enrollment||0, c.maxSeats||0, c.notes,
    c.year||'', c.fiscalYear||'', c.active?'Yes':'No'
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [20,30,12,14,12,12,20,25,10,10,30,8,10,8].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Classes');
  _appendReferenceSheets(wb);
  XLSX.writeFile(wb, `CJI_Training_Data_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Export complete.');
}

function downloadTemplate() {
  const headers = ['County','Class Title','Department','Status','Start Date','End Date',
                   'Instructor','Venue / Location','Enrollment','Max Seats','Notes'];
  const example = ['Pulaski','Introduction to Law Enforcement',
    getDepts()[0]?.name||'', getStatuses()[0]?.name||'Scheduled',
    '2025-08-15','2025-08-16','Smith, John','Little Rock Police Academy',20,30,'Fall cohort'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = [20,30,12,14,12,12,20,25,10,10,30].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Classes');
  _appendReferenceSheets(wb);
  XLSX.writeFile(wb, 'CJI_Training_Data_Template.xlsx');
  showToast('Template downloaded.');
}

function _appendReferenceSheets(wb) {
  const countyWs = XLSX.utils.aoa_to_sheet([['County'], ...COUNTY_NAMES.map(n=>[n])]);
  XLSX.utils.book_append_sheet(wb, countyWs, '_Counties');

  const deptWs = XLSX.utils.aoa_to_sheet([
    ['Department','Color'],
    ...getDepts().map(d => [d.name, d.color])
  ]);
  XLSX.utils.book_append_sheet(wb, deptWs, 'Departments');

  const howWs = XLSX.utils.aoa_to_sheet([
    ['CJI Arkansas Training Map — Data File'],[''],
    ['Fill in the Classes sheet, then import using the "Load Spreadsheet" button in the app.'],
    ['The app merges on County + Class Title + Start Date, so re-importing updates existing rows.'],
    [''],['COLUMN GUIDE:'],
    ['County',         'Required. Must match one of the 75 AR counties in the _Counties sheet.'],
    ['Class Title',    'Required. Full name of the training class.'],
    ['Department',     `Required. One of: ${getDepts().map(d=>d.name).join(', ')}`],
    ['Status',         `Required. One of: ${getStatuses().map(s=>s.name).join(', ')}`],
    ['Start Date',     'YYYY-MM-DD format (e.g. 2025-08-15)'],
    ['End Date',       'YYYY-MM-DD format'],
    ['Instructor',     'Last, First'],
    ['Venue / Location','Building name or street address'],
    ['Enrollment',     'Number currently enrolled'],
    ['Max Seats',      'Maximum seat capacity'],
    ['Notes',          'Any additional notes'],[''],
    ['Year, Fiscal Year, and Active columns are computed automatically on import.'],
  ]);
  XLSX.utils.book_append_sheet(wb, howWs, 'How To Use');
}

// ── Print ─────────────────────────────────────────────────────

function triggerPrint() {
  document.getElementById('print-date').textContent =
    new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  const parts = [];
  if (state.filters.dept)   parts.push(`Dept: ${state.filters.dept}`);
  if (state.filters.status) parts.push(`Status: ${state.filters.status}`);
  if (state.filters.year)   parts.push(`Year: ${state.filters.year}`);
  if (state.selectedCounty) parts.push(`County: ${state.selectedCounty}`);
  const summaryEl = document.getElementById('print-filter-summary');
  if (summaryEl) summaryEl.textContent = parts.length ? `Filters: ${parts.join(' · ')}` : '';
  window.print();
}

// ── Init ──────────────────────────────────────────────────────

async function init() {
  settings      = loadSettings();
  injectDynamicStyles();
  state.classes = loadData().map(ensureFields);

  const countySelect = document.getElementById('f-county');
  COUNTY_NAMES.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    countySelect.appendChild(opt);
  });

  const printDateEl = document.getElementById('print-date');
  if (printDateEl) printDateEl.textContent =
    new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

  populateFormDropdowns();
  setupFilterBar();
  rebuildYearPills();
  updatePills();
  switchTab('overview');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('settings-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settings-overlay')) closeSettingsModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeSettingsModal(); }
  });

  document.getElementById('file-input').addEventListener('change', handleFileInput);

  try {
    await initMap();
    redrawFills();
  } catch (err) {
    console.error('Map load failed:', err);
    document.getElementById('map-container').innerHTML =
      `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6B7280;flex-direction:column;gap:10px;padding:20px;text-align:center">
        <div style="font-size:40px">🗺️</div>
        <div style="font-size:14px;font-weight:600">Map could not be loaded</div>
        <div style="font-size:12px">An internet connection is required to load county geometry from the CDN.<br>All other features (data entry, export) remain available.</div>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

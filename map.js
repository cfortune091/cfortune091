/* ============================================================
   CJI Arkansas Training Map — map.js
   ============================================================ */

// ── Constants ────────────────────────────────────────────────

const TOPO_URL   = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json';
const STORAGE_KEY = 'cji_training_map_v1';

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

const DEPT_COLORS = {
  'DEC':       '#1B4F8A',
  'Forensics': '#6B3FA0',
  'LEMD':      '#B85C00',
  'ACSS':      '#1A7A4A',
  'VAWA':      '#A0304A'
};

const STATUS_COLORS = {
  'Scheduled':   '#2563EB',
  'In Progress': '#D97706',
  'Completed':   '#16A34A',
  'Cancelled':   '#9CA3AF'
};

const DEPARTMENTS = ['DEC', 'Forensics', 'LEMD', 'ACSS', 'VAWA'];
const STATUSES    = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];

// ── State ────────────────────────────────────────────────────

const state = {
  classes:       [],
  filters:       { dept: null, status: null, year: null },
  selectedCounty: null,
  activeTab:     'overview',
  arFeatures:    [],
  pathGen:       null,
  editingId:     null
};

// ── Utilities ────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cssKey(str) {
  // "In Progress" → "In-Progress" for use in CSS class names
  return String(str || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
}

function parseLocalDate(str) {
  if (!str) return null;
  const parts = String(str).slice(0, 10).split('-');
  if (parts.length < 3) return null;
  return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

function fmtDate(str) {
  if (!str) return '—';
  const d = parseLocalDate(str);
  if (!d || isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  // AR state fiscal year: Jul 1 – Jun 30. Jul(6)+ → FY of following calendar year.
  return d.getMonth() >= 6 ? `FY${d.getFullYear() + 1}` : `FY${d.getFullYear()}`;
}

function isActive(status) {
  return status === 'Scheduled' || status === 'In Progress';
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.classes));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ── Filter logic ─────────────────────────────────────────────

function getFilteredClasses() {
  return state.classes.filter(c => {
    if (state.filters.dept   && c.department !== state.filters.dept)           return false;
    if (state.filters.status && c.status      !== state.filters.status)        return false;
    if (state.filters.year   && String(c.year) !== String(state.filters.year)) return false;
    if (state.selectedCounty && c.county !== state.selectedCounty)             return false;
    return true;
  });
}

function getUniqueYears() {
  const years = [...new Set(
    state.classes.map(c => c.year).filter(y => y != null)
  )].sort();
  return years.map(String);
}

// ── Map drawing ───────────────────────────────────────────────

async function initMap() {
  const us = await d3.json(TOPO_URL);

  state.arFeatures = topojson.feature(us, us.objects.counties).features
    .filter(f => String(f.id).padStart(5, '0').startsWith('05'))
    .map(f => { f.id = String(f.id).padStart(5, '0'); return f; });

  const container = document.getElementById('map-container');
  const W = container.clientWidth  || 700;
  const H = container.clientHeight || 500;

  const svg = d3.select('#map')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const arCollection = { type: 'FeatureCollection', features: state.arFeatures };
  const projection = d3.geoIdentity()
    .fitExtent([[20, 20], [W - 20, H - 20]], arCollection);
  state.pathGen = d3.geoPath().projection(projection);

  // Clip paths (one per county) used for pie-wedge fills
  const defs = svg.append('defs');
  state.arFeatures.forEach(f => {
    defs.append('clipPath')
      .attr('id', `clip-${f.id}`)
      .append('path')
        .datum(f)
        .attr('d', state.pathGen);
  });

  // Layer order: fills → borders → state outline → hit targets
  svg.append('g').attr('id', 'county-fills');

  const bordersG = svg.append('g').attr('id', 'county-borders');
  state.arFeatures.forEach(f => {
    bordersG.append('path')
      .datum(f)
      .attr('d', state.pathGen)
      .attr('fill', 'none')
      .attr('stroke', 'white')
      .attr('stroke-width', 0.7)
      .attr('pointer-events', 'none');
  });

  const arMerged = topojson.merge(
    us,
    us.objects.counties.geometries.filter(
      g => String(g.id).padStart(5, '0').startsWith('05')
    )
  );
  svg.append('path')
    .datum(arMerged)
    .attr('d', state.pathGen)
    .attr('fill', 'none')
    .attr('stroke', '#1B3A6B')
    .attr('stroke-width', 2.5)
    .attr('pointer-events', 'none');

  // Transparent hit targets (must be on top)
  const hitG = svg.append('g').attr('id', 'county-hits');
  state.arFeatures.forEach(f => {
    hitG.append('path')
      .datum(f)
      .attr('d', state.pathGen)
      .attr('fill', 'transparent')
      .attr('data-fips', f.id)
      .attr('class', 'county-hit')
      .on('mouseenter', (evt, d) => onCountyHover(evt, d))
      .on('mousemove',  (evt)    => moveTooltip(evt))
      .on('mouseleave', ()       => hideTooltip())
      .on('click',      (evt, d) => onCountyClick(d));
  });
}
function redrawFills() {
  if (!state.pathGen || !state.arFeatures.length) return;

  const filtered = getFilteredClasses();
  const byCounty = {};
  filtered.forEach(c => {
    if (!byCounty[c.county]) byCounty[c.county] = [];
    byCounty[c.county].push(c);
  });

  const fillsG = d3.select('#county-fills');
  fillsG.selectAll('*').remove();

  state.arFeatures.forEach(f => {
    const name    = AR_COUNTIES[f.id];
    if (!name) return;
    const classes  = byCounty[name] || [];
    const centroid = state.pathGen.centroid(f);
    if (!centroid || isNaN(centroid[0]) || isNaN(centroid[1])) return;

    const [[x0, y0], [x1, y1]] = state.pathGen.bounds(f);
    const r = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) * 1.5;

    if (classes.length === 0) {
      fillsG.append('path')
        .datum(f)
        .attr('d', state.pathGen)
        .attr('fill', '#D1D5DB')
        .attr('pointer-events', 'none');
    } else {
      const deptCounts = {};
      classes.forEach(c => {
        deptCounts[c.department] = (deptCounts[c.department] || 0) + 1;
      });
      const entries = Object.entries(deptCounts);

      if (entries.length === 1) {
        // Solid fill for single department
        fillsG.append('path')
          .datum(f)
          .attr('d', state.pathGen)
          .attr('fill', DEPT_COLORS[entries[0][0]] || '#888')
          .attr('pointer-events', 'none');
      } else {
        // Pie wedges clipped to county shape
        const pieData = entries.map(([dept, count]) => ({ dept, count }));
        const pie  = d3.pie().value(d => d.count).sort(null)(pieData);
        const arc  = d3.arc().innerRadius(0).outerRadius(r);
        pie.forEach(slice => {
          fillsG.append('path')
            .attr('transform', `translate(${centroid[0]},${centroid[1]})`)
            .attr('d', arc(slice))
            .attr('fill', DEPT_COLORS[slice.data.dept] || '#888')
            .attr('clip-path', `url(#clip-${f.id})`)
            .attr('pointer-events', 'none');
        });
      }
    }

    // Selected county: gold border overlay
    if (state.selectedCounty === name) {
      fillsG.append('path')
        .datum(f)
        .attr('d', state.pathGen)
        .attr('fill', 'none')
        .attr('stroke', '#C8A84B')
        .attr('stroke-width', 3)
        .attr('pointer-events', 'none');
    }
  });
}

// ── Tooltip ───────────────────────────────────────────────────

function onCountyHover(evt, feature) {
  const name = AR_COUNTIES[feature.id];
  if (!name) return;

  const classes = getFilteredClasses().filter(c => c.county === name);
  const tip     = document.getElementById('tooltip');

  let html = `<div class="tooltip-county">${escHtml(name)} County</div>`;

  if (classes.length === 0) {
    const qualifier = (state.filters.dept || state.filters.status || state.filters.year)
      ? ' matching current filters' : '';
    html += `<div style="opacity:0.65;font-size:11px">No classes${qualifier}</div>`;
  } else {
    const show = classes.slice(0, 4);
    show.forEach(c => {
      html += `<div class="tooltip-class">
        <div class="tooltip-class-title">${escHtml(c.classTitle)}</div>
        <div class="tooltip-class-meta">${escHtml(c.department)} · ${escHtml(c.status)} · ${fmtDate(c.startDate)}</div>
      </div>`;
    });
    if (classes.length > 4) {
      html += `<div style="opacity:0.6;font-size:11px;margin-top:4px">+${classes.length - 4} more</div>`;
    }
  }

  tip.innerHTML = html;
  tip.classList.add('visible');
  moveTooltip(evt);
}

function moveTooltip(evt) {
  const tip = document.getElementById('tooltip');
  const x   = evt.clientX + 14;
  const y   = evt.clientY - 10;
  const tw  = tip.offsetWidth;
  const th  = tip.offsetHeight;
  tip.style.left = (x + tw > window.innerWidth  - 10 ? x - tw - 28 : x) + 'px';
  tip.style.top  = (y + th > window.innerHeight - 10 ? y - th      : y) + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').classList.remove('visible');
}

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
  DEPARTMENTS.forEach(dept => {
    const btn = document.createElement('button');
    btn.className    = `pill dept-${dept}`;
    btn.dataset.dept = dept;
    btn.textContent  = dept;
    btn.onclick = () => {
      state.filters.dept   = state.filters.dept === dept ? null : dept;
      state.selectedCounty = null;
      updatePills();
      redrawFills();
      renderSidePanel();
    };
    deptBar.appendChild(btn);
  });

  const statusBar = document.getElementById('status-pills');
  STATUSES.forEach(status => {
    const btn = document.createElement('button');
    btn.className       = `pill status-${cssKey(status)}`;
    btn.dataset.status  = status;
    btn.textContent     = status;
    btn.onclick = () => {
      state.filters.status = state.filters.status === status ? null : status;
      state.selectedCounty = null;
      updatePills();
      redrawFills();
      renderSidePanel();
    };
    statusBar.appendChild(btn);
  });
}

function rebuildYearPills() {
  const yearBar = document.getElementById('year-pills');
  yearBar.innerHTML = '';
  getUniqueYears().forEach(yr => {
    const btn = document.createElement('button');
    btn.className      = 'pill';
    btn.dataset.year   = yr;
    btn.textContent    = yr;
    btn.onclick = () => {
      state.filters.year   = state.filters.year === yr ? null : yr;
      state.selectedCounty = null;
      updatePills();
      redrawFills();
      renderSidePanel();
    };
    yearBar.appendChild(btn);
  });
  updatePills();
}

function updatePills() {
  document.querySelectorAll('#dept-pills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dept === state.filters.dept);
  });
  document.querySelectorAll('#status-pills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === state.filters.status);
  });
  document.querySelectorAll('#year-pills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.year === state.filters.year);
  });
  const hasFilter = state.filters.dept || state.filters.status ||
                    state.filters.year || state.selectedCounty;
  document.getElementById('clear-filters-btn').style.opacity = hasFilter ? '1' : '0.4';
}

function clearFilters() {
  state.filters        = { dept: null, status: null, year: null };
  state.selectedCounty = null;
  updatePills();
  redrawFills();
  renderSidePanel();
}

// ── Side panel tabs ───────────────────────────────────────────

function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${name}`);
  });
  renderSidePanel();
}

function renderSidePanel() {
  if      (state.activeTab === 'overview') renderOverview();
  else if (state.activeTab === 'classes')  renderClasses();
  else if (state.activeTab === 'gaps')     renderGaps();
}

// ── Overview tab ──────────────────────────────────────────────

function renderOverview() {
  const filtered  = getFilteredClasses();
  const total     = filtered.length;
  const covered   = new Set(filtered.map(c => c.county)).size;
  const active    = filtered.filter(c => isActive(c.status)).length;
  const pct       = Math.round((covered / 75) * 100);

  const deptMap = {};
  DEPARTMENTS.forEach(d => { deptMap[d] = 0; });
  filtered.forEach(c => { if (deptMap[c.department] !== undefined) deptMap[c.department]++; });
  const maxDept = Math.max(...Object.values(deptMap), 1);

  const statusMap = {};
  STATUSES.forEach(s => { statusMap[s] = 0; });
  filtered.forEach(c => { if (statusMap[c.status] !== undefined) statusMap[c.status]++; });

  const coverColor = pct >= 75 ? '#16A34A' : pct >= 40 ? '#D97706' : '#DC2626';

  document.getElementById('tab-overview').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total Classes</div>
        <div class="stat-value">${total}</div>
        <div class="stat-sub">${state.selectedCounty ? state.selectedCounty + ' Co.' : state.filters.dept || state.filters.status || state.filters.year ? 'filtered' : 'all data'}</div>
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
      ${DEPARTMENTS.map(dept => `
        <div class="legend-item">
          <div class="legend-swatch" style="background:${DEPT_COLORS[dept]}"></div>
          <span>${escHtml(dept)}</span>
          <div class="legend-bar">
            <div class="legend-bar-fill" style="width:${Math.round(deptMap[dept] / maxDept * 100)}%;background:${DEPT_COLORS[dept]}"></div>
          </div>
          <span class="legend-count">${deptMap[dept]}</span>
        </div>`).join('')}
    </div>

    <div class="section-sep"></div>

    <div class="legend-section">
      <div class="legend-title">By Status</div>
      ${STATUSES.map(st => `
        <div class="legend-item">
          <div class="legend-swatch" style="background:${STATUS_COLORS[st]}"></div>
          <span>${escHtml(st)}</span>
          <span class="legend-count" style="margin-left:auto">${statusMap[st]}</span>
        </div>`).join('')}
    </div>
  `;
}
// ── Classes tab ───────────────────────────────────────────────

function renderClasses() {
  const filtered = getFilteredClasses();
  const sorted   = [...filtered].sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.localeCompare(b.startDate);
  });

  const headerLabel = state.selectedCounty
    ? `${escHtml(state.selectedCounty)} County`
    : 'All Classes';

  let html = `<div class="class-list-header">
    <span style="font-weight:600">${headerLabel}${state.selectedCounty ? ` <button class="btn btn-sm" style="margin-left:6px;font-size:11px;padding:2px 8px" onclick="clearFilters()">× clear</button>` : ''}</span>
    <span class="class-count">${sorted.length} class${sorted.length !== 1 ? 'es' : ''}</span>
  </div>`;

  if (sorted.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-state-icon">📍</div>
      <div class="empty-state-text">No classes match the current filters.<br>Try clearing filters or adding a class.</div>
    </div>`;
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
          <div class="class-title">${escHtml(cls.classTitle || '(Untitled)')}</div>
          <div class="class-actions">
            <button class="icon-btn" title="Edit" onclick="openEditModal('${escHtml(cls.id)}')">✎</button>
            <button class="icon-btn danger" title="Delete" onclick="deleteClass('${escHtml(cls.id)}')">🗑</button>
          </div>
        </div>
        <div class="class-county">📍 ${escHtml(cls.county || '')} County</div>
        <div class="class-meta">
          ${cls.department ? `<span class="badge badge-dept-${deptKey}">${escHtml(cls.department)}</span>` : ''}
          ${cls.status     ? `<span class="badge badge-status-${statusKey}">${escHtml(cls.status)}</span>` : ''}
          <span style="font-size:11px;color:var(--text-muted)">${escHtml(dateRange)}</span>
          ${cls.instructor ? `<span style="font-size:11px;color:var(--text-muted)">· ${escHtml(cls.instructor)}</span>` : ''}
        </div>
        ${cls.venue ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">🏛 ${escHtml(cls.venue)}</div>` : ''}
        ${cls.enrollment || cls.maxSeats
          ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">👥 ${cls.enrollment || 0}/${cls.maxSeats || '?'} seats</div>`
          : ''}
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
  const filterNote    = (state.filters.dept || state.filters.status || state.filters.year)
    ? ' under current filters' : '';

  document.getElementById('tab-gaps').innerHTML = `
    <div class="gaps-header">
      Counties with no active (Scheduled or In Progress) classes${escHtml(filterNote)}.
    </div>
    <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:${gapColor}">
      ${gaps.length} of 75 counties uncovered
    </div>
    ${gaps.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">All counties have active classes!</div></div>`
      : gaps.map((n, i) => `<div class="gap-county">${i + 1}. ${escHtml(n)} County</div>`).join('')
    }
  `;
}

// ── Modal ─────────────────────────────────────────────────────

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
    .forEach(f => {
      const el = document.getElementById(`f-${f}`);
      if (el) el.value = cls[f] != null ? cls[f] : '';
    });
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.editingId = null;
}

function clearModalForm() {
  ['county','classTitle','department','status','startDate','endDate','instructor','venue','enrollment','maxSeats','notes']
    .forEach(f => {
      const el = document.getElementById(`f-${f}`);
      if (el) el.value = '';
    });
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
    county,
    classTitle,
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

  saveData();
  closeModal();
  rebuildYearPills();
  redrawFills();
  renderSidePanel();
}

function deleteClass(id) {
  if (!confirm('Remove this class? This cannot be undone.')) return;
  state.classes = state.classes.filter(c => c.id !== id);
  saveData();
  rebuildYearPills();
  redrawFills();
  renderSidePanel();
  showToast('Class removed.');
}
// ── XLSX import ───────────────────────────────────────────────

function handleFileInput(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      const ws   = wb.Sheets['Classes'] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      let added = 0, updated = 0;

      rows.forEach(row => {
        const county     = String(row['County']      || '').trim();
        const classTitle = String(row['Class Title'] || '').trim();
        if (!county || !classTitle) return;
        if (!COUNTY_NAMES.includes(county)) return;

        const toDateStr = v => {
          if (!v) return '';
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return String(v).slice(0, 10);
        };

        const startDate = toDateStr(row['Start Date']);
        const endDate   = toDateStr(row['End Date']);
        const dept      = String(row['Department'] || '').trim();
        const status    = String(row['Status']     || 'Scheduled').trim();

        const existing = state.classes.find(
          c => c.county === county && c.classTitle === classTitle && c.startDate === startDate
        );

        const cls = ensureFields({
          id:         existing ? existing.id : generateId(),
          county,
          classTitle,
          department: DEPARTMENTS.includes(dept)   ? dept   : DEPARTMENTS[0],
          status:     STATUSES.includes(status)     ? status : 'Scheduled',
          startDate,
          endDate,
          instructor: String(row['Instructor']       || '').trim(),
          venue:      String(row['Venue / Location'] || row['Venue'] || '').trim(),
          enrollment: parseInt(row['Enrollment'])    || 0,
          maxSeats:   parseInt(row['Max Seats'])     || 0,
          notes:      String(row['Notes']            || '').trim(),
        });

        if (existing) {
          const idx = state.classes.findIndex(c => c.id === existing.id);
          state.classes[idx] = cls;
          updated++;
        } else {
          state.classes.push(cls);
          added++;
        }
      });

      saveData();
      rebuildYearPills();
      redrawFills();
      renderSidePanel();
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

  const headers = [
    'County','Class Title','Department','Status',
    'Start Date','End Date','Instructor','Venue / Location',
    'Enrollment','Max Seats','Notes','Year','Fiscal Year','Active'
  ];

  const rows = state.classes.map(c => [
    c.county, c.classTitle, c.department, c.status,
    c.startDate, c.endDate, c.instructor, c.venue,
    c.enrollment || 0, c.maxSeats || 0, c.notes,
    c.year || '', c.fiscalYear || '', c.active ? 'Yes' : 'No'
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [20,30,12,14,12,12,20,25,10,10,30,8,10,8].map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Classes');
  _appendReferenceSheets(wb);

  const filename = `CJI_Training_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast('Export complete.');
}

function downloadTemplate() {
  const headers = [
    'County','Class Title','Department','Status',
    'Start Date','End Date','Instructor','Venue / Location',
    'Enrollment','Max Seats','Notes'
  ];
  const example = [
    'Pulaski','Introduction to Law Enforcement','LEMD','Scheduled',
    '2025-08-15','2025-08-16','Smith, John','Little Rock Police Academy',
    20, 30, 'Fall cohort'
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = [20,30,12,14,12,12,20,25,10,10,30].map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Classes');
  _appendReferenceSheets(wb);

  XLSX.writeFile(wb, 'CJI_Training_Data_Template.xlsx');
  showToast('Template downloaded.');
}

function _appendReferenceSheets(wb) {
  const countyWs = XLSX.utils.aoa_to_sheet([['County'], ...COUNTY_NAMES.map(n => [n])]);
  XLSX.utils.book_append_sheet(wb, countyWs, '_Counties');

  const deptWs = XLSX.utils.aoa_to_sheet([
    ['Department', 'Color'],
    ...DEPARTMENTS.map(d => [d, DEPT_COLORS[d]])
  ]);
  XLSX.utils.book_append_sheet(wb, deptWs, 'Departments');

  const howWs = XLSX.utils.aoa_to_sheet([
    ['CJI Arkansas Training Map — Data File'],
    [''],
    ['Fill in the Classes sheet, then import using the "Load Spreadsheet" button in the app.'],
    ['The app merges on County + Class Title + Start Date, so re-importing updates existing rows.'],
    [''],
    ['COLUMN GUIDE:'],
    ['County',          'Required. Must match one of the 75 AR counties in the _Counties sheet.'],
    ['Class Title',     'Required. Full name of the training class.'],
    ['Department',      'Required. One of: DEC, Forensics, LEMD, ACSS, VAWA'],
    ['Status',          'Required. One of: Scheduled, In Progress, Completed, Cancelled'],
    ['Start Date',      'YYYY-MM-DD format (e.g. 2025-08-15)'],
    ['End Date',        'YYYY-MM-DD format'],
    ['Instructor',      'Last, First'],
    ['Venue / Location','Building name or street address'],
    ['Enrollment',      'Number currently enrolled'],
    ['Max Seats',       'Maximum seat capacity'],
    ['Notes',           'Any additional notes'],
    [''],
    ['Year, Fiscal Year, and Active columns are computed automatically on import.'],
  ]);
  XLSX.utils.book_append_sheet(wb, howWs, 'How To Use');
}

// ── Print ─────────────────────────────────────────────────────

function triggerPrint() {
  document.getElementById('print-date').textContent =
    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Show filter summary for print
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
  // Load persisted data
  state.classes = loadData().map(ensureFields);

  // Populate county dropdown in modal
  const countySelect = document.getElementById('f-county');
  COUNTY_NAMES.forEach(name => {
    const opt = document.createElement('option');
    opt.value       = name;
    opt.textContent = name;
    countySelect.appendChild(opt);
  });

  // Print date placeholder
  const printDateEl = document.getElementById('print-date');
  if (printDateEl) {
    printDateEl.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  setupFilterBar();
  rebuildYearPills();
  updatePills();
  switchTab('overview');

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // File import
  document.getElementById('file-input').addEventListener('change', handleFileInput);

  // Load map
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

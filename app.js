/* EM Faculty Census Explorer — static, no dependencies. */
'use strict';
(function () {
  const REPO = 'https://github.com/tampaERdoc/em-faculty-census';
  const PAGE = 100;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const fmt = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));
  const pct = (a, b, d = 1) => (b ? (100 * a / b).toFixed(d) + '%' : '—');
  const money = (v) => (v == null ? '' : '$' + Math.round(v).toLocaleString('en-US'));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  const fmtQ = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toString());

  const RANKS = ['No rank', 'Instructor', 'Assistant professor', 'Associate professor', 'Full professor', 'Emeritus', 'Other title'];
  const PHENOS = ['AAU + Vizient + Blue Ridge', 'AAU + Blue Ridge', 'Vizient + Blue Ridge', 'Blue Ridge', 'AAU + Vizient', 'AAU', 'Vizient', 'None'];
  const TYPES = ['Research-marker academic: NIH-ranked (Blue Ridge)', 'Research-marker academic: AAU or Vizient', 'University-based academic (no marker)',
    'Corporate (for-profit hospital or national staffing group)', 'Community-based (non-profit or public)', 'Military'];
  const TYPE_SHORT = ['NIH-ranked academic', 'AAU/Vizient academic', 'University-based', 'Corporate', 'Community-based', 'Military'];
  const ERAS = ['Legacy (on or before 2000)', '2001–2013', '2014–2020 (single accreditation)', '2021 or later'];
  const CHAIR_KEYS = [['A', 'Academic chair'], ['H', 'Hospital chair'], ['N', 'No chair identified']];
  const HB = [[0, 0, 'h = 0'], [1, 4, 'h 1–4'], [5, 9, 'h 5–9'], [10, 19, 'h 10–19'], [20, 1e9, 'h ≥ 20']];
  const has = (tok, t) => tok.indexOf(t) >= 0;
  const ROLE_GROUPS = [
    { id: 'pca', label: 'Program chair: academic', test: (p) => p.chd === 1 && p.cht === 'A' },
    { id: 'pch', label: 'Program chair: hospital', test: (p) => p.chd === 1 && p.cht === 'H' },
    { id: 'chair', label: 'Any chair title', test: (p) => p.chd > 0 || has(p.tok, 'Chair') || has(p.tok, 'Interim Chair') },
    { id: 'vice', label: 'Vice chair', test: (p) => p.tok.some((t) => t.indexOf('Vice Chair') >= 0) },
    { id: 'chief', label: 'Division or section chief', test: (p) => has(p.tok, 'Division Chief') || has(p.tok, 'Section Chief') },
    { id: 'pd', label: 'Program director', test: (p) => has(p.tok, 'Program Director') },
    { id: 'apd', label: 'Associate or assistant program director', test: (p) => has(p.tok, 'Associate Program Director') || has(p.tok, 'Assistant Program Director') },
    { id: 'md', label: 'Medical director (incl. associate/assistant)', test: (p) => p.tok.some((t) => /Medical Director$/.test(t)) },
    { id: 'res', label: 'Research director or vice chair of research', test: (p) => p.tok.some((t) => ['Research Director', 'Vice Chair of Research', 'Vice Chair of Population Health & Research', 'Associate Vice Chair of Research'].indexOf(t) >= 0) },
    { id: 'clerk', label: 'Clerkship director', test: (p) => p.tok.some((t) => /Clerkship Director$/.test(t)) },
    { id: 'fellow', label: 'Fellowship director', test: (p) => p.tok.some((t) => /Fellowship Director$/.test(t)) },
    { id: 'edu', label: 'Education director', test: (p) => has(p.tok, 'Education Director') },
    { id: 'odir', label: 'Other director', test: (p) => has(p.tok, 'Other Director') },
    { id: 'olead', label: 'Other department leadership', test: (p) => has(p.tok, 'Other Department Leadership') },
    { id: 'fac', label: 'Faculty (no leadership title)', test: (p) => p.tok.every((t) => t === 'Faculty') && p.chd === 0 },
  ];
  const DEGS = [[1, 'MD (incl. MBBS/MBChB)'], [2, 'DO'], [4, 'PhD or other research doctorate'], [8, 'Non-physician doctorate only'], [16, 'Degree not verified']];

  let DATA, META, LK, P = [], F = [], OWN = [], STAFF = [], STATES = [], CHAIRPOS = [];
  const DEFAULT = { view: 'programs', q: '', aau: '', viz: '', br: '', pheno: [], type: [], chair: [], cpos: [], do: '', era: [], st: '', own: [], staff: [], len: '',
    rank: [], role: [], deg: [], hs: 'sc', hmin: '', hmax: '', hp: '', sp: 'name', dp: 1, sf: 'name', df: 1 };
  let S = JSON.parse(JSON.stringify(DEFAULT));
  let shown = PAGE, lastList = null, inApp = false, navDepth = 0, lastFocus = null;
  let matchP = [], matchF = [];

  /* ---------------------------------------------------------------- load */
  fetch('census-data.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { DATA = d; init(); })
    .catch((e) => { $('#loading').innerHTML = '<p>Could not load the data (' + esc(e.message) + '). Please reload the page.</p>'; });

  function init() {
    META = DATA.meta; LK = DATA.lookups;
    decode();
    $('#tagline').textContent = 'National census of ' + fmt(META.nRecords) + ' faculty-program records at all ' + META.nPrograms + ' ACGME-accredited emergency medicine residency programs · ' + META.asOf;
    $('#tagline-short').textContent = fmt(META.nRecords) + ' faculty records · ' + META.nPrograms + ' EM programs · ' + META.asOf;
    buildFilters();
    bindUI();
    $('#loading').hidden = true; $('#toolbar').hidden = false; $('#layout').hidden = false; $('#app').setAttribute('aria-busy', 'false');
    route();
    window.addEventListener('hashchange', route);
  }

  function decode() {
    const c = {}; DATA.cols.forEach((k, i) => { c[k] = i; });
    OWN = uniq(DATA.programs.map((p) => p.ownType)).sort(collator.compare);
    STAFF = uniq(DATA.programs.map((p) => p.staffCat)).sort(collator.compare);
    STATES = uniq(DATA.programs.map((p) => p.state)).sort();
    CHAIRPOS = uniq(DATA.programs.map((p) => p.chairPos).filter(Boolean)).sort(collator.compare);
    P = DATA.programs.map((p, i) => Object.assign({}, p, {
      i, phenoIdx: PHENOS.indexOf(p.pheno), typeIdx: TYPES.indexOf(p.type6), eraIdx: ERAS.indexOf(p.accEra), ownIdx: OWN.indexOf(p.ownType), staffIdx: STAFF.indexOf(p.staffCat),
      chairKey: p.chair == null ? 'N' : (p.chairType === 'Academic chair' ? 'A' : 'H'), cposIdx: CHAIRPOS.indexOf(p.chairPos), fac: [], pds: [],
    }));
    F = DATA.people.map((r, i) => {
      const roles = LK.roles[r[c.roles]] || '';
      const tok = roles.split(';').map((t) => t.trim()).filter(Boolean);
      const p = {
        i, rid: r[c.rid], fn: r[c.fn], ln: r[c.ln], cred: LK.cred[r[c.cred]], deg: LK.deg[r[c.deg]], degF: LK.degFlags[r[c.deg]], progs: r[c.progs],
        inst: LK.inst[r[c.inst]], rank: r[c.rank], title: LK.title[r[c.title]], roles, tok, ftype: LK.ftype[r[c.ftype]],
        sc: r[c.sc], scb: r[c.scb], scid: r[c.scid], gs: r[c.gs], gsb: r[c.gsb], gsid: r[c.gsid],
        aau: r[c.aau], aaum: LK.aaum[r[c.aaum]], viz: r[c.viz], brr: r[c.brr], brf: r[c.brf], brpr: r[c.brpr], brpf: r[c.brpf],
        chd: r[c.chd], cht: r[c.cht], chpos: LK.chairpos[r[c.chpos]], chtitle: r[c.chtitle], chsrc: r[c.chsrc], chev: r[c.chev], chfor: r[c.chfor],
        roster: LK.roster[r[c.roster]], profile: r[c.profile], rsrc: r[c.rsrc],
      };
      p.name = (p.fn + ' ' + p.ln).trim();
      p.sortName = p.ln + ' ' + p.fn;
      p.phenoIdx = PHENOS.indexOf(phenoOf(p.aau, p.viz === 1, p.brr != null));
      p.roleMask = ROLE_GROUPS.reduce((m, g, k) => (g.test(p) ? m | (1 << k) : m), 0);
      p.isDO = (p.degF & 2) && !(p.degF & 1);
      return p;
    });
    F.forEach((p) => p.progs.forEach((pi) => { P[pi].fac.push(p.i); if (has(p.tok, 'Program Director')) P[pi].pds.push(p.i); }));
    P.forEach((p) => {
      const fac = p.fac.map((k) => F[k]);
      const sc = fac.map((f) => f.sc).sort((a, b) => a - b), gs = fac.map((f) => f.gs).sort((a, b) => a - b);
      p.n = fac.length;
      p.rankN = RANKS.map((_, k) => fac.filter((f) => f.rank === k).length);
      p.noRank = p.n ? p.rankN[0] / p.n : 0;
      p.medSc = quantile(sc, 0.5); p.q1Sc = quantile(sc, 0.25); p.q3Sc = quantile(sc, 0.75); p.meanSc = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
      p.medGs = quantile(gs, 0.5); p.q1Gs = quantile(gs, 0.25); p.q3Gs = quantile(gs, 0.75);
      p.ge10 = p.n ? fac.filter((f) => f.sc >= 10).length / p.n : 0;
      p.doShare = p.n ? fac.filter((f) => f.isDO).length / p.n : 0;
      p.hBands = HB.map(([lo, hi]) => fac.filter((f) => f.sc >= lo && f.sc <= hi).length);
      p.aauMembers = uniq(fac.map((f) => f.aaum).filter(Boolean));
      const brs = {}; fac.forEach((f) => { if (f.brr != null) { const k = f.inst + '|' + f.brr; brs[k] = brs[k] || { inst: f.inst, rank: f.brr, fund: f.brf }; } });
      p.brList = Object.values(brs).sort((a, b) => a.rank - b.rank);
      p.brBest = p.brList.length ? p.brList[0].rank : null;
      p.accSort = p.accCensored ? 1999 : (p.accYear == null ? 9999 : p.accYear);
      p.chairName = p.chair == null ? '' : F[p.chair].name;
      p.pdNames = p.pds.map((k) => F[k].name);
      p.hay = ' ' + norm([p.name, p.sponsor, p.site, p.city, p.state, p.id, p.nrmp, p.owner, p.staffing, p.chairName].concat(p.pdNames, p.aliases || []).join(' ')).replace(/[^a-z0-9]+/g, ' ') + ' ';
    });
    F.forEach((p) => {
      const pr = p.progs.map((k) => P[k]);
      p.hay = ' ' + norm([p.fn, p.ln, p.inst].concat(pr.map((x) => x.name + ' ' + x.city + ' ' + x.state + ' ' + x.site + ' ' + (x.aliases || []).join(' '))).join(' ')).replace(/[^a-z0-9]+/g, ' ') + ' ';
      p.progName = pr.length ? pr[0].name : '';
    });
  }
  function uniq(a) { return Array.from(new Set(a)); }
  function phenoOf(a, v, b) { const parts = []; if (a) parts.push('AAU'); if (v) parts.push('Vizient'); if (b) parts.push('Blue Ridge'); return parts.length ? parts.join(' + ') : 'None'; }

  /* ---------------------------------------------------------------- filters UI */
  function checks(key, items, note) {
    return '<div class="checks" data-key="' + key + '">' + items.map(([val, label, n]) =>
      '<label class="check"><input type="checkbox" value="' + esc(val) + '"><span class="lbl">' + esc(label) + '</span>' + (n != null ? '<span class="n" data-n="' + esc(val) + '">' + fmt(n) + '</span>' : '') + '</label>').join('') + '</div>' + (note ? '<p class="note">' + note + '</p>' : '');
  }
  function tri(key, label) {
    return '<div class="tri"><span>' + label + '</span><span class="seg" data-key="' + key + '" role="group" aria-label="' + esc(label) + '">' +
      [['', 'Any'], ['1', 'Yes'], ['0', 'No']].map(([v, t]) => '<button type="button" data-v="' + v + '" aria-pressed="false">' + t + '</button>').join('') + '</span></div>';
  }
  function buildFilters() {
    const cnt = (fn) => P.filter(fn).length;
    const html = [];
    html.push('<div class="fgroup"><h3>Research markers</h3><p class="hint" id="marker-hint"></p>' + tri('aau', 'AAU') + tri('viz', 'Vizient') + tri('br', 'Blue Ridge ranked') +
      '<p class="fsub">Marker phenotype</p>' + checks('pheno', PHENOS.map((ph, k) => [k, ph, cnt((p) => p.phenoIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Program type</h3>' + checks('type', TYPES.map((t, k) => [k, t, cnt((p) => p.typeIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Program chair</h3>' + checks('chair', CHAIR_KEYS.map(([k, l]) => [k, l, cnt((p) => p.chairKey === k)])) +
      '<p class="fsub">Chair position</p>' + checks('cpos', CHAIRPOS.map((t, k) => [k, t, cnt((p) => p.cposIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Origin and accreditation</h3>' + tri('do', 'DO origin (moved from AOA)') +
      '<p class="fsub">ACGME accreditation era</p>' + checks('era', ERAS.map((t, k) => [k, t, cnt((p) => p.eraIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Location and ownership</h3><div class="row2"><label for="f-st" class="sr-only">State</label><select id="f-st" class="sel"><option value="">All states</option>' +
      STATES.map((s) => '<option value="' + esc(s) + '">' + esc(s) + ' (' + cnt((p) => p.state === s) + ')</option>').join('') + '</select>' +
      '<label for="f-len" class="sr-only">Program length</label><select id="f-len" class="sel"><option value="">Any length</option><option value="3">3-year (' + cnt((p) => p.length === 3) + ')</option><option value="4">4-year (' + cnt((p) => p.length === 4) + ')</option></select></div>' +
      '<details class="more-filters"><summary>Hospital ownership and ED staffing</summary><p class="fsub">Hospital ownership</p>' + checks('own', OWN.map((t, k) => [k, t, cnt((p) => p.ownIdx === k)])) +
      '<p class="fsub">ED staffing</p>' + checks('staff', STAFF.map((t, k) => [k, t, cnt((p) => p.staffIdx === k)])) + '</details></div>');
    const rc = RANKS.map((_, k) => F.filter((f) => f.rank === k).length);
    html.push('<div class="fgroup people-only"><h3>Academic rank</h3>' + checks('rank', RANKS.map((r, k) => [k, r, rc[k]])) + '</div>');
    html.push('<div class="fgroup people-only"><h3>Role</h3>' + checks('role', ROLE_GROUPS.map((g, k) => [g.id, g.label, F.filter((f) => f.roleMask & (1 << k)).length])) + '</div>');
    html.push('<div class="fgroup people-only"><h3>h-index</h3><div class="row2"><label for="f-hs" class="sr-only">h-index source</label><select id="f-hs" class="sel"><option value="sc">Scopus</option><option value="gs">Google Scholar</option></select>' +
      '<label class="sr-only" for="f-hmin">Minimum h-index</label><input id="f-hmin" class="num-in" type="number" min="0" step="1" inputmode="numeric" placeholder="min"><span>to</span>' +
      '<label class="sr-only" for="f-hmax">Maximum h-index</label><input id="f-hmax" class="num-in" type="number" min="0" step="1" inputmode="numeric" placeholder="max"></div>' +
      '<div class="presets" id="h-presets">' + [['0', '0'], ['1', '4'], ['5', '9'], ['10', '19'], ['20', ''], ['10', '']].map(([a, b]) => '<button type="button" data-min="' + a + '" data-max="' + b + '">' + (b === '' ? a + '+' : (a === b ? a : a + '–' + b)) + '</button>').join('') + '</div>' +
      '<p class="fsub">Profile</p><div class="row2"><label for="f-hp" class="sr-only">Profile status</label><select id="f-hp" class="sel"><option value="">Any</option><option value="obs">Matched profile (observed value)</option><option value="zero">No matched profile (counted as 0)</option></select></div></div>');
    html.push('<div class="fgroup people-only"><h3>Degree</h3>' + checks('deg', DEGS.map(([b, l]) => [b, l, F.filter((f) => f.degF & b).length])) + '</div>');
    $('#filter-groups').innerHTML = html.join('');
  }

  function syncFilterUI() {
    document.querySelectorAll('.checks[data-key]').forEach((box) => {
      const vals = S[box.dataset.key].map(String);
      box.querySelectorAll('input').forEach((i) => { i.checked = vals.indexOf(i.value) >= 0; });
    });
    document.querySelectorAll('.seg[data-key]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S[seg.dataset.key])));
    });
    $('#f-st').value = S.st; $('#f-len').value = S.len; $('#f-hs').value = S.hs; $('#f-hmin').value = S.hmin; $('#f-hmax').value = S.hmax; $('#f-hp').value = S.hp;
    if ($('#q').value !== S.q) $('#q').value = S.q;
    const people = S.view === 'people';
    document.querySelectorAll('.people-only').forEach((g) => g.classList.toggle('hidden-by-view', !people));
    $('#marker-hint').textContent = people ? 'Markers of each faculty member’s own institution.' : 'A program carries a marker if any of its faculty records does.';
    $('#tab-programs').setAttribute('aria-selected', String(!people)); $('#tab-people').setAttribute('aria-selected', String(people));
    const nf = activeFilters().length; const b = $('#filter-badge'); b.hidden = !nf; b.textContent = nf;
  }

  function bindUI() {
    let t;
    $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; changed(); }, 140); });
    document.querySelectorAll('.view-switch button').forEach((b) => b.addEventListener('click', () => { if (S.view !== b.dataset.view) { S.view = b.dataset.view; changed(true); } }));
    $('#filter-groups').addEventListener('change', (e) => {
      const box = e.target.closest('.checks[data-key]');
      if (e.target.id === 'f-hmin' || e.target.id === 'f-hmax') return;
      if (box) {
        const key = box.dataset.key;
        S[key] = Array.from(box.querySelectorAll('input:checked')).map((i) => (['role', 'chair'].indexOf(key) >= 0 ? i.value : Number(i.value)));
        return changed();
      }
      if (e.target.id === 'f-st') S.st = e.target.value;
      if (e.target.id === 'f-len') S.len = e.target.value;
      if (e.target.id === 'f-hs') S.hs = e.target.value;
      if (e.target.id === 'f-hp') S.hp = e.target.value;
      changed();
    });
    $('#filter-groups').addEventListener('input', (e) => {
      if (e.target.id === 'f-hmin' || e.target.id === 'f-hmax') { clearTimeout(t); t = setTimeout(() => { S.hmin = cleanNum($('#f-hmin').value); S.hmax = cleanNum($('#f-hmax').value); changed(); }, 250); }
    });
    $('#filter-groups').addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (b) { S[b.parentElement.dataset.key] = b.dataset.v; return changed(); }
      const pr = e.target.closest('#h-presets button');
      if (pr) { S.hmin = pr.dataset.min; S.hmax = pr.dataset.max; changed(); }
    });
    $('#clear-filters').addEventListener('click', () => { const keep = { view: S.view, q: S.q, sp: S.sp, dp: S.dp, sf: S.sf, df: S.df }; S = Object.assign(JSON.parse(JSON.stringify(DEFAULT)), keep); changed(); });
    $('#filters-toggle').addEventListener('click', () => toggleFilters(true));
    $('#filters-close').addEventListener('click', () => toggleFilters(false));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#overlay').hidden) closeOverlay(); else if ($('#filters').classList.contains('open')) toggleFilters(false);
    });
    document.addEventListener('click', (e) => { if (document.body.classList.contains('filters-open') && !e.target.closest('#filters') && !e.target.closest('#filters-toggle')) toggleFilters(false); });
    $('#chips').addEventListener('click', (e) => { const b = e.target.closest('button[data-rm]'); if (b) { removeFilter(b.dataset.rm); } });
    $('#thead').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sort]'); if (!b) return;
      const k = b.dataset.sort, pk = S.view === 'people' ? ['sf', 'df'] : ['sp', 'dp'];
      if (S[pk[0]] === k) S[pk[1]] = -S[pk[1]]; else { S[pk[0]] = k; S[pk[1]] = b.dataset.dir === 'desc' ? -1 : 1; }
      changed();
    });
    $('#tbody').addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // links handle themselves
      const tr = e.target.closest('tr[data-href]'); if (tr) go(tr.dataset.href);
    });
    $('#tbody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('a')) { const tr = e.target.closest('tr[data-href]'); if (tr) go(tr.dataset.href); } });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#/program/"], a[href^="#/person/"], a[href="#/about"]');
      if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) inApp = true;
    });
    $('#show-more').addEventListener('click', () => { shown += PAGE * 2; renderTable(); });
    $('#export-csv').addEventListener('click', () => (S.view === 'people' ? exportPeople(matchF.map((k) => F[k]), 'em-census-people') : exportPrograms(matchP.map((k) => P[k]), 'em-census-programs')));
    $('#copy-link').addEventListener('click', () => copy(location.href.split('#')[0] + listHash(), 'Link to this search copied'));
    $('#overlay').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeOverlay(); });
  }
  function cleanNum(v) { v = String(v).trim(); if (v === '') return ''; const n = Math.max(0, Math.floor(Number(v))); return isFinite(n) ? String(n) : ''; }
  function toggleFilters(open) {
    $('#filters').classList.toggle('open', open); document.body.classList.toggle('filters-open', open);
    $('#filters-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('#filters').focus && $('#filters .filters-head button').focus();
  }

  /* ---------------------------------------------------------------- state <-> hash */
  const ARR = ['pheno', 'type', 'chair', 'cpos', 'era', 'own', 'staff', 'rank', 'role', 'deg'];
  const STR = ['q', 'aau', 'viz', 'br', 'do', 'st', 'len', 'hs', 'hmin', 'hmax', 'hp', 'sp', 'sf'];
  function listHash() {
    const u = new URLSearchParams();
    STR.forEach((k) => { if (S[k] !== DEFAULT[k] && S[k] !== '') u.set(k, S[k]); });
    ARR.forEach((k) => { if (S[k].length) u.set(k, S[k].join('.')); });
    if (S.dp !== 1) u.set('dp', S.dp); if (S.df !== 1) u.set('df', S.df);
    const qs = u.toString();
    return '#/' + S.view + (qs ? '?' + qs : '');
  }
  function parseList(view, qs) {
    const u = new URLSearchParams(qs || ''), s = JSON.parse(JSON.stringify(DEFAULT));
    s.view = view;
    STR.forEach((k) => { if (u.has(k)) s[k] = u.get(k); });
    ARR.forEach((k) => { if (u.get(k)) s[k] = u.get(k).split('.').filter((x) => x !== '').map((x) => (['role', 'chair'].indexOf(k) >= 0 ? x : Number(x))).filter((x) => x === x); });
    s.dp = u.get('dp') === '-1' ? -1 : 1; s.df = u.get('df') === '-1' ? -1 : 1;
    return s;
  }
  function go(hash) { inApp = true; location.hash = hash; }
  function route() {
    const h = location.hash || '';
    const wasInApp = inApp; inApp = false;
    let m = h.match(/^#\/(people|programs)(?:\?(.*))?$/);
    if (m) {
      navDepth = 0;
      if (h === lastList && !$('#overlay').hidden) { closeOverlay(true); return; }
      S = parseList(m[1], m[2]); lastList = listHash(); closeOverlay(true); shown = PAGE; syncFilterUI(); render(); return;
    }
    if (wasInApp) navDepth++;
    if (!lastList) { S = parseList('programs', ''); lastList = listHash(); syncFilterUI(); render(); }
    m = h.match(/^#\/program\/(\d+)$/);
    if (m) { const p = P.find((x) => x.id === m[1]); return p ? openOverlay(programHTML(p), programActions(p), p.name) : notFound(); }
    m = h.match(/^#\/person\/(.+)$/);
    if (m) { const rid = decodeURIComponent(m[1]); const f = F.find((x) => x.rid === rid); return f ? openOverlay(personHTML(f), personActions(f), f.name) : notFound(); }
    if (h === '#/about') return openOverlay(aboutHTML(), '', 'About the data');
    history.replaceState(null, '', '#/programs'); route();
  }
  function notFound() { openOverlay('<p class="d-kicker">Not found</p><h2 class="d-title" id="panel-title">No such record</h2><p>The link may be out of date.</p>', '', 'Not found'); }
  function changed(viewChange) {
    shown = PAGE; const h = listHash(); lastList = h;
    history.replaceState(null, '', h);
    syncFilterUI(); render();
    if (viewChange) $('#results').focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- matching */
  function tokens() { return norm(S.q).split(/[^a-z0-9]+/).filter(Boolean); }
  function textOK(hay, toks) { for (let k = 0; k < toks.length; k++) if (hay.indexOf(' ' + toks[k]) < 0) return false; return true; }
  function triOK(v, want) { return want === '' || (want === '1' ? !!v : !v); }
  function progOK(p, markers) {
    if (markers) {
      if (!triOK(p.aau, S.aau) || !triOK(p.viz, S.viz) || !triOK(p.br, S.br)) return false;
      if (S.pheno.length && S.pheno.indexOf(p.phenoIdx) < 0) return false;
    }
    if (S.type.length && S.type.indexOf(p.typeIdx) < 0) return false;
    if (S.chair.length && S.chair.indexOf(p.chairKey) < 0) return false;
    if (S.cpos.length && S.cpos.indexOf(p.cposIdx) < 0) return false;
    if (!triOK(p.doOrigin, S.do)) return false;
    if (S.era.length && S.era.indexOf(p.eraIdx) < 0) return false;
    if (S.st && p.state !== S.st) return false;
    if (S.own.length && S.own.indexOf(p.ownIdx) < 0) return false;
    if (S.staff.length && S.staff.indexOf(p.staffIdx) < 0) return false;
    if (S.len && String(p.length) !== S.len) return false;
    return true;
  }
  function progFilterActive() { return S.type.length || S.chair.length || S.cpos.length || S.do || S.era.length || S.st || S.own.length || S.staff.length || S.len; }
  function computeMatches() {
    const toks = tokens();
    matchP = []; P.forEach((p) => { if (progOK(p, true) && textOK(p.hay, toks)) matchP.push(p.i); });
    const pOK = P.map((p) => progOK(p, false)), anyProg = progFilterActive();
    const roleBits = S.role.reduce((m, id) => { const k = ROLE_GROUPS.findIndex((g) => g.id === id); return k >= 0 ? m | (1 << k) : m; }, 0);
    const degBits = S.deg.reduce((m, b) => m | b, 0);
    const hmin = S.hmin === '' ? null : Number(S.hmin), hmax = S.hmax === '' ? null : Number(S.hmax);
    matchF = [];
    for (let k = 0; k < F.length; k++) {
      const f = F[k];
      if (anyProg && !f.progs.some((pi) => pOK[pi])) continue;
      if (!triOK(f.aau, S.aau) || !triOK(f.viz === 1, S.viz) || !triOK(f.brr != null, S.br)) continue;
      if (S.pheno.length && S.pheno.indexOf(f.phenoIdx) < 0) continue;
      if (S.rank.length && S.rank.indexOf(f.rank) < 0) continue;
      if (roleBits && !(f.roleMask & roleBits)) continue;
      if (degBits && !(f.degF & degBits)) continue;
      const hv = S.hs === 'gs' ? f.gs : f.sc, hb = S.hs === 'gs' ? f.gsb : f.scb;
      if (hmin != null && hv < hmin) continue;
      if (hmax != null && hv > hmax) continue;
      if (S.hp === 'obs' && hb !== 0) continue;
      if (S.hp === 'zero' && hb === 0) continue;
      if (!textOK(f.hay, toks)) continue;
      matchF.push(k);
    }
  }

  /* ---------------------------------------------------------------- chips */
  function activeFilters() {
    const out = [], tl = { '1': 'Yes', '0': 'No' };
    if (S.aau) out.push(['aau', 'AAU: ' + tl[S.aau]]);
    if (S.viz) out.push(['viz', 'Vizient: ' + tl[S.viz]]);
    if (S.br) out.push(['br', 'Blue Ridge ranked: ' + tl[S.br]]);
    S.pheno.forEach((v) => out.push(['pheno:' + v, 'Phenotype: ' + PHENOS[v]]));
    S.type.forEach((v) => out.push(['type:' + v, TYPES[v]]));
    S.chair.forEach((v) => out.push(['chair:' + v, (CHAIR_KEYS.find((c) => c[0] === v) || [, v])[1]]));
    S.cpos.forEach((v) => out.push(['cpos:' + v, 'Chair: ' + CHAIRPOS[v]]));
    if (S.do) out.push(['do', 'DO origin: ' + tl[S.do]]);
    S.era.forEach((v) => out.push(['era:' + v, 'Accredited: ' + ERAS[v]]));
    if (S.st) out.push(['st', 'State: ' + S.st]);
    if (S.len) out.push(['len', S.len + '-year programs']);
    S.own.forEach((v) => out.push(['own:' + v, 'Ownership: ' + OWN[v]]));
    S.staff.forEach((v) => out.push(['staff:' + v, 'Staffing: ' + STAFF[v]]));
    S.rank.forEach((v) => out.push(['rank:' + v, RANKS[v]]));
    S.role.forEach((v) => out.push(['role:' + v, (ROLE_GROUPS.find((g) => g.id === v) || { label: v }).label]));
    S.deg.forEach((v) => out.push(['deg:' + v, (DEGS.find((d) => d[0] === v) || [, v])[1]]));
    if (S.hmin !== '' || S.hmax !== '') out.push(['h', (S.hs === 'gs' ? 'Scholar' : 'Scopus') + ' h ' + (S.hmin !== '' && S.hmax !== '' ? (S.hmin === S.hmax ? '= ' + S.hmin : S.hmin + '–' + S.hmax) : (S.hmin !== '' ? '≥ ' + S.hmin : '≤ ' + S.hmax))]);
    if (S.hp) out.push(['hp', S.hp === 'obs' ? 'Matched ' + (S.hs === 'gs' ? 'Scholar' : 'Scopus') + ' profile' : 'No matched ' + (S.hs === 'gs' ? 'Scholar' : 'Scopus') + ' profile']);
    return out;
  }
  function removeFilter(key) {
    const [k, v] = key.split(':');
    if (v !== undefined) S[k] = S[k].filter((x) => String(x) !== v);
    else if (k === 'h') { S.hmin = ''; S.hmax = ''; }
    else S[k] = DEFAULT[k];
    changed();
  }

  /* ---------------------------------------------------------------- render list */
  const PCOLS = [
    { k: 'name', t: 'Program', cls: '' },
    { k: 'type', t: 'Type', cls: 'col-opt' },
    { k: 'aau', t: 'AAU', cls: 'ctr', dir: 'desc' },
    { k: 'viz', t: 'Vizient', cls: 'ctr', dir: 'desc' },
    { k: 'br', t: 'Blue Ridge', cls: 'ctr' },
    { k: 'chair', t: 'Chair', cls: 'col-opt' },
    { k: 'n', t: 'Faculty', cls: 'num', dir: 'desc' },
    { k: 'norank', t: 'No rank', cls: 'num col-opt', dir: 'desc' },
    { k: 'medsc', t: 'Median Scopus h', cls: 'num', dir: 'desc' },
    { k: 'acc', t: 'Accredited', cls: 'num col-opt' },
    { k: 'do', t: 'DO origin', cls: 'ctr col-opt', dir: 'desc' },
  ];
  const FCOLS = [
    { k: 'name', t: 'Name', cls: '' },
    { k: 'program', t: 'Program', cls: '' },
    { k: 'rank', t: 'Rank', cls: '' },
    { k: 'role', t: 'Role', cls: 'col-opt' },
    { k: 'sc', t: 'Scopus h', cls: 'num', dir: 'desc' },
    { k: 'gs', t: 'Scholar h', cls: 'num', dir: 'desc' },
    { k: 'aau', t: 'AAU', cls: 'ctr', dir: 'desc' },
    { k: 'viz', t: 'Vizient', cls: 'ctr', dir: 'desc' },
    { k: 'br', t: 'Blue Ridge', cls: 'ctr' },
  ];
  const nullLast = (a, b, dir) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : dir * (a - b));
  function sortPrograms(arr) {
    const k = S.sp, d = S.dp;
    const key = {
      name: (a, b) => d * collator.compare(a.name, b.name), type: (a, b) => d * (a.typeIdx - b.typeIdx), aau: (a, b) => d * (a.aau - b.aau), viz: (a, b) => d * (a.viz - b.viz),
      br: (a, b) => nullLast(a.brBest, b.brBest, d), chair: (a, b) => d * collator.compare(a.chairKey, b.chairKey), n: (a, b) => d * (a.n - b.n), norank: (a, b) => d * (a.noRank - b.noRank),
      medsc: (a, b) => nullLast(a.medSc, b.medSc, d), acc: (a, b) => d * (a.accSort - b.accSort), do: (a, b) => d * (a.doOrigin - b.doOrigin),
    }[k] || ((a, b) => collator.compare(a.name, b.name));
    return arr.sort((a, b) => key(a, b) || collator.compare(a.name, b.name));
  }
  function sortPeople(arr) {
    const k = S.sf, d = S.df;
    const key = {
      name: (a, b) => d * collator.compare(a.sortName, b.sortName), program: (a, b) => d * collator.compare(a.progName, b.progName), rank: (a, b) => d * (a.rank - b.rank),
      role: (a, b) => d * collator.compare(roleText(a), roleText(b)), sc: (a, b) => d * (a.sc - b.sc), gs: (a, b) => d * (a.gs - b.gs), aau: (a, b) => d * (a.aau - b.aau),
      viz: (a, b) => d * ((a.viz === 1) - (b.viz === 1)), br: (a, b) => nullLast(a.brr, b.brr, d),
    }[k] || ((a, b) => collator.compare(a.sortName, b.sortName));
    return arr.sort((a, b) => key(a, b) || collator.compare(a.sortName, b.sortName));
  }
  function roleText(f) { const t = f.tok.filter((x) => x !== 'Faculty'); return t.length ? t.join('; ') : 'Faculty'; }
  function render() {
    computeMatches();
    $('#count-programs').textContent = fmt(matchP.length);
    $('#count-people').textContent = fmt(matchF.length);
    const people = S.view === 'people';
    const chips = activeFilters();
    $('#chips').innerHTML = chips.map(([k, l]) => '<span class="chip">' + esc(l) + '<button type="button" data-rm="' + esc(k) + '" aria-label="Remove filter ' + esc(l) + '">&times;</button></span>').join('') +
      (!people && chips.some(([k]) => /^(rank|role|deg|h|hp)/.test(k)) ? '<span class="note">Rank, role, degree, and h-index filters apply in the People view.</span>' : '');
    const qt = tokens(), notes = qt.length ? P.filter((p) => p.searchNote && p.keys.some((k) => qt.indexOf(k) >= 0)) : [];
    $('#search-note').hidden = !notes.length;
    $('#search-note').innerHTML = notes.map((p) => esc(p.searchNote) + ' <a href="#/program/' + p.id + '">Open the ' + esc(p.name) + ' program</a>.').join('<br>');
    if (people) {
      const rows = matchF.map((k) => F[k]);
      const sc = rows.map((f) => f.sc).sort((a, b) => a - b);
      const nr = rows.filter((f) => f.rank === 0).length;
      const np = new Set(); rows.forEach((f) => f.progs.forEach((p) => np.add(p)));
      $('#result-count').textContent = fmt(rows.length) + (rows.length === 1 ? ' faculty record' : ' faculty records');
      $('#result-summary').textContent = rows.length ? 'Median Scopus h ' + fmtQ(quantile(sc, 0.5)) + ' (IQR ' + fmtQ(quantile(sc, 0.25)) + '–' + fmtQ(quantile(sc, 0.75)) + ') · ' + pct(nr, rows.length) + ' no rank · at ' + fmt(np.size) + (np.size === 1 ? ' program' : ' programs') : '';
      sortPeople(rows); $('#table').dataset.rows = rows.length; renderHead(FCOLS, S.sf, S.df); curRows = rows;
      $('#table-note').innerHTML = 'Faint values marked ° are not observed on a matched profile and are counted as 0, as in the study. Blue Ridge shows the rank of the faculty member’s medical school in the FY2025 NIH ranking of EM departments.';
    } else {
      const rows = matchP.map((k) => P[k]);
      const uf = new Set(); rows.forEach((p) => p.fac.forEach((k) => uf.add(k))); const nfac = uf.size;
      $('#result-count').textContent = fmt(rows.length) + (rows.length === 1 ? ' program' : ' programs');
      $('#result-summary').textContent = rows.length ? fmt(nfac) + ' faculty records · ' + rows.filter((p) => p.aau).length + ' AAU · ' + rows.filter((p) => p.viz).length + ' Vizient · ' + rows.filter((p) => p.br).length + ' Blue Ridge ranked' : '';
      sortPrograms(rows);
      const toks = tokens(), pinned = toks.length ? rows.filter((p) => p.keys && p.keys.some((k) => toks.indexOf(k) >= 0)) : [];
      if (pinned.length) { const pin = new Set(pinned); rows.splice(0, rows.length, ...pinned, ...rows.filter((p) => !pin.has(p))); }
      renderHead(PCOLS, S.sp, S.dp); curRows = rows;
      $('#table-note').innerHTML = 'Faculty counts are faculty-program records linked to each program. Blue Ridge shows the best (lowest) FY2025 NIH rank among the program’s medical schools. Accredited is the year of ACGME accreditation; ≤2000 means accredited on or before 2000.';
    }
    renderTable();
  }
  let curRows = [];
  function renderHead(cols, key, dir) {
    const html = '<tr>' + cols.map((c) => {
      const on = c.k === key, arrow = on ? (dir === 1 ? '▲' : '▼') : '↕';
      return '<th scope="col" class="' + c.cls + '"' + (on ? ' aria-sort="' + (dir === 1 ? 'ascending' : 'descending') + '"' : '') + '><button type="button" data-sort="' + c.k + '"' + (c.dir ? ' data-dir="' + c.dir + '"' : '') + '>' + esc(c.t) + '<span class="arrow" aria-hidden="true">' + arrow + '</span></button></th>';
    }).join('') + '</tr>';
    if (renderHead.last !== html) { $('#thead').innerHTML = html; renderHead.last = html; }
  }
  function renderTable() {
    const people = S.view === 'people', rows = curRows.slice(0, shown);
    $('#tbody').innerHTML = rows.map(people ? personRow : programRow).join('');
    $('#empty').hidden = curRows.length > 0;
    const more = curRows.length - shown;
    $('#show-more').hidden = more <= 0;
    $('#show-more').textContent = 'Show ' + fmt(Math.min(more, PAGE * 2)) + ' more (' + fmt(more) + ' not shown)';
  }
  const yes = (v) => (v ? '<span class="yes">Yes</span>' : '<span class="dash">—</span>');
  const brCell = (r) => (r == null ? '<span class="dash">—</span>' : '#' + r);
  function hCell(v, basis, src) {
    if (basis === 0) return String(v);
    const why = src === 'gs' ? META.gsBasis[basis] : META.scBasis[basis];
    return '<span class="zero" title="' + esc(why) + '">' + v + '<sup aria-hidden="true">°</sup><span class="sr-only"> (' + esc(why) + ')</span></span>';
  }
  function programRow(p) {
    const acc = p.accCensored ? '≤2000' : (p.accYear == null ? '—' : p.accYear + (p.accApprox ? '*' : ''));
    return '<tr data-href="#/program/' + p.id + '" tabindex="0"><td class="w-name"><a class="rowlink" href="#/program/' + p.id + '">' + esc(p.name) + '</a><span class="sub">' + esc(p.city) + ', ' + esc(p.state) + (p.site ? ' · ' + esc(p.site) : '') + '</span></td>' +
      '<td class="col-opt w-type">' + esc(TYPE_SHORT[p.typeIdx]) + '</td><td class="ctr">' + yes(p.aau) + '</td><td class="ctr">' + yes(p.viz) + '</td><td class="ctr">' + brCell(p.brBest) + '</td>' +
      '<td class="col-opt w-chair">' + (p.chair == null ? '<span class="dash">None identified</span>' : esc(p.chairKey === 'A' ? 'Academic' : 'Hospital') + '<span class="sub">' + esc(p.chairName) + '</span>') + '</td>' +
      '<td class="num">' + fmt(p.n) + '</td><td class="num col-opt">' + pct(p.rankN[0], p.n, 0) + '</td><td class="num">' + fmtQ(p.medSc) + '</td><td class="num col-opt">' + acc + '</td><td class="ctr col-opt">' + (p.doOrigin ? '<span class="pill gold">DO</span>' : '<span class="dash">—</span>') + '</td></tr>';
  }
  function personRow(f) {
    const pr = f.progs.map((k) => P[k]);
    const prog = pr.length ? '<a class="plink" href="#/program/' + pr[0].id + '">' + esc(pr[0].name) + '</a>' + (pr.length > 1 ? '<span class="sub">+' + (pr.length - 1) + ' more</span>' : '<span class="sub">' + esc(pr[0].city) + ', ' + esc(pr[0].state) + '</span>') : '';
    return '<tr data-href="#/person/' + encodeURIComponent(f.rid) + '" tabindex="0"><td class="w-name"><a class="rowlink" href="#/person/' + encodeURIComponent(f.rid) + '">' + esc(f.name) + '</a>' + (f.cred ? '<span class="sub">' + esc(f.cred) + '</span>' : '') + '</td>' +
      '<td class="w-prog">' + prog + '</td><td>' + esc(RANKS[f.rank]) + '</td><td class="col-opt">' + esc(roleText(f)) + '</td>' +
      '<td class="num">' + hCell(f.sc, f.scb, 'sc') + '</td><td class="num">' + hCell(f.gs, f.gsb, 'gs') + '</td>' +
      '<td class="ctr">' + yes(f.aau) + '</td><td class="ctr">' + (f.viz === 1 ? '<span class="yes">Yes</span>' : f.viz === 2 ? '<span class="dash" title="Unresolved">?</span>' : '<span class="dash">—</span>') + '</td><td class="ctr">' + brCell(f.brr) + '</td></tr>';
  }

  /* ---------------------------------------------------------------- overlay */
  function openOverlay(html, actions, title) {
    const o = $('#overlay');
    if (o.hidden) lastFocus = document.activeElement;
    $('#panel-body').innerHTML = html; $('#panel-actions').innerHTML = actions || '';
    o.hidden = false; document.body.classList.add('no-scroll');
    $('#panel-body').scrollTop = 0;
    document.title = title + ' · EM Faculty Census Explorer';
    $('#panel').focus();
    bindPanel();
  }
  function closeOverlay(fromRoute) {
    const o = $('#overlay');
    if (o.hidden) return;
    if (fromRoute) { o.hidden = true; document.body.classList.remove('no-scroll'); document.title = 'EM Faculty Census Explorer'; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); return; }
    if (navDepth > 0) { navDepth--; history.back(); }
    else location.replace(location.href.split('#')[0] + (lastList || '#/programs'));
  }
  function bindPanel() {
    const b = $('#panel-body');
    b.querySelectorAll('[data-export]').forEach((btn) => btn.addEventListener('click', () => {
      const p = P.find((x) => x.id === btn.dataset.export);
      exportPeople(p.fac.map((k) => F[k]), 'em-census-' + slug(p.name));
    }));
    b.querySelectorAll('table[data-prog]').forEach(renderFacultyTable);
    b.querySelectorAll('tbody[data-rows]').forEach((tb) => tb.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; const tr = e.target.closest('tr[data-href]'); if (tr) go(tr.dataset.href);
    }));
    const pa = $('#panel-actions');
    pa.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', () => copy(location.href, 'Link copied')));
    pa.querySelectorAll('[data-export]').forEach((btn) => btn.addEventListener('click', () => {
      const p = P.find((x) => x.id === btn.dataset.export); exportPeople(p.fac.map((k) => F[k]), 'em-census-' + slug(p.name));
    }));
    pa.querySelectorAll('[data-export-person]').forEach((btn) => btn.addEventListener('click', () => {
      const f = F.find((x) => x.rid === btn.dataset.exportPerson); exportPeople([f], 'em-census-' + slug(f.name));
    }));
    pa.querySelectorAll('[data-export-all]').forEach((btn) => btn.addEventListener('click', () => (btn.dataset.exportAll === 'people' ? exportPeople(F, 'em-census-all-people') : exportPrograms(P, 'em-census-all-programs'))));
  }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
  const fact = (k, v) => (v === '' || v == null ? '' : '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>');
  const link = (u, t) => (safeUrl(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t || u) + '</a>' : '');
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const srcHTML = (u, label) => (safeUrl(u) ? link(u, (label ? label + ' (' + host(u) + ')' : host(u))) : (u ? esc((label ? label + ': ' : '') + u) : ''));
  function bars(labels, counts, total) {
    return '<div class="bars">' + labels.map((l, k) => '<div class="barrow"><span>' + esc(l) + '</span><span class="track" aria-hidden="true"><span class="fill" style="width:' + (total ? (100 * counts[k] / total).toFixed(1) : 0) + '%"></span></span><span class="val">' + fmt(counts[k]) + ' (' + pct(counts[k], total, 0) + ')</span></div>').join('') + '</div>';
  }

  function programActions(p) {
    return '<button type="button" class="btn" data-copy>Copy link</button><button type="button" class="btn btn-primary" data-export="' + p.id + '">Export faculty CSV</button>';
  }
  function programHTML(p) {
    const ch = p.chair == null ? null : F[p.chair];
    const acc = p.accCensored ? 'On or before 2000 (legacy program; ACGME histories begin in academic year 2000–2001)' :
      (p.accYear == null ? '—' : p.accYear + (p.accDate ? '<span class="sub">Effective ' + esc(longDate(p.accDate)) + (p.accApprox ? ' (approximate)' : '') + (p.accStatus ? ' · first status: ' + esc(p.accStatus) : '') + '</span>' : ''));
    const brTxt = p.brList.length ? p.brList.map((b) => 'Rank #' + b.rank + ' · ' + esc(b.inst) + (b.fund != null ? ' · ' + money(b.fund) + ' NIH funding to EM (FY2025)' : '')).join('<br>') : 'Not ranked';
    const pills = ['<span class="pill on">' + esc(TYPES[p.typeIdx]) + '</span>', '<span class="pill">' + esc(p.pheno === 'None' ? 'No research marker' : 'Markers: ' + p.pheno) + '</span>']
      .concat(p.doOrigin ? ['<span class="pill gold">DO origin</span>'] : []).concat(p.chair == null ? [] : ['<span class="pill">' + esc(p.chairType) + '</span>']);
    const chairBlock = ch ? '<a href="#/person/' + encodeURIComponent(ch.rid) + '">' + esc(ch.name) + '</a>' + (p.chairInterim ? ' (interim)' : '') +
      '<span class="sub">' + esc(p.chairType) + ' · ' + esc(p.chairPos) + '</span>' + (p.chairTitle ? '<span class="sub">Listed title: “' + esc(p.chairTitle) + '”</span>' : '') +
      '<span class="sub">Evidence: ' + esc(p.chairEv || '—') + (p.chairSrc ? ' · ' + srcHTML(p.chairSrc, 'source') : '') + '</span>' : '<span class="dash">No chair identified in public sources</span>';
    const pdBlock = p.pds.length ? p.pds.map((k) => '<a href="#/person/' + encodeURIComponent(F[k].rid) + '">' + esc(F[k].name) + '</a>').join('<br>') : '<span class="dash">Not listed</span>';
    return '<p class="d-kicker">Program · ACGME ' + esc(p.id) + '</p><h2 class="d-title" id="panel-title">' + esc(p.name) + '</h2>' +
      '<p class="d-sub">' + esc(p.site) + (p.sponsor && p.sponsor !== p.name ? ' · sponsor: ' + esc(p.sponsor) : '') + ' · ' + esc(p.city) + ', ' + esc(p.state) + '</p>' +
      '<div class="pills d-pills">' + pills.join('') + '</div>' +
      (p.note ? '<div class="callout-note" role="note"><strong>Not to be confused:</strong> ' + esc(p.note) +
        (p.related && p.related.length ? '<span class="sub">See ' + p.related.map((k) => '<a href="#/program/' + P[k].id + '">' + esc(P[k].name) + '</a>').join(' and ') + '.</span>' : '') + '</div>' : '') +
      '<div class="stats">' + stat(fmt(p.n), 'faculty records') + stat(pct(p.rankN[0], p.n, 0), 'no academic rank') + stat(fmtQ(p.medSc), 'median Scopus h (IQR ' + fmtQ(p.q1Sc) + '–' + fmtQ(p.q3Sc) + ')') + stat(fmtQ(p.medGs), 'median Google Scholar h') + '</div>' +
      '<div class="card"><h3>Program</h3><dl class="facts">' +
      fact('Program type', esc(TYPES[p.typeIdx])) + fact('Marker phenotype', esc(p.pheno)) +
      fact('AAU', p.aau ? 'Yes' + (p.aauMembers.length ? '<span class="sub">' + esc(p.aauMembers.join('; ')) + '</span>' : '') : 'No' + (p.aauNote ? '<span class="sub">' + esc(p.aauNote) + '</span>' : '')) +
      fact('Vizient', p.viz ? 'Yes (Vizient Academic Medical Center cohort)' : 'No') + fact('Blue Ridge (NIH)', brTxt) +
      fact('Year accredited (ACGME)', acc) + fact('Accreditation era', esc(p.accEra)) +
      fact('DO origin', (p.doOrigin ? 'Yes: AOA-accredited program that moved to ACGME accreditation' : 'No' + (p.origin && p.origin.indexOf('ACGME (allopathic)') !== 0 ? '<span class="sub">' + esc(p.origin) + '</span>' : '')) +
        (p.formerName ? '<span class="sub">Formerly ' + esc(p.formerName) + '</span>' : '') + (p.originBasis ? '<span class="sub">Basis: ' + esc(p.originBasis) + '</span>' : '')) +
      fact('Program length', p.length ? p.length + ' years' : '') + fact('Affiliation', esc(p.affil)) + fact('NRMP code', esc(p.nrmp)) +
      '</dl></div>' +
      '<div class="card"><h3>Leadership</h3><dl class="facts">' + fact('Program chair', chairBlock) + fact('Program director', pdBlock) +
      (p.chairSecondary ? fact('Other chairs', esc(p.chairSecondary)) : '') + '</dl></div>' +
      '<div class="card"><h3>Hospital ownership and ED staffing</h3><dl class="facts">' +
      fact('Owner', esc(p.owner) + (p.ownType ? '<span class="sub">' + esc(p.ownType) + '</span>' : '')) + fact('ED staffing', esc(p.staffing) + (p.staffCat ? '<span class="sub">' + esc(p.staffCat) + '</span>' : '')) +
      fact('Corporate ties', esc(p.corpRel)) + fact('Classification', esc(cap(p.classConf)) + ' confidence' + (safeUrl(p.ownSrc) ? '<span class="sub">' + link(p.ownSrc, 'Ownership source (' + host(p.ownSrc) + ')') + '</span>' : '') + (safeUrl(p.staffSrc) ? '<span class="sub">' + link(p.staffSrc, 'Staffing source (' + host(p.staffSrc) + ')') + '</span>' : '')) +
      '</dl></div>' +
      '<div class="two"><div class="card"><h3>Academic rank</h3>' + bars(RANKS, p.rankN, p.n) + '</div><div class="card"><h3>Scopus h-index</h3>' + bars(HB.map((b) => b[2]), p.hBands, p.n) +
      '<p class="note">Mean ' + fmtQ(p.meanSc) + ' · ' + pct(Math.round(p.ge10 * p.n), p.n, 0) + ' with h ≥ 10 · ' + pct(Math.round(p.doShare * p.n), p.n, 0) + ' DO-only degree</p></div></div>' +
      '<div class="card"><h3>Faculty (' + fmt(p.n) + ')</h3><div class="table-wrap" style="max-height:none"><table class="data" data-prog="' + p.id + '" data-sort="rank" data-dir="-1"><thead></thead><tbody data-rows></tbody></table></div>' +
      '<p class="note">Faint values marked ° are not observed on a matched profile and are counted as 0, as in the study.</p></div>';
  }
  const stat = (v, k) => '<div class="stat"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div></div>';
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  function longDate(iso) { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
  const PF = [['name', 'Name'], ['rank', 'Rank', 'desc'], ['role', 'Role'], ['sc', 'Scopus h', 'desc', 'num'], ['gs', 'Scholar h', 'desc', 'num'], ['aau', 'AAU', 'desc', 'ctr'], ['viz', 'Vizient', 'desc', 'ctr'], ['br', 'Blue Ridge', '', 'ctr']];
  function renderFacultyTable(tbl) {
    const p = P.find((x) => x.id === tbl.dataset.prog), k = tbl.dataset.sort, d = Number(tbl.dataset.dir);
    const rows = p.fac.map((i) => F[i]);
    const cmp = { name: (a, b) => collator.compare(a.sortName, b.sortName), rank: (a, b) => (a.rank <= 4 ? a.rank : -1) - (b.rank <= 4 ? b.rank : -1), role: (a, b) => collator.compare(roleText(a), roleText(b)), sc: (a, b) => a.sc - b.sc, gs: (a, b) => a.gs - b.gs,
      aau: (a, b) => a.aau - b.aau, viz: (a, b) => (a.viz === 1) - (b.viz === 1), br: (a, b) => (a.brr == null ? 999 : a.brr) - (b.brr == null ? 999 : b.brr) }[k];
    rows.sort((a, b) => d * cmp(a, b) || collator.compare(a.sortName, b.sortName));
    tbl.querySelector('thead').innerHTML = '<tr>' + PF.map(([c, t, dir, cls]) => '<th scope="col" class="' + (cls || '') + (c === 'role' ? ' col-opt' : '') + '"' + (c === k ? ' aria-sort="' + (d === 1 ? 'ascending' : 'descending') + '"' : '') + '><button type="button" data-psort="' + c + '"' + (dir ? ' data-dir="' + dir + '"' : '') + '>' + t + '<span class="arrow" aria-hidden="true">' + (c === k ? (d === 1 ? '▲' : '▼') : '↕') + '</span></button></th>').join('') + '</tr>';
    tbl.querySelector('tbody').innerHTML = rows.map((f) => '<tr data-href="#/person/' + encodeURIComponent(f.rid) + '"><td><a class="rowlink" href="#/person/' + encodeURIComponent(f.rid) + '">' + esc(f.name) + '</a>' + (f.cred ? '<span class="sub">' + esc(f.cred) + '</span>' : '') + '</td><td>' + esc(RANKS[f.rank]) + '</td><td class="col-opt">' + esc(roleText(f)) + '</td><td class="num">' + hCell(f.sc, f.scb, 'sc') + '</td><td class="num">' + hCell(f.gs, f.gsb, 'gs') + '</td><td class="ctr">' + yes(f.aau) + '</td><td class="ctr">' + (f.viz === 1 ? '<span class="yes">Yes</span>' : '<span class="dash">—</span>') + '</td><td class="ctr">' + brCell(f.brr) + '</td></tr>').join('');
    tbl.querySelectorAll('thead button[data-psort]').forEach((btn) => btn.addEventListener('click', () => {
      const kk = btn.dataset.psort; tbl.dataset.dir = tbl.dataset.sort === kk ? -Number(tbl.dataset.dir) : (btn.dataset.dir === 'desc' ? -1 : 1); tbl.dataset.sort = kk; renderFacultyTable(tbl);
    }));
  }

  function personActions(f) {
    return '<button type="button" class="btn" data-copy>Copy link</button><button type="button" class="btn btn-primary" data-export-person="' + esc(f.rid) + '">Export CSV</button>';
  }
  function personHTML(f) {
    const pr = f.progs.map((k) => P[k]);
    const scIds = f.scid ? f.scid.split(';') : [];
    const sc = hDetail(f.sc, f.scb, META.scBasis[f.scb], '', '') + scIds.map((id, k) => '<span class="sub">' + link('https://www.scopus.com/authid/detail.uri?authorId=' + id, scIds.length > 1 ? 'Scopus author profile ' + (k + 1) : 'Scopus author profile') + '</span>').join('');
    const gs = hDetail(f.gs, f.gsb, META.gsBasis[f.gsb], f.gsid ? 'https://scholar.google.com/citations?user=' + f.gsid : '', 'Google Scholar profile');
    const chairFor = f.chfor.map((k) => P[k]);
    const chairTxt = f.chd === 1 ? 'Designated program chair' + (chairFor.length ? ' of ' + chairFor.map((x) => '<a href="#/program/' + x.id + '">' + esc(x.name) + '</a>').join(', ') : '') +
      '<span class="sub">' + esc(f.cht === 'A' ? 'Academic chair' : 'Hospital chair') + ' · ' + esc(f.chpos) + '</span>' + (f.chtitle ? '<span class="sub">Listed title: “' + esc(f.chtitle) + '”</span>' : '') +
      '<span class="sub">Evidence: ' + esc({ H: 'High', M: 'Medium', L: 'Low' }[f.chev] || '—') + (f.chsrc ? ' · ' + srcHTML(f.chsrc, 'source') : '') + '</span>'
      : (f.chd === 2 ? 'Secondary chair (other site or parallel role)' + '<span class="sub">' + esc(f.cht === 'A' ? 'Academic' : 'Hospital') + ' · ' + esc(f.chpos) + '</span>' : '');
    const issue = REPO + '/issues/new?title=' + encodeURIComponent('Correction: ' + f.name + ' (' + f.rid + ')') + '&body=' + encodeURIComponent('Record ID: ' + f.rid + '\nName: ' + f.name + '\nProgram: ' + pr.map((x) => x.name).join('; ') + '\n\nWhat should change, and a source for it:\n');
    return '<p class="d-kicker">Faculty record</p><h2 class="d-title" id="panel-title">' + esc(f.name) + '</h2><p class="d-sub">' + esc(f.cred || f.deg) + '</p>' +
      '<div class="pills d-pills"><span class="pill on">' + esc(RANKS[f.rank]) + '</span>' + (f.chd === 1 ? '<span class="pill gold">Program chair</span>' : '') + (has(f.tok, 'Program Director') ? '<span class="pill gold">Program director</span>' : '') + '</div>' +
      '<div class="stats three">' + stat(hVal(f.sc, f.scb), 'Scopus h-index') + stat(hVal(f.gs, f.gsb), 'Google Scholar h-index') + stat(f.brr != null ? '#' + f.brr : '—', 'Blue Ridge rank of institution (FY2025)') + '</div>' +
      '<div class="card"><h3>Appointment</h3><dl class="facts">' +
      fact('Program', pr.map((x) => '<a href="#/program/' + x.id + '">' + esc(x.name) + '</a><span class="sub">' + esc(x.city) + ', ' + esc(x.state) + '</span>').join('')) +
      fact('Institution', esc(f.inst)) + fact('Academic rank', esc(RANKS[f.rank]) + (f.title && norm(f.title) !== norm(RANKS[f.rank]) && f.title !== 'No Rank' ? '<span class="sub">Listed title: ' + esc(f.title) + '</span>' : '')) +
      fact('Department role', esc(roleText(f))) + fact('Program chair', chairTxt) + fact('Faculty type', esc(f.ftype)) + fact('Degree', esc(f.deg)) + fact('Listed credentials', esc(f.cred)) +
      '</dl></div>' +
      '<div class="card"><h3>h-index</h3><dl class="facts">' + fact('Scopus', sc) + fact('Google Scholar', gs) + '</dl><p class="note">Values collected ' + esc(META.hDates) + '.</p></div>' +
      '<div class="card"><h3>Institutional markers</h3><dl class="facts">' + fact('AAU', f.aau ? 'Yes' + (f.aaum ? '<span class="sub">' + esc(f.aaum) + '</span>' : '') : 'No') +
      fact('Vizient', f.viz === 1 ? 'Yes' : (f.viz === 2 ? 'Unresolved' : 'No')) +
      fact('Blue Ridge institution', f.brr != null ? 'Rank #' + f.brr + (f.brf != null ? '<span class="sub">' + money(f.brf) + ' NIH funding to EM (FY2025)</span>' : '') : 'Not ranked') +
      (f.brpr != null ? fact('Blue Ridge PI', 'Rank #' + f.brpr + (f.brpf != null ? '<span class="sub">' + money(f.brpf) + ' NIH funding (FY2025)</span>' : '')) : '') + '</dl></div>' +
      '<div class="card"><h3>Sources</h3><dl class="facts">' + fact('Faculty roster', srcHTML(f.roster)) + fact('Profile page', link(f.profile, host(f.profile))) + fact('Rank source', link(f.rsrc, host(f.rsrc))) + fact('Record ID', esc(f.rid)) + '</dl>' +
      '<p class="note">See an error? <a href="' + esc(issue) + '" target="_blank" rel="noopener">Report a correction</a> (needs a GitHub account).</p></div>';
  }
  const hVal = (v, b) => (b === 0 ? String(v) : '<span class="zero">' + v + '<sup>°</sup></span>');
  function hDetail(v, b, why, url, label) {
    return '<strong>' + v + '</strong><span class="sub">' + esc(why) + '</span>' + (url ? '<span class="sub">' + link(url, label) + '</span>' : '');
  }

  function aboutHTML() {
    return '<p class="d-kicker">About</p><h2 class="d-title" id="panel-title">About the data</h2><div class="prose">' +
      '<p>This explorer covers a national census of emergency medicine faculty at all ' + META.nPrograms + ' ACGME-accredited EM residency programs, compiled in ' + esc(META.asOf) + '. It holds ' + fmt(META.nRecords) +
      ' faculty-program records: each is one faculty member as listed by a program, so a person listed by two programs can appear twice.</p>' +
      '<h3>Searching</h3><p>Switch between <strong>Programs</strong> and <strong>People</strong>, type in the search box, and combine any filters. Select a program to see everything recorded for it, including all of its faculty. Every result can be exported as a CSV, and <em>Copy link</em> saves the current search.</p>' +
      '<h3>Definitions</h3><dl>' +
      '<dt>Academic rank</dt><dd>The published academic rank, normalized to instructor, assistant, associate, or full professor. No rank means none was published.</dd>' +
      '<dt>h-index</dt><dd>Scopus and Google Scholar h-indices, collected ' + esc(META.hDates) + '. Where no profile could be matched, the value is counted as 0, the study’s convention; these values appear faint with a ° mark, and each record says why.</dd>' +
      '<dt>AAU</dt><dd>The sponsor or primary teaching site is a US member of the Association of American Universities, or a hospital whose EM residency is affiliated with one. Forty affiliated programs that the senior author judged not part of an AAU member institution carry no AAU marker (review of September 21, 2026); the program page says so under AAU.</dd>' +
      '<dt>Vizient</dt><dd>Inclusion in the Vizient Academic Medical Center cohort (2025).</dd>' +
      '<dt>Blue Ridge</dt><dd>The medical school appears in the Blue Ridge Institute for Medical Research (BRIMR) fiscal-year 2025 ranking of NIH funding to departments of emergency medicine. Ranks and dollars are BRIMR’s.</dd>' +
      '<dt>Markers and phenotypes</dt><dd>A program carries a marker if any of its faculty records does; in the People view, markers describe each faculty member’s own institution. The marker phenotype is the combination of the three markers.</dd>' +
      '<dt>Program type</dt><dd>Mutually exclusive. <em>Military</em>. <em>Corporate</em>: a for-profit or investor-owned primary hospital, or an ED staffed by a national contract-management group (private-equity-financed or physician-owned); this takes precedence over the markers. <em>Research-marker academic</em>: any of the three markers, split into NIH-ranked (Blue Ridge) and AAU or Vizient. <em>University-based academic</em>: no marker, but university-sponsored with university-employed faculty. <em>Community-based</em>: everything else (non-profit or public).</dd>' +
      '<dt>Program chair</dt><dd>One chair per program. An <em>academic chair</em> heads a medical-school EM department, division, or section (including regional campuses). A <em>hospital chair</em> heads a hospital or health-system emergency department: department chair, chief, system chair, or, when none of those was identified, the ED medical director. Where a program listed both, the academic chair was designated. Evidence is graded high, medium, or low.</dd>' +
      '<dt>Program director</dt><dd>Faculty listed with the Program Director title.</dd>' +
      '<dt>ACGME accreditation</dt><dd>The effective date of the earliest record conferring accredited or pre-accredited status. Published histories begin in academic year 2000–2001, so older programs are shown as on or before 2000. It marks entry into ACGME accreditation, not when training began.</dd>' +
      '<dt>DO origin</dt><dd>The program held American Osteopathic Association accreditation before the single accreditation system (2014–2020) and obtained ACGME accreditation during it.</dd>' +
      '<dt>Ownership and staffing</dt><dd>From public ownership and staffing sources at one date; contracts change, and staffing could not be determined for some programs.</dd></dl>' +
      '<h3>Corrections</h3><p>Every value comes from a public source, but rosters and profiles change. To report an error, open the record and choose <em>Report a correction</em>, or <a href="' + REPO + '/issues/new" target="_blank" rel="noopener">open an issue</a>.</p>' +
      '<h3>Download</h3><p><button type="button" class="btn" data-export-all-inline="people">All faculty records (CSV)</button> <button type="button" class="btn" data-export-all-inline="programs">All programs (CSV)</button></p>' +
      '<p class="note">National census of US emergency medicine faculty, USF Department of Emergency Medicine, ' + esc(META.asOf) + '.</p></div>';
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-export-all-inline]'); if (b) (b.dataset.exportAllInline === 'people' ? exportPeople(F, 'em-census-all-people') : exportPrograms(P, 'em-census-all-programs')); });

  /* ---------------------------------------------------------------- CSV */
  function csvCell(v) {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet formulas from running
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function download(name, header, rows) {
    const csv = '﻿' + [header].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Exported ' + fmt(rows.length) + ' rows');
  }
  function exportPeople(rows, name) {
    const H = ['Record ID', 'First name', 'Last name', 'Listed credentials', 'Degree', 'Program(s)', 'ACGME program ID(s)', 'Program state(s)', 'Program type(s)', 'Institution', 'Academic rank', 'Listed academic title',
      'Department role(s)', 'Faculty type', 'Scopus h-index', 'Scopus basis', 'Scopus profile', 'Google Scholar h-index', 'Google Scholar basis', 'Google Scholar profile',
      'AAU', 'AAU university', 'Vizient', 'Marker phenotype (own institution)', 'Blue Ridge institution rank (FY2025)', 'Blue Ridge institution NIH funding (FY2025, $)', 'Blue Ridge PI rank (FY2025)', 'Blue Ridge PI NIH funding (FY2025, $)',
      'Program chair designation', 'Chair type', 'Chair position', 'Chair title (listed)', 'Chair source', 'Chair evidence', 'Program director', 'Faculty roster', 'Profile page', 'Rank source'];
    const out = rows.map((f) => {
      const pr = f.progs.map((k) => P[k]);
      return [f.rid, f.fn, f.ln, f.cred, f.deg, pr.map((x) => x.name).join('; '), pr.map((x) => x.id).join('; '), uniq(pr.map((x) => x.state)).join('; '), uniq(pr.map((x) => TYPES[x.typeIdx])).join('; '), f.inst,
        RANKS[f.rank], f.title, roleText(f), f.ftype, f.sc, META.scBasis[f.scb], f.scid ? f.scid.split(';').map((id) => 'https://www.scopus.com/authid/detail.uri?authorId=' + id).join('; ') : '', f.gs, META.gsBasis[f.gsb],
        f.gsid ? 'https://scholar.google.com/citations?user=' + f.gsid : '', f.aau ? 'Yes' : 'No', f.aaum, f.viz === 1 ? 'Yes' : (f.viz === 2 ? 'Unresolved' : 'No'), PHENOS[f.phenoIdx],
        f.brr, f.brf, f.brpr, f.brpf, f.chd === 1 ? 'Designated program chair' + (f.chfor.length ? ' (' + f.chfor.map((k) => P[k].name).join('; ') + ')' : '') : (f.chd === 2 ? 'Secondary chair' : ''),
        f.chd ? (f.cht === 'A' ? 'Academic chair' : 'Hospital chair') : '', f.chd ? f.chpos : '', f.chtitle, f.chsrc, { H: 'High', M: 'Medium', L: 'Low' }[f.chev] || '',
        has(f.tok, 'Program Director') ? 'Yes' : '', f.roster, f.profile, f.rsrc];
    });
    download(name, H, out);
  }
  function exportPrograms(rows, name) {
    const H = ['ACGME program ID', 'Program', 'Sponsor', 'Primary site', 'City', 'State', 'Program length (years)', 'Program type', 'Marker phenotype', 'AAU', 'AAU university(ies)', 'Vizient', 'Blue Ridge ranked',
      'Blue Ridge best rank (FY2025)', 'Blue Ridge institution(s)', 'ACGME accreditation year', 'Accreditation date', 'Accreditation era', 'DO origin', 'Origin', 'Origin basis', 'Former name',
      'Program chair', 'Chair type', 'Chair position', 'Chair interim', 'Chair title (listed)', 'Chair source', 'Chair evidence', 'Other chairs', 'Program director(s)',
      'Hospital owner', 'Ownership type', 'ED staffing', 'Staffing category', 'Corporate ties', 'Classification confidence', 'Ownership source', 'Staffing source', 'Affiliation', 'NRMP code',
      'Faculty records', 'No rank (n)', 'No rank (%)', 'Instructor (n)', 'Assistant professor (n)', 'Associate professor (n)', 'Full professor (n)', 'Emeritus (n)', 'Other title (n)',
      'Median Scopus h', 'Scopus h Q1', 'Scopus h Q3', 'Mean Scopus h', 'Scopus h >= 10 (%)', 'Median Google Scholar h', 'DO-only degree share (%)'];
    const out = rows.map((p) => [p.id, p.name, p.sponsor, p.site, p.city, p.state, p.length, TYPES[p.typeIdx], p.pheno, p.aau ? 'Yes' : 'No', p.aauMembers.join('; '), p.viz ? 'Yes' : 'No', p.br ? 'Yes' : 'No',
      p.brBest, p.brList.map((b) => b.inst + ' (#' + b.rank + ')').join('; '), p.accCensored ? 'On or before 2000' : (p.accYear == null ? '' : p.accYear + (p.accApprox ? ' (approximate)' : '')), p.accDate, p.accEra,
      p.doOrigin ? 'Yes' : 'No', p.origin, p.originBasis, p.formerName, p.chairName || 'Not identified', p.chairType, p.chairPos, p.chairInterim ? 'Yes' : '', p.chairTitle, p.chairSrc, p.chairEv, p.chairSecondary, p.pdNames.join('; '),
      p.owner, p.ownType, p.staffing, p.staffCat, p.corpRel, p.classConf, p.ownSrc, p.staffSrc, p.affil, p.nrmp,
      p.n, p.rankN[0], p.n ? (100 * p.rankN[0] / p.n).toFixed(1) : '', p.rankN[1], p.rankN[2], p.rankN[3], p.rankN[4], p.rankN[5], p.rankN[6],
      fmtQ(p.medSc), fmtQ(p.q1Sc), fmtQ(p.q3Sc), p.meanSc == null ? '' : p.meanSc.toFixed(1), (100 * p.ge10).toFixed(1), fmtQ(p.medGs), (100 * p.doShare).toFixed(1)]);
    download(name, H, out);
  }

  /* ---------------------------------------------------------------- misc */
  function copy(text, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } t.remove(); }
  }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }
})();

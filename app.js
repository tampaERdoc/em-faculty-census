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
  // one decimal, ties to even (the rounding used for the study's tables), so the site and the manuscript print the same values
  const rhe1 = (v) => {
    if (Math.abs(v * 4 - Math.round(v * 4)) > 1e-9) return Number(v.toFixed(1)); // not an exact quarter: no true tie
    const x = v * 10, f = Math.floor(x + 1e-9);
    return (Math.abs(x - f - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(x)) / 10;
  };
  const fmtQ = (v) => (v == null ? '—' : rhe1(v).toString());
  const fix1 = (v) => rhe1(v).toFixed(1);

  const RANKS = ['No rank', 'Instructor', 'Assistant professor', 'Associate professor', 'Full professor', 'Emeritus', 'Other title'];
  const PHENOS = ['AAU + Vizient + Blue Ridge', 'AAU + Blue Ridge', 'Vizient + Blue Ridge', 'Blue Ridge', 'AAU + Vizient', 'AAU', 'Vizient', 'None'];
  const TYPES = ['Research-marker academic: NIH-ranked (Blue Ridge)', 'Research-marker academic: AAU or Vizient', 'University-based academic (no marker)',
    'Corporate (for-profit hospital or national staffing group)', 'Community-based (non-profit or public)', 'Military'];
  const TYPE_SHORT = ['NIH-ranked academic', 'AAU/Vizient academic', 'University-based', 'Corporate', 'Community-based', 'Military'];
  const ERAS = ['Legacy (on or before 2000)', '2001–2013', '2014–2020 (single accreditation)', '2021 or later'];
  const CHAIR_KEYS = [['A', 'Academic chair'], ['H', 'Hospital chair'], ['N', 'No chair identified']];
  const MAXG = 25; // most programs compared side by side in the summary
  const HB = [[0, 0, 'h = 0'], [1, 4, 'h 1–4'], [5, 9, 'h 5–9'], [10, 19, 'h 10–19'], [20, 1e9, 'h ≥ 20']];
  const has = (tok, t) => tok.indexOf(t) >= 0;
  const ROLE_GROUPS = [
    { id: 'pca', fig: 'Academic chair', label: 'Department chair (academic)', dc: true, test: (p) => p.chd === 1 && p.cht === 'A' },
    { id: 'pch', fig: 'Hospital chair', label: 'Department chair (hospital)', dc: true, test: (p) => p.chd === 1 && p.cht === 'H' },
    { id: 'pd', fig: 'Program director', label: 'Program director', test: (p) => has(p.tok, 'Program Director') },
    { id: 'apd', fig: 'Assoc./asst. program director', label: 'Associate or assistant program director', test: (p) => has(p.tok, 'Associate Program Director') || has(p.tok, 'Assistant Program Director') },
    { id: 'vice', fig: 'Vice chair', label: 'Vice chair (incl. associate and executive)', test: (p) => p.tok.some((t) => t.indexOf('Vice Chair') >= 0) },
    { id: 'clerk', fig: 'Student clerkship director', label: 'Student clerkship director', test: (p) => has(p.tok, 'Student Clerkship Director') },
    { id: 'aclerk', fig: 'Assoc./asst. clerkship director', label: 'Associate or assistant clerkship director', test: (p) => has(p.tok, 'Associate Clerkship Director') || has(p.tok, 'Assistant Clerkship Director') },
    { id: 'fellow', fig: 'Fellowship director', label: 'Fellowship director (incl. associate/assistant)', test: (p) => p.tok.some((t) => /Fellowship Director$/.test(t)) },
    { id: 'res', fig: 'Research director', label: 'Research director or vice chair of research', test: (p) => p.tok.some((t) => ['Research Director', 'Vice Chair of Research', 'Vice Chair of Population Health & Research', 'Associate Vice Chair of Research'].indexOf(t) >= 0) },
    { id: 'chief', fig: 'Division/section chief', label: 'Division or section chief', test: (p) => has(p.tok, 'Division Chief') || has(p.tok, 'Section Chief') },
    { id: 'md', fig: 'Medical director', label: 'Medical director (incl. associate/assistant)', test: (p) => p.tok.some((t) => /Medical Director$/.test(t)) },
    { id: 'edu', fig: 'Education director', label: 'Education director', test: (p) => has(p.tok, 'Education Director') },
    { id: 'odir', fig: 'Other director', label: 'Other director', test: (p) => has(p.tok, 'Other Director') },
    { id: 'olead', fig: 'Other dept. leadership', label: 'Other department leadership', test: (p) => has(p.tok, 'Other Department Leadership') },
    { id: 'chair', fig: 'Any chair title', label: 'Any chair title (incl. site and secondary chairs)', test: (p) => p.chd > 0 || has(p.tok, 'Chair') || has(p.tok, 'Interim Chair') },
    { id: 'fac', fig: 'Faculty, no leadership title', label: 'Faculty (no leadership title)', test: (p) => p.tok.every((t) => t === 'Faculty') && p.chd === 0 },
  ];
  const DEGS = [[1, 'MD (incl. MBBS/MBChB)'], [2, 'DO'], [4, 'PhD or other research doctorate'], [8, 'Non-physician doctorate only'], [16, 'Degree not verified']];

  let DATA, META, LK, P = [], F = [], OWN = [], STAFF = [], STATES = [], CHAIRPOS = [];
  let TITLES = [], TITLE_HAY = [], TITLE_N = new Map(), TITLE_SET = new Set(), TITLE_ALT = new Map(), TITLE_OF = () => '', ttlFind = ''; // listed (non-normalized) academic titles
  const MAXT = 15; // most listed titles compared side by side in the summary
  const PLAIN_TITLES = new Set(['instructor', 'assistant professor', 'associate professor', 'professor', 'full professor']);
  const PID = new Map(), RID = new Map();
  const DEFAULT = { view: 'programs', q: '', aau: '', viz: '', br: '', pheno: [], type: [], chair: [], do: '', era: [], st: '', own: [], staff: [], len: '',
    rank: [], title: [], role: [], deg: [], hs: 'sc', hmin: '', hmax: '', hp: '', sp: 'name', dp: 1, sf: 'name', df: 1, g: '', si: 'sc', pk: [], pf: [] };
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
    P.forEach((p) => PID.set(p.id, p)); F.forEach((f) => RID.set(f.rid, f));
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
    // listed titles that differ only in capitalization or spacing are one entry, shown in their most common spelling
    const tkey = (t) => t.trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase(), spell = new Map();
    F.forEach((f) => { if (f.title && f.title !== 'No Rank') { const k = tkey(f.title), m = spell.get(k) || new Map(); m.set(f.title, (m.get(f.title) || 0) + 1); spell.set(k, m); } });
    const label = new Map(); spell.forEach((m, k) => { const v = Array.from(m.entries()).sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0])); label.set(k, v[0][0]); TITLE_N.set(v[0][0], v.reduce((a, x) => a + x[1], 0)); if (v.length > 1) TITLE_ALT.set(v[0][0], v.slice(1).map((x) => x[0])); });
    F.forEach((f) => { f.tl = f.title && f.title !== 'No Rank' ? label.get(tkey(f.title)) : ''; });
    TITLES = Array.from(TITLE_N.keys()).sort((a, b) => TITLE_N.get(b) - TITLE_N.get(a) || collator.compare(a, b));
    TITLE_SET = new Set(TITLES); TITLE_HAY = TITLES.map((t) => ' ' + norm(t).replace(/[^a-z0-9]+/g, ' ') + ' ');
    TITLE_OF = (t) => (TITLE_SET.has(t) ? t : label.get(tkey(t)) || '');
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
    const rc = RANKS.map((_, k) => F.filter((f) => f.rank === k).length);
    const roleN = (id) => { const k = ROLE_GROUPS.findIndex((g) => g.id === id); return F.filter((f) => f.roleMask & (1 << k)).length; };
    html.push('<div class="fgroup farea" id="fg-rank"><h3>Normalized rank title</h3><p class="hint">The rank analyzed in the paper: every published title normalized to instructor, assistant, associate, or full professor, with modifiers such as clinical set aside.</p><p class="hint view-hint" hidden>Selecting a normalized rank, a described title, a chair, or a role lists the matching faculty (People).</p>' + checks('rank', RANKS.map((r, k) => [k, r, rc[k]])) + '</div>');
    html.push('<div class="fgroup farea" id="fg-title"><h3>Department/program described title</h3><p class="hint">The title exactly as the department or program describes it, before normalization (' + fmt(TITLES.length) + ' variants). Type to find a title and its variants.</p>' +
      '<label for="f-ttl" class="sr-only">Find a department or program described title</label><input id="f-ttl" class="sel ttl-find" type="search" autocomplete="off" spellcheck="false" placeholder="Find a title, e.g. clinical assistant">' +
      '<div class="ttl-tools"><span class="ttl-count" id="ttl-count" aria-live="polite"></span><button type="button" class="link-btn" id="ttl-all" hidden>Select all shown</button><button type="button" class="link-btn" id="ttl-none" hidden>Clear titles</button></div>' +
      '<div class="checks ttl-list" data-key="title" id="ttl-list" role="group" aria-label="Department or program described titles"></div></div>');
    html.push('<div class="fgroup" id="fg-chair"><h3>Department chair</h3><p class="hint">Academic and hospital chair list the chairs themselves: one designated chair per program, and a few chairs lead more than one program.</p>' +
      checks('role', [['pca', 'Academic chair', roleN('pca')], ['pch', 'Hospital chair', roleN('pch')]]) +
      checks('chair', [['N', 'Programs with no chair identified', cnt((p) => p.chairKey === 'N')]]) + '</div>');
    html.push('<div class="fgroup"><h3>Leadership role</h3>' + checks('role', ROLE_GROUPS.filter((g) => !g.dc).map((g) => [g.id, g.label, roleN(g.id)])) + '</div>');
    html.push('<div class="fgroup"><h3>Research markers</h3><p class="hint" id="marker-hint"></p>' + tri('aau', 'AAU') + tri('viz', 'Vizient') + tri('br', 'Blue Ridge ranked') +
      '<p class="fsub">Marker phenotype</p>' + checks('pheno', PHENOS.map((ph, k) => [k, ph, cnt((p) => p.phenoIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Program type</h3>' + checks('type', TYPES.map((t, k) => [k, t, cnt((p) => p.typeIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Origin and accreditation</h3>' + tri('do', 'DO origin (moved from AOA)') +
      '<p class="fsub">ACGME accreditation era</p>' + checks('era', ERAS.map((t, k) => [k, t, cnt((p) => p.eraIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Location and ownership</h3><div class="row2"><label for="f-st" class="sr-only">State</label><select id="f-st" class="sel"><option value="">All states</option>' +
      STATES.map((s) => '<option value="' + esc(s) + '">' + esc(s) + ' (' + cnt((p) => p.state === s) + ')</option>').join('') + '</select>' +
      '<label for="f-len" class="sr-only">Program length</label><select id="f-len" class="sel"><option value="">Any length</option><option value="3">3-year (' + cnt((p) => p.length === 3) + ')</option><option value="4">4-year (' + cnt((p) => p.length === 4) + ')</option></select></div>' +
      '<details class="more-filters"><summary>Hospital ownership and ED staffing</summary><p class="fsub">Hospital ownership</p>' + checks('own', OWN.map((t, k) => [k, t, cnt((p) => p.ownIdx === k)])) +
      '<p class="fsub">ED staffing</p>' + checks('staff', STAFF.map((t, k) => [k, t, cnt((p) => p.staffIdx === k)])) + '</details></div>');
    html.push('<div class="fgroup people-only"><h3>h-index</h3><div class="row2"><label for="f-hs" class="sr-only">h-index source</label><select id="f-hs" class="sel"><option value="sc">Scopus</option><option value="gs">Google Scholar</option></select>' +
      '<label class="sr-only" for="f-hmin">Minimum h-index</label><input id="f-hmin" class="num-in" type="number" min="0" step="1" inputmode="numeric" placeholder="min"><span>to</span>' +
      '<label class="sr-only" for="f-hmax">Maximum h-index</label><input id="f-hmax" class="num-in" type="number" min="0" step="1" inputmode="numeric" placeholder="max"></div>' +
      '<div class="presets" id="h-presets">' + [['0', '0'], ['1', '4'], ['5', '9'], ['10', '19'], ['20', ''], ['10', '']].map(([a, b]) => '<button type="button" data-min="' + a + '" data-max="' + b + '">' + (b === '' ? a + '+' : (a === b ? a : a + '–' + b)) + '</button>').join('') + '</div>' +
      '<p class="fsub">Profile</p><div class="row2"><label for="f-hp" class="sr-only">Profile status</label><select id="f-hp" class="sel"><option value="">Any</option><option value="obs">Matched profile (observed value)</option><option value="zero">No matched profile (counted as 0)</option></select></div></div>');
    html.push('<div class="fgroup people-only"><h3>Degree</h3>' + checks('deg', DEGS.map(([b, l]) => [b, l, F.filter((f) => f.degF & b).length])) + '</div>');
    $('#filter-groups').innerHTML = html.join('');
    renderTitleList();
  }
  function titleMatches() {
    const toks = norm(ttlFind).split(/[^a-z0-9]+/).filter(Boolean);
    return TITLES.map((_, k) => k).filter((k) => toks.every((w) => TITLE_HAY[k].indexOf(' ' + w) >= 0));
  }
  function renderTitleList() {
    const box = $('#ttl-list'); if (!box) return;
    const sel = new Set(S.title), ks = titleMatches();
    box.innerHTML = ks.length ? ks.map((k) => '<label class="check"' + (TITLE_ALT.has(TITLES[k]) ? ' title="Also listed as: ' + esc(TITLE_ALT.get(TITLES[k]).join('; ')) + '"' : '') + '><input type="checkbox" value="' + esc(TITLES[k]) + '"' + (sel.has(TITLES[k]) ? ' checked' : '') + '><span class="lbl">' + esc(TITLES[k]) + '</span><span class="n">' + fmt(TITLE_N.get(TITLES[k])) + '</span></label>').join('') :
      '<p class="note ttl-none">No described title matches.</p>';
    box.dataset.shown = ks.length;
    titleTools(ks);
  }
  function titleTools(ks) {
    ks = ks || titleMatches();
    const finding = ttlFind.trim() !== '', recs = ks.reduce((a, k) => a + TITLE_N.get(TITLES[k]), 0);
    $('#ttl-count').textContent = (finding ? fmt(ks.length) + (ks.length === 1 ? ' title matches' : ' titles match') + ' (' + fmt(recs) + ' records)' : fmt(TITLES.length) + ' titles, most common first') +
      (S.title.length ? ' · ' + fmt(S.title.length) + ' selected' : '');
    const all = $('#ttl-all'), none = $('#ttl-none'), unsel = ks.filter((k) => S.title.indexOf(TITLES[k]) < 0).length;
    all.hidden = !finding || !unsel; all.textContent = 'Select all ' + fmt(ks.length) + ' shown';
    none.hidden = !S.title.length;
  }

  function syncFilterUI() {
    document.querySelectorAll('.checks[data-key]').forEach((box) => {
      const vals = S[box.dataset.key].map(String);
      box.querySelectorAll('input').forEach((i) => { i.checked = vals.indexOf(i.value) >= 0; });
    });
    document.querySelectorAll('.seg[data-key]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S[seg.dataset.key])));
    });
    if ($('#f-ttl') && $('#f-ttl').value !== ttlFind) $('#f-ttl').value = ttlFind;
    titleTools();
    $('#f-st').value = S.st; $('#f-len').value = S.len; $('#f-hs').value = S.hs; $('#f-hmin').value = S.hmin; $('#f-hmax').value = S.hmax; $('#f-hp').value = S.hp;
    if ($('#q').value !== S.q) $('#q').value = S.q;
    const people = S.view === 'people';
    document.querySelectorAll('.people-only').forEach((g) => g.classList.toggle('hidden-by-view', !people));
    document.querySelectorAll('.view-hint').forEach((h) => { h.hidden = people; });
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
      if (e.target.id === 'f-hmin' || e.target.id === 'f-hmax' || e.target.id === 'f-ttl') return;
      if (box && box.dataset.key === 'title') {
        const t = e.target.value;
        S.title = e.target.checked ? (S.title.indexOf(t) < 0 ? S.title.concat([t]) : S.title) : S.title.filter((x) => x !== t);
        if (e.target.checked && S.view === 'programs') { S.view = 'people'; toast('Showing people: described titles select faculty'); return changed(true); }
        return changed();
      }
      if (box) {
        const key = box.dataset.key;
        S[key] = Array.from(document.querySelectorAll('#filter-groups .checks[data-key="' + key + '"] input:checked')).map((i) => (['role', 'chair'].indexOf(key) >= 0 ? i.value : Number(i.value)));
        if ((key === 'rank' || key === 'role') && S.view === 'programs' && e.target.checked) { S.view = 'people'; toast(box.closest('#fg-chair') ? 'Showing people: the chairs themselves' : 'Showing people: rank and role select faculty'); return changed(true); }
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
      if (e.target.id === 'f-ttl') { ttlFind = e.target.value; renderTitleList(); }
    });
    $('#filter-groups').addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (b) { S[b.parentElement.dataset.key] = b.dataset.v; return changed(); }
      const pr = e.target.closest('#h-presets button');
      if (pr) { S.hmin = pr.dataset.min; S.hmax = pr.dataset.max; changed(); }
      if (e.target.closest('#ttl-all')) {
        const add = titleMatches().map((k) => TITLES[k]).filter((x) => S.title.indexOf(x) < 0);
        S.title = S.title.concat(add); document.querySelectorAll('#ttl-list input').forEach((i) => { i.checked = true; });
        if (S.view === 'programs') { S.view = 'people'; toast('Showing people: described titles select faculty'); return changed(true); }
        return changed();
      }
      if (e.target.closest('#ttl-none')) { S.title = []; changed(); }
    });
    $('#clear-filters').addEventListener('click', () => { const keep = { view: S.view, q: S.q, sp: S.sp, dp: S.dp, sf: S.sf, df: S.df, g: S.g, si: S.si, pk: S.pk, pf: S.pf }; S = Object.assign(JSON.parse(JSON.stringify(DEFAULT)), keep); ttlFind = ''; renderTitleList(); changed(); });
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
      if (e.target.closest('a') || e.target.closest('.sel-col')) return; // links and row checkboxes handle themselves
      const tr = e.target.closest('tr[data-href]'); if (tr) go(tr.dataset.href);
    });
    $('#tbody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('a') && !e.target.closest('.sel-col')) { const tr = e.target.closest('tr[data-href]'); if (tr) go(tr.dataset.href); } });
    $('#tbody').addEventListener('change', (e) => { const i = e.target.closest('input.pick'); if (i) togglePick([i.value], i.checked); });
    $('#thead').addEventListener('change', (e) => { if (e.target.id === 'pick-all') togglePick(curRows.slice(0, shown).map(rowId), e.target.checked); });
    const selClick = (e) => {
      const rm = e.target.closest('button[data-unpick]'); if (rm) return togglePick([rm.dataset.unpick], false);
      if (e.target.closest('[data-sel-clear]')) return togglePick(picks().slice(), false);
      if (e.target.closest('[data-sel-export]')) { const sel = pickedRows(); return S.view === 'people' ? exportPeople(sel, 'em-census-selected-people') : exportPrograms(sel, 'em-census-selected-programs'); }
    };
    $('#selbar').addEventListener('click', selClick); $('#sum-sel').addEventListener('click', selClick);
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#/program/"], a[href^="#/person/"], a[href="#/about"]');
      if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) inApp = true;
    });
    $('#show-more').addEventListener('click', () => { shown += PAGE * 2; renderTable(); });
    $('#export-csv').addEventListener('click', () => (S.view === 'people' ? exportPeople(matchF.map((k) => F[k]), 'em-census-people') : exportPrograms(matchP.map((k) => P[k]), 'em-census-programs')));
    $('#copy-link').addEventListener('click', () => copy(location.href.split('#')[0] + listHash(), 'Link to this search copied'));
    $('#overlay').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeOverlay(); });
    $('#sum-group').innerHTML = GROUP_DIMS.map(([v, l]) => '<option value="' + v + '">' + esc(l) + '</option>').join('');
    $('#sum-group').addEventListener('change', (e) => { S.g = e.target.value; changed(); });
    $('#sum-index').addEventListener('change', (e) => { S.si = e.target.value; changed(); });
    $('#sum-png').addEventListener('click', exportSummaryPNG);
    $('#sum-svg').addEventListener('click', exportSummarySVG);
    $('#sum-csv').addEventListener('click', exportSummaryCSV);
    $('#jump-summary').addEventListener('click', () => { $('#summary').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#summary').focus({ preventScroll: true }); });
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawSummaryFigure, 150); });
    if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener('change', drawSummaryFigure) : mq.addListener(drawSummaryFigure)); }
  }
  function cleanNum(v) { v = String(v).trim(); if (v === '') return ''; const n = Math.max(0, Math.floor(Number(v))); return isFinite(n) ? String(n) : ''; }
  function toggleFilters(open) {
    $('#filters').classList.toggle('open', open); document.body.classList.toggle('filters-open', open);
    $('#filters-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('#filters').focus && $('#filters .filters-head button').focus();
  }

  /* ---------------------------------------------------------------- state <-> hash */
  const ARR = ['pheno', 'type', 'chair', 'era', 'own', 'staff', 'rank', 'role', 'deg'];
  const STR = ['q', 'aau', 'viz', 'br', 'do', 'st', 'len', 'hs', 'hmin', 'hmax', 'hp', 'sp', 'sf', 'g', 'si'];
  function listHash() {
    const u = new URLSearchParams();
    STR.forEach((k) => { if (S[k] !== DEFAULT[k] && S[k] !== '') u.set(k, S[k]); });
    ARR.forEach((k) => { if (S[k].length) u.set(k, S[k].join('.')); });
    if (S.title.length) u.set('ti', S.title.join('|'));
    if (S.pk.length) u.set('pk', S.pk.join('.')); if (S.pf.length) u.set('pf', S.pf.join('.'));
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
    s.role = s.role.filter((id) => ROLE_GROUPS.some((g) => g.id === id));
    // links made before the chair filter selected the chairs themselves (chair=A or H)
    const oldChair = s.chair.filter((v) => v === 'A' || v === 'H');
    if (oldChair.length) { oldChair.forEach((v) => { const id = v === 'A' ? 'pca' : 'pch'; if (s.role.indexOf(id) < 0) s.role.push(id); }); s.view = 'people'; }
    s.chair = s.chair.filter((v) => v === 'N');
    s.title = uniq((u.get('ti') || '').split('|').map((t) => TITLE_OF(t)).filter(Boolean));
    s.pk = uniq((u.get('pk') || '').split('.').filter((id) => PID.has(id)));
    s.pf = uniq((u.get('pf') || '').split('.').filter((id) => RID.has(id)));
    if (!GROUP_DIMS.some((d) => d[0] === s.g)) s.g = '';
    if (s.si !== 'gs') s.si = 'sc';
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
      S = parseList(m[1], m[2]); lastList = listHash(); if (lastList !== h) history.replaceState(null, '', lastList);
      closeOverlay(true); shown = PAGE; syncFilterUI(); render(); return;
    }
    if (wasInApp) navDepth++;
    if (!lastList) { S = parseList('programs', ''); lastList = listHash(); syncFilterUI(); render(); }
    m = h.match(/^#\/program\/(\d+)$/);
    if (m) { const p = PID.get(m[1]); return p ? openOverlay(programHTML(p), programActions(p), p.name) : notFound(); }
    m = h.match(/^#\/person\/(.+)$/);
    if (m) { const rid = decodeURIComponent(m[1]); const f = RID.get(rid); return f ? openOverlay(personHTML(f), personActions(f), f.name) : notFound(); }
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
    if (!triOK(p.doOrigin, S.do)) return false;
    if (S.era.length && S.era.indexOf(p.eraIdx) < 0) return false;
    if (S.st && p.state !== S.st) return false;
    if (S.own.length && S.own.indexOf(p.ownIdx) < 0) return false;
    if (S.staff.length && S.staff.indexOf(p.staffIdx) < 0) return false;
    if (S.len && String(p.length) !== S.len) return false;
    return true;
  }
  function progFilterActive() { return S.type.length || S.chair.length || S.do || S.era.length || S.st || S.own.length || S.staff.length || S.len; }
  function computeMatches() {
    const toks = tokens();
    matchP = []; P.forEach((p) => { if (progOK(p, true) && textOK(p.hay, toks)) matchP.push(p.i); });
    const pOK = P.map((p) => progOK(p, false)), anyProg = progFilterActive();
    const roleBits = S.role.reduce((m, id) => { const k = ROLE_GROUPS.findIndex((g) => g.id === id); return k >= 0 ? m | (1 << k) : m; }, 0);
    const degBits = S.deg.reduce((m, b) => m | b, 0), tset = S.title.length ? new Set(S.title) : null;
    const hmin = S.hmin === '' ? null : Number(S.hmin), hmax = S.hmax === '' ? null : Number(S.hmax);
    matchF = [];
    for (let k = 0; k < F.length; k++) {
      const f = F[k];
      if (anyProg && !f.progs.some((pi) => pOK[pi])) continue;
      if (!triOK(f.aau, S.aau) || !triOK(f.viz === 1, S.viz) || !triOK(f.brr != null, S.br)) continue;
      if (S.pheno.length && S.pheno.indexOf(f.phenoIdx) < 0) continue;
      if (S.rank.length && S.rank.indexOf(f.rank) < 0) continue;
      if (tset && !tset.has(f.tl)) continue;
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
    S.chair.forEach((v) => out.push(['chair:' + v, v === 'N' ? 'Programs with no chair identified' : 'Program led by: ' + (CHAIR_KEYS.find((c) => c[0] === v) || [, v])[1].toLowerCase()]));
    if (S.do) out.push(['do', 'DO origin: ' + tl[S.do]]);
    S.era.forEach((v) => out.push(['era:' + v, 'Accredited: ' + ERAS[v]]));
    if (S.st) out.push(['st', 'State: ' + S.st]);
    if (S.len) out.push(['len', S.len + '-year programs']);
    S.own.forEach((v) => out.push(['own:' + v, 'Ownership: ' + OWN[v]]));
    S.staff.forEach((v) => out.push(['staff:' + v, 'Staffing: ' + STAFF[v]]));
    S.rank.forEach((v) => out.push(['rank:' + v, RANKS[v]]));
    if (S.title.length <= 3) S.title.forEach((t) => out.push(['ttl:' + TITLES.indexOf(t), 'Described title: ' + t]));
    else out.push(['ttl', 'Described titles: ' + S.title.slice(0, 2).join('; ') + '; and ' + fmt(S.title.length - 2) + ' more']);
    S.role.forEach((v) => out.push(['role:' + v, (ROLE_GROUPS.find((g) => g.id === v) || { label: v }).label]));
    S.deg.forEach((v) => out.push(['deg:' + v, (DEGS.find((d) => d[0] === v) || [, v])[1]]));
    if (S.hmin !== '' || S.hmax !== '') out.push(['h', (S.hs === 'gs' ? 'Scholar' : 'Scopus') + ' h ' + (S.hmin !== '' && S.hmax !== '' ? (S.hmin === S.hmax ? '= ' + S.hmin : S.hmin + '–' + S.hmax) : (S.hmin !== '' ? '≥ ' + S.hmin : '≤ ' + S.hmax))]);
    if (S.hp) out.push(['hp', S.hp === 'obs' ? 'Matched ' + (S.hs === 'gs' ? 'Scholar' : 'Scopus') + ' profile' : 'No matched ' + (S.hs === 'gs' ? 'Scholar' : 'Scopus') + ' profile']);
    return out;
  }
  function removeFilter(key) {
    const [k, v] = key.split(':');
    if (k === 'ttl') { S.title = v === undefined ? [] : S.title.filter((t) => t !== TITLES[Number(v)]); document.querySelectorAll('#ttl-list input').forEach((i) => { i.checked = S.title.indexOf(i.value) >= 0; }); return changed(); }
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
    { k: 'chair', t: 'Dept. chair', cls: 'col-opt' },
    { k: 'n', t: 'Faculty', cls: 'num', dir: 'desc' },
    { k: 'norank', t: 'No rank', cls: 'num col-opt', dir: 'desc' },
    { k: 'medsc', t: 'Median Scopus h', cls: 'num', dir: 'desc' },
    { k: 'acc', t: 'Accredited', cls: 'num col-opt' },
    { k: 'do', t: 'DO origin', cls: 'ctr col-opt', dir: 'desc' },
  ];
  const FCOLS = [
    { k: 'name', t: 'Name', cls: '' },
    { k: 'program', t: 'Program', cls: '' },
    { k: 'rank', t: 'Normalized rank', cls: '' },
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
  const titleSub = (f) => (f.title && f.title !== 'No Rank' && !PLAIN_TITLES.has(norm(f.title)) ? '<span class="sub">' + esc(f.title) + '</span>' : '');
  function roleText(f) { const t = f.tok.filter((x) => x !== 'Faculty'); return t.length ? t.join('; ') : 'Faculty'; }
  function render() {
    computeMatches();
    $('#count-programs').textContent = fmt(matchP.length);
    $('#count-people').textContent = fmt(matchF.length);
    const people = S.view === 'people';
    const chips = activeFilters();
    $('#chips').innerHTML = chips.map(([k, l]) => '<span class="chip">' + esc(l) + '<button type="button" data-rm="' + esc(k) + '" aria-label="Remove filter ' + esc(l) + '">&times;</button></span>').join('') +
      (!people && chips.some(([k]) => /^(rank|ttl|role|deg|h|hp)/.test(k)) ? '<span class="note">Normalized rank, described title, department chair, leadership role, degree, and h-index filters select faculty, so they apply in the People view.</span>' : '');
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
      $('#table-note').innerHTML = 'Tick the box beside a person to limit the summary below to the people you pick. Beneath the normalized rank, the department or program described title is shown where it differs. Faint values marked ° are not observed on a matched profile and are counted as 0, as in the study. Blue Ridge shows the rank of the faculty member’s medical school in the FY2025 NIH ranking of EM departments.';
    } else {
      const rows = matchP.map((k) => P[k]);
      const uf = new Set(); rows.forEach((p) => p.fac.forEach((k) => uf.add(k))); const nfac = uf.size;
      $('#result-count').textContent = fmt(rows.length) + (rows.length === 1 ? ' program' : ' programs');
      $('#result-summary').textContent = rows.length ? fmt(nfac) + ' faculty records · ' + rows.filter((p) => p.aau).length + ' AAU · ' + rows.filter((p) => p.viz).length + ' Vizient · ' + rows.filter((p) => p.br).length + ' Blue Ridge ranked' : '';
      sortPrograms(rows);
      const toks = tokens(), pinned = toks.length ? rows.filter((p) => p.keys && p.keys.some((k) => toks.indexOf(k) >= 0)) : [];
      if (pinned.length) { const pin = new Set(pinned); rows.splice(0, rows.length, ...pinned, ...rows.filter((p) => !pin.has(p))); }
      renderHead(PCOLS, S.sp, S.dp); curRows = rows;
      $('#table-note').innerHTML = 'Tick the box beside a program to limit the summary below to its faculty; tick two or more to compare them. Faculty counts are faculty-program records linked to each program. Blue Ridge shows the best (lowest) FY2025 NIH rank among the program’s medical schools. Accredited is the year of ACGME accreditation; ≤2000 means accredited on or before 2000.';
    }
    renderTable();
    renderSummary();
  }
  let curRows = [];
  function renderHead(cols, key, dir) {
    const html = '<tr><th scope="col" class="sel-col"><label class="pick-hit" title="Select all rows shown"><input type="checkbox" id="pick-all" aria-label="Select all rows shown, to limit the summary to them"></label></th>' + cols.map((c) => {
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
    syncPickUI();
  }
  const pickCell = (id, name) => '<td class="sel-col"><label class="pick-hit"><input type="checkbox" class="pick" value="' + esc(id) + '" aria-label="Select ' + esc(name) + ' for the summary"></label></td>';
  const yes = (v) => (v ? '<span class="yes">Yes</span>' : '<span class="dash">—</span>');
  const brCell = (r) => (r == null ? '<span class="dash">—</span>' : '#' + r);
  function hCell(v, basis, src) {
    if (basis === 0) return String(v);
    const why = src === 'gs' ? META.gsBasis[basis] : META.scBasis[basis];
    return '<span class="zero" title="' + esc(why) + '">' + v + '<sup aria-hidden="true">°</sup><span class="sr-only"> (' + esc(why) + ')</span></span>';
  }
  function programRow(p) {
    const acc = p.accCensored ? '≤2000' : (p.accYear == null ? '—' : p.accYear + (p.accApprox ? '*' : ''));
    return '<tr data-href="#/program/' + p.id + '" tabindex="0">' + pickCell(p.id, p.name) + '<td class="w-name"><a class="rowlink" href="#/program/' + p.id + '">' + esc(p.name) + '</a><span class="sub">' + esc(p.city) + ', ' + esc(p.state) + (p.site ? ' · ' + esc(p.site) : '') + '</span></td>' +
      '<td class="col-opt w-type">' + esc(TYPE_SHORT[p.typeIdx]) + '</td><td class="ctr">' + yes(p.aau) + '</td><td class="ctr">' + yes(p.viz) + '</td><td class="ctr">' + brCell(p.brBest) + '</td>' +
      '<td class="col-opt w-chair">' + (p.chair == null ? '<span class="dash">None identified</span>' : esc(p.chairKey === 'A' ? 'Academic' : 'Hospital') + '<span class="sub">' + esc(p.chairName) + '</span>') + '</td>' +
      '<td class="num">' + fmt(p.n) + '</td><td class="num col-opt">' + pct(p.rankN[0], p.n, 0) + '</td><td class="num">' + fmtQ(p.medSc) + '</td><td class="num col-opt">' + acc + '</td><td class="ctr col-opt">' + (p.doOrigin ? '<span class="pill gold">DO</span>' : '<span class="dash">—</span>') + '</td></tr>';
  }
  function personRow(f) {
    const pr = f.progs.map((k) => P[k]);
    const prog = pr.length ? '<a class="plink" href="#/program/' + pr[0].id + '">' + esc(pr[0].name) + '</a>' + (pr.length > 1 ? '<span class="sub">+' + (pr.length - 1) + ' more</span>' : '<span class="sub">' + esc(pr[0].city) + ', ' + esc(pr[0].state) + '</span>') : '';
    return '<tr data-href="#/person/' + encodeURIComponent(f.rid) + '" tabindex="0">' + pickCell(f.rid, f.name) + '<td class="w-name"><a class="rowlink" href="#/person/' + encodeURIComponent(f.rid) + '">' + esc(f.name) + '</a>' + (f.cred ? '<span class="sub">' + esc(f.cred) + '</span>' : '') + '</td>' +
      '<td class="w-prog">' + prog + '</td><td class="w-rank">' + esc(RANKS[f.rank]) + titleSub(f) + '</td><td class="col-opt">' + esc(roleText(f)) + '</td>' +
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
      '<div class="card"><h3>Leadership</h3><dl class="facts">' + fact('Department chair', chairBlock) + fact('Program director', pdBlock) +
      (p.chairSecondary ? fact('Other chairs', esc(p.chairSecondary)) : '') + '</dl></div>' +
      '<div class="card"><h3>Hospital ownership and ED staffing</h3><dl class="facts">' +
      fact('Owner', esc(p.owner) + (p.ownType ? '<span class="sub">' + esc(p.ownType) + '</span>' : '')) + fact('ED staffing', esc(p.staffing) + (p.staffCat ? '<span class="sub">' + esc(p.staffCat) + '</span>' : '')) +
      fact('Corporate ties', esc(p.corpRel)) + fact('Classification', esc(cap(p.classConf)) + ' confidence' + (safeUrl(p.ownSrc) ? '<span class="sub">' + link(p.ownSrc, 'Ownership source (' + host(p.ownSrc) + ')') + '</span>' : '') + (safeUrl(p.staffSrc) ? '<span class="sub">' + link(p.staffSrc, 'Staffing source (' + host(p.staffSrc) + ')') + '</span>' : '')) +
      '</dl></div>' +
      '<div class="two"><div class="card"><h3>Normalized rank title</h3>' + bars(RANKS, p.rankN, p.n) + '</div><div class="card"><h3>Scopus h-index</h3>' + bars(HB.map((b) => b[2]), p.hBands, p.n) +
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
    tbl.querySelector('tbody').innerHTML = rows.map((f) => '<tr data-href="#/person/' + encodeURIComponent(f.rid) + '"><td><a class="rowlink" href="#/person/' + encodeURIComponent(f.rid) + '">' + esc(f.name) + '</a>' + (f.cred ? '<span class="sub">' + esc(f.cred) + '</span>' : '') + '</td><td class="w-rank">' + esc(RANKS[f.rank]) + titleSub(f) + '</td><td class="col-opt">' + esc(roleText(f)) + '</td><td class="num">' + hCell(f.sc, f.scb, 'sc') + '</td><td class="num">' + hCell(f.gs, f.gsb, 'gs') + '</td><td class="ctr">' + yes(f.aau) + '</td><td class="ctr">' + (f.viz === 1 ? '<span class="yes">Yes</span>' : '<span class="dash">—</span>') + '</td><td class="ctr">' + brCell(f.brr) + '</td></tr>').join('');
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
    const chairTxt = f.chd === 1 ? 'Designated department chair' + (chairFor.length ? ' of ' + chairFor.map((x) => '<a href="#/program/' + x.id + '">' + esc(x.name) + '</a>').join(', ') : '') +
      '<span class="sub">' + esc(f.cht === 'A' ? 'Academic chair' : 'Hospital chair') + ' · ' + esc(f.chpos) + '</span>' + (f.chtitle ? '<span class="sub">Listed title: “' + esc(f.chtitle) + '”</span>' : '') +
      '<span class="sub">Evidence: ' + esc({ H: 'High', M: 'Medium', L: 'Low' }[f.chev] || '—') + (f.chsrc ? ' · ' + srcHTML(f.chsrc, 'source') : '') + '</span>'
      : (f.chd === 2 ? 'Secondary chair (other site or parallel role)' + '<span class="sub">' + esc(f.cht === 'A' ? 'Academic' : 'Hospital') + ' · ' + esc(f.chpos) + '</span>' : '');
    const issue = REPO + '/issues/new?title=' + encodeURIComponent('Correction: ' + f.name + ' (' + f.rid + ')') + '&body=' + encodeURIComponent('Record ID: ' + f.rid + '\nName: ' + f.name + '\nProgram: ' + pr.map((x) => x.name).join('; ') + '\n\nWhat should change, and a source for it:\n');
    return '<p class="d-kicker">Faculty record</p><h2 class="d-title" id="panel-title">' + esc(f.name) + '</h2><p class="d-sub">' + esc(f.cred || f.deg) + '</p>' +
      '<div class="pills d-pills"><span class="pill on">' + esc(RANKS[f.rank]) + '</span>' + (f.chd === 1 ? '<span class="pill gold">Department chair</span>' : '') + (has(f.tok, 'Program Director') ? '<span class="pill gold">Program director</span>' : '') + '</div>' +
      '<div class="stats three">' + stat(hVal(f.sc, f.scb), 'Scopus h-index') + stat(hVal(f.gs, f.gsb), 'Google Scholar h-index') + stat(f.brr != null ? '#' + f.brr : '—', 'Blue Ridge rank of institution (FY2025)') + '</div>' +
      '<div class="card"><h3>Appointment</h3><dl class="facts">' +
      fact('Program', pr.map((x) => '<a href="#/program/' + x.id + '">' + esc(x.name) + '</a><span class="sub">' + esc(x.city) + ', ' + esc(x.state) + '</span>').join('')) +
      fact('Institution', esc(f.inst)) + fact('Normalized rank title', esc(RANKS[f.rank])) + fact('Department/program described title', f.title && f.title !== 'No Rank' ? esc(f.title) : '<span class="dash">None published</span>') +
      fact('Department role', esc(roleText(f))) + fact('Department chair', chairTxt) + fact('Faculty type', esc(f.ftype)) + fact('Degree', esc(f.deg)) + fact('Listed credentials', esc(f.cred)) +
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
      '<h3>Searching</h3><p>Switch between <strong>Programs</strong> and <strong>People</strong>, type in the search box, and combine any filters. Normalized rank title, department/program described title, department chair, and leadership role select faculty, so choosing one lists the matching people; choosing academic or hospital chair lists the chairs themselves. Select a program to see everything recorded for it, including all of its faculty. Every result can be exported as a CSV, and <em>Copy link</em> saves the current search.</p>' +
      '<h3>Summary and figures</h3><p>Below the results, a summary gives the number of faculty (n), mean, median, and interquartile range (IQR, 25th to 75th percentile) of the Scopus h-index for the current selection, overall and by a grouping you choose (normalized rank title, department/program described title, leadership role, program type, research stratum, accreditation era, or program origin), with a box-plot figure. Download the figure as PNG or SVG and the summary as CSV; <em>Copy link</em> keeps the grouping and any rows you ticked. In the Programs view the summary covers all faculty at the programs shown. Tick the box beside one or more rows to limit the summary to them: tick a program to summarize its faculty, tick two or more programs to compare them side by side (group by program), or tick people to summarize just those people. Ticked rows stay selected while you search, so you can build a comparison across several searches.</p>' +
      '<h3>Definitions</h3><dl>' +
      '<dt>Normalized rank title</dt><dd>The published academic rank, normalized to instructor, assistant, associate, or full professor, as analyzed in the paper. Modifiers such as clinical, adjunct, or research are set aside, so a clinical assistant professor counts as an assistant professor. No rank means none was published.</dd>' +
      '<dt>Department/program described title</dt><dd>The academic title exactly as the department or program describes it, before normalization: for example Clinical Assistant Professor, Assistant Clinical Professor, Assistant Professor of Clinical Emergency Medicine, or Health Sciences Assistant Clinical Professor. In some departments these titles mark a distinct track, with different expectations for scholarship and promotion, so this filter lets you explore them directly; type part of a title to find its variants, then tick them one by one or select all shown. Faculty with no published rank have no described title. Where the described title differs from the plain rank, it appears beneath the normalized rank in the People table.</dd>' +
      '<dt>h-index</dt><dd>Scopus and Google Scholar h-indices, collected ' + esc(META.hDates) + '. Where no profile could be matched, the value is counted as 0, the study’s convention; these values appear faint with a ° mark, and each record says why.</dd>' +
      '<dt>AAU</dt><dd>The sponsor or primary teaching site is a US member of the Association of American Universities, or a hospital whose EM residency is affiliated with one. Forty affiliated programs that the senior author judged not part of an AAU member institution carry no AAU marker (review of September 21, 2026); the program page says so under AAU.</dd>' +
      '<dt>Vizient</dt><dd>Inclusion in the Vizient Academic Medical Center cohort (2025).</dd>' +
      '<dt>Blue Ridge</dt><dd>The medical school appears in the Blue Ridge Institute for Medical Research (BRIMR) fiscal-year 2025 ranking of NIH funding to departments of emergency medicine. Ranks and dollars are BRIMR’s.</dd>' +
      '<dt>Markers and phenotypes</dt><dd>A program carries a marker if any of its faculty records does; in the People view, markers describe each faculty member’s own institution. The marker phenotype is the combination of the three markers.</dd>' +
      '<dt>Program type</dt><dd>Mutually exclusive. <em>Military</em>. <em>Corporate</em>: a for-profit or investor-owned primary hospital, or an ED staffed by a national contract-management group (private-equity-financed or physician-owned); this takes precedence over the markers. <em>Research-marker academic</em>: any of the three markers, split into NIH-ranked (Blue Ridge) and AAU or Vizient. <em>University-based academic</em>: no marker, but university-sponsored with university-employed faculty. <em>Community-based</em>: everything else (non-profit or public).</dd>' +
      '<dt>Department chair</dt><dd>One designated chair per program. An <em>academic chair</em> heads a medical-school EM department, division, or section (including regional campuses). A <em>hospital chair</em> heads a hospital or health-system emergency department: department chair, chief, system chair, or, when none of those was identified, the ED medical director. Where a program listed both, the academic chair was designated. Evidence is graded high, medium, or low.</dd>' +
      '<dt>Leadership role</dt><dd>Titles as listed by each program. Department chairs are selected under Department chair, defined below. <em>Program director</em> is the residency program director; <em>Student clerkship director</em> is the medical student clerkship director (associate and assistant clerkship directors are listed separately); <em>Vice chair</em> includes associate and executive vice chairs. A faculty member can hold more than one title.</dd>' +
      '<dt>Program director</dt><dd>Faculty listed with the Program Director title.</dd>' +
      '<dt>ACGME accreditation</dt><dd>The effective date of the earliest record conferring accredited or pre-accredited status. Published histories begin in academic year 2000–2001, so older programs are shown as on or before 2000. It marks entry into ACGME accreditation, not when training began.</dd>' +
      '<dt>DO origin</dt><dd>The program held American Osteopathic Association accreditation before the single accreditation system (2014–2020) and obtained ACGME accreditation during it.</dd>' +
      '<dt>Ownership and staffing</dt><dd>From public ownership and staffing sources at one date; contracts change, and staffing could not be determined for some programs.</dd></dl>' +
      '<h3>Corrections</h3><p>Every value comes from a public source, but rosters and profiles change. To report an error, open the record and choose <em>Report a correction</em>, or <a href="' + REPO + '/issues/new" target="_blank" rel="noopener">open an issue</a>.</p>' +
      '<h3>Download</h3><p><button type="button" class="btn" data-export-all-inline="people">All faculty records (CSV)</button> <button type="button" class="btn" data-export-all-inline="programs">All programs (CSV)</button></p>' +
      '<p class="note">National census of US emergency medicine faculty, USF Department of Emergency Medicine, ' + esc(META.asOf) + '.</p></div>';
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-export-all-inline]'); if (b) (b.dataset.exportAllInline === 'people' ? exportPeople(F, 'em-census-all-people') : exportPrograms(P, 'em-census-all-programs')); });

  /* ---------------------------------------------------------------- row selection (limits the summary to ticked rows) */
  const rowId = (r) => (S.view === 'people' ? r.rid : r.id);
  const picks = () => (S.view === 'people' ? S.pf : S.pk);
  function pickedRows() { return S.view === 'people' ? S.pf.map((id) => RID.get(id)).filter(Boolean) : S.pk.map((id) => PID.get(id)).filter(Boolean); }
  function togglePick(ids, on) {
    const key = S.view === 'people' ? 'pf' : 'pk', set = new Set(S[key]), cur = S[key].slice();
    ids.forEach((id) => { if (on && !set.has(id)) { set.add(id); cur.push(id); } else if (!on) set.delete(id); });
    S[key] = cur.filter((id) => set.has(id));
    const h = listHash(); lastList = h; history.replaceState(null, '', h);
    syncPickUI(); renderSummary();
  }
  function syncPickUI() {
    const set = new Set(picks()), people = S.view === 'people';
    document.querySelectorAll('#tbody input.pick').forEach((i) => { const on = set.has(i.value); i.checked = on; i.closest('tr').classList.toggle('picked', on); });
    const all = $('#pick-all');
    if (all) {
      const ids = curRows.slice(0, shown).map(rowId), k = ids.filter((id) => set.has(id)).length;
      all.checked = k > 0 && k === ids.length; all.indeterminate = k > 0 && k < ids.length; all.disabled = !ids.length;
    }
    const sel = pickedRows(), unit = people ? (sel.length === 1 ? 'person' : 'people') : (sel.length === 1 ? 'program' : 'programs');
    $('#selbar').hidden = !sel.length; $('#sum-sel').hidden = !sel.length;
    if (!sel.length) return;
    const MAXCHIPS = 12, where = (r) => (people ? (r.progs.length ? P[r.progs[0]].name : '') : r.city + ', ' + r.state);
    $('#sel-text').textContent = fmt(sel.length) + ' ' + unit + ' selected. The summary below covers only ' + (sel.length === 1 ? (people ? 'this person' : 'this program') : 'these ' + unit) + '.';
    $('#sel-items').innerHTML = sel.slice(0, MAXCHIPS).map((r) => '<span class="sel-item" title="' + esc(r.name + (where(r) ? ' · ' + where(r) : '')) + '"><span class="sel-name">' + esc(r.name) + '</span><button type="button" data-unpick="' + esc(rowId(r)) + '" aria-label="Remove ' + esc(r.name) + ' from the selection">&times;</button></span>').join('') +
      (sel.length > MAXCHIPS ? '<span class="sel-more">+' + fmt(sel.length - MAXCHIPS) + ' more</span>' : '');
    $('#sum-sel').innerHTML = 'Limited to the ' + fmt(sel.length) + ' ' + unit + ' you ticked. <button type="button" class="link-btn" data-sel-clear>Clear selection</button>';
  }

  /* ---------------------------------------------------------------- group summary (n, mean, median, IQR) with figure */
  const GROUP_DIMS = [['', 'Auto'], ['none', 'No breakdown'], ['rank', 'Normalized rank title'], ['title', 'Department/program described title'], ['role', 'Leadership role'], ['program', 'Program'], ['type', 'Program type'],
    ['stratum', 'Research stratum'], ['era', 'Accreditation era'], ['origin', 'Program origin']];
  const STRATA = ['NIH-ranked (Blue Ridge)', 'AAU or Vizient, not NIH-ranked', 'No research marker'];
  const ROLE_DEFAULT = ['pca', 'pch', 'pd', 'apd', 'vice', 'clerk', 'fac'];
  const PAL = {
    light: { bg: '#ffffff', text: '#1b2521', muted: '#56645e', grid: '#e3e9e6', axis: '#9aa7a1', box: '#d3e6dc', boxAll: '#b3d4c3', stroke: '#006747', med: '#00563b', whisk: '#56645e', mean: '#cfc493', meanStroke: '#6e5f1c', rule: '#c3ccc7' },
    dark: { bg: '#151c18', text: '#e4ebe7', muted: '#a3b1ab', grid: '#29342f', axis: '#56645e', box: '#1f3a2d', boxAll: '#2a5443', stroke: '#56b68c', med: '#9fdcbc', whisk: '#a3b1ab', mean: '#d6ca97', meanStroke: '#efe6bd', rule: '#3a4842' },
  };
  let SUM = null;
  function autoGroup() {
    if (S.view === 'programs' && S.pk.length >= 2 && S.pk.length <= MAXG) return 'program';
    if (S.title.length >= 2 && S.title.length <= MAXT) return 'title';
    if (S.rank.length >= 2) return 'rank';
    if (S.role.length >= 2) return 'role';
    if (S.type.length >= 2) return 'type';
    if (S.era.length >= 2) return 'era';
    if (S.rank.length === 1) return 'type';
    return 'rank';
  }
  function summaryRows() {
    if (S.view === 'people') return S.pf.length ? pickedRows() : matchF.map((k) => F[k]);
    const seen = new Set(), out = [], progs = S.pk.length ? pickedRows().map((p) => p.i) : matchP;
    progs.forEach((pi) => P[pi].fac.forEach((k) => { if (!seen.has(k)) { seen.add(k); out.push(F[k]); } }));
    return out;
  }
  function groupDefs(dim, rows) {
    const first = (f) => P[f.progs[0]];
    const pick = (sel, all) => (sel.length ? sel.slice().sort((a, b) => a - b) : all);
    if (dim === 'rank') return pick(S.rank, RANKS.map((_, k) => k)).map((k) => ({ label: RANKS[k], test: (f) => f.rank === k }));
    if (dim === 'title') {
      const tv = (f) => f.tl || 'No Rank', n = new Map(); rows.forEach((f) => n.set(tv(f), (n.get(tv(f)) || 0) + 1));
      const byN = (a, b) => (n.get(b) || 0) - (n.get(a) || 0) || (TITLE_N.get(b) || 0) - (TITLE_N.get(a) || 0) || collator.compare(a, b);
      let ts = S.title.length ? S.title.slice().sort(byN) : Array.from(n.keys()).sort(byN);
      const total = ts.length, capped = total > MAXT;
      if (capped) ts = ts.slice(0, MAXT);
      const out = ts.map((t) => { const l = t === 'No Rank' ? 'No rank published' : t; return { label: l, fig: l, csv: l, test: (f) => tv(f) === t }; });
      out.capped = capped ? total : 0;
      return out;
    }
    if (dim === 'role') {
      const ids = S.role.length ? ROLE_GROUPS.filter((g) => S.role.indexOf(g.id) >= 0).map((g) => g.id) : ROLE_DEFAULT;
      return ids.map((id) => { const k = ROLE_GROUPS.findIndex((g) => g.id === id); return { label: ROLE_GROUPS[k].label, fig: ROLE_GROUPS[k].fig, test: (f) => !!(f.roleMask & (1 << k)) }; });
    }
    if (dim === 'type') return pick(S.type, TYPES.map((_, k) => k)).map((k) => ({ label: TYPE_SHORT[k], csv: TYPES[k], test: (f) => first(f).typeIdx === k }));
    if (dim === 'stratum') {
      const st = (f) => (f.brr != null ? 0 : (f.aau || f.viz === 1 ? 1 : 2));
      return STRATA.map((l, k) => ({ label: l, test: (f) => st(f) === k }));
    }
    if (dim === 'era') return pick(S.era, ERAS.map((_, k) => k)).map((k) => ({ label: ERAS[k], test: (f) => first(f).eraIdx === k }));
    if (dim === 'origin') { const dO = (f) => f.progs.some((pi) => P[pi].doOrigin); return [{ label: 'DO-origin program', test: (f) => dO(f) }, { label: 'Allopathic-origin program', test: (f) => !dO(f) }]; }
    if (dim === 'program') {
      const picked = S.view === 'programs' && S.pk.length > 0;
      let ids;
      if (S.view === 'programs') ids = picked ? pickedRows().map((p) => p.i) : matchP.slice();
      else { const seen = new Set(); rows.forEach((f) => f.progs.forEach((pi) => seen.add(pi))); ids = Array.from(seen); }
      const total = ids.length;
      if (total > MAXG) {
        const n = new Map(); rows.forEach((f) => f.progs.forEach((pi) => n.set(pi, (n.get(pi) || 0) + 1)));
        ids = ids.slice().sort((a, b) => (n.get(b) || 0) - (n.get(a) || 0) || collator.compare(P[a].name, P[b].name)).slice(0, MAXG);
      }
      if (!picked) ids.sort((a, b) => collator.compare(P[a].name, P[b].name));
      const out = ids.map((pi) => ({ label: P[pi].name, fig: P[pi].name, csv: P[pi].name + ' (' + P[pi].city + ', ' + P[pi].state + '; ACGME ' + P[pi].id + ')', test: (f) => f.progs.indexOf(pi) >= 0 }));
      out.capped = total > MAXG ? total : 0;
      return out;
    }
    return [];
  }
  function hStats(vals) {
    const n = vals.length; if (!n) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / (n - 1)) : 0;
    return { n, mean, sd, med: quantile(vals, 0.5), q1: quantile(vals, 0.25), q3: quantile(vals, 0.75), p5: quantile(vals, 0.05), p95: quantile(vals, 0.95), zero: vals.filter((v) => v === 0).length / n };
  }
  function selectionText() {
    const sel = pickedRows();
    if (sel.length) {
      const names = sel.slice(0, 4).map((r) => r.name).join('; ') + (sel.length > 4 ? '; and ' + fmt(sel.length - 4) + ' more' : '');
      return S.view === 'people' ? 'Selected: ' + names : 'Faculty at ' + fmt(sel.length) + ' selected ' + (sel.length === 1 ? 'program' : 'programs') + ': ' + names;
    }
    const personOnly = /^(rank|ttl|role|deg|h|hp)/;
    const chips = activeFilters().filter(([k]) => S.view === 'people' || !personOnly.test(k)).map(([, l]) => l);
    if (S.q.trim()) chips.unshift('Search “' + S.q.trim() + '”');
    if (S.view === 'people') return chips.length ? chips.join(' · ') : 'All faculty records';
    return 'Faculty at ' + fmt(matchP.length) + (matchP.length === 1 ? ' program' : ' programs') + ' shown' + (chips.length ? ' · ' + chips.join(' · ') : '');
  }
  function renderSummary() {
    const rows = summaryRows(), key = S.si === 'gs' ? 'gs' : 'sc', dim = S.g || autoGroup();
    const idxName = key === 'gs' ? 'Google Scholar h-index' : 'Scopus h-index';
    const dimLabel = (GROUP_DIMS.find((d) => d[0] === dim) || ['', ''])[1];
    const num = (a, b) => a - b;
    const groups = [{ label: 'All selected', fig: 'All selected', csv: 'All selected', all: true, st: hStats(rows.map((f) => f[key]).sort(num)) }];
    const defs = dim !== 'none' && rows.length ? groupDefs(dim, rows) : [];
    defs.forEach((g) => { groups.push({ label: g.label, fig: g.fig || g.label, csv: g.csv || g.label, st: hStats(rows.filter(g.test).map((f) => f[key]).sort(num)) }); });
    if (groups.length === 2 && groups[1].st && groups[0].st && groups[1].st.n === groups[0].st.n) groups.pop();
    const broke = groups.length > 1;
    SUM = { groups, dim, dimLabel, key, idxName, title: idxName + (broke ? ' by ' + dimLabel.toLowerCase() : ''), sub: selectionText(), n: rows.length };
    const autoOpt = $('#sum-group option[value=""]'); if (autoOpt) autoOpt.textContent = 'Auto (' + (GROUP_DIMS.find((d) => d[0] === autoGroup()) || ['', ''])[1].toLowerCase() + ')';
    $('#sum-group').value = S.g; $('#sum-index').value = key;
    $('#sum-caption').textContent = SUM.title + ': ' + fmt(rows.length) + ' faculty records (' + SUM.sub + ')';
    const f1 = (v) => (v == null ? '—' : fix1(v));
    $('#sum-tbody').innerHTML = groups.map((g) => '<tr' + (g.all ? ' class="all"' : '') + '><th scope="row">' + esc(g.label) + '</th><td class="num">' + fmt(g.st ? g.st.n : 0) + '</td><td class="num">' + (g.st ? f1(g.st.mean) : '—') +
      '</td><td class="num">' + (g.st ? fmtQ(g.st.med) : '—') + '</td><td class="num">' + (g.st ? fmtQ(g.st.q1) + '–' + fmtQ(g.st.q3) : '—') + '</td></tr>').join('');
    $('#sum-thead').innerHTML = '<tr><th scope="col">Group</th><th scope="col" class="num">n</th><th scope="col" class="num">Mean h</th><th scope="col" class="num">Median h</th><th scope="col" class="num">IQR</th></tr>';
    $('#sum-note').textContent = (dim === 'role' && broke ? 'Leadership groups can overlap: a faculty member with two titles counts in both. ' : '') +
      (dim === 'program' && broke ? 'Faculty listed by more than one of these programs count in each. ' + (defs.capped ? 'Showing the ' + MAXG + ' programs with the most faculty records, of ' + fmt(defs.capped) + '; tick programs in the table to choose which ones are compared. ' : '') : '') +
      (dim === 'title' && defs.capped ? 'Showing the ' + MAXT + ' most common described titles in this selection, of ' + fmt(defs.capped) + (S.title.length ? ' selected' : '') + '; tick up to ' + MAXT + ' titles under Department/program described title to choose which ones are compared. ' : '') +
      (dim === 'type' || dim === 'era' ? 'Faculty listed by more than one program are grouped by their first-listed program, as in the study. ' : '') + (dim === 'origin' ? 'Faculty listed by more than one program count as DO-origin if any of their programs is, as in the study. ' : '') +
      'IQR is the 25th to 75th percentile. Faculty without a matched ' + (key === 'gs' ? 'Google Scholar' : 'Scopus') + ' profile are counted as 0, as in the study.';
    const has0 = rows.length > 0;
    $('#sum-empty').hidden = has0; $('#sum-fig').hidden = !has0; $('#sum-table-wrap').hidden = !has0;
    ['#sum-png', '#sum-svg', '#sum-csv'].forEach((id) => { $(id).disabled = !has0; });
    drawSummaryFigure();
  }
  function drawSummaryFigure() {
    if (!SUM || !SUM.n) { $('#sum-fig').innerHTML = ''; return; }
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light';
    const w = Math.max(320, Math.min(860, Math.round($('#sum-fig').clientWidth || 860)));
    $('#sum-fig').innerHTML = svgFigure(SUM, dark ? PAL.dark : PAL.light, w).svg;
  }
  function niceStep(hi) { const steps = [1, 2, 5, 10, 20, 25, 50, 100]; for (let k = 0; k < steps.length; k++) if (hi / steps[k] <= 6) return steps[k]; return 200; }
  function clip(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function twoLines(t, per) {
    t = String(t);
    if (t.length <= per) return [t];
    let cut = t.lastIndexOf(' ', per); if (cut < per * 0.5) cut = per;
    const a = t.slice(0, cut).trim(), b = t.slice(cut).trim();
    if (b.length <= per) return [a, b];
    let tail = b.slice(b.length - per + 1); const sp = tail.indexOf(' ');
    if (b.charAt(b.length - per) !== ' ' && sp > 0 && sp < per / 2) tail = tail.slice(sp + 1);
    return [a, '…' + tail.replace(/^[\s\-–—\/,;:]+/, '').trim()];
  }
  function svgFigure(sum, pal, W) {
    const compact = W < 640, L = compact ? 132 : 250, R = compact ? 12 : 172, per = compact ? 19 : 34;
    const lab = sum.groups.map((g) => (g.all ? [clip(g.fig || g.label, per + 2)] : twoLines(g.fig || g.label, per)));
    const two = lab.some((l) => l.length > 1), rowH = two ? (compact ? 52 : 56) : (compact ? 40 : 44);
    const sub = fmt(sum.n) + ' faculty records · ' + sum.sub, perSub = compact ? 52 : 118;
    const wrap = (t, n, max) => { const out = []; let line = ''; t.split(' ').forEach((w) => { if ((line + ' ' + w).trim().length > n && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }); if (line) out.push(line); if (out.length > max) { out.length = max; out[max - 1] = clip(out[max - 1] + ' …', n); } return out; };
    const subLines = wrap(sub, perSub, compact ? 3 : 2), top = 62 + subLines.length * 15;
    const G = sum.groups.map((g, k) => Object.assign({}, g, { lines: lab[k] })).filter((g) => g.st);
    const f1 = (v) => fix1(v), q = fmtQ;
    const hi = Math.max(5, ...G.map((g) => Math.max(g.st.p95, g.st.q3, g.st.mean)));
    const step = niceStep(hi), xmax = Math.ceil(hi / step) * step;
    const x0 = L + 8, x1 = W - R - 12, x = (v) => x0 + (Math.min(v, xmax) / xmax) * (x1 - x0);
    const n1 = 'Box: interquartile range. Line: median. ◆ Mean. Whiskers: 5th–95th percentile.';
    const n2 = 'No matched profile counted as 0. EM Faculty Census Explorer, ' + META.asOf + '.';
    const notes = compact ? wrap(n1 + ' ' + n2, 50, 6) : [n1, n2 + ' tampaerdoc.github.io/em-faculty-census'];
    const plotBottom = top + G.length * rowH, H = plotBottom + 58 + (notes.length - 1) * 15 + 14;
    const T = (x_, y_, txt, a) => '<text x="' + x_.toFixed(1) + '" y="' + y_.toFixed(1) + '"' + (a || '') + '>' + esc(txt) + '</text>';
    const o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(sum.title + '. ' + G.map((g) => (g.fig || g.label) + ': n ' + g.st.n + ', mean ' + f1(g.st.mean) + ', median ' + q(g.st.med) + ', IQR ' + q(g.st.q1) + ' to ' + q(g.st.q3)).join('; ')) + '" font-family="Helvetica, Arial, sans-serif">');
    o.push('<rect width="' + W + '" height="' + H + '" fill="' + pal.bg + '"/>');
    o.push(T(16, 28, clip(sum.title, compact ? 44 : 90), ' font-size="' + (compact ? 15 : 17) + '" font-weight="700" fill="' + pal.text + '"'));
    subLines.forEach((ln, k) => o.push(T(16, 48 + k * 15, ln, ' font-size="' + (compact ? 11.5 : 12.5) + '" fill="' + pal.muted + '"')));
    if (!compact) { o.push(T(W - R + 6, top - 10, 'Median (IQR)', ' font-size="11" font-weight="700" fill="' + pal.muted + '"')); o.push(T(W - 16, top - 10, 'Mean', ' font-size="11" font-weight="700" fill="' + pal.muted + '" text-anchor="end"')); }
    for (let t = 0; t <= xmax + 1e-9; t += step) {
      o.push('<line x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + (top - 4) + '" y2="' + plotBottom + '" stroke="' + pal.grid + '" stroke-width="1"/>');
      o.push(T(x(t), plotBottom + 16, String(t), ' font-size="11" fill="' + pal.muted + '" text-anchor="middle"'));
    }
    o.push('<line x1="' + x0 + '" x2="' + x1 + '" y1="' + plotBottom + '" y2="' + plotBottom + '" stroke="' + pal.axis + '" stroke-width="1"/>');
    o.push(T((x0 + x1) / 2, plotBottom + 34, sum.idxName, ' font-size="12" fill="' + pal.text + '" text-anchor="middle"'));
    G.forEach((g, i) => {
      const s = g.st, yc = top + i * rowH + rowH / 2;
      const tip = (g.fig || g.label) + ': n = ' + fmt(s.n) + '; mean ' + f1(s.mean) + ' (SD ' + f1(s.sd) + '); median ' + q(s.med) + ' (IQR ' + q(s.q1) + '–' + q(s.q3) + '); 5th–95th percentile ' + q(s.p5) + '–' + q(s.p95);
      o.push('<g><title>' + esc(tip) + '</title>');
      o.push('<rect x="0" y="' + (yc - rowH / 2) + '" width="' + W + '" height="' + rowH + '" fill="transparent"/>');
      const y0 = g.lines.length > 1 ? yc - 9 : yc - 2;
      g.lines.forEach((ln, j) => o.push(T(16, y0 + j * 14, ln, ' font-size="' + (compact ? 12 : 13) + '"' + (g.all ? ' font-weight="700"' : '') + ' fill="' + pal.text + '"')));
      o.push(T(16, y0 + g.lines.length * 14 + 1, 'n = ' + fmt(s.n), ' font-size="11" fill="' + pal.muted + '"'));
      o.push('<line x1="' + x(s.p5).toFixed(1) + '" x2="' + x(s.q1).toFixed(1) + '" y1="' + yc + '" y2="' + yc + '" stroke="' + pal.whisk + '" stroke-width="1.3"/>');
      o.push('<line x1="' + x(s.q3).toFixed(1) + '" x2="' + x(s.p95).toFixed(1) + '" y1="' + yc + '" y2="' + yc + '" stroke="' + pal.whisk + '" stroke-width="1.3"/>');
      [s.p5, s.p95].forEach((v) => o.push('<line x1="' + x(v).toFixed(1) + '" x2="' + x(v).toFixed(1) + '" y1="' + (yc - 6) + '" y2="' + (yc + 6) + '" stroke="' + pal.whisk + '" stroke-width="1.3"/>'));
      const bx = x(s.q1), bw = Math.max(2, x(s.q3) - x(s.q1));
      o.push('<rect x="' + bx.toFixed(1) + '" y="' + (yc - 9) + '" width="' + bw.toFixed(1) + '" height="18" rx="2" fill="' + (g.all ? pal.boxAll : pal.box) + '" stroke="' + pal.stroke + '" stroke-width="1.3"/>');
      o.push('<line x1="' + x(s.med).toFixed(1) + '" x2="' + x(s.med).toFixed(1) + '" y1="' + (yc - 9) + '" y2="' + (yc + 9) + '" stroke="' + pal.med + '" stroke-width="2.6"/>');
      const mx = x(s.mean);
      o.push('<path d="M' + mx.toFixed(1) + ' ' + (yc - 6.5) + ' L' + (mx + 6.5).toFixed(1) + ' ' + yc + ' L' + mx.toFixed(1) + ' ' + (yc + 6.5) + ' L' + (mx - 6.5).toFixed(1) + ' ' + yc + ' Z" fill="' + pal.mean + '" stroke="' + pal.meanStroke + '" stroke-width="1.2"/>');
      if (!compact) { o.push(T(W - R + 6, yc + 4, q(s.med) + ' (' + q(s.q1) + '–' + q(s.q3) + ')', ' font-size="12.5" fill="' + pal.text + '"')); o.push(T(W - 16, yc + 4, f1(s.mean), ' font-size="12.5" fill="' + pal.text + '" text-anchor="end"')); }
      o.push('</g>');
      if (g.all && G.length > 1) o.push('<line x1="16" x2="' + (W - 16) + '" y1="' + (yc + rowH / 2) + '" y2="' + (yc + rowH / 2) + '" stroke="' + pal.rule + '" stroke-width="1" stroke-dasharray="3 3"/>');
    });
    notes.forEach((ln, k) => o.push(T(16, plotBottom + 58 + k * 15, ln, ' font-size="11" fill="' + pal.muted + '"')));
    o.push('</svg>');
    return { svg: o.join(''), w: W, h: H };
  }
  function sumFileName() { return 'em-census-' + (SUM.key === 'gs' ? 'scholar' : 'scopus') + '-h' + (SUM.groups.length > 1 ? '-by-' + SUM.dim : '') + '-' + (S.view === 'people' ? 'faculty' : 'programs'); }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function exportSummarySVG() { const f = svgFigure(SUM, PAL.light, 860); saveBlob(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + f.svg], { type: 'image/svg+xml;charset=utf-8' }), sumFileName() + '.svg'); toast('Figure saved (SVG)'); }
  function exportSummaryPNG() {
    const f = svgFigure(SUM, PAL.light, 860), scale = 3, img = new Image();
    const url = URL.createObjectURL(new Blob([f.svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = f.w * scale; c.height = f.h * scale;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => { if (b) { saveBlob(b, sumFileName() + '.png'); toast('Figure saved (PNG)'); } else toast('Could not create the PNG'); }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not create the PNG'); };
    img.src = url;
  }
  function exportSummaryCSV() {
    const f1 = (v) => (v == null ? '' : fix1(v)), q = (v) => (v == null ? '' : fmtQ(v));
    const lines = [['EM Faculty Census Explorer: ' + SUM.title], ['Selection: ' + fmt(SUM.n) + ' faculty records · ' + SUM.sub], ['Link: ' + location.href.split('#')[0] + listHash()],
      ['Faculty without a matched ' + (SUM.key === 'gs' ? 'Google Scholar' : 'Scopus') + ' profile are counted as 0. Percentiles use linear interpolation. Census ' + META.asOf + '.'], [],
      ['Group', 'n', 'Mean', 'SD', 'Median', 'Q1 (25th percentile)', 'Q3 (75th percentile)', 'IQR (Q3 - Q1)', '5th percentile', '95th percentile', 'h = 0 (%)']];
    SUM.groups.forEach((g) => { const s = g.st; lines.push(s ? [g.csv, s.n, f1(s.mean), f1(s.sd), q(s.med), q(s.q1), q(s.q3), q(s.q3 - s.q1), q(s.p5), q(s.p95), (100 * s.zero).toFixed(1)] : [g.csv, 0, '', '', '', '', '', '', '', '', '']); });
    const csv = '﻿' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), sumFileName() + '.csv'); toast('Summary saved (CSV)');
  }

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
    const H = ['Record ID', 'First name', 'Last name', 'Listed credentials', 'Degree', 'Program(s)', 'ACGME program ID(s)', 'Program state(s)', 'Program type(s)', 'Institution', 'Normalized rank title', 'Department/program described title',
      'Department role(s)', 'Faculty type', 'Scopus h-index', 'Scopus basis', 'Scopus profile', 'Google Scholar h-index', 'Google Scholar basis', 'Google Scholar profile',
      'AAU', 'AAU university', 'Vizient', 'Marker phenotype (own institution)', 'Blue Ridge institution rank (FY2025)', 'Blue Ridge institution NIH funding (FY2025, $)', 'Blue Ridge PI rank (FY2025)', 'Blue Ridge PI NIH funding (FY2025, $)',
      'Department chair designation', 'Chair type', 'Chair position', 'Chair title (listed)', 'Chair source', 'Chair evidence', 'Program director', 'Faculty roster', 'Profile page', 'Rank source'];
    const out = rows.map((f) => {
      const pr = f.progs.map((k) => P[k]);
      return [f.rid, f.fn, f.ln, f.cred, f.deg, pr.map((x) => x.name).join('; '), pr.map((x) => x.id).join('; '), uniq(pr.map((x) => x.state)).join('; '), uniq(pr.map((x) => TYPES[x.typeIdx])).join('; '), f.inst,
        RANKS[f.rank], f.title, roleText(f), f.ftype, f.sc, META.scBasis[f.scb], f.scid ? f.scid.split(';').map((id) => 'https://www.scopus.com/authid/detail.uri?authorId=' + id).join('; ') : '', f.gs, META.gsBasis[f.gsb],
        f.gsid ? 'https://scholar.google.com/citations?user=' + f.gsid : '', f.aau ? 'Yes' : 'No', f.aaum, f.viz === 1 ? 'Yes' : (f.viz === 2 ? 'Unresolved' : 'No'), PHENOS[f.phenoIdx],
        f.brr, f.brf, f.brpr, f.brpf, f.chd === 1 ? 'Designated department chair' + (f.chfor.length ? ' (' + f.chfor.map((k) => P[k].name).join('; ') + ')' : '') : (f.chd === 2 ? 'Secondary chair' : ''),
        f.chd ? (f.cht === 'A' ? 'Academic chair' : 'Hospital chair') : '', f.chd ? f.chpos : '', f.chtitle, f.chsrc, { H: 'High', M: 'Medium', L: 'Low' }[f.chev] || '',
        has(f.tok, 'Program Director') ? 'Yes' : '', f.roster, f.profile, f.rsrc];
    });
    download(name, H, out);
  }
  function exportPrograms(rows, name) {
    const H = ['ACGME program ID', 'Program', 'Sponsor', 'Primary site', 'City', 'State', 'Program length (years)', 'Program type', 'Marker phenotype', 'AAU', 'AAU university(ies)', 'Vizient', 'Blue Ridge ranked',
      'Blue Ridge best rank (FY2025)', 'Blue Ridge institution(s)', 'ACGME accreditation year', 'Accreditation date', 'Accreditation era', 'DO origin', 'Origin', 'Origin basis', 'Former name',
      'Department chair', 'Chair type', 'Chair position', 'Chair interim', 'Chair title (listed)', 'Chair source', 'Chair evidence', 'Other chairs', 'Program director(s)',
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

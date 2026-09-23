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
  // percentages round half to even at the printed precision, as the study's tables do (81.25% prints as 81.2%)
  const rhe = (v, d) => { const m = Math.pow(10, d), x = v * m, f = Math.floor(x + 1e-9), frac = x - f; return (Math.abs(frac - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(x)) / m; };
  const pct = (a, b, d = 1) => (b ? rhe(100 * a / b, d).toFixed(d) + '%' : '—');
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
  const DEFAULT = { view: 'programs', q: '', aau: '', viz: '', br: '', pheno: [], type: [], chair: [], do: '', era: [], st: '', own: [], staff: [], len: [], pg: [],
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
    askInit();
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
    html.push('<div class="fgroup"><h3>Program length</h3>' + checks('len', [[3, '3-year programs', cnt((p) => p.length === 3)], [4, '4-year programs', cnt((p) => p.length === 4)]]) + '</div>');
    html.push('<div class="fgroup"><h3>Origin and accreditation</h3>' + tri('do', 'DO origin (moved from AOA)') +
      '<p class="fsub">ACGME accreditation era</p>' + checks('era', ERAS.map((t, k) => [k, t, cnt((p) => p.eraIdx === k)])) + '</div>');
    html.push('<div class="fgroup"><h3>Location and ownership</h3><div class="row2"><label for="f-st" class="sr-only">State</label><select id="f-st" class="sel"><option value="">All states</option>' +
      STATES.map((s) => '<option value="' + esc(s) + '">' + esc(s) + ' (' + cnt((p) => p.state === s) + ')</option>').join('') + '</select>' +
      '</div>' +
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
    $('#f-st').value = S.st; $('#f-hs').value = S.hs; $('#f-hmin').value = S.hmin; $('#f-hmax').value = S.hmax; $('#f-hp').value = S.hp;
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
    // front page: "Search the data" focuses the search bar; "Ask the data" sends a typed question to the Ask screen (or opens it)
    $('#search-btn').addEventListener('click', () => { $('#q').focus(); $('#q').select(); });
    const askInline = () => { const q = $('#ask-q2').value.trim(); go(q ? '#/ask?q=' + encodeURIComponent(q) : '#/ask'); };
    $('#ask-inline').addEventListener('submit', (e) => { e.preventDefault(); askInline(); });
    $('#ask-btn').addEventListener('click', askInline);
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-ask-inline]'); if (b) go('#/ask?q=' + encodeURIComponent(b.dataset.askInline)); });
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
  const ARR = ['pheno', 'type', 'chair', 'era', 'own', 'staff', 'rank', 'role', 'deg', 'len'];
  const STR = ['q', 'aau', 'viz', 'br', 'do', 'st', 'hs', 'hmin', 'hmax', 'hp', 'sp', 'sf', 'g', 'si'];
  function listHash() {
    const u = new URLSearchParams();
    STR.forEach((k) => { if (S[k] !== DEFAULT[k] && S[k] !== '') u.set(k, S[k]); });
    ARR.forEach((k) => { if (S[k].length) u.set(k, S[k].join('.')); });
    if (S.title.length) u.set('ti', S.title.join('|'));
    if (S.pg.length) u.set('pg', S.pg.join('.'));
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
    s.pg = uniq((u.get('pg') || '').split('.').filter((id) => PID.has(id))); // programs named in a link (e.g. from Ask the data)
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
    let m = h.match(/^#\/ask(?:\?(.*))?$/);
    if (m) {
      navDepth = 0;
      if (!lastList) { S = parseList('programs', ''); lastList = listHash(); syncFilterUI(); render(); }
      closeOverlay(true); showAsk(true, m[1]); return;
    }
    m = h.match(/^#\/(people|programs)(?:\?(.*))?$/);
    if (m) {
      navDepth = 0; showAsk(false);
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
    if (S.len.length && S.len.indexOf(p.length) < 0) return false;
    if (S.pg.length && S.pg.indexOf(p.id) < 0) return false;
    return true;
  }
  function progFilterActive() { return S.type.length || S.chair.length || S.do || S.era.length || S.st || S.own.length || S.staff.length || S.len.length || S.pg.length; }
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
    S.len.forEach((v) => out.push(['len:' + v, v + '-year programs']));
    if (S.pg.length <= 3) S.pg.forEach((id) => out.push(['pg:' + id, 'Program: ' + PID.get(id).name]));
    else out.push(['pg', 'Programs: ' + S.pg.slice(0, 2).map((id) => PID.get(id).name).join('; ') + '; and ' + fmt(S.pg.length - 2) + ' more']);
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
    else S[k] = JSON.parse(JSON.stringify(DEFAULT[k]));
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
    else location.replace(location.href.split('#')[0] + (askOpen ? askHash() : (lastList || '#/programs')));
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
      (p.chairSecondary ? fact('Other chairs', esc(p.chairSecondary)) : '') + (p.chairNote ? fact('Chair note', noteHTML(p.chairNote)) : '') + '</dl></div>' +
      '<div class="card"><h3>Hospital ownership and ED staffing</h3><dl class="facts">' +
      fact('Owner', esc(p.owner) + (p.ownType ? '<span class="sub">' + esc(p.ownType) + '</span>' : '')) + fact('ED staffing', esc(p.staffing) + (p.staffCat ? '<span class="sub">' + esc(p.staffCat) + '</span>' : '')) +
      fact('Corporate ties', esc(p.corpRel)) + fact('Classification', esc(cap(p.classConf)) + ' confidence' + (safeUrl(p.ownSrc) ? '<span class="sub">' + link(p.ownSrc, 'Ownership source (' + host(p.ownSrc) + ')') + '</span>' : '') + (safeUrl(p.staffSrc) ? '<span class="sub">' + link(p.staffSrc, 'Staffing source (' + host(p.staffSrc) + ')') + '</span>' : '')) +
      '</dl></div>' +
      '<div class="two"><div class="card"><h3>Normalized rank title</h3>' + bars(RANKS, p.rankN, p.n) + '</div><div class="card"><h3>Scopus h-index</h3>' + bars(HB.map((b) => b[2]), p.hBands, p.n) +
      '<p class="note">Mean ' + fmtQ(p.meanSc) + ' · ' + pct(Math.round(p.ge10 * p.n), p.n, 0) + ' with h ≥ 10 · ' + pct(Math.round(p.doShare * p.n), p.n, 0) + ' DO-only degree</p></div></div>' +
      '<div class="card"><h3>Faculty (' + fmt(p.n) + ')</h3><div class="table-wrap" style="max-height:none"><table class="data" data-prog="' + p.id + '" data-sort="rank" data-dir="-1"><thead></thead><tbody data-rows></tbody></table></div>' +
      '<p class="note">Faint values marked ° are not observed on a matched profile and are counted as 0, as in the study.</p></div>';
  }
  // a chair note can carry a source URL; link it
  const noteHTML = (t) => esc(t).replace(/(https?:\/\/[^\s)]+)/g, (u) => '<a href="' + u + '" target="_blank" rel="noopener">' + host(u) + '</a>');
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
      '<h3>Ask the data</h3><p><a href="#/ask">Ask the data</a> answers plain-language questions from the same data, entirely in your browser: for example <em>h-index distribution of chairs versus assistant professors</em>, <em>compare USF rank distribution and h-index to HCA Brandon</em>, <em>how many program directors have an h-index of at least 10</em>, or <em>who is the chair at Johns Hopkins</em>. It is a rule-based reader rather than an AI model: it recognizes the census vocabulary (normalized ranks, described titles, leadership roles, degrees, program types, markers, program length, accreditation era, states, health systems, program names and ACGME IDs) and the words <em>versus</em>, <em>compare</em>, <em>by</em>, <em>how many</em>, <em>share</em>, <em>list</em>, <em>top</em>, and <em>who is</em>. Each answer states how the question was read, shows the numbers with a figure and a table you can download, and links to the same selection in the explorer so you can check and refine it. Nothing you type is sent anywhere.</p>' +
      '<h3>Summary and figures</h3><p>Below the results, a summary gives the number of faculty (n), mean, median, and interquartile range (IQR, 25th to 75th percentile) of the Scopus h-index for the current selection, overall and by a grouping you choose (normalized rank title, department/program described title, leadership role, program type, program length, research stratum, accreditation era, or program origin), with a box-plot figure. Download the figure as PNG or SVG and the summary as CSV; <em>Copy link</em> keeps the grouping and any rows you ticked. In the Programs view the summary covers all faculty at the programs shown. Tick the box beside one or more rows to limit the summary to them: tick a program to summarize its faculty, tick two or more programs to compare them side by side (group by program), or tick people to summarize just those people. Ticked rows stay selected while you search, so you can build a comparison across several searches.</p>' +
      '<h3>Definitions</h3><dl>' +
      '<dt>Normalized rank title</dt><dd>The published academic rank, normalized to instructor, assistant, associate, or full professor, as analyzed in the paper. Modifiers such as clinical, adjunct, or research are set aside, so a clinical assistant professor counts as an assistant professor. No rank means none was published.</dd>' +
      '<dt>Department/program described title</dt><dd>The academic title exactly as the department or program describes it, before normalization: for example Clinical Assistant Professor, Assistant Clinical Professor, Assistant Professor of Clinical Emergency Medicine, or Health Sciences Assistant Clinical Professor. In some departments these titles mark a distinct track, with different expectations for scholarship and promotion, so this filter lets you explore them directly; type part of a title to find its variants, then tick them one by one or select all shown. Faculty with no published rank have no described title. Where the described title differs from the plain rank, it appears beneath the normalized rank in the People table.</dd>' +
      '<dt>h-index</dt><dd>Scopus and Google Scholar h-indices, collected ' + esc(META.hDates) + '. Where no profile could be matched, the value is counted as 0, the study’s convention; these values appear faint with a ° mark, and each record says why.</dd>' +
      '<dt>AAU</dt><dd>A program of an Association of American Universities member university’s own medical school, at any of its sites (both University of Florida programs, for example). Forty-five programs affiliated with a member university, or at a separate campus of a university system, carry no AAU marker (senior-author reviews of September 21 and 23, 2026); the program page says so under AAU.</dd>' +
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
  const GROUP_DIMS = [['', 'Auto'], ['none', 'No breakdown'], ['rank', 'Normalized rank title'], ['title', 'Department/program described title'], ['role', 'Leadership role'], ['program', 'Program'], ['type', 'Program type'], ['length', 'Program length'],
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
    if (S.len.length >= 2) return 'length';
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
    if (dim === 'length') return pick(S.len, [3, 4]).map((k) => ({ label: k + '-year programs', fig: k + '-year', csv: k + '-year programs', test: (f) => first(f).length === k }));
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
      (dim === 'type' || dim === 'era' || dim === 'length' ? 'Faculty listed by more than one program are grouped by their first-listed program, as in the study. ' : '') + (dim === 'origin' ? 'Faculty listed by more than one program count as DO-origin if any of their programs is, as in the study. ' : '') +
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
      'Department chair', 'Chair type', 'Chair position', 'Chair interim', 'Chair title (listed)', 'Chair source', 'Chair evidence', 'Other chairs', 'Chair note', 'Program director(s)',
      'Hospital owner', 'Ownership type', 'ED staffing', 'Staffing category', 'Corporate ties', 'Classification confidence', 'Ownership source', 'Staffing source', 'Affiliation', 'NRMP code',
      'Faculty records', 'No rank (n)', 'No rank (%)', 'Instructor (n)', 'Assistant professor (n)', 'Associate professor (n)', 'Full professor (n)', 'Emeritus (n)', 'Other title (n)',
      'Median Scopus h', 'Scopus h Q1', 'Scopus h Q3', 'Mean Scopus h', 'Scopus h >= 10 (%)', 'Median Google Scholar h', 'DO-only degree share (%)'];
    const out = rows.map((p) => [p.id, p.name, p.sponsor, p.site, p.city, p.state, p.length, TYPES[p.typeIdx], p.pheno, p.aau ? 'Yes' : 'No', p.aauMembers.join('; '), p.viz ? 'Yes' : 'No', p.br ? 'Yes' : 'No',
      p.brBest, p.brList.map((b) => b.inst + ' (#' + b.rank + ')').join('; '), p.accCensored ? 'On or before 2000' : (p.accYear == null ? '' : p.accYear + (p.accApprox ? ' (approximate)' : '')), p.accDate, p.accEra,
      p.doOrigin ? 'Yes' : 'No', p.origin, p.originBasis, p.formerName, p.chairName || 'Not identified', p.chairType, p.chairPos, p.chairInterim ? 'Yes' : '', p.chairTitle, p.chairSrc, p.chairEv, p.chairSecondary, p.chairNote, p.pdNames.join('; '),
      p.owner, p.ownType, p.staffing, p.staffCat, p.corpRel, p.classConf, p.ownSrc, p.staffSrc, p.affil, p.nrmp,
      p.n, p.rankN[0], p.n ? (100 * p.rankN[0] / p.n).toFixed(1) : '', p.rankN[1], p.rankN[2], p.rankN[3], p.rankN[4], p.rankN[5], p.rankN[6],
      fmtQ(p.medSc), fmtQ(p.q1Sc), fmtQ(p.q3Sc), p.meanSc == null ? '' : p.meanSc.toFixed(1), (100 * p.ge10).toFixed(1), fmtQ(p.medGs), (100 * p.doShare).toFixed(1)]);
    download(name, H, out);
  }


  /* ================================================================ Ask the data: plain-language questions, answered in the browser.
     A small rule-based reader: it recognizes the census vocabulary (ranks, roles, program types, markers, program names, h-index
     thresholds) and turns a question into one or more faculty cohorts, a measure, and an optional breakdown. Nothing leaves the page. */
  const ASK_LIST = 50, ASK_MAXC = 12, ASK_MAXG = 25;
  const CAT_PAL = ['#118a5c', '#c07f0a', '#3a6fd8', '#d04040', '#9057d6', '#2c9fc9']; // categorical fills: pass lightness, chroma, CVD and contrast checks on light and dark surfaces
  const US_STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', 'washington dc': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'puerto rico': 'PR', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
  const STATE_NAME = {}; Object.keys(US_STATES).forEach((k) => { if (!STATE_NAME[US_STATES[k]]) STATE_NAME[US_STATES[k]] = k.replace(/\b\w/g, (c) => c.toUpperCase()); }); STATE_NAME.DC = 'District of Columbia';
  const STATE_RE = Object.keys(US_STATES).sort((a, b) => b.length - a.length).join('|');
  const ASK_STOP = new Set(['a', 'an', 'the', 'of', 'for', 'at', 'in', 'on', 'me', 'us', 'please', 'show', 'tell', 'give', 'get', 'what', 'whats', 'is', 'are', 'was', 'were', 'does', 'did', 'have', 'has', 'how', 'which', 'who', 'whos', 'whose', 'that', 'this', 'these', 'those', 'all', 'any', 'faculty', 'member', 'members', 'people', 'person', 'records', 'record', 'data', 'about', 'their', 'its', 'there', 'here', 'within', 'across', 'among', 'from', 'into', 'as', 'be', 'by', 'do', 'i', 'we', 'you', 'can', 'could', 'would', 'like', 'want', 'see', 'look', 'find', 'department', 'departments', 'dept', 'em', 'emergency', 'medicine', 'residency', 'residencies', 'program', 'programs', 'just', 'only', 'also', 'again', 'now', 'much', 'many', 'lot', 'each', 'every', 'per', 'up', 'out', 'so', 'then', 'than', 'well', 'ok', 'okay', 'hi', 'hello', 'thanks', 'thank', 'vs', 'versus', 'and', 'or', 'to', 'with', 'plus', 'but', 'while', 'whereas', 'compared', 'between', 'against', 'my', 'our', 'your', 'own', 'same', 'other', 'versus', 'question', 'answer', 'it', 'they', 'them', 'he', 'she', 'his', 'her', 'not', 'no', 'yes', 'when', 'where', 'why', 'if', 'over', 'under', 'more', 'less', 'most', 'least', 'very', 'really', 'some', 'few', 'several', 'different', 'various']);
  const ASK_SPLIT = new Set(['and', 'or', 'to', 'with', 'plus', 'versus', 'but', 'while', 'whereas', 'vs', 'than', 'then', 'also', 'against', 'compared', 'between', ',']);
  // Vocabulary. Each entry: a regex over the normalized question, a class (t), a value, a label, and how it filters.
  // lvl 'p' filters faculty records; lvl 'g' filters programs (a faculty record passes if any of its programs does).
  const RL = (v, label, short) => ({ t: 'role', v, label, short: short || label });
  const ASK_LEX = [
    // comparison connectors, intersections, and question words
    { re: /\b(?:versus|compared (?:to|with|against)|in comparison (?:to|with)|relative to|as opposed to|against|rather than)\b/g, t: 'vs' },
    { re: /\b(?:who are|that are|which are|who hold|who have|who has|holding|having|whose|with)\b/g, t: 'isect' },
    { re: /\b(?:and|or|plus|to|then)\b|,/g, t: 'and' },
    { re: /\b(?:compare|comparison|comparing|contrast|difference between|differ|differences)\b/g, t: 'intent', v: 'compare' },
    { re: /\b(?:how many|number of|count of|count|how much|total number|total)\b/g, t: 'intent', v: 'count' },
    { re: /\b(?:what (?:share|percent|percentage|proportion|fraction)|share|percent|percentage|proportion|fraction|rate) of\b|\b(?:share|percent|percentage|proportion|fraction)\b/g, t: 'intent', v: 'share' },
    { re: /\b(?:list|names? of|who are|which|show all|show the|display|table of|roster|enumerate|listing)\b/g, t: 'intent', v: 'list' },
    { re: /\b(?:who is|whos|who)\b/g, t: 'intent', v: 'who' },
    { re: /\b(?:top|highest|most productive|most cited|best|largest|greatest|leading|ranked highest|max|maximum)\b(?: (\d{1,3}))?/g, t: 'top', v: 'desc' },
    { re: /\b(?:bottom|lowest|least productive|least cited|smallest|min|minimum)\b(?: (\d{1,3}))?/g, t: 'top', v: 'asc' },
    { re: /\b(?:distribution|distributions|spread|histogram|breakdown|make ?up|composition|bands?)\b/g, t: 'intent', v: 'dist' },
    { re: /\b(?:median|medians|mean|means|average|averages|avg|iqr|interquartile|quartiles?|percentiles?|typical|summary|summarize|summarise|statistics|stats)\b/g, t: 'intent', v: 'stats' },
    { re: /\b(?:tell me about|what do you (?:know|have) (?:about|on)|information (?:about|on)|info (?:about|on)|details? (?:about|on|of|for)|describe|overview of|profile of|about)\b/g, t: 'intent', v: 'about' },
    { re: /\b(?:help|what can (?:i|you)|examples?|how (?:do|does) this work|instructions)\b/g, t: 'intent', v: 'help' },
    // measures
    { re: /\b(?:google scholar|scholar|gs) (?:h[ -]?(?:index|indices|indexes)?)\b|\b(?:google scholar|scholar)\b/g, t: 'metric', v: 'h', key: 'gs' },
    { re: /\bscopus (?:h[ -]?(?:index|indices|indexes)?)\b|\bscopus\b/g, t: 'metric', v: 'h', key: 'sc' },
    { re: /\bh[ -]?(?:index|indices|indexes|idx)\b|\bh\b(?= (?:of|for|at|by|distribution|values?|scores?|among|in|>=|<=|>|<|=|over|under|above|below|at least|greater|less|more|fewer|between))|\bhindex\b|\bcitation(?:s| impact| metrics?)?\b|\bresearch (?:productivity|output|impact|metrics?)\b|\bscholarly (?:output|productivity|impact)\b|\bbibliometrics?\b|\bpublication metrics?\b/g, t: 'metric', v: 'h' },
    { re: /\b(?:normalized )?(?:academic )?rank(?:s|ings?)?\b|\b(?:academic )?titles?\b|\bprofessorial (?:rank|title)s?\b|\bseniority\b/g, t: 'metric', v: 'rank' },
    { re: /\b(?:leadership )?roles?\b|\bleadership (?:titles?|positions?|structure)\b|\btitles? held\b/g, t: 'metric', v: 'role' },
    { re: /\bdegrees?\b|\bcredentials?\b|\btraining background\b/g, t: 'metric', v: 'deg' },
    { re: /\bprogram types?\b|\btypes? of programs?\b|\bsectors?\b/g, t: 'metric', v: 'type' },
    { re: /\bchair types?\b|\btypes? of chairs?\b/g, t: 'metric', v: 'chairtype' },
    // breakdown dimension
    { re: /\b(?:by|per|for each|stratified by|broken down by|split by|grouped by|according to) (?:normalized |academic |program |research |accreditation |department |listed |described |hospital |ed |emergency department )?(rank|ranks|title|titles|role|roles|program|programs|type|types|length|lengths|stratum|strata|marker|markers|phenotype|era|eras|origin|state|states|degree|degrees|chair type|chair types|ownership|owner|staffing|institution|institutions|university|universities|band|bands)\b/g, t: 'by' },
    // h-index thresholds
    { re: /\b(?:h[ -]?index|h|hindex|scopus h|scholar h)? ?between (\d{1,3}) and (\d{1,3})\b/g, t: 'h', op: 'between' },
    { re: /\b(?:h[ -]?index|h|hindex|scopus h|scholar h)? ?(?:>=|of at least|at least|greater than or equal to|no less than|minimum of|min of|not less than) ?(\d{1,3})\b/g, t: 'h', op: '>=' },
    { re: /\b(\d{1,3}) (?:or (?:more|higher|greater|above)|and (?:up|above|over|higher|more)|plus)\b|\b(\d{1,3})\+/g, t: 'h', op: '>=' },
    { re: /\b(?:h[ -]?index|h|hindex)? ?(?:>|greater than|more than|above|over|exceeding|higher than) ?(\d{1,3})\b/g, t: 'h', op: '>' },
    { re: /\b(?:h[ -]?index|h|hindex)? ?(?:<=|at most|no more than|up to|maximum of|max of|not more than) ?(\d{1,3})\b/g, t: 'h', op: '<=' },
    { re: /\b(\d{1,3}) (?:or (?:less|fewer|lower|below)|and (?:below|under|lower|less))\b/g, t: 'h', op: '<=' },
    { re: /\b(?:h[ -]?index|h|hindex)? ?(?:<|less than|fewer than|below|under|lower than) ?(\d{1,3})\b/g, t: 'h', op: '<' },
    { re: /\b(?:h[ -]?index|h|hindex) (?:of|=|equal to|equals|is) ?(\d{1,3})\b/g, t: 'h', op: '=' },
    { re: /\b(?:zero|no|0) (?:h[ -]?index|h|scopus (?:h|profile|h index)|scholar (?:h|profile))\b|\bh (?:=|of|is) 0\b|\bwithout (?:a )?(?:matched )?(?:scopus|scholar|google scholar) profiles?\b|\bno (?:matched )?(?:scopus|scholar|google scholar) profiles?\b|\bunmatched\b/g, t: 'h', op: '=', n: 0 },
    { re: /\b(?:with|having|have|has) (?:a )?(?:matched )?(?:scopus|scholar|google scholar) profiles?\b|\bmatched profiles?\b|\bobserved (?:h|values?)\b/g, t: 'hp' },
    // normalized rank
    { re: /\b(?:no|without|missing|unpublished|unknown|not?) (?:a |an |any )?(?:published |listed |academic |stated )?(?:rank|ranks|title|titles)(?: published| listed)?\b|\bunranked\b|\brank(?:s)? not (?:published|listed|given|stated)\b|\bnon ?ranked\b/g, t: 'rank', v: [0], label: 'No published rank', pred: 'have no published rank' },
    { re: /\binstructors?\b|\blecturers?\b|\bclinical instructors?\b/g, t: 'rank', v: [1], label: 'Instructors' },
    { re: /\b(?:assistant|asst|assist) (?:clinical |research |adjunct |teaching )?prof(?:essor|essors|s)?\b|\bassistant level\b|\bassistants\b|\bassistant\b(?= (?:and|or|,|to|versus|vs|through|-))/g, t: 'rank', v: [2], label: 'Assistant professors' },
    { re: /\b(?:associate|assoc) (?:clinical |research |adjunct |teaching )?prof(?:essor|essors|s)?\b|\bassociate level\b|\bassociates\b|\bassociate\b(?= (?:and|or|,|to|versus|vs|through|-|professors?))/g, t: 'rank', v: [3], label: 'Associate professors' },
    { re: /\bfull (?:clinical |research |adjunct )?prof(?:essor|essors|s)?\b|\bfulls\b|\btenured professors?\b|\bfull\b(?= (?:and|or|,|to|versus|vs))/g, t: 'rank', v: [4], label: 'Full professors' },
    { re: /\bprof(?:essor|essors)\b|\bprofs\b/g, t: 'rank', v: [4], label: 'Full professors (a bare “professor” is read as full professor)', short: 'Full professors' },
    { re: /\bemerit(?:us|i|a|ae)\b|\bretired (?:faculty|professors?)\b/g, t: 'rank', v: [5], label: 'Emeritus' },
    { re: /\bother (?:title|titles|rank|ranks)\b/g, t: 'rank', v: [6], label: 'Other title' },
    { re: /\bwith (?:a |an )?(?:published |listed |academic )?rank\b|\branked (?:faculty|people|members)\b|\bany rank\b|\bpublished rank\b/g, t: 'rank', v: [1, 2, 3, 4, 5, 6], label: 'Faculty with a published rank', short: 'Ranked faculty', pred: 'have a published rank' },
    { re: /\bjunior (?:faculty|ranks?)\b/g, t: 'rank', v: [1, 2], label: 'Junior faculty (instructors and assistant professors)', short: 'Junior faculty' },
    { re: /\bsenior (?:faculty|ranks?)\b/g, t: 'rank', v: [3, 4], label: 'Senior faculty (associate and full professors)', short: 'Senior faculty' },
    // department/program described title (before normalization): a modifier before a rank word
    { re: /\b(clinical|adjunct|research|visiting|volunteer|affiliate|affiliated|teaching|health sciences|clinical track|of clinical|community|courtesy|voluntary)[ ]+(?:assistant|associate|full)? ?prof(?:essor|essors|s)?\b/g, t: 'title' },
    // roles: the census chair designation and listed leadership titles
    { re: /\b(?:academic|medical school|university|school of medicine|som|med school) (?:department |dept )?chairs?\b|\bdepartment chairs? \(academic\)\b/g, ...RL(['pca'], 'Academic chairs (medical-school department, division, or section chairs)', 'Academic chairs') },
    { re: /\b(?:hospital|health system|system|hospital department|health-system|healthsystem) (?:department |dept )?chairs?\b|\bchiefs? of (?:emergency medicine|the department|the ed|service)\b|\bdepartment chairs? \(hospital\)\b/g, ...RL(['pch'], 'Hospital chairs (hospital or health-system department chairs, chiefs, or ED medical directors where no chair was identified)', 'Hospital chairs') },
    { re: /\binterim chairs?\b|\bacting chairs?\b/g, t: 'role', v: 'interim', label: 'Interim department chairs', short: 'Interim chairs', test: (f) => f.chd === 1 && /interim/i.test(f.chpos || '') },
    { re: /\b(?:any|all|every|including site|site|secondary) chairs?\b|\bchair titles?\b|\banyone (?:titled|called) chair\b/g, ...RL(['chair'], 'Anyone with a chair title (incl. site and secondary chairs)', 'Any chair title') },
    { re: /\b(?:department |dept |departmental |designated |em |emergency medicine |ed )?(?:chairs?|chairpersons?|chairmen|chairman|chairwomen|chairwoman|chairholders?|heads? of departments?|department heads?)\b/g, ...RL(['pca', 'pch'], 'Department chairs (the designated academic or hospital chair of each program)', 'Department chairs') },
    { re: /\b(?:associate|assistant|assoc|asst) (?:residency )?(?:program )?directors?\b|\bapds?\b/g, ...RL(['apd'], 'Associate or assistant program directors') },
    { re: /\b(?:residency )?program directors?\b|\bresidency directors?\b|\bpds?\b/g, ...RL(['pd'], 'Program directors') },
    { re: /\b(?:executive |associate |senior )?vice[ -]?chairs?\b|\bassociate chairs?\b/g, ...RL(['vice'], 'Vice chairs (incl. associate and executive vice chairs)', 'Vice chairs') },
    { re: /\b(?:associate|assistant) (?:student |medical student )?clerkship directors?\b/g, ...RL(['aclerk'], 'Associate or assistant clerkship directors') },
    { re: /\b(?:student |medical student |ms )?clerkship directors?\b|\bclerkship\b/g, ...RL(['clerk'], 'Student clerkship directors') },
    { re: /\bfellowship directors?\b|\bfellowship\b/g, ...RL(['fellow'], 'Fellowship directors (incl. associate and assistant)', 'Fellowship directors') },
    { re: /\bresearch directors?\b|\bdirectors? of research\b|\bvice chairs? (?:of|for) research\b|\bresearch vice chairs?\b|\bresearch leads?\b/g, ...RL(['res'], 'Research directors or vice chairs of research', 'Research directors') },
    { re: /\b(?:division|section) chiefs?\b|\bchiefs?\b/g, ...RL(['chief'], 'Division or section chiefs') },
    { re: /\b(?:ed |emergency department |associate |assistant )?medical directors?\b|\bed directors?\b/g, ...RL(['md'], 'Medical directors (incl. associate and assistant)', 'Medical directors') },
    { re: /\beducation directors?\b|\bdirectors? of education\b/g, ...RL(['edu'], 'Education directors') },
    { re: /\bother directors?\b/g, ...RL(['odir'], 'Other directors') },
    { re: /\bother (?:department )?leadership\b/g, ...RL(['olead'], 'Other department leadership') },
    { re: /\b(?:other faculty|all other faculty|all others|everyone else|everybody else|the rest|remaining faculty|others)\b/g, t: 'rest' },
    { re: /\b(?:non ?leadership|rank and file|regular) faculty\b|\bfaculty (?:with(?:out| no)|holding no|lacking) (?:a )?(?:leadership|administrative) (?:title|titles|role|roles)\b|\bno leadership (?:title|titles|role|roles)\b/g, ...RL(['fac'], 'Faculty with no leadership title', 'No leadership title') },
    { re: /\b(?:department |dept |any |all )?(?:leaders|leadership|leadership (?:titles?|roles?|positions?)|administrators|title[ -]?holders)\b|\bwith (?:a |any )?leadership (?:title|role|position)\b/g, t: 'role', v: 'lead', label: 'Faculty with any leadership title', short: 'Any leadership title', pred: 'hold a leadership title', test: (f) => !(f.roleMask & (1 << ROLE_GROUPS.findIndex((g) => g.id === 'fac'))) },
    { re: /\bcore faculty\b|\bprimary faculty\b/g, t: 'ftype', v: 'Primary', label: 'Primary (core) faculty listings', short: 'Core faculty' },
    { re: /\badjunct faculty\b|\baffiliate faculty\b|\bcollaborative faculty\b/g, t: 'ftype', v: 'Adjunct/Affiliate/Collaborative', label: 'Adjunct, affiliate, or collaborative faculty listings', short: 'Adjunct/affiliate faculty' },
    // degrees
    { re: /\bmd[ \/]?phds?\b|\bphysician[ -]?scientists?\b|\bdual[ -]?degree\b/g, t: 'deg', v: 'mdphd', label: 'Physician-scientists (MD or DO with a PhD or other research doctorate)', short: 'Physician-scientists', pred: 'are physician-scientists', test: (f) => (f.degF & 3) && (f.degF & 4) },
    { re: /\bph\.?d\.?s?\b|\bdoctorates?\b|\bresearch doctorates?\b|\bdoctoral\b/g, t: 'deg', v: 4, label: 'PhD or other research doctorate', short: 'PhDs', pred: 'hold a PhD or other research doctorate' },
    { re: /\bosteopath(?:s|ic)?(?: physicians?| graduates?| trained)?\b|\bd\.o\.s?\b|\bdos\b|\bdo (?:graduates?|physicians?|degrees?|faculty|trained|holders?)\b|\bdo only\b/g, t: 'deg', v: 2, label: 'DO', short: 'DOs', pred: 'are DOs' },
    { re: /\ballopath(?:s|ic)?(?: physicians?| graduates?)?\b|\bm\.d\.s?\b|\bmds\b|\bmd (?:graduates?|physicians?|degrees?|faculty|holders?)\b/g, t: 'deg', v: 1, label: 'MD (incl. MBBS/MBChB)', short: 'MDs', pred: 'are MDs' },
    { re: /\bphysicians?\b|\bdoctors?\b|\bclinicians?\b/g, t: 'deg', v: 3, label: 'Physicians (MD or DO)', short: 'Physicians', pred: 'are physicians (MD or DO)' },
    { re: /\bnon ?physicians?(?: doctorates?| faculty)?\b|\bpharmd\b|\bpharmacists?\b|\bpsychologists?\b/g, t: 'deg', v: 8, label: 'Non-physician doctorate only', short: 'Non-physician doctorates', pred: 'hold a non-physician doctorate only' },
    { re: /\bdegree (?:not verified|unverified|unknown)\b|\bunverified degrees?\b/g, t: 'deg', v: 16, label: 'Degree not verified', short: 'Unverified degrees', pred: 'have an unverified degree' },
    // program type (program-level)
    { re: /\bresearch[ -]?marker(?:ed)? (?:academic )?(?:programs?|centers?|institutions?|departments?)?\b|\bmarker(?:ed)? programs?\b|\bprograms? with (?:a |any )?(?:research )?markers?\b|\bany[ -]marker\b/g, t: 'type', v: [0, 1], label: 'Research-marker academic programs (NIH-ranked, AAU, or Vizient)', short: 'research-marker programs' },
    { re: /\baau (?:academic )?(?:programs?|residencies|centers?|departments?|hospitals?|sites?)\b/g, t: 'pmk', v: 'aau', label: 'Programs with the AAU marker', short: 'AAU programs' },
    { re: /\bvizient (?:academic )?(?:programs?|residencies|centers?|departments?|hospitals?|sites?)\b/g, t: 'pmk', v: 'viz', label: 'Programs with the Vizient marker', short: 'Vizient programs' },
    { re: /\b(?:blue ridge|brimr|nih)[ -]?(?:ranked|funded|listed)? (?:academic )?(?:programs?|residencies|departments?|centers?|sites?)\b/g, t: 'pmk', v: 'br', label: 'Programs with the Blue Ridge (NIH-ranked) marker', short: 'Blue Ridge programs' },
    { re: /\b(?:non|not)[ -]?aau(?: members?| institutions?| universities| university| schools?| faculty)?\b/g, t: 'mk', v: 'noaau', label: 'Faculty at institutions that are not AAU members', short: 'non-AAU faculty', pred: 'are not at AAU institutions' },
    { re: /\b(?:non|not)[ -]?vizient(?: members?| institutions?| faculty)?\b/g, t: 'mk', v: 'noviz', label: 'Faculty at institutions outside the Vizient cohort', short: 'non-Vizient faculty', pred: 'are not at Vizient academic medical centers' },
    { re: /\buniversity[ -]based(?: academic)?(?: programs?| departments?)?\b|\bno[ -]marker academic\b|\bunmarked academic\b|\buniversity programs? (?:with|without) (?:no |a )?markers?\b/g, t: 'type', v: [2], label: 'University-based academic programs (no research marker)', short: 'university-based programs' },
    { re: /\b(?:non|not)[ -]?academic(?: programs?| departments?| centers?| settings?)?\b/g, t: 'type', v: [3, 4, 5], label: 'Non-academic programs (corporate, community-based, or military)', short: 'non-academic programs' },
    { re: /\bacademic (?:programs?|departments?|centers?|medical centers?|institutions?|settings?|places?|sites?|hospitals?|em)\b|\bacademics?\b|\bamcs?\b|\buniversity(?: affiliated| sponsored)? (?:programs?|departments?|hospitals?|centers?|settings?)\b|\buniversities\b/g, t: 'type', v: [0, 1, 2], label: 'Academic programs (research-marker or university-based)', short: 'academic programs' },
    { re: /\bcorporate(?: programs?| departments?| sites?| hospitals?| settings?| owned| run| affiliated)?\b|\bfor[ -]?profit(?: programs?| hospitals?| sites?| settings?| owned)?\b|\binvestor[ -]owned(?: programs?| hospitals?)?\b|\bprivate[ -]equity(?: owned| backed| financed| staffed)?(?: programs?| groups?| sites?)?\b|\bpe[ -](?:owned|backed|financed|staffed)(?: programs?| sites?)?\b|\bcmgs?\b|\bcontract[ -]management groups?\b|\bnational staffing groups?\b|\bstaffing[ -]group(?: programs?| sites?)?\b/g, t: 'type', v: [3], label: 'Corporate programs (for-profit hospital or national staffing group)', short: 'corporate programs' },
    { re: /\bcommunity[ -]?(?:based)?(?: programs?| departments?| hospitals?| sites?| settings?| em)?\b|\bnon[ -]?profit community\b/g, t: 'type', v: [4], label: 'Community-based programs (non-profit or public)', short: 'community-based programs' },
    { re: /\bmilitary(?: programs?| departments?| hospitals?| sites?| settings?)?\b|\bdod\b|\barmy\b|\bnavy\b|\bair force\b|\bdefense\b|\barmed forces\b/g, t: 'type', v: [5], label: 'Military programs', short: 'military programs' },
    { re: /\b(?:non|not)[ -]?corporate(?: programs?)?\b/g, t: 'type', v: [0, 1, 2, 4, 5], label: 'Non-corporate programs', short: 'non-corporate programs' },
    // markers of the faculty member's own institution (person-level)
    { re: /\b(?:aau)(?: members?| institutions?| universities| university| schools?| faculty)?\b|\bassociation of american universities\b/g, t: 'mk', v: 'aau', label: 'Faculty at AAU member institutions', short: 'AAU faculty', pred: 'are at AAU institutions' },
    { re: /\bvizient(?: members?| institutions?| cohort| amcs?| faculty)?\b/g, t: 'mk', v: 'viz', label: 'Faculty at Vizient academic medical centers', short: 'Vizient faculty', pred: 'are at Vizient academic medical centers' },
    { re: /\b(?:blue ridge|brimr|nih)(?: ranked| funded| listed)?(?: institutions?| schools?| medical schools?| faculty| departments?)?\b/g, t: 'mk', v: 'br', label: 'Faculty at Blue Ridge (NIH-ranked) medical schools', short: 'Blue Ridge faculty', pred: 'are at NIH-ranked medical schools' },
    { re: /\b(?:no|without|non|zero|not?) (?:a |any )?(?:research )?markers?(?: institutions?| programs?)?\b|\bunmarked\b|\bmarker ?less\b/g, t: 'mk', v: 'none', label: 'Faculty with no research marker (not NIH-ranked, AAU, or Vizient)', short: 'no research marker', pred: 'have no research marker' },
    // program length, origin, era, accreditation year, chair status (program-level)
    { re: /\b(?:3|three)[ -]?(?:year|yr|years)(?: programs?| residencies| formats?| tracks?)?\b|\b36[ -]month(?: programs?)?\b|\bpgy ?1 ?(?:to|through|-) ?3(?: programs?)?\b/g, t: 'len', v: 3, label: '3-year programs' },
    { re: /\b(?:4|four)[ -]?(?:year|yr|years)(?: programs?| residencies| formats?| tracks?)?\b|\b48[ -]month(?: programs?)?\b|\bpgy ?1 ?(?:to|through|-) ?4(?: programs?)?\b/g, t: 'len', v: 4, label: '4-year programs' },
    { re: /\b(?:do|d\.o\.|osteopathic|aoa|former aoa|formerly aoa|ex aoa)[ -]?(?:origin|accredited|heritage|legacy|derived|converted|transition(?:ed)?)(?: programs?)?\b|\baoa programs?\b|\bosteopathic programs?\b|\bformer(?:ly)? (?:aoa|osteopathic)(?: accredited)?(?: programs?)?\b|\bprograms? (?:that )?(?:moved|converted|transitioned) from (?:the )?aoa\b|\bsingle accreditation (?:transition|conversions?|converts?)\b/g, t: 'do', v: 1, label: 'DO-origin programs (moved from AOA accreditation)', short: 'DO-origin programs' },
    { re: /\b(?:allopathic|acgme|md|non[ -]?do|never aoa)[ -]?origin(?: programs?)?\b|\ballopathic programs?\b|\boriginally acgme\b/g, t: 'do', v: 0, label: 'Allopathic-origin programs' },
    { re: /\blegacy(?: programs?| era)?\b|\b(?:accredited |established )?(?:on or before|before|pre) 2001\b|\b(?:old|older|oldest|long[ -]?standing|established) programs?\b|\baccredited by 2000\b/g, t: 'era', v: [0], label: 'Legacy programs (accredited on or before 2000)', short: 'legacy programs' },
    { re: /\b2001(?: to| through| and)? 2013(?: era| programs?)?\b/g, t: 'era', v: [1], label: 'Programs accredited 2001–2013' },
    { re: /\bsingle accreditation(?: era| period| system| window)?(?: programs?)?\b|\b2014(?: to| through| and)? 2020(?: era| programs?)?\b|\bsas era\b/g, t: 'era', v: [2], label: 'Programs accredited 2014–2020 (single accreditation era)', short: 'programs accredited 2014–2020' },
    { re: /\b2021 or later\b|\b(?:new|newer|newest|recent|recently accredited|young|youngest) programs?\b|\bsince 2021\b|\bafter 2020\b|\bpost[ -]2020\b/g, t: 'era', v: [3], label: 'Programs accredited 2021 or later' },
    { re: /\baccredited (since|after|from|before|until|through|by|in|during) ((?:19|20)\d\d)\b/g, t: 'acc' },
    { re: /\b(?:programs? )?(?:with(?:out| no)|lacking|missing|and no) (?:an? )?(?:identified |designated |known )?chairs?(?: identified| designated)?\b|\bno chair identified\b|\bchairless\b|\bunidentified chairs?\b/g, t: 'chairN', label: 'Programs with no chair identified', short: 'programs with no chair identified' },
    { re: /\b(?:programs? )?(?:led|headed|run|chaired) by (?:an? )?(?:academic|medical school) chairs?\b|\bacademic[ -]chair(?:ed| led)(?: programs?)?\b/g, t: 'chairK', v: 'A', label: 'Programs led by an academic chair', short: 'academic-chair programs' },
    { re: /\b(?:programs? )?(?:led|headed|run|chaired) by (?:an? )?(?:hospital|health system) chairs?\b|\bhospital[ -]chair(?:ed| led)(?: programs?)?\b/g, t: 'chairK', v: 'H', label: 'Programs led by a hospital chair', short: 'hospital-chair programs' },
    // ownership and staffing (program-level)
    { re: /\b(?:public|government|county|state[ -]owned|city|municipal|public or government|publicly owned|safety[ -]net) (?:hospitals?|owned|ownership|programs?|institutions?|systems?)\b/g, t: 'own', v: 'Public / government', label: 'Programs at public or government hospitals', short: 'public hospitals' },
    { re: /\bnon[ -]?profit(?: hospitals?| owned| ownership| programs?| systems?| institutions?)?\b|\bnot[ -]for[ -]profit(?: hospitals?| programs?)?\b/g, t: 'own', v: 'Non-profit', label: 'Programs at non-profit hospitals', short: 'non-profit hospitals' },
    { re: /\bpublicly traded(?: hospitals?| companies| corporations?| owners?)?\b|\bfor[ -]profit corporations?\b|\bstock[ -]exchange listed\b/g, t: 'own', v: 'For-profit (publicly traded corporation)', label: 'Programs at hospitals owned by publicly traded corporations', short: 'publicly traded owners' },
    { re: /\bteam ?health(?: staffed| programs?| sites?)?\b/g, t: 'staff', proper: true, v: 'TeamHealth', label: 'Programs whose ED is staffed by TeamHealth', short: 'TeamHealth-staffed programs' },
    { re: /\benvision(?: physician services| healthcare| staffed| programs?| sites?)?\b/g, t: 'staff', proper: true, v: 'Envision', label: 'Programs whose ED is staffed by Envision Physician Services', short: 'Envision-staffed programs' },
    { re: /\b(?:usacs|us acute care solutions|acute care solutions)(?: staffed| programs?| sites?)?\b/g, t: 'staff', proper: true, v: 'US Acute Care Solutions', label: 'Programs whose ED is staffed by US Acute Care Solutions', short: 'USACS-staffed programs' },
    { re: /\bvituity(?: staffed| programs?| sites?)?\b/g, t: 'staff', proper: true, v: 'Vituity', label: 'Programs whose ED is staffed by Vituity', short: 'Vituity-staffed programs' },
    { re: /\bapollo ?md(?: staffed| programs?| sites?)?\b/g, t: 'staff', proper: true, v: 'ApolloMD', label: 'Programs whose ED is staffed by ApolloMD', short: 'ApolloMD-staffed programs' },
    { re: /\bscp health(?: staffed| programs?| sites?)?\b|\bschumacher\b/g, t: 'staff', proper: true, v: 'SCP Health', label: 'Programs whose ED is staffed by SCP Health', short: 'SCP-staffed programs' },
    { re: /\b(?:hospital|academic|hospital or academic)[ -]employed(?: faculty| physicians?| eds?| programs?| staffing)?\b|\bemployed (?:model|physicians?|faculty|staffing)\b|\bdirectly employed\b/g, t: 'staffCat', v: 'Hospital / academic employed', label: 'Programs with hospital- or academic-employed ED physicians', short: 'employed-model programs' },
    { re: /\b(?:independent|democratic|local|regional|private) (?:physician |emergency |em )?(?:groups?|practices?)(?: staffed| programs?)?\b|\bsmall[ -]group staffed\b/g, t: 'staffCat', v: 'Independent local / regional group', label: 'Programs staffed by an independent local or regional group', short: 'independent-group programs' },
    { re: /\bphysician[ -]owned(?: national)?(?: staffing)?(?: groups?| programs?| sites?)?\b/g, t: 'staffCat', v: 'Physician-owned national staffing group', label: 'Programs staffed by a physician-owned national group', short: 'physician-owned-group programs' },
    { re: /\bstaffing (?:not determined|unknown|undetermined)\b|\bundetermined staffing\b|\bunknown staffing\b/g, t: 'staffCat', v: 'Not determined', label: 'Programs whose ED staffing could not be determined', short: 'staffing not determined' },
    // location
    { re: new RegExp('\\b(?:in|from|across|within|outside|throughout|located in|based in) (?:the state of )?(' + STATE_RE + ')\\b', 'g'), t: 'state' },
    { re: new RegExp('\\b(' + STATE_RE + ') (?:programs?|residencies|faculty|departments?|hospitals?|chairs?|eds?|em)\\b', 'g'), t: 'state' },
    // nouns that are not program names
    { re: /\bprograms?\b|\bresidenc(?:y|ies)\b|\bdepartments?\b|\bsites?\b|\binstitutions?\b|\bhospitals?\b|\bcenters?\b|\bresidency programs?\b/g, t: 'noun' },
    { re: /\b(?:faculty|people|persons?|members?|individuals?|names?|folks|staff)\b/g, t: 'pnoun' },
  ];
  ASK_LEX.forEach((L) => { L.re.lastIndex = 0; });
  let askOpen = false, askLastQ = '', askLog = [], ASK_ACRO = null; const ASK_FIGS = new Map(), ASK_TABLES = new Map(); let askSeq = 0;
  const lcFirst = (s) => { if (!s) return s; const w = s.split(' ')[0]; return /[A-Z]/.test(w.slice(1)) || /^\d/.test(w) ? s : s.charAt(0).toLowerCase() + s.slice(1); }; // keeps AAU, NIH-ranked, PhD, 3-year
  function askNorm(q) {
    return ' ' + norm(q).replace(/[’‘`]/g, "'").replace(/'s\b/g, '').replace(/'/g, '').replace(/&/g, ' and ').replace(/\bvs\.?(?=\s|$)/g, ' versus ').replace(/≥/g, ' >= ').replace(/≤/g, ' <= ').replace(/,/g, ' , ')
      .replace(/[^a-z0-9>=<"+,\/-]+/g, ' ').replace(/([a-z0-9])-(?=[a-z0-9])/g, '$1 ').replace(/-/g, ' - ').replace(/\//g, ' / ').replace(/\s+/g, ' ') + ' ';
  }
  function askCaps(q, word, nth) { // is the nth occurrence of this word typed in capitals in the original question? ("DO" the degree, "FL" the state)
    const ws = q.split(/[^A-Za-z0-9]+/).filter((w) => w.toLowerCase() === word); const w = ws[nth];
    return !!w && w === w.toUpperCase() && /[A-Z]/.test(w);
  }
  // acronyms of program, sponsor and site names ("UCLA", "MGH", "NYU"): first letters of the first 3–6 significant words
  function askAcronyms() {
    if (ASK_ACRO) return ASK_ACRO;
    ASK_ACRO = new Map();
    const skip = new Set(['of', 'the', 'and', 'at', 'for', 'in', 'a', 'an', 'gme']);
    P.forEach((p) => {
      const seen = new Set();
      [p.name, p.sponsor, p.site].concat(p.aliases || []).forEach((s) => {
        if (!s) return;
        s.split(/\s*[\/(),;:]\s*/).forEach((part) => {
          const words = norm(part).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !skip.has(w));
          for (let k = 3; k <= Math.min(6, words.length); k++) seen.add(words.slice(0, k).map((w) => w[0]).join(''));
        });
      });
      seen.forEach((a) => { if (!ASK_ACRO.has(a)) ASK_ACRO.set(a, []); ASK_ACRO.get(a).push(p.i); });
    });
    return ASK_ACRO;
  }
  // nicknames the generic matcher misses or misreads (ACGME program IDs); keys are normalized (lower case, no punctuation)
  const ASK_ALIAS = { penn: '1104121148', upenn: '1104121148', hup: '1104121148', 'university of penn': '1104121148', utsw: '1104821153', 'ut southwestern': '1104821153', washu: '1102821154', 'wash u': '1102821154', wustl: '1102821154', 'barnes jewish': '1102821154', barnes: '1102821154',
    bwh: '1102421150', brigham: '1102421150', mgh: '1102421150', mgb: '1102421150', haemr: '1102421150', 'mass general': '1102421150', 'harvard affiliated': '1102421150', hcmc: '1102612028', ucsd: '1100521080', 'uc san diego': '1100521080', unm: '1103421075', unmc: '1103031168',
    zsfg: '1100513192', sfgh: '1100513192', 'sf general': '1100513192', ucsf: '1100513192', uva: '1105121125', uconn: '1100821120', keck: '1100512005', 'lac usc': '1100512005', 'lac+usc': '1100512005', 'la county usc': '1100512005', 'la general': '1100512005', 'usc la general': '1100512005',
    mizzou: '1102800202', ku: '1101913182', kumc: '1101913182', umkc: '1102812029', truman: '1102812029', 'maine medical': '1102221142', 'maine med': '1102221142', mmc: '1102221142', slu: '1102831201', 'saint louis university': '1102831201', 'st louis university': '1102831201',
    jhu: '1102312022', jhh: '1102312022', gw: '1101012011', gwu: '1101012011', umich: '1102521106', 'u of m': '1102521106', 'university of michigan': '1102521106', 'michigan medicine': '1102521106', ucd: '1100521097', 'uc davis': '1100521097', uci: '1100521078', 'uc irvine': '1100521078',
    bidmc: '1102431163', bmc: '1102421084', 'boston medical center': '1102421084', bu: '1102421084', nyu: '1103521092', bellevue: '1103521092', 'nyu langone': '1103521092', cornell: '1103513169', 'weill cornell': '1103513169', nyp: '1103513169', cuimc: '1103513169', metro: '1103821110', pitt: '1104112055',
    bcm: '1104821207', 'baylor college of medicine': '1104821207', 'ben taub': '1104821207', ccf: '1103800002', 'cleveland clinic': '1103800002', 'uh cleveland': '1103813200', 'case western': '1103813200', 'university hospitals cleveland': '1103813200', ecu: '1103612063', vidant: '1103612063', 'east carolina': '1103612063',
    'ut houston': '1104821096', uth: '1104821096', mcgovern: '1104821096', 'uthealth houston': '1104821096', 'ut san antonio': '1104800214', uthscsa: '1104800214', 'ut health san antonio': '1104800214', usa: '1100100167', 'south alabama': '1100100167', 'usa health': '1100100167',
    lij: '1103521141', 'long island jewish': '1103521141', 'north shore': '1103521141', harbor: '1100512008', 'harbor ucla': '1100512008', jackson: '1101100193', jmh: '1101100193', 'jackson memorial': '1101100193', 'university of miami': '1101100193', vandy: '1104721113', grady: '1101212012', parkland: '1104821153', shands: '1101131186',
    'wake': '1103612033', wfu: '1103612033', musc: '1104512183', 'ole miss': '1102721073', ummc: '1102721073', uihc: '1101812174', kern: '1100512001', hfh: '1102512025', 'detroit receiving': '1102512024', 'sinai grace': '1102512059', cincy: '1103812036', rwj: '1103321205', njms: '1103331177', downstate: '1103531135', 'kings county': '1103531135',
    'stony brook': '1103521091', ormc: '1101121072', 'orlando regional': '1101121072', unc: '1103621130', dell: '1104800211', 'ut austin': '1104800211', unlv: '1103131189', 'olive view': '1100512003', ucla: '1100512003', ohsu: '1104012042', uw: '1105431210', harborview: '1105431210', uab: '1100131165', wvu: '1105521128', vcu: '1105121160', mcv: '1105121160',
    georgetown: '1101012181', medstar: '1101012181', 'shock trauma': '1102321101', hershey: '1104133171', 'penn state': '1104133171', drexel: '1104100200', 'tower health': '1104100200', urmc: '1103521131', strong: '1103521131', ub: '1103531127', siuh: '1103512206', valleywise: '1100321082', maricopa: '1100321082', highland: '1100512006', armc: '1100500216', ruhs: '1100500001', uky: '1102021129', uofl: '1102012020' };
  const hayOf = (s) => ' ' + norm(s || '').replace(/[^a-z0-9]+/g, ' ') + ' ';
  // match a phrase to one program, a set of programs (one sponsor or health system), or a list of candidates
  function askPrograms(phraseRaw) {
    const quoted = /^".*"$/.test(phraseRaw.trim()), raw = phraseRaw.trim().replace(/^"|"$/g, '');
    const toks = raw.split(' ').filter((w) => w && !ASK_STOP.has(w) && w !== '/' && w !== '-' && w !== ',');
    if (!toks.length) return null;
    if (toks.length === 1 && /^\d{10}$/.test(toks[0])) { const p = PID.get(toks[0]); return p ? { progs: [p.i], how: 'ACGME ID' } : { none: raw }; }
    const rw = raw.split(' ').filter((w) => w && w !== '/' && w !== '-' && w !== ',');
    while (rw.length && ASK_STOP.has(rw[0])) rw.shift(); while (rw.length && ASK_STOP.has(rw[rw.length - 1])) rw.pop();
    const contig = ' ' + (rw.length ? rw : toks).join(' ') + ' ';
    const common = (ids, fld) => { const v = new Set(ids.map((i) => (P[i][fld] || '').replace(/\s*\(.*$/, '').trim())); return v.size === 1 ? Array.from(v)[0] : ''; };
    const group = (ids, how) => ({ progs: ids.slice(), how, phrase: raw, system: common(ids, 'sponsor') || common(ids, 'owner') });
    const settle = (ids, how) => { // several programs: one sponsor is a group; a name that starts with the phrase wins; otherwise the user must choose
      if (ids.length === 1) return { progs: ids.slice(), how };
      const eq = ids.filter((i) => hayOf(P[i].name).trim() === contig.trim() || (P[i].aliases || []).some((a) => hayOf(a).trim() === contig.trim()));
      if (eq.length === 1) return { progs: eq, how };
      if (common(ids, 'sponsor')) return group(ids, how);
      const starts = toks.length >= 2 || quoted ? ids.filter((i) => hayOf(P[i].name).indexOf(contig) === 0 || (P[i].aliases || []).some((a) => hayOf(a) === contig)) : [];
      if (starts.length === 1) return { progs: starts, how };
      return { ambiguous: ids.slice(0, 8), phrase: raw };
    };
    const nick = ASK_ALIAS[contig.trim()] || ASK_ALIAS[toks.join(' ')];
    if (nick && PID.has(nick)) return { progs: [PID.get(nick).i], how: 'nickname' };
    if (quoted) {
      const hit = P.filter((p) => [p.name, p.site, p.sponsor].concat(p.aliases || []).some((s) => hayOf(s).indexOf(contig) >= 0)).map((p) => p.i);
      return hit.length ? settle(hit, 'name') : { none: raw };
    }
    const keyHit = P.filter((p) => (toks.length === 1 && (p.keys || []).indexOf(toks[0]) >= 0) || (p.aliases || []).some((a) => hayOf(a).trim() === contig.trim())).map((p) => p.i);
    if (keyHit.length) return settle(keyHit, 'alias');
    if (toks.length === 1 && toks[0].length >= 3 && toks[0].length <= 6) { const ac = askAcronyms().get(toks[0]); if (ac && ac.length) return settle(ac, 'acronym'); }
    const VAR = { st: ['saint'], saint: ['st'], mt: ['mount'], mount: ['mt'], ft: ['fort'], fort: ['ft'], univ: ['university'], med: ['medical'], ctr: ['center'], hosp: ['hospital'], u: ['university'] };
    const forms = (w) => [w].concat(VAR[w] || []);
    let exact = true;
    const inHay = (hay, w) => forms(w).some((v) => (exact ? hay.indexOf(' ' + v + ' ') >= 0 : hay.indexOf(' ' + v) >= 0));
    let cands = [];
    const collect = () => P.forEach((p) => {
      if (!toks.every((w) => inHay(p.hay, w))) return;
      const all = (s) => { const h = hayOf(s); return toks.every((w) => inHay(h, w)); };
      let sc = 0, named = false;
      if (hayOf(p.name).indexOf(contig) === 0) { sc += 7; named = true; } else if (hayOf(p.name).indexOf(contig) >= 0) { sc += 5; named = true; } else if (all(p.name)) sc += 3;
      if ((p.aliases || []).some((a) => hayOf(a).indexOf(contig) >= 0)) { sc += 5; named = true; }
      if (hayOf(p.site).indexOf(contig) >= 0) sc += 3; else if (all(p.site)) sc += 2;
      if (all(p.sponsor)) sc += 2;
      if (all(p.city)) sc += 1.5;
      if (all(p.owner)) sc += 1;
      if (all(p.chairName) || p.pdNames.some(all)) sc += 1;
      cands.push({ i: p.i, sc: sc || 0.5, owner: all(p.owner), named });
    });
    collect();
    if (!cands.length) { exact = false; collect(); }
    if (!cands.length) return { none: raw };
    cands.sort((a, b) => b.sc - a.sc || collator.compare(P[a.i].name, P[b.i].name));
    const own = cands.filter((c) => c.owner).map((c) => c.i);
    if (own.length >= 2 && own.length === cands.length) return group(own, 'owner'); // "HCA", "Corewell": a health system
    const named = cands.filter((c) => c.named).map((c) => c.i);
    if (named.length >= 2) return settle(named, 'name'); // several programs carry the phrase in their name: one sponsor is a group, otherwise the user chooses
    const top = cands.filter((c) => c.sc >= cands[0].sc - 1e-9).map((c) => c.i);
    if (top.length === 1) return { progs: top, how: 'name' };
    return settle(cands.filter((c) => c.sc >= cands[0].sc - 5).slice(0, 8).map((c) => c.i), 'name');
  }
  function askParse(q) {
    const s = askNorm(q), ents = [];
    ASK_LEX.forEach((L, pri) => {
      L.re.lastIndex = 0; let m;
      while ((m = L.re.exec(s))) { if (m[0].trim() === '') { L.re.lastIndex++; continue; } ents.push({ L, pri, pos: m.index, end: m.index + m[0].length, m }); }
    });
    const seen = {};
    const nth = (w) => { seen[w] = (seen[w] || 0) + 1; return seen[w] - 1; };
    // two-letter state codes typed in capitals ("in FL"), and DO / MD / PhD as degrees
    const words = s.trim().split(' '); let pos = 1;
    words.forEach((w, k) => {
      const prev = words[k - 1] || '', next = words[k + 1] || '';
      if (/^[a-z]{2}$/.test(w) && STATE_NAME[w.toUpperCase()] && ['in', 'from', 'across', 'within', 'outside', 'throughout'].indexOf(prev) >= 0 && askCaps(q, w, nth(w))) ents.push({ L: { t: 'state' }, pri: 900, pos, end: pos + w.length, m: [w, STATE_NAME[w.toUpperCase()].toLowerCase()] });
      else if (w === 'do' || w === 'md' || w === 'phd') {
        const verb = /^(?:origin|accredited|program|programs|heritage|you|we|they|i|not|n't|the|a|an|this|that|these|those|is|are|does|it|so|what|how|why|when|where|who)$/.test(next) || /^(?:how|what|why|where|when|to|i|we|you|they|can|could|would|should|will|do|does|did|not|n't|also|than|then)$/.test(prev);
        if (w === 'phd' || (askCaps(q, w, nth(w)) && !verb)) ents.push({ L: { t: 'deg', v: w === 'do' ? 2 : (w === 'md' ? 1 : 4), label: w === 'do' ? 'DO' : (w === 'md' ? 'MD (incl. MBBS/MBChB)' : 'PhD or other research doctorate'), short: w === 'do' ? 'DOs' : (w === 'md' ? 'MDs' : 'PhDs'), pred: w === 'do' ? 'are DOs' : (w === 'md' ? 'are MDs' : 'hold a PhD or other research doctorate') }, pri: 800, pos, end: pos + w.length, m: [w] });
      }
      pos += w.length + 1;
    });
    const qre = /"([^"]+)"/g; let m4; while ((m4 = qre.exec(s))) ents.push({ L: { t: 'quoted' }, pri: -1, pos: m4.index, end: m4.index + m4[0].length, m: m4 });
    // resolve overlaps: longest span first, then the earlier vocabulary entry
    ents.sort((a, b) => (b.end - b.pos) - (a.end - a.pos) || a.pri - b.pri || a.pos - b.pos);
    const used = new Array(s.length).fill(false), keep = [];
    ents.forEach((e) => { for (let k = e.pos; k < e.end; k++) if (used[k]) return; for (let k = e.pos; k < e.end; k++) used[k] = true; keep.push(e); });
    const out = keep.map((e) => ({ t: e.L.t, pos: e.pos, text: s.slice(e.pos, e.end).trim(), L: e.L, m: e.m }));
    // leftover words become candidate program names; connector words split them
    let cur = [], curPos = -1, word = '', wpos = -1;
    const flushWord = () => { if (word) { if (ASK_SPLIT.has(word)) flushPhrase(); else { if (curPos < 0) curPos = wpos; cur.push(word); } } word = ''; wpos = -1; };
    const flushPhrase = () => { if (cur.length) { const toks = cur.filter((w) => !ASK_STOP.has(w) && w !== '-' && w !== '/'); if (toks.length && !(toks.length === 1 && /^\d+$/.test(toks[0]) && toks[0].length !== 10)) { const joined = toks.join(' '); if (US_STATES[joined]) out.push({ t: 'state', pos: curPos, text: joined, m: [joined, joined] }); else out.push({ t: 'phrase', pos: curPos, text: joined, raw: cur.join(' ') }); } } cur = []; curPos = -1; };
    for (let k = 0; k < s.length; k++) {
      if (used[k]) { flushWord(); flushPhrase(); continue; }
      if (s[k] === ' ') flushWord(); else { if (wpos < 0) wpos = k; word += s[k]; }
    }
    flushWord(); flushPhrase();
    out.sort((a, b) => a.pos - b.pos);
    return { s, ents: out };
  }
  // ---- entities become filters
  function askEntity(e) {
    const L = e.L || {}, t = e.t, base = { t, label: L.label, short: L.short || L.label, pred: L.pred, pos: e.pos, text: e.text };
    if (t === 'rank') return Object.assign(base, { test: (f) => L.v.indexOf(f.rank) >= 0, params: { rank: L.v.join('.') }, key: 'rank:' + L.v.join('.'), lvl: 'p', v: L.v, pred: L.pred || 'are ' + lcFirst(L.short || L.label) });
    if (t === 'role') {
      const pred = L.pred || 'are ' + lcFirst(L.short || L.label);
      if (L.test) return Object.assign(base, { test: L.test, params: null, key: 'role:' + L.v, lvl: 'p', v: L.v, pred });
      const m = L.v.reduce((a, id) => a | (1 << ROLE_GROUPS.findIndex((g) => g.id === id)), 0);
      return Object.assign(base, { test: (f) => !!(f.roleMask & m), params: { role: L.v.join('.') }, key: 'role:' + L.v.join('.'), lvl: 'p', v: L.v, pred });
    }
    if (t === 'title') {
      const want = e.text.replace(/\bprofs?\b/, 'professor').replace(/\bprofessors\b/, 'professor'), toks = want.split(' ').filter(Boolean);
      const ks = TITLES.map((_, k) => k).filter((k) => toks.every((w) => TITLE_HAY[k].indexOf(' ' + w) >= 0));
      if (!ks.length) return { t: 'bad', label: 'No described title matches “' + want + '”' };
      const set = new Set(ks.map((k) => TITLES[k]));
      return Object.assign(base, { label: 'Described title contains “' + want + '” (' + ks.length + (ks.length === 1 ? ' title)' : ' titles)'), short: '“' + want + '” titles', test: (f) => set.has(f.tl), params: { ti: ks.map((k) => TITLES[k]).join('|') }, key: 'title:' + want, lvl: 'p', pred: 'carry a described title containing “' + want + '”' });
    }
    if (t === 'deg') {
      if (L.test) return Object.assign(base, { test: L.test, params: null, key: 'deg:' + L.v, lvl: 'p' });
      const b = L.v; return Object.assign(base, { test: (f) => !!(f.degF & b), params: { deg: (b === 3 ? '1.2' : String(b)) }, key: 'deg:' + b, lvl: 'p' });
    }
    if (t === 'mk') {
      const v = L.v, tests = { aau: (f) => !!f.aau, viz: (f) => f.viz === 1, br: (f) => f.brr != null, none: (f) => !f.aau && f.viz !== 1 && f.brr == null, noaau: (f) => !f.aau, noviz: (f) => f.viz !== 1 };
      const params = { aau: { aau: '1' }, viz: { viz: '1' }, br: { br: '1' }, none: { aau: '0', viz: '0', br: '0' }, noaau: { aau: '0' }, noviz: { viz: '0' } };
      const at = { aau: 'AAU member institutions', viz: 'Vizient academic medical centers', br: 'Blue Ridge (NIH-ranked) medical schools', none: 'institutions with no research marker', noaau: 'institutions that are not AAU members', noviz: 'institutions outside the Vizient cohort' }[v];
      return Object.assign(base, { test: tests[v], params: params[v], key: 'mk:' + v, lvl: 'p', at, proper: true });
    }
    if (t === 'pmk') { const v = L.v, tests = { aau: (p) => !!p.aau, viz: (p) => !!p.viz, br: (p) => !!p.br }; return Object.assign(base, { ptest: tests[v], params: { [v]: '1' }, key: 'pmk:' + v, lvl: 'g', proper: true }); }
    if (t === 'ftype') return Object.assign(base, { test: (f) => f.ftype === L.v, params: null, key: 'ftype:' + L.v, lvl: 'p', pred: 'are ' + lcFirst(L.short) });
    if (t === 'h') {
      const op = L.op; let lo = null, hi = null, label;
      if (op === 'between') { lo = Number(e.m[1]); hi = Number(e.m[2]); if (lo > hi) { const x = lo; lo = hi; hi = x; } label = 'h-index ' + lo + '–' + hi; }
      else { const n = L.n != null ? L.n : Number(e.m[1] != null ? e.m[1] : e.m[2]); lo = op === '>=' ? n : op === '>' ? n + 1 : op === '=' ? n : null; hi = op === '<=' ? n : op === '<' ? n - 1 : op === '=' ? n : null; label = op === '=' ? (n === 0 ? 'h-index of 0 (no matched profile, or h ≤ 1 under the study rule)' : 'h-index of exactly ' + n) : 'h-index ' + { '>=': '≥ ', '>': '> ', '<=': '≤ ', '<': '< ' }[op] + n; }
      return Object.assign(base, { label, short: label.replace(/ \(.*\)$/, ''), lo, hi, params: Object.assign({}, lo != null ? { hmin: String(lo) } : {}, hi != null ? { hmax: String(hi) } : {}), key: 'h:' + op + lo + '-' + hi, lvl: 'p', h: true, pred: 'have an ' + label.replace(/ \(.*\)$/, '') });
    }
    if (t === 'hp') return Object.assign(base, { label: 'Faculty with a matched profile (observed h-index)', short: 'matched profile', hp: 'obs', params: { hp: 'obs' }, key: 'hp:obs', lvl: 'p', h: true, pred: 'have a matched profile' });
    if (t === 'type') return Object.assign(base, { ptest: (p) => L.v.indexOf(p.typeIdx) >= 0, params: { type: L.v.join('.') }, key: 'type:' + L.v.join('.'), lvl: 'g', v: L.v });
    if (t === 'len') return Object.assign(base, { ptest: (p) => p.length === L.v, params: { len: String(L.v) }, key: 'len:' + L.v, lvl: 'g', v: L.v });
    if (t === 'do') return Object.assign(base, { ptest: (p) => !!p.doOrigin === !!L.v, params: { do: String(L.v) }, key: 'do:' + L.v, lvl: 'g' });
    if (t === 'era') return Object.assign(base, { ptest: (p) => L.v.indexOf(p.eraIdx) >= 0, params: { era: L.v.join('.') }, key: 'era:' + L.v.join('.'), lvl: 'g', v: L.v });
    if (t === 'acc') {
      const how = e.m[1], y = Number(e.m[2]);
      const tests = { since: (p) => p.accSort >= y, from: (p) => p.accSort >= y, after: (p) => p.accSort > y, before: (p) => p.accSort < y, until: (p) => p.accSort <= y, through: (p) => p.accSort <= y, by: (p) => p.accSort <= y, in: (p) => p.accYear === y, during: (p) => p.accYear === y };
      const words = { since: y + ' or later', from: y + ' or later', after: 'after ' + y, before: 'before ' + y, until: 'through ' + y, through: 'through ' + y, by: 'by ' + y, in: 'in ' + y, during: 'in ' + y };
      return Object.assign(base, { label: 'Programs accredited ' + words[how] + (y <= 2001 && how !== 'in' && how !== 'during' ? ' (legacy programs count as accredited on or before 2000)' : ''), short: 'programs accredited ' + words[how], ptest: tests[how], params: null, key: 'acc:' + how + y, lvl: 'g' });
    }
    if (t === 'chairN') return Object.assign(base, { ptest: (p) => p.chairKey === 'N', params: { chair: 'N' }, key: 'chairN', lvl: 'g' });
    if (t === 'chairK') return Object.assign(base, { ptest: (p) => p.chairKey === L.v, params: null, key: 'chairK:' + L.v, lvl: 'g' });
    if (t === 'own') { const k = OWN.indexOf(L.v); return Object.assign(base, { ptest: (p) => p.ownType === L.v, params: k >= 0 ? { own: String(k) } : null, key: 'own:' + L.v, lvl: 'g' }); }
    if (t === 'staff') return Object.assign(base, { proper: !!L.proper, ptest: (p) => (p.staffing || '').indexOf(L.v) >= 0, params: null, key: 'staff:' + L.v, lvl: 'g' });
    if (t === 'staffCat') { const k = STAFF.indexOf(L.v); return Object.assign(base, { ptest: (p) => p.staffCat === L.v, params: k >= 0 ? { staff: String(k) } : null, key: 'staffCat:' + L.v, lvl: 'g' }); }
    if (t === 'state') { const code = US_STATES[e.m[1]]; if (!code) return null; return Object.assign(base, { label: 'Programs in ' + STATE_NAME[code], short: STATE_NAME[code], proper: true, ptest: (p) => p.state === code, params: { st: code }, key: 'state:' + code, lvl: 'g' }); }
    return null;
  }
  function askPlan(q) {
    const parsed = askParse(q), E = parsed.ents;
    const plan = { q, intents: new Set(), metrics: [], keys: [], by: null, top: null, filters: [], cuts: [], ands: [], isects: [], progNouns: 0, pnouns: 0, notes: [], bad: [], ambiguous: [], ents: E };
    E.forEach((e) => {
      if (e.t === 'intent') plan.intents.add(e.L.v);
      else if (e.t === 'metric') { if (plan.metrics.indexOf(e.L.v) < 0) plan.metrics.push(e.L.v); if (e.L.key && plan.keys.indexOf(e.L.key) < 0) plan.keys.push(e.L.key); }
      else if (e.t === 'by') plan.by = e.m[1];
      else if (e.t === 'top') plan.top = { dir: e.L.v, n: e.m[1] ? Math.max(1, Math.min(200, Number(e.m[1]))) : 10 };
      else if (e.t === 'vs') plan.cuts.push(e.pos);
      else if (e.t === 'and') plan.ands.push(e.pos);
      else if (e.t === 'isect') plan.isects.push(e.pos);
      else if (e.t === 'phrase' || e.t === 'quoted') {
        const r = askPrograms(e.t === 'quoted' ? '"' + e.m[1] + '"' : (e.raw || e.text));
        if (!r) return;
        if (r.none) { plan.bad.push(e.raw || r.none); return; }
        if (r.ambiguous) { plan.ambiguous.push({ phrase: e.raw || r.phrase, progs: r.ambiguous }); return; }
        const ids = r.progs, set = new Set(ids);
        const ph = (e.raw || r.phrase || '').trim(), phTxt = ph.length <= 5 && ph.indexOf(' ') < 0 ? ph.toUpperCase() : ph;
        const label = ids.length === 1 ? P[ids[0]].name : (r.system ? r.system + ' programs (' + ids.length + ')' : 'the ' + ids.length + ' programs matching “' + phTxt + '”');
        plan.filters.push({ t: 'prog', pos: e.pos, text: e.text, label, short: label, ptest: (p) => set.has(p.i), params: { pg: ids.map((i) => P[i].id).join('.') }, key: 'prog:' + ids.join('.'), lvl: 'g', ids, how: r.how, proper: true });
      } else if (e.t === 'rest') plan.filters.push({ t: 'rest', pos: e.pos, text: e.text, label: 'All other faculty records', short: 'All other faculty', key: 'rest', lvl: 'p', params: null, test: () => true });
      else {
        const f = askEntity(e);
        if (!f) return;
        if (f.t === 'bad') { plan.notes.push(f.label); return; }
        plan.filters.push(f);
      }
    });
    plan.progNouns = (parsed.s.match(/\bprograms?\b|\bresidenc(?:y|ies)\b/g) || []).length;
    plan.pnouns = (parsed.s.match(/\b(?:faculty|people|persons?|members?|individuals?|names?|folks|staff|physicians?|doctors?|chairs?|directors?|professors?|instructors?)\b/g) || []).length;
    if (!plan.metrics.length && plan.keys.length) plan.metrics.push('h');
    if (!plan.keys.length) plan.keys.push('sc');
    return plan;
  }
  // ---- cohorts: split at comparison words (and at "and"/"to" between two different kinds of group), then by repeated classes
  const CLS = (f) => f.t;
  function askCohorts(plan) {
    const F0 = plan.filters.slice().sort((a, b) => a.pos - b.pos);
    if (!F0.length) return [{ label: 'All faculty records', short: 'All faculty records', filters: [] }];
    const cuts = plan.cuts.slice();
    for (let k = 1; k < F0.length; k++) {
      const a = F0[k - 1], b = F0[k], between = (arr) => arr.some((p) => p > a.pos && p < b.pos);
      if (CLS(a) !== CLS(b) && between(plan.ands) && !between(plan.isects) && !between(plan.cuts) && !(a.h || b.h)) cuts.push((a.pos + b.pos) / 2);
    }
    cuts.sort((x, y) => x - y);
    const segs = []; let k = 0;
    cuts.concat([Infinity]).forEach((c) => { const seg = []; while (k < F0.length && F0[k].pos < c) seg.push(F0[k++]); if (seg.length) segs.push(seg); });
    if (segs.length > 1) {
      // a filter present on one side only, of a kind absent from the other sides, applies to all sides ("chairs vs assistant professors at academic programs")
      const lvlOf = (f) => (f.h ? 'h' : f.lvl);
      const orig = segs.map((seg) => seg.slice());
      orig.forEach((seg, si) => seg.forEach((f) => {
        const lv = lvlOf(f);
        const elsewhere = orig.some((o, oi) => oi !== si && o.some((g) => lvlOf(g) === lv));
        const alone = seg.length > 1;
        if (!elsewhere && (alone || lv === 'h')) segs.forEach((o, oi) => { if (oi !== si && !o.some((g) => g.key === f.key)) o.push(Object.assign({}, f, { shared: true })); });
      }));
    }
    let cohorts = [];
    segs.forEach((seg) => {
      const byT = new Map(); seg.forEach((f) => { const c = CLS(f); if (!byT.has(c)) byT.set(c, []); if (!byT.get(c).some((g) => g.key === f.key)) byT.get(c).push(f); });
      const multi = Array.from(byT.values()).filter((a) => a.length > 1), single = Array.from(byT.values()).filter((a) => a.length === 1).map((a) => a[0]);
      let combos = [[]];
      multi.slice(0, 2).forEach((vals) => { const next = []; combos.forEach((c) => vals.forEach((v) => next.push(c.concat([v])))); combos = next; });
      multi.slice(2).forEach((vals) => single.push(vals[0]));
      combos.forEach((c) => cohorts.push({ filters: c.concat(single).sort((a, b) => a.pos - b.pos) }));
    });
    const seen = new Set(); cohorts = cohorts.filter((c) => { const kk = c.filters.map((f) => f.key).sort().join('|'); if (seen.has(kk)) return false; seen.add(kk); return true; });
    if (cohorts.length > ASK_MAXC) cohorts = cohorts.slice(0, ASK_MAXC);
    cohorts.forEach(askLabel);
    // "X versus everyone else": the complement of the other cohorts
    cohorts.forEach((c) => { if (c.filters.some((f) => f.t === 'rest')) { c.rest = true; c.others = cohorts.filter((o) => o !== c && !o.filters.some((f) => f.t === 'rest')); c.filters = c.filters.filter((f) => f.t !== 'rest'); askLabel(c); c.label = c.filters.length ? 'All other ' + lcFirst(c.label) : 'All other faculty records'; c.short = c.filters.length ? 'Other ' + lcFirst(c.short) : 'All other faculty'; } });
    return cohorts;
  }
  function askLabel(c) {
    const pl = c.filters.filter((f) => f.lvl === 'p' && !f.h && !f.at), at = c.filters.filter((f) => f.at), gl = c.filters.filter((f) => f.lvl === 'g' && f.t !== 'state'), st = c.filters.filter((f) => f.t === 'state'), hl = c.filters.filter((f) => f.h);
    const pTxt = pl.map((f, k) => (k ? lcFirst(f.short) : f.short)).join(' who are '), gTxt = gl.map((f) => (f.proper ? f.short : lcFirst(f.short))).concat(at.map((f) => f.at)).join(', ');
    c.label = (pTxt || (gTxt || st.length ? 'Faculty' : 'All faculty records')) + (gTxt ? ' at ' + gTxt : '') + (st.length ? ' in ' + st.map((f) => f.short).join(' or ') : '') + (hl.length ? ' with ' + hl.map((f) => f.short).join(' and ') : '');
    c.short = c.filters.length ? cap(c.filters.map((f) => f.short).join(' · ')) : 'All faculty records';
    c.rows = c.rows || {};
    return c;
  }
  function askProgSet(filters) { const gl = filters.filter((f) => f.lvl === 'g'); if (!gl.length) return null; const set = new Set(); P.forEach((p) => { if (gl.every((f) => f.ptest(p))) set.add(p.i); }); return set; }
  function askRows(c, key) {
    key = key || 'sc'; if (c.rows && c.rows[key]) return c.rows[key];
    if (c.rest) { const ex = new Set(); (c.others || []).forEach((o) => askRows(o, key).forEach((f) => ex.add(f.i))); const inner = Object.assign({}, c, { rest: false, rows: {} }); const rows = askRows(inner, key).filter((f) => !ex.has(f.i)); if (c.rows) c.rows[key] = rows; return rows; }
    const pset = askProgSet(c.filters), pl = c.filters.filter((f) => f.lvl === 'p' && !f.h), hl = c.filters.filter((f) => f.h);
    const rows = F.filter((f) => {
      if (pset && !f.progs.some((pi) => pset.has(pi))) return false;
      for (let k = 0; k < pl.length; k++) if (!pl[k].test(f)) return false;
      for (let k = 0; k < hl.length; k++) { const h = hl[k], v = key === 'gs' ? f.gs : f.sc, b = key === 'gs' ? f.gsb : f.scb; if (h.hp === 'obs' && b !== 0) return false; if (h.lo != null && v < h.lo) return false; if (h.hi != null && v > h.hi) return false; }
      return true;
    });
    if (c.rows) c.rows[key] = rows;
    return rows;
  }
  const LISTP = new Set(['pg', 'rank', 'type', 'era', 'len', 'role', 'deg', 'own', 'staff']);
  function askLink(c, view, extra) { // an explorer link that reproduces a cohort, or '' when a filter has no explorer equivalent
    const u = new URLSearchParams();
    for (let k = 0; k < c.filters.length; k++) { const f = c.filters[k]; if (!f.params) return ''; Object.keys(f.params).forEach((p) => { if (u.has(p) && u.get(p) !== f.params[p]) { if (LISTP.has(p)) u.set(p, u.get(p) + '.' + f.params[p]); } else u.set(p, f.params[p]); }); }
    Object.keys(extra || {}).forEach((k) => u.set(k, extra[k]));
    const qs = u.toString(); return '#/' + view + (qs ? '?' + qs : '');
  }
  // ---- breakdown groups
  const ASK_DIMS = { rank: 'rank', ranks: 'rank', title: 'title', titles: 'title', role: 'role', roles: 'role', program: 'program', programs: 'program', type: 'type', types: 'type', length: 'length', lengths: 'length', stratum: 'stratum', strata: 'stratum', marker: 'stratum', markers: 'stratum', phenotype: 'stratum', era: 'era', eras: 'era', origin: 'origin', state: 'state', states: 'state', degree: 'degree', degrees: 'degree', 'chair type': 'chairtype', 'chair types': 'chairtype', ownership: 'own', owner: 'own', staffing: 'staff', institution: 'inst', institutions: 'inst', university: 'inst', universities: 'inst', band: 'band', bands: 'band' };
  const ASK_DIM_LABEL = { rank: 'normalized rank title', title: 'department/program described title', role: 'leadership role', program: 'program', type: 'program type', length: 'program length', stratum: 'research stratum', era: 'accreditation era', origin: 'program origin', state: 'state', degree: 'degree', chairtype: 'chair type of the program', own: 'hospital ownership', staff: 'ED staffing', inst: 'institution', band: 'h-index band' };
  const FIRSTP = (f) => P[f.progs[0]];
  function askGroups(dim, rows) {
    if (dim === 'rank') return RANKS.map((r, k) => ({ label: r, test: (f) => f.rank === k }));
    if (dim === 'role') return ROLE_DEFAULT.map((id) => { const k = ROLE_GROUPS.findIndex((g) => g.id === id); return { label: ROLE_GROUPS[k].label, fig: ROLE_GROUPS[k].fig, test: (f) => !!(f.roleMask & (1 << k)) }; });
    if (dim === 'type') return TYPES.map((t, k) => ({ label: TYPE_SHORT[k], csv: t, test: (f) => FIRSTP(f).typeIdx === k }));
    if (dim === 'length') return [3, 4].map((k) => ({ label: k + '-year programs', test: (f) => FIRSTP(f).length === k }));
    if (dim === 'stratum') { const st = (f) => (f.brr != null ? 0 : (f.aau || f.viz === 1 ? 1 : 2)); return STRATA.map((l, k) => ({ label: l, test: (f) => st(f) === k })); }
    if (dim === 'era') return ERAS.map((t, k) => ({ label: t, test: (f) => FIRSTP(f).eraIdx === k }));
    if (dim === 'origin') { const dO = (f) => f.progs.some((pi) => P[pi].doOrigin); return [{ label: 'DO-origin program', test: (f) => dO(f) }, { label: 'Allopathic-origin program', test: (f) => !dO(f) }]; }
    if (dim === 'degree') return DEGS.map(([b, l]) => ({ label: l, test: (f) => !!(f.degF & b) }));
    if (dim === 'chairtype') return [['A', 'Program led by an academic chair'], ['H', 'Program led by a hospital chair'], ['N', 'Program with no chair identified']].map(([k, l]) => ({ label: l, test: (f) => FIRSTP(f).chairKey === k }));
    if (dim === 'own') return OWN.map((t, k) => ({ label: t, test: (f) => FIRSTP(f).ownIdx === k }));
    if (dim === 'staff') return STAFF.map((t, k) => ({ label: t, test: (f) => FIRSTP(f).staffIdx === k }));
    if (dim === 'band') return HB.map(([lo, hi, l]) => ({ label: l, test: (f) => f.sc >= lo && f.sc <= hi }));
    if (dim === 'title') {
      const tv = (f) => f.tl || 'No Rank', n = new Map(); rows.forEach((f) => n.set(tv(f), (n.get(tv(f)) || 0) + 1));
      const ts = Array.from(n.keys()).sort((a, b) => n.get(b) - n.get(a) || collator.compare(a, b)).slice(0, MAXT);
      const out = ts.map((t) => ({ label: t === 'No Rank' ? 'No rank published' : t, test: (f) => tv(f) === t })); out.capped = n.size > MAXT ? n.size : 0; return out;
    }
    if (dim === 'state' || dim === 'program' || dim === 'inst') {
      const keyOf = dim === 'state' ? (f) => FIRSTP(f).state : dim === 'inst' ? (f) => f.inst || '(not recorded)' : (f) => FIRSTP(f).name;
      const n = new Map(); rows.forEach((f) => { const k = keyOf(f); n.set(k, (n.get(k) || 0) + 1); });
      const ks = Array.from(n.keys()).sort((a, b) => n.get(b) - n.get(a) || collator.compare(a, b)).slice(0, ASK_MAXG);
      const out = ks.map((k) => ({ label: dim === 'state' ? (STATE_NAME[k] || k) : k, test: (f) => keyOf(f) === k })); out.capped = n.size > ASK_MAXG ? n.size : 0; return out;
    }
    return [];
  }
  // ---- answer blocks
  const f1 = (v) => (v == null ? '—' : fix1(v));
  const nUnit = (n, one, many) => fmt(n) + ' ' + (n === 1 ? one : many);
  const srcName = (key) => (key === 'gs' ? 'Google Scholar' : 'Scopus');
  const share10 = (rows, key) => pct(rows.filter((f) => f[key] >= 10).length, rows.length, 0);
  function hSentence(label, rows, st, key) {
    if (!st) return label + ': no faculty records';
    return label + ' (n = ' + fmt(st.n) + '): median ' + srcName(key) + ' h-index ' + fmtQ(st.med) + ' (IQR ' + fmtQ(st.q1) + '–' + fmtQ(st.q3) + '), mean ' + f1(st.mean) + ' (SD ' + f1(st.sd) + '); ' + pct(Math.round(st.zero * st.n), st.n, 0) + ' have h = 0 and ' + share10(rows, key) + ' have h ≥ 10';
  }
  function askHBlock(cohorts, key, groups, opts) {
    const num = (a, b) => a - b, single = cohorts.length === 1, G = [];
    const add = (label, fig, csv, rows, all) => G.push({ label, fig, csv, rows, all: !!all, n: rows.length, st: hStats(rows.map((f) => f[key]).sort(num)) });
    if (single && groups) { const rows = askRows(cohorts[0], key); add(cohorts[0].label, cohorts[0].short, cohorts[0].label, rows, true); groups.forEach((g) => add(g.label, g.fig || g.label, g.csv || g.label, rows.filter(g.test))); }
    else if (groups) cohorts.forEach((c) => { const rows = askRows(c, key); groups.forEach((g) => { const r = rows.filter(g.test); if (r.length) add(c.short + ' · ' + g.label, c.short + ' · ' + (g.fig || g.label), c.label + ' · ' + (g.csv || g.label), r); }); });
    else cohorts.forEach((c) => add(c.label, c.short, c.label, askRows(c, key)));
    const shown = G.filter((g) => g.st);
    const title = srcName(key) + ' h-index' + (groups ? ' by ' + ASK_DIM_LABEL[opts.dim] : '') + (single ? (cohorts[0].filters.length && !groups ? ': ' + cohorts[0].short : (groups ? ': ' + cohorts[0].short : '')) : ': ' + cohorts.map((c) => c.short).join(' vs '));
    const sum = { groups: shown.slice(0, 16), key, idxName: srcName(key) + ' h-index', title: clip(title, 110), sub: clip('Ask the data: ' + opts.q, 150), n: single ? G[0].n : G.reduce((a, g) => a + g.n, 0), dim: opts.dim || 'ask' };
    const id = 'fig' + (++askSeq); ASK_FIGS.set(id, { render: (pal, W) => svgFigure(sum, pal, W), name: 'em-census-ask-' + (key === 'gs' ? 'scholar' : 'scopus') + '-h' });
    const trs = G.map((g) => '<tr' + (g.all ? ' class="all"' : '') + '><th scope="row">' + esc(g.label) + '</th><td class="num">' + fmt(g.n) + '</td><td class="num">' + (g.st ? f1(g.st.mean) : '—') + '</td><td class="num">' + (g.st ? fmtQ(g.st.med) : '—') + '</td><td class="num">' + (g.st ? fmtQ(g.st.q1) + '–' + fmtQ(g.st.q3) : '—') + '</td><td class="num">' + (g.st ? pct(Math.round(g.st.zero * g.st.n), g.st.n, 0) : '—') + '</td><td class="num">' + (g.st ? share10(g.rows, key) : '—') + '</td></tr>').join('');
    const table = '<div class="table-wrap ask-table"><table class="data sum-table"><caption class="sr-only">' + esc(title) + '</caption><thead><tr><th scope="col">Group</th><th scope="col" class="num">n</th><th scope="col" class="num">Mean h</th><th scope="col" class="num">Median h</th><th scope="col" class="num">IQR</th><th scope="col" class="num">h = 0</th><th scope="col" class="num">h ≥ 10</th></tr></thead><tbody>' + trs + '</tbody></table></div>';
    const tid = 'tbl' + (++askSeq);
    ASK_TABLES.set(tid, { name: 'em-census-ask-' + (key === 'gs' ? 'scholar' : 'scopus') + '-h', header: ['Group', 'n', 'Mean', 'SD', 'Median', 'Q1', 'Q3', '5th percentile', '95th percentile', 'h = 0 (%)', 'h >= 10 (%)'],
      rows: G.map((g) => (g.st ? [g.csv, g.n, fix1(g.st.mean), fix1(g.st.sd), fmtQ(g.st.med), fmtQ(g.st.q1), fmtQ(g.st.q3), fmtQ(g.st.p5), fmtQ(g.st.p95), (100 * g.st.zero).toFixed(1), (100 * g.rows.filter((f) => f[key] >= 10).length / g.n).toFixed(1)] : [g.csv, 0, '', '', '', '', '', '', '', '', ''])) });
    let text;
    if (!groups && G.length === 2 && G[0].st && G[1].st) {
      const a = G[0], b = G[1], d = a.st.med - b.st.med;
      text = hSentence(a.label, a.rows, a.st, key) + '. ' + hSentence(b.label, b.rows, b.st, key) + '. ' + (d === 0 ? 'The medians are the same.' : 'The median is ' + fmtQ(Math.abs(d)) + ' points ' + (d > 0 ? 'higher' : 'lower') + ' for ' + lcFirst(a.label) + '.');
    } else if (!groups && G.length === 1) text = (G[0].st ? hSentence(G[0].label, G[0].rows, G[0].st, key) : 'No faculty records match ' + lcFirst(G[0].label)) + '.';
    else if (shown.length) {
      let ordered = shown.filter((g) => !g.all).slice().sort((a, b) => b.st.med - a.st.med || b.st.mean - a.st.mean);
      if (ordered.filter((g) => g.n >= 20).length >= 2) ordered = ordered.filter((g) => g.n >= 20);
      text = (G[0].all && G[0].st ? hSentence(G[0].label, G[0].rows, G[0].st, key) + '. ' : '') + (ordered.length ? 'Highest median ' + srcName(key) + ' h: ' + ordered.slice(0, 3).map((g) => g.label + ' ' + fmtQ(g.st.med) + ' (n = ' + fmt(g.n) + ')').join('; ') + (ordered.length > 3 ? '; lowest: ' + ordered[ordered.length - 1].label + ' ' + fmtQ(ordered[ordered.length - 1].st.med) + ' (n = ' + fmt(ordered[ordered.length - 1].n) + ')' : '') + '.' : '');
    } else text = 'No faculty records match.';
    const note = (groups && opts.dim === 'role' ? 'Leadership groups can overlap: a faculty member with two titles counts in both. ' : '') + (groups && ['type', 'era', 'length', 'state', 'chairtype', 'own', 'staff', 'program'].indexOf(opts.dim) >= 0 ? 'Faculty listed by more than one program are grouped by their first-listed program, as in the study. ' : '') + (groups && groups.capped ? 'Showing the ' + groups.length + ' largest of ' + fmt(groups.capped) + ' groups. ' : '') + (!single && cohorts.some((c) => c.filters.some((f) => f.t === 'prog')) ? 'Faculty listed by more than one of these programs count in each. ' : '') + 'IQR is the 25th to 75th percentile; whiskers span the 5th to 95th percentile. Faculty without a matched ' + srcName(key) + ' profile are counted as 0, as in the study.';
    return { text, fig: shown.length ? id : null, table, tid, note };
  }
  function askCatBlock(cohorts, cats, opts) {
    const key = opts.key || 'sc';
    const series = cohorts.slice(0, ASK_MAXC).map((c) => { const rows = c.gtest ? askRows(c.base, key).filter(c.gtest) : askRows(c, key); return { label: c.short, full: c.label, n: rows.length, counts: cats.map((g) => rows.filter(g.test).length) }; });
    const keepCat = cats.map((_, k) => series.some((s) => s.counts[k] > 0) || (opts.keepAll && k < 5));
    const single = cohorts.length === 1, title = opts.title + (single ? (cohorts[0].filters && cohorts[0].filters.length ? ': ' + cohorts[0].short : '') : ': ' + series.map((s) => s.label).join(' vs '));
    const spec = { title: clip(title, 110), sub: clip('Ask the data: ' + opts.q, 150), cats: cats.map((g) => g.label).filter((_, k) => keepCat[k]), series: series.map((s) => ({ label: s.label, n: s.n, counts: s.counts.filter((_, k) => keepCat[k]) })), note: opts.figNote || '' };
    const id = 'fig' + (++askSeq); ASK_FIGS.set(id, { render: (pal, W) => svgBars(spec, pal, W), name: 'em-census-ask-' + slug(opts.title) });
    const head = '<tr><th scope="col">' + esc(opts.catName) + '</th>' + series.map((s) => '<th scope="col" class="num">' + esc(s.label) + '<span class="sub">n = ' + fmt(s.n) + '</span></th>').join('') + '</tr>';
    const body = cats.map((g, k) => '<tr><th scope="row">' + esc(g.label) + '</th>' + series.map((s) => '<td class="num">' + fmt(s.counts[k]) + ' <span class="pc">(' + pct(s.counts[k], s.n, 0) + ')</span></td>').join('') + '</tr>').join('');
    const table = '<div class="table-wrap ask-table"><table class="data sum-table cat-table"><caption class="sr-only">' + esc(title) + '</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    const tid = 'tbl' + (++askSeq);
    ASK_TABLES.set(tid, { name: 'em-census-ask-' + slug(opts.title), header: [opts.catName].concat(series.map((s) => s.full + ' (n)'), series.map((s) => s.full + ' (%)')), rows: cats.map((g, k) => [g.csv || g.label].concat(series.map((s) => s.counts[k]), series.map((s) => (s.n ? (100 * s.counts[k] / s.n).toFixed(1) : '')))) });
    const text = series.map((s) => { if (!s.n) return s.full + ': no faculty records.'; const order = cats.map((g, k) => k).sort((a, b) => s.counts[b] - s.counts[a]).filter((k) => s.counts[k] > 0).slice(0, opts.topN || 3); return s.full + ' (n = ' + fmt(s.n) + '): ' + order.map((k) => pct(s.counts[k], s.n, 0) + ' ' + (opts.lower ? lcFirst(cats[k].label) : cats[k].label)).join(', ') + (opts.extra ? opts.extra(s, cats) : '') + '.'; }).join(' ');
    return { text, fig: series.some((s) => s.n) ? id : null, table, tid, note: opts.foot || '' };
  }
  function svgBars(spec, pal, W) {
    // horizontal grouped bars: one row per category, one thin bar per series, value at the bar end, legend above for two or more series
    const compact = W < 640, L = compact ? 118 : 200, R = compact ? 62 : 84, nS = spec.series.length, barH = nS > 3 ? 9 : 12, gap = 2;
    const rowH = nS * (barH + gap) + 10, colors = spec.series.map((_, k) => CAT_PAL[k % CAT_PAL.length]);
    const maxPct = Math.max(1, ...spec.series.map((s) => Math.max(0, ...s.counts.map((c) => (s.n ? 100 * c / s.n : 0)))));
    const step = maxPct <= 25 ? 5 : maxPct <= 50 ? 10 : 20, xmax = Math.min(100, Math.ceil(maxPct / step) * step) || 5;
    const wrapT = (t, n, max) => { const out = []; let line = ''; String(t).split(' ').forEach((w) => { if ((line + ' ' + w).trim().length > n && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }); if (line) out.push(line); if (out.length > max) { out.length = max; out[max - 1] = clip(out[max - 1] + ' …', n); } return out; };
    const subLines = wrapT(spec.sub, compact ? 52 : 118, compact ? 3 : 2);
    const per = compact ? 6.4 : 6.8, legItems = spec.series.map((s, k) => ({ t: clip(s.label, compact ? 26 : 44) + ' (n = ' + fmt(s.n) + ')', c: colors[k] }));
    const legLines = []; let cur = [], curW = 0;
    legItems.forEach((it) => { const w = it.t.length * per + 26; if (curW + w > W - 32 && cur.length) { legLines.push(cur); cur = []; curW = 0; } cur.push(it); curW += w; });
    if (cur.length) legLines.push(cur);
    const top = 48 + subLines.length * 15 + (nS > 1 ? legLines.length * 18 + 8 : 0) + 10;
    const x0 = L + 8, x1 = W - R, x = (v) => x0 + (v / xmax) * (x1 - x0);
    const plotBottom = top + spec.cats.length * rowH, notes = wrapT((spec.note ? spec.note + ' ' : '') + 'EM Faculty Census Explorer, ' + META.asOf + '.' + (compact ? '' : ' tampaerdoc.github.io/em-faculty-census'), compact ? 50 : 118, 4);
    const H = plotBottom + 50 + notes.length * 15;
    const T = (x_, y_, txt, a) => '<text x="' + x_.toFixed(1) + '" y="' + y_.toFixed(1) + '"' + (a || '') + '>' + esc(txt) + '</text>';
    const o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(spec.title + '. ' + spec.series.map((s) => s.label + ': ' + spec.cats.map((c, k) => c + ' ' + pct(s.counts[k], s.n, 0)).join(', ')).join('; ')) + '" font-family="Helvetica, Arial, sans-serif">');
    o.push('<rect width="' + W + '" height="' + H + '" fill="' + pal.bg + '"/>');
    o.push(T(16, 28, clip(spec.title, compact ? 44 : 90), ' font-size="' + (compact ? 15 : 17) + '" font-weight="700" fill="' + pal.text + '"'));
    subLines.forEach((ln, k) => o.push(T(16, 48 + k * 15, ln, ' font-size="' + (compact ? 11.5 : 12.5) + '" fill="' + pal.muted + '"')));
    if (nS > 1) legLines.forEach((line, li) => { let lx = 16; const ly = 48 + subLines.length * 15 + 8 + li * 18; line.forEach((it) => { o.push('<rect x="' + lx + '" y="' + (ly - 9) + '" width="12" height="12" rx="2" fill="' + it.c + '"/>'); o.push(T(lx + 17, ly + 1, it.t, ' font-size="11.5" fill="' + pal.text + '"')); lx += it.t.length * per + 26; }); });
    for (let t = 0; t <= xmax + 1e-9; t += step) { o.push('<line x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + (top - 4) + '" y2="' + plotBottom + '" stroke="' + pal.grid + '" stroke-width="1"/>'); o.push(T(x(t), plotBottom + 16, t + '%', ' font-size="11" fill="' + pal.muted + '" text-anchor="middle"')); }
    o.push('<line x1="' + x0 + '" x2="' + x1 + '" y1="' + plotBottom + '" y2="' + plotBottom + '" stroke="' + pal.axis + '" stroke-width="1"/>');
    o.push(T((x0 + x1) / 2, plotBottom + 34, 'Share of faculty records', ' font-size="12" fill="' + pal.text + '" text-anchor="middle"'));
    spec.cats.forEach((cat, ci) => {
      const yTop = top + ci * rowH + 5, lines = twoLines(cat, compact ? 17 : 30), yc = yTop + (nS * (barH + gap)) / 2;
      lines.forEach((ln, j) => o.push(T(16, yc - (lines.length - 1) * 7 + j * 14 + 4, ln, ' font-size="' + (compact ? 12 : 13) + '" fill="' + pal.text + '"')));
      spec.series.forEach((s, si) => {
        const v = s.n ? 100 * s.counts[ci] / s.n : 0, y = yTop + si * (barH + gap), w = Math.max(v > 0 ? 2 : 0, x(v) - x0);
        o.push('<g><title>' + esc(s.label + ' · ' + cat + ': ' + fmt(s.counts[ci]) + ' of ' + fmt(s.n) + ' (' + pct(s.counts[ci], s.n, 1) + ')') + '</title>');
        o.push('<rect x="' + x0 + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + barH + '" rx="' + (w > 6 ? 3 : 1) + '" fill="' + colors[si] + '"/>');
        o.push(T(x0 + w + 5, y + barH - (barH > 10 ? 2 : 1), pct(s.counts[ci], s.n, 0) + (nS === 1 || !compact ? ' (' + fmt(s.counts[ci]) + ')' : ''), ' font-size="' + (barH > 10 ? 11 : 9.5) + '" fill="' + pal.text + '"'));
        o.push('</g>');
      });
      if (ci < spec.cats.length - 1) o.push('<line x1="16" x2="' + (W - 16) + '" y1="' + (top + (ci + 1) * rowH) + '" y2="' + (top + (ci + 1) * rowH) + '" stroke="' + pal.rule + '" stroke-width="1" stroke-dasharray="2 4"/>');
    });
    notes.forEach((ln, k) => o.push(T(16, plotBottom + 50 + k * 15, ln, ' font-size="11" fill="' + pal.muted + '"')));
    o.push('</svg>');
    return { svg: o.join(''), w: W, h: H };
  }
  function personTableHTML(rows, total) {
    return '<div class="table-wrap ask-table"><table class="data ask-people"><thead><tr><th scope="col">Name</th><th scope="col">Program</th><th scope="col">Normalized rank</th><th scope="col" class="col-opt">Role</th><th scope="col" class="num">Scopus h</th><th scope="col" class="num">Scholar h</th></tr></thead><tbody>' +
      rows.map((f) => { const pr = f.progs.map((k) => P[k]); return '<tr><td class="w-name"><a class="rowlink" href="#/person/' + encodeURIComponent(f.rid) + '">' + esc(f.name) + '</a>' + (f.cred ? '<span class="sub">' + esc(f.cred) + '</span>' : '') + '</td><td class="w-prog">' + (pr.length ? '<a class="plink" href="#/program/' + pr[0].id + '">' + esc(pr[0].name) + '</a>' + (pr.length > 1 ? '<span class="sub">+' + (pr.length - 1) + ' more</span>' : '') : '') + '</td><td class="w-rank">' + esc(RANKS[f.rank]) + titleSub(f) + '</td><td class="col-opt">' + esc(roleText(f)) + '</td><td class="num">' + hCell(f.sc, f.scb, 'sc') + '</td><td class="num">' + hCell(f.gs, f.gsb, 'gs') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (total > rows.length ? '<p class="note">Showing ' + fmt(rows.length) + ' of ' + fmt(total) + '; the CSV and the explorer link hold all of them.</p>' : '');
  }
  function programTableHTML(progs, total) {
    return '<div class="table-wrap ask-table"><table class="data"><thead><tr><th scope="col">Program</th><th scope="col" class="col-opt">Type</th><th scope="col" class="num">Length</th><th scope="col" class="col-opt">Dept. chair</th><th scope="col" class="num">Faculty</th><th scope="col" class="num">Median Scopus h</th></tr></thead><tbody>' +
      progs.map((p) => '<tr><td class="w-name"><a class="rowlink" href="#/program/' + p.id + '">' + esc(p.name) + '</a><span class="sub">' + esc(p.city) + ', ' + esc(p.state) + '</span></td><td class="col-opt">' + esc(TYPE_SHORT[p.typeIdx]) + '</td><td class="num">' + (p.length ? p.length + ' yr' : '—') + '</td><td class="col-opt">' + (p.chair == null ? '<span class="dash">None identified</span>' : esc(p.chairName) + '<span class="sub">' + esc(p.chairType) + '</span>') + '</td><td class="num">' + fmt(p.n) + '</td><td class="num">' + fmtQ(p.medSc) + '</td></tr>').join('') +
      '</tbody></table></div>' + (total > progs.length ? '<p class="note">Showing ' + fmt(progs.length) + ' of ' + fmt(total) + '; the CSV and the explorer link hold all of them.</p>' : '');
  }
  const openText = (cohorts, c) => (cohorts.length > 1 ? 'Open ' + clip(c.short, 40) : 'Open in explorer');
  function askAnswer(q) {
    const plan = askPlan(q), out = { q, read: [], measure: '', blocks: [], links: [], follow: [], notes: [] };
    const I = plan.intents, has_ = (x) => I.has(x);
    if (has_('help') && !plan.filters.length && !plan.metrics.length) return askHelp(out);
    if (plan.ambiguous.length) {
      const a = plan.ambiguous[0];
      out.blocks.push({ html: '<p class="ask-text">“' + esc(a.phrase) + '” could be any of these programs. Pick one and I will run the question again:</p><div class="ask-choices">' + a.progs.map((i) => '<button type="button" class="chip-btn" data-pick="' + esc(P[i].name) + '" data-phrase="' + esc(a.phrase) + '">' + esc(P[i].name) + '<span class="sub">' + esc(P[i].city) + ', ' + esc(P[i].state) + '</span></button>').join('') + '</div><p class="note">Tip: put a program name in quotes, or use its ACGME program ID, to name it exactly.</p>' });
      return out;
    }
    if (plan.bad.length && !plan.filters.length && !plan.metrics.length && !plan.top) {
      out.blocks.push({ html: '<p class="ask-text">I could not match “' + esc(plan.bad.join('”, “')) + '” to a program or to a term I know. I understand normalized ranks (assistant professors, no published rank), leadership roles (chairs, program directors, vice chairs), degrees, program types (academic, corporate, community, military), program length, AAU, Vizient and Blue Ridge, states, health systems, and program names or ACGME IDs.</p>' });
      out.follow = askExamples().slice(0, 4);
      return out;
    }
    if (!plan.filters.length && !plan.metrics.length && !plan.intents.size && !plan.top && !plan.by) return askHelp(out);
    const cohorts = askCohorts(plan), single = cohorts.length === 1;
    const keyList = plan.keys.slice(), metrics = plan.metrics.slice();
    const anyPerson = plan.filters.some((f) => f.lvl === 'p'), progLevelOnly = plan.filters.length > 0 && !anyPerson;
    const dim = plan.by ? ASK_DIMS[plan.by] || null : null;
    out.read = cohorts.map((c) => c.label);
    if (plan.bad.length) out.notes.push('Ignored “' + plan.bad.join('”, “') + '”: no program or term matched.');
    out.notes.push(...plan.notes);
    const link = (c, extra) => askLink(c, 'people', extra);
    // ---- programs as the unit
    const metricsOK = !metrics.length || (plan.top && metrics.every((m) => m === 'h'));
    const progUnit = !anyPerson && plan.progNouns > 0 && !plan.pnouns && metricsOK && (plan.filters.length || plan.top || has_('count') || has_('list'));
    const progIntent = progUnit && (has_('count') || has_('list') || has_('share') || plan.top || (!has_('about') && !has_('dist') && !has_('stats') && !has_('compare') && !plan.cuts.length));
    if (progIntent || (plan.filters.some((f) => f.t === 'chairN' || f.t === 'chairK') && !anyPerson && !metrics.length && !has_('about'))) {
      out.measure = plan.top ? 'Programs ranked by median ' + srcName(keyList[0]) + ' h-index' : 'Programs';
      cohorts.forEach((c) => {
        const set = askProgSet(c.filters), progs = set ? P.filter((p) => set.has(p.i)) : P.slice(), mkey = keyList[0] === 'gs' ? 'medGs' : 'medSc';
        const ranked = plan.top ? progs.filter((p) => p.n >= 10) : progs;
        const sorted = plan.top ? ranked.slice().sort((a, b) => (plan.top.dir === 'desc' ? nullLast(b[mkey], a[mkey], 1) : nullLast(a[mkey], b[mkey], 1)) || collator.compare(a.name, b.name)) : progs.slice().sort((a, b) => collator.compare(a.name, b.name));
        const shownP = plan.top ? sorted.slice(0, plan.top.n) : sorted.slice(0, ASK_LIST);
        const nfac = new Set(); progs.forEach((p) => p.fac.forEach((k) => nfac.add(k)));
        const what = c.filters.length ? lcFirst(c.label.replace(/^Faculty (?:at|in) /, '')) : 'all programs';
        let text = nUnit(progs.length, 'program matches', 'programs match') + ' (' + what + '): ' + pct(progs.length, P.length, 1) + ' of the ' + META.nPrograms + ' programs, with ' + fmt(nfac.size) + ' faculty records.';
        if (progs.length && !plan.top) { const types = TYPES.map((t, k) => progs.filter((p) => p.typeIdx === k).length); text += ' By type: ' + TYPE_SHORT.map((t, k) => (types[k] ? t + ' ' + types[k] : '')).filter(Boolean).join(', ') + '. Length: ' + progs.filter((p) => p.length === 3).length + ' three-year and ' + progs.filter((p) => p.length === 4).length + ' four-year.'; }
        if (plan.top && shownP.length) text += ' ' + (plan.top.dir === 'desc' ? 'Highest' : 'Lowest') + ' median ' + srcName(keyList[0]) + ' h among the ' + fmt(ranked.length) + ' with at least 10 faculty records: ' + shownP.slice(0, 3).map((p) => p.name + ' (' + fmtQ(p[mkey]) + ', n = ' + fmt(p.n) + ')').join('; ') + '.';
        const tid = 'tbl' + (++askSeq);
        ASK_TABLES.set(tid, { name: 'em-census-ask-programs', header: ['ACGME program ID', 'Program', 'City', 'State', 'Program type', 'Length (years)', 'Department chair', 'Chair type', 'Faculty records', 'Median Scopus h', 'Median Google Scholar h'], rows: sorted.map((p) => [p.id, p.name, p.city, p.state, TYPES[p.typeIdx], p.length, p.chairName || 'Not identified', p.chairType, p.n, fmtQ(p.medSc), fmtQ(p.medGs)]) });
        out.blocks.push({ text, html: has_('count') && !has_('list') && !plan.top ? '' : programTableHTML(shownP, progs.length), tid, links: [{ href: askLink(c, 'programs'), text: openText(cohorts, c) }] });
      });
      return out;
    }
    // ---- a lookup or list of people ("who is the chair at X", "list …", "top 10 …")
    const lookup = (has_('who') || has_('list') || (!metrics.length && plan.filters.some((f) => f.t === 'prog') && plan.filters.some((f) => f.t === 'role'))) && !metrics.length && !plan.top && !has_('count') && !has_('share') && !dim && !has_('dist') && !has_('stats');
    if (lookup || (plan.top && !metrics.some((m) => m !== 'h'))) {
      const key = keyList[0];
      out.measure = plan.top ? (plan.top.dir === 'desc' ? 'Highest ' : 'Lowest ') + srcName(key) + ' h-index' : 'People';
      cohorts.forEach((c) => {
        const dir = plan.top ? plan.top.dir : 'desc';
        const rows = askRows(c, key).slice().sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]) || collator.compare(a.sortName, b.sortName));
        const n = plan.top ? plan.top.n : ASK_LIST, shownR = rows.slice(0, n);
        let text;
        if (!rows.length) text = 'No faculty records match ' + lcFirst(c.label) + '.';
        else if (plan.top) text = (plan.top.dir === 'desc' ? 'Highest ' : 'Lowest ') + srcName(key) + ' h-index among ' + lcFirst(c.label) + ' (n = ' + fmt(rows.length) + '): ' + shownR.slice(0, 3).map((f) => f.name + ' (' + f[key] + '; ' + (f.progs.length ? P[f.progs[0]].name : '') + ')').join('; ') + (shownR.length > 3 ? '; and ' + (shownR.length - 3) + ' more below' : '') + '.';
        else text = nUnit(rows.length, 'faculty record matches', 'faculty records match') + ' ' + lcFirst(c.label) + (rows.length <= 3 ? ': ' + rows.map((f) => f.name + (f.chd === 1 && c.filters.some((x) => x.t === 'role') ? ' (' + (f.cht === 'A' ? 'academic chair' : 'hospital chair') + '; ' + lcFirst(f.chpos) + (f.chtitle ? '; listed as “' + f.chtitle + '”' : '') + ')' : '')).join('; ') : ', sorted by ' + srcName(key) + ' h-index') + '.';
        const tid = 'tbl' + (++askSeq);
        ASK_TABLES.set(tid, { name: 'em-census-ask-people', header: ['Record ID', 'Name', 'Credentials', 'Program(s)', 'Normalized rank', 'Described title', 'Roles', 'Scopus h', 'Google Scholar h', 'Chair designation'], rows: rows.map((f) => [f.rid, f.name, f.cred, f.progs.map((k) => P[k].name).join('; '), RANKS[f.rank], f.title, roleText(f), f.sc, f.gs, f.chd === 1 ? (f.cht === 'A' ? 'Academic chair' : 'Hospital chair') + ' · ' + f.chpos : '']) });
        let extraHtml = '';
        const pf = c.filters.find((x) => x.t === 'prog');
        if (pf && pf.ids.length === 1 && c.filters.some((x) => x.t === 'role' && Array.isArray(x.v) && x.v.indexOf('pca') >= 0)) { const p = P[pf.ids[0]]; if (p.chairNote) extraHtml += '<p class="note"><strong>Chair note:</strong> ' + noteHTML(p.chairNote) + '</p>'; if (p.chairSrc) extraHtml += '<p class="note">Chair source: ' + srcHTML(p.chairSrc) + (p.chairEv ? ' · evidence ' + esc(p.chairEv.toLowerCase()) : '') + '</p>'; if (p.chairSecondary) extraHtml += '<p class="note">Other chairs: ' + esc(p.chairSecondary) + '</p>'; }
        out.blocks.push({ text, html: rows.length ? personTableHTML(shownR, rows.length) + extraHtml : '', tid, links: [{ href: link(c, { sf: key, df: dir === 'desc' ? '-1' : '1' }), text: openText(cohorts, c) }] });
      });
      return out;
    }
    // ---- counts and shares
    if ((has_('count') || has_('share')) && !metrics.some((m) => m !== 'h') && !dim) {
      const key = keyList[0]; out.measure = 'Count of faculty records';
      const tblRows = [];
      cohorts.forEach((c) => {
        const rows = askRows(c, key), n = rows.length, pl = c.filters.filter((f) => f.lvl === 'p');
        let text = nUnit(n, 'faculty record matches', 'faculty records match') + ' ' + lcFirst(c.label) + ' (' + pct(n, F.length, 1) + ' of all ' + fmt(F.length) + ' records).', bn = F.length, baseLabel = 'all faculty records';
        if (pl.length && (pl.length >= 2 || c.filters.length > pl.length || has_('share'))) {
          const last = pl[pl.length - 1], base = askLabel({ filters: c.filters.filter((f) => f !== last) });
          bn = askRows(base, key).length; baseLabel = base.filters.length ? base.label : 'all faculty records';
          text = 'Of ' + fmt(bn) + ' ' + lcFirst(baseLabel).replace(/^all faculty records$/, 'faculty records') + ', ' + fmt(n) + ' (' + pct(n, bn, 1) + ') ' + (last.pred || 'are ' + lcFirst(last.short)) + '.';
        }
        if (n) { const np = new Set(); rows.forEach((f) => f.progs.forEach((p) => np.add(p))); text += ' They are listed at ' + nUnit(np.size, 'program', 'programs') + '; median ' + srcName(key) + ' h ' + fmtQ(quantile(rows.map((f) => f[key]).sort((a, b) => a - b), 0.5)) + '.'; }
        tblRows.push([c.label, n, bn, bn ? (100 * n / bn).toFixed(1) : '']);
        out.blocks.push({ text, links: [{ href: link(c), text: openText(cohorts, c) }] });
      });
      if (cohorts.length > 1) { const tid = 'tbl' + (++askSeq); ASK_TABLES.set(tid, { name: 'em-census-ask-counts', header: ['Group', 'n', 'Of', '%'], rows: tblRows }); out.blocks.push({ html: '<div class="table-wrap ask-table"><table class="data sum-table"><thead><tr><th scope="col">Group</th><th scope="col" class="num">n</th><th scope="col" class="num">of</th><th scope="col" class="num">%</th></tr></thead><tbody>' + tblRows.map((r) => '<tr><th scope="row">' + esc(r[0]) + '</th><td class="num">' + fmt(r[1]) + '</td><td class="num">' + fmt(r[2]) + '</td><td class="num">' + (r[3] === '' ? '—' : r[3] + '%') + '</td></tr>').join('') + '</tbody></table></div>', tid }); }
      return out;
    }
    // ---- measures: h-index and categorical distributions
    if (!metrics.length) { if (cohorts.some((c) => c.filters.some((f) => f.t === 'prog')) || has_('about')) metrics.push('rank', 'h'); else metrics.push('h'); }
    out.measure = metrics.map((m) => ({ h: keyList.map((k) => srcName(k) + ' h-index').join(' and '), rank: 'normalized rank distribution', role: 'leadership roles', deg: 'degrees', type: 'program type', chairtype: 'chair type' }[m])).join(' · ') + (dim ? ' by ' + ASK_DIM_LABEL[dim] : '');
    if (has_('about') && single && cohorts[0].filters.length === 1 && cohorts[0].filters[0].t === 'prog' && cohorts[0].filters[0].ids.length === 1) {
      const p = P[cohorts[0].filters[0].ids[0]], ch = p.chair == null ? null : F[p.chair];
      out.blocks.push({ text: p.name + ' (' + p.city + ', ' + p.state + '; ACGME ' + p.id + ') is a ' + (p.length ? p.length + '-year ' : '') + TYPES[p.typeIdx].replace(/ \(.*\)$/, '').toLowerCase().replace(/nih-ranked/, 'NIH-ranked').replace(/aau/, 'AAU') + ' program' + (p.pheno !== 'None' ? ' with the markers ' + p.pheno : ' with no research marker') + ', accredited ' + (p.accCensored ? 'on or before 2000' : (p.accYear || '—')) + (p.doOrigin ? ' (DO origin)' : '') + '. It lists ' + fmt(p.n) + ' faculty records; ' + pct(p.rankN[0], p.n, 0) + ' have no published rank; median Scopus h ' + fmtQ(p.medSc) + ' (IQR ' + fmtQ(p.q1Sc) + '–' + fmtQ(p.q3Sc) + '). ' + (ch ? 'Department chair: ' + ch.name + ' (' + lcFirst(p.chairType) + '; ' + lcFirst(p.chairPos) + ').' : 'No department chair identified.') + (p.pdNames.length ? ' Program director: ' + p.pdNames.join(', ') + '.' : ''), links: [{ href: '#/program/' + p.id, text: 'Open the program page' }] });
    }
    metrics.forEach((m) => {
      if (m === 'h') keyList.forEach((key) => {
        let gdefs = null, gdim = dim;
        if (dim) gdefs = askGroups(dim, single ? askRows(cohorts[0], key) : F);
        else if (single && (has_('dist') || has_('stats') || has_('compare') || cohorts[0].filters.length <= 1)) { gdim = cohorts[0].filters.some((f) => f.t === 'rank') ? 'type' : 'rank'; gdefs = askGroups(gdim, askRows(cohorts[0], key)); }
        const b = askHBlock(cohorts, key, gdefs, { dim: gdim, q });
        b.links = cohorts.map((c) => ({ href: link(c, Object.assign({ si: key, hs: key }, gdim && GROUP_DIMS.some((d) => d[0] === gdim) ? { g: gdim } : {})), text: openText(cohorts, c) }));
        out.blocks.push(b);
        if (has_('dist') && !dim) { const bb = askCatBlock(cohorts, askGroups('band', F), { title: 'Scopus h-index bands', catName: 'Scopus h-index', q, keepAll: true, lower: true, topN: 5, foot: 'Bands follow the study: 0, 1–4, 5–9, 10–19, and 20 or more. Faculty without a matched Scopus profile are counted as 0.' }); bb.textHide = true; out.blocks.push(bb); }
      });
      const catOpts = (title, catName, foot, extra) => ({ title, catName, q, lower: true, foot, extra });
      const cat = (cats, opts, g) => {
        if (dim && single) { const gd = askGroups(dim, askRows(cohorts[0], 'sc')); const sub = gd.map((gg) => ({ label: gg.label, short: gg.label, filters: cohorts[0].filters, base: cohorts[0], gtest: gg.test })); const b = askCatBlock(sub, cats, Object.assign({}, opts, { title: opts.title + ' by ' + ASK_DIM_LABEL[dim] })); b.links = [{ href: link(cohorts[0], g ? { g } : {}), text: 'Open in explorer' }]; return b; }
        const b = askCatBlock(cohorts, cats, opts); b.links = cohorts.map((c) => ({ href: link(c, g ? { g } : {}), text: openText(cohorts, c) })); return b;
      };
      if (m === 'rank') out.blocks.push(cat(askGroups('rank'), catOpts('Normalized rank title', 'Normalized rank title', 'Ranks are normalized as in the paper: clinical, adjunct and research modifiers set aside. No rank means none was published.', (s, cats) => (cats.map((g, k) => k).sort((a, b) => s.counts[b] - s.counts[a]).slice(0, 3).indexOf(0) >= 0 ? '' : '; ' + pct(s.counts[0], s.n, 0) + ' no rank')), 'rank'));
      if (m === 'role') out.blocks.push(cat(askGroups('role'), catOpts('Leadership roles', 'Role', 'Roles can overlap: a faculty member with two titles counts in both. Department chairs are the designated chair of each program.'), 'role'));
      if (m === 'deg') out.blocks.push(cat(askGroups('degree'), Object.assign(catOpts('Degrees', 'Degree', 'Degrees can overlap: an MD-PhD counts under MD and under PhD.'), { lower: false })));
      if (m === 'type') out.blocks.push(cat(askGroups('type'), Object.assign(catOpts('Program type', 'Program type of the first-listed program', 'Faculty listed by more than one program are grouped by their first-listed program, as in the study.'), { lower: false }), 'type'));
      if (m === 'chairtype') out.blocks.push(cat(askGroups('chairtype'), catOpts('Chair type of the program', 'Chair type', 'The designated chair of each faculty member’s first-listed program.')));
    });
    const progC = cohorts.filter((c) => c.filters.length === 1 && c.filters[0].t === 'prog');
    if (progC.length >= 2 && progC.length === cohorts.length && progC.length <= MAXG) out.links.push({ href: '#/programs?pg=' + progC.map((c) => c.filters[0].params.pg).join('.') + '&g=program', text: 'Compare these programs side by side in the explorer' });
    const fu = [], who = cohorts.map((c) => c.short).join(' versus ');
    if (metrics.indexOf('h') >= 0 && keyList.indexOf('gs') < 0) fu.push(q.replace(/\s*\((?:google )?scholar\)\s*$/i, '') + ' (Google Scholar)');
    if (metrics.indexOf('rank') < 0 && cohorts.length <= 6) fu.push('Rank distribution: ' + who);
    if (metrics.indexOf('h') < 0) fu.push('h-index: ' + who);
    if (!dim && single && !has_('about')) fu.push(q + ' by program type');
    if (metrics.indexOf('role') < 0 && cohorts.length <= 6 && cohorts.some((c) => c.filters.some((f) => f.t === 'prog'))) fu.push('Leadership roles: ' + who);
    out.follow = fu.slice(0, 3);
    return out;
  }
  function askHelp(out) {
    out.blocks.push({ html: '<p class="ask-text">Ask about the census in plain language. I recognize:</p><ul class="ask-list"><li><strong>Groups of faculty</strong>: normalized ranks (assistant professors, full professors, no published rank), leadership roles (chairs, academic or hospital chairs, program directors, vice chairs, clerkship or fellowship directors), degrees (MD, DO, PhD, physician-scientists), described titles (clinical assistant professors), and h-index thresholds (h ≥ 10, no Scopus profile).</li><li><strong>Groups of programs</strong>: program type (academic, corporate, community, military, NIH-ranked, AAU or Vizient, university-based), 3- or 4-year, DO origin, accreditation era or year, state, health systems (HCA), and any program by name, nickname, or ACGME ID.</li><li><strong>Measures</strong>: h-index (Scopus by default, or Google Scholar), rank distribution, roles, degrees, counts and shares, top lists, and “who is the chair of …”.</li><li><strong>Comparisons and breakdowns</strong>: “X versus Y”, “compare X to Y”, “by rank”, “by program type”, “by state”.</li></ul>' });
    out.follow = askExamples();
    return out;
  }
  function askExamples() {
    return ['Show me the h-index distribution of chairs versus assistant professors', 'Compare USF rank distribution and h-index to HCA Brandon', 'Median Scopus h-index by rank at academic vs corporate programs', 'How many program directors have an h-index of at least 10?', 'Rank distribution at 3-year vs 4-year programs', 'Who is the chair at Johns Hopkins?', 'Top 10 chairs by Google Scholar h-index', 'List 4-year programs in Florida', 'Share of faculty with no published rank at community vs university-based programs', 'Compare clinical assistant professors to assistant professors'];
  }
  // ---- UI
  function askHash() { return '#/ask' + (askLastQ ? '?q=' + encodeURIComponent(askLastQ) : ''); }
  function showAsk(open, qs) {
    askOpen = open;
    $('#toolbar').hidden = open; $('#layout').hidden = open; $('#ask').hidden = !open;
    document.body.classList.toggle('ask-open', open);
    document.querySelectorAll('a[href="#/ask"]').forEach((a) => { if (open) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!open) { if (document.title.indexOf('Ask the data') === 0) document.title = 'EM Faculty Census Explorer'; return; }
    if ($('#ask-q2')) $('#ask-q2').value = '';
    document.title = 'Ask the data · EM Faculty Census Explorer';
    const u = new URLSearchParams(qs || ''), q = (u.get('q') || '').trim();
    if (q && q !== askLastQ) askRun(q, true);
    else if (!askLog.length) $('#ask-q').focus({ preventScroll: true });
  }
  function askInit() {
    const ex = $('#ask-examples'); if (!ex) return;
    ex.innerHTML = '<span class="ask-try">Try:</span>' + askExamples().slice(0, 6).map((t) => '<button type="button" class="chip-btn" data-ask="' + esc(t) + '">' + esc(t) + '</button>').join('');
    $('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#ask-q').value.trim(); if (q) askRun(q); });
    $('#ask').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-ask]'); if (b) { askRun(b.dataset.ask); return; }
      const pk = e.target.closest('button[data-pick]'); if (pk) { const turn = pk.closest('.ask-turn'), q0 = turn ? turn.dataset.q : $('#ask-q').value; const re = new RegExp('"?' + pk.dataset.phrase.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Za-z0-9]+') + '"?', 'i'); const q1 = re.test(q0) ? q0.replace(re, '"' + pk.dataset.pick + '"') : q0 + ' "' + pk.dataset.pick + '"'; askRun(q1); return; }
      const fp = e.target.closest('button[data-fig-png]'); if (fp) { const f = ASK_FIGS.get(fp.dataset.figPng); if (f) askPNG(f); return; }
      const fs = e.target.closest('button[data-fig-svg]'); if (fs) { const f = ASK_FIGS.get(fs.dataset.figSvg); if (f) { const r = f.render(PAL.light, 860); saveBlob(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + r.svg], { type: 'image/svg+xml;charset=utf-8' }), f.name + '.svg'); toast('Figure saved (SVG)'); } return; }
      const cs = e.target.closest('button[data-csv]'); if (cs) { const t = ASK_TABLES.get(cs.dataset.csv); if (t) download(t.name, t.header, t.rows); return; }
      const cl = e.target.closest('button[data-ask-link]'); if (cl) { copy(location.href.split('#')[0] + '#/ask?q=' + encodeURIComponent(cl.dataset.askLink), 'Link to this question copied'); return; }
      if (e.target.closest('#ask-clear')) { askLog = []; askLastQ = ''; ASK_FIGS.clear(); ASK_TABLES.clear(); $('#ask-log').innerHTML = ''; $('#ask-log').hidden = true; $('#ask-examples').hidden = false; $('#ask-clear').hidden = true; history.replaceState(null, '', '#/ask'); $('#ask-q').value = ''; $('#ask-q').placeholder = 'Ask a question about the census…'; $('#ask-q').focus(); }
    });
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(askRedraw, 150); });
    if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener('change', askRedraw) : mq.addListener(askRedraw)); }
    window.EMCensusAsk = { parse: askParse, plan: askPlan, answer: askAnswer, programs: askPrograms, acronyms: askAcronyms, P: () => P }; // for tests and the browser console
  }
  function askPal() { const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light'; return dark ? PAL.dark : PAL.light; }
  function askDraw(fig) { const f = ASK_FIGS.get(fig.dataset.fig); if (f) { const w = Math.max(320, Math.min(860, Math.round(fig.clientWidth || 860))); fig.innerHTML = f.render(askPal(), w).svg; } }
  function askRedraw() { document.querySelectorAll('#ask-log figure[data-fig]').forEach(askDraw); }
  function askPNG(f) {
    const r = f.render(PAL.light, 860), scale = 3, img = new Image(), url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => { const c = document.createElement('canvas'); c.width = r.w * scale; c.height = r.h * scale; const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob((b) => { if (b) { saveBlob(b, f.name + '.png'); toast('Figure saved (PNG)'); } else toast('Could not create the PNG'); }, 'image/png'); };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not create the PNG'); };
    img.src = url;
  }
  function askRun(q, fromLink) {
    q = q.trim().slice(0, 400); if (!q) return;
    askLastQ = q; if (!fromLink) history.replaceState(null, '', askHash());
    let ans;
    try { ans = askAnswer(q); } catch (err) { ans = { q, read: [], blocks: [{ html: '<p class="ask-text">Something went wrong reading that question (' + esc(err.message) + '). Try rephrasing it, or start from one of the examples.</p>' }], follow: askExamples().slice(0, 3) }; if (window.console) console.error(err); }
    askLog.push(ans);
    const log = $('#ask-log'); log.hidden = false; $('#ask-examples').hidden = true; $('#ask-clear').hidden = false;
    const art = document.createElement('article'); art.className = 'ask-turn'; art.dataset.q = q; art.innerHTML = askTurnHTML(ans, askLog.length);
    log.appendChild(art);
    art.querySelectorAll('figure[data-fig]').forEach(askDraw);
    $('#ask-q').value = ''; $('#ask-q').placeholder = 'Ask a follow-up…';
    art.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const a = art.querySelector('.ask-a'); if (a) a.focus({ preventScroll: true });
  }
  function askTurnHTML(a, n) {
    const read = a.read && a.read.length ? '<p class="ask-read"><span class="k">Read as</span>' + (a.measure ? '<span class="chip chip-m">' + esc(a.measure) + '</span><span class="ask-of">of</span>' : '') + a.read.map((r) => '<span class="chip">' + esc(r) + '</span>').join('<span class="ask-vs">vs</span>') + '</p>' : '';
    const notes = a.notes && a.notes.length ? '<p class="ask-warn">' + a.notes.map(esc).join(' ') + '</p>' : '';
    const blocks = a.blocks.map((b) => {
      const acts = [];
      (b.links || []).forEach((l) => { if (l.href) acts.push('<a class="btn btn-sm" href="' + esc(l.href) + '">' + esc(l.text) + ' →</a>'); });
      if (b.fig) acts.push('<button type="button" class="btn btn-sm" data-fig-png="' + b.fig + '">Figure PNG</button><button type="button" class="btn btn-sm" data-fig-svg="' + b.fig + '">SVG</button>');
      if (b.tid) acts.push('<button type="button" class="btn btn-sm" data-csv="' + b.tid + '">Table CSV</button>');
      return '<div class="ask-block">' + (b.text && !b.textHide ? '<p class="ask-text">' + esc(b.text) + '</p>' : '') + (b.fig ? '<figure class="ask-fig" data-fig="' + b.fig + '"></figure>' : '') + (b.html || '') + (b.table || '') + (b.note ? '<p class="note">' + esc(b.note) + '</p>' : '') + (acts.length ? '<div class="ask-actions">' + acts.join('') + '</div>' : '') + '</div>';
    }).join('');
    const links = a.links && a.links.length ? '<div class="ask-actions ask-actions-all">' + a.links.map((l) => '<a class="btn btn-sm btn-primary" href="' + esc(l.href) + '">' + esc(l.text) + ' →</a>').join('') + '</div>' : '';
    const follow = a.follow && a.follow.length ? '<div class="ask-follow"><span class="ask-try">Next:</span>' + a.follow.map((t) => '<button type="button" class="chip-btn" data-ask="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>' : '';
    return '<div class="ask-q"><span class="ask-who">You</span><p>' + esc(a.q) + '</p></div><div class="ask-a" tabindex="-1" aria-label="Answer ' + n + '"><span class="ask-who">Census</span>' + read + notes + blocks + links + follow + '<div class="ask-meta"><button type="button" class="link-btn" data-ask-link="' + esc(a.q) + '">Copy link to this question</button></div></div>';
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

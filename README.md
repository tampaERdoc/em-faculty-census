# EM Faculty Census Explorer

A searchable web tool for a national census of emergency medicine faculty at all 304 ACGME-accredited EM residency programs: 12,934 faculty-program records, compiled in September 2026 (12,905 in the paper's analysis, frozen on September 24, plus 29 fellowship directors added on September 26 from the SAEM Fellowship Directory, marked on their records).

**Live site:** https://tampaerdoc.github.io/em-faculty-census/

## What you can do

- Search for a program or a person by name, institution, city, or state.
- Filter by normalized rank title (the rank analyzed in the paper), department chair (academic or hospital chairs listed by name, or programs with no chair identified), and leadership role (program director, vice chair, student clerkship director, and more); choosing a rank, chair, or role lists the matching people.
- Filter by the department/program described title, the title exactly as the department or program describes it before it is normalized to a rank (for example Clinical Assistant Professor, Assistant Clinical Professor, or Assistant Professor of Clinical Emergency Medicine). Type part of a title to find its variants, then tick them one by one or select all shown.
- Filter programs by AAU, Vizient, and Blue Ridge (any combination), marker phenotype, program type, program length (3-year or 4-year), DO origin, ACGME accreditation era, state, hospital ownership, and ED staffing. Program types (regrouped September 29, 2026): **research-intensive academic** (AAU member or NIH-ranked in the Blue Ridge table, 75 programs), **Vizient academic** (Vizient marker only, 39), **university-based academic** (no marker, 27), **corporate-affiliated** (76), **community-based** (82), and military (5); the three academic types together form the **academic group** (141 programs), selectable with one click and available as a summary breakdown.
- Filter the 76 **corporate-affiliated** programs by **owner–employer designation**, the owner of the primary teaching hospital paired with the employer of its emergency physicians (for example *HCA–HCA* where HCA Healthcare employs them directly, *HCA–TeamHealth*, *HCA–Envision*, or *Non-profit–USACS*), by the ED physician employer itself (TeamHealth, Envision, US Acute Care Solutions, Vituity, ApolloMD, SCP Health, regional and independent groups, or the for-profit owner), and by the for-profit company that owns the hospital (HCA Healthcare, Tenet, UHS, and others). Employers were verified program by program on September 29, 2026 from dated sources and the CMS Medicare clinician file; each program shows its source, date, and confidence. Type *HCA-Envision programs*, *all TeamHealth programs*, or *HCA programs* in Search or Ask the data.
- Filter people further by degree and Scopus or Google Scholar h-index range.
- Summarize any selection: n, mean, median, and interquartile range of the Scopus (or Google Scholar) h-index, overall and by normalized rank title, department/program described title, leadership role, program, program type, academic group, program length, research stratum (research-intensive, Vizient only, or no marker), accreditation era, or program origin, with a box-plot figure. Download the figure as PNG or SVG and the summary as CSV.
- Tick the box beside any program or person to limit the summary to your selection: one program gives its faculty, two or more programs are compared side by side. Ticked rows stay selected across searches, and a copied link keeps them.
- Sort any column, including AAU, Vizient, and Blue Ridge.
- Open a program to see everything recorded for it, including all of its faculty.
- Filter people by **program director**: the residency program director designated in the census, or the director of any fellowship listed in the SAEM Fellowship Directory (entries dated 2024 or later, confirmed on institutional pages; a director not in the directory is marked on the department chair's designation, stated on the profile). The summary can be grouped the same way, and *Ask the data* understands questions such as *how many ultrasound fellowship directors are there* or *residency program directors versus fellowship directors*.
- Open a faculty record to see its public professional email address where one was found (5,984 records), with its source: a faculty or professional page, or the author contact in a published article or document, whose current mailbox is not verified. CSV exports include the address and its source.
- Export any search as a CSV, or copy a link that reopens the same search.
- **Ask the data**: type a plain-language question and get the numbers, a figure, a table, and a link to the same selection in the explorer. For example: *show me the h-index distribution of chairs versus assistant professors*, *compare USF rank distribution and h-index to HCA Brandon*, *median Scopus h-index by rank at academic vs corporate-affiliated programs*, *how many program directors have an h-index of at least 10*, *list 4-year programs in Florida*, *who is the chair at Johns Hopkins*. It is a rule-based reader, not an AI model: it recognizes the census vocabulary (normalized ranks, described titles, leadership roles, degrees, program types, research markers, program length, accreditation era or year, states, health systems, and program names, nicknames, or ACGME IDs) and the words *versus*, *compare*, *by*, *how many*, *share*, *list*, *top*, and *who is*. Every answer says how the question was read. Nothing typed is sent anywhere; the reading and the arithmetic happen in the browser.

Definitions are on the site under **About the data**.

## How it works

It's a static site with no server and no dependencies: `index.html`, `style.css`, `app.js`, and one data file, `census-data.json`. GitHub Pages serves it from the `main` branch.

## Updating the data

Replace `census-data.json` with a newly generated file and commit it. The site redeploys automatically.

## Validation audits (1 October 2026)

Two audits of the extracted values were run after the paper's analytic freeze and applied to this dataset on 1 October 2026, both by an AI system (OpenAI ChatGPT GPT-6 Astra) that took part in the original collection, unblinded; independent human review is pending.

- A stratified random source recheck of 300 faculty-program records (four Scopus provenance bands × seven ranks × six program types, seed `EM-census-validation-2026-09-30-v1`): rank agreed in 265 of 273 resolvable comparisons (97%); previously matched Scopus profiles agreed in 131 of 138 (95%; six of the seven differences were one citation accrued since September); but a matching profile with h > 0 was found for 62 of 150 records that had been assigned 0.
- A targeted recheck of all 83 full-professor listings with a reported Scopus 0: 63 had a profile with h > 0, 6 displayed 0, 6 completed negative searches, 8 unresolved.

Applied: 120 recovered values replaced assigned zeros; 6 recovered profiles displaying 0 are now observed zeros; 22 completed negative searches are labelled as such; 8 ranks were set to the current official source (date of change not established); 4 matched profiles found to contain another author's work carry a caution; unresolved cases keep their value with a caution. Previously matched profiles whose h rose by 1 since September were not changed (values are as displayed on the collection date). An assigned 0 means that no profile was found at collection, not that the person has no publications; the remaining assigned zeros have not been re-searched. Each audited record shows its disposition on the faculty record and in the CSV column "Validation audit (October 1, 2026)".

## Corrections

Every value comes from a public source, but rosters and profiles change. To report an error, open the record on the site and choose **Report a correction**, or [open an issue](https://github.com/tampaERdoc/em-faculty-census/issues/new).

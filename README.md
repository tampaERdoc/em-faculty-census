# EM Faculty Census Explorer

A searchable web tool for a national census of emergency medicine faculty at all 304 ACGME-accredited EM residency programs: 12,905 faculty-program records, compiled in September 2026.

**Live site:** https://tampaerdoc.github.io/em-faculty-census/

## What you can do

- Search for a program or a person by name, institution, city, or state.
- Filter by normalized rank title (the rank analyzed in the paper), department chair (academic or hospital chairs listed by name, or programs with no chair identified), and leadership role (program director, vice chair, student clerkship director, and more); choosing a rank, chair, or role lists the matching people.
- Filter by the department/program described title, the title exactly as the department or program describes it before it is normalized to a rank (for example Clinical Assistant Professor, Assistant Clinical Professor, or Assistant Professor of Clinical Emergency Medicine). Type part of a title to find its variants, then tick them one by one or select all shown.
- Filter programs by AAU, Vizient, and Blue Ridge (any combination), marker phenotype, program type, DO origin, ACGME accreditation era, state, program length, hospital ownership, and ED staffing.
- Filter people further by degree and Scopus or Google Scholar h-index range.
- Summarize any selection: n, mean, median, and interquartile range of the Scopus (or Google Scholar) h-index, overall and by normalized rank title, department/program described title, leadership role, program, program type, research stratum, accreditation era, or program origin, with a box-plot figure. Download the figure as PNG or SVG and the summary as CSV.
- Tick the box beside any program or person to limit the summary to your selection: one program gives its faculty, two or more programs are compared side by side. Ticked rows stay selected across searches, and a copied link keeps them.
- Sort any column, including AAU, Vizient, and Blue Ridge.
- Open a program to see everything recorded for it, including all of its faculty.
- Export any search as a CSV, or copy a link that reopens the same search.

Definitions are on the site under **About the data**.

## How it works

It's a static site with no server and no dependencies: `index.html`, `style.css`, `app.js`, and one data file, `census-data.json`. GitHub Pages serves it from the `main` branch.

## Updating the data

Replace `census-data.json` with a newly generated file and commit it. The site redeploys automatically.

## Corrections

Every value comes from a public source, but rosters and profiles change. To report an error, open the record on the site and choose **Report a correction**, or [open an issue](https://github.com/tampaERdoc/em-faculty-census/issues/new).

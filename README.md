# EM Faculty Census Explorer

A searchable web tool for a national census of emergency medicine faculty at all 304 ACGME-accredited EM residency programs: 12,941 faculty-program records, compiled in September 2026.

**Live site:** https://tampaerdoc.github.io/em-faculty-census/

## What you can do

- Search for a program or a person by name, institution, city, or state.
- Filter programs by AAU, Vizient, and Blue Ridge (any combination), marker phenotype, program type, chair type and position, DO origin, ACGME accreditation era, state, program length, hospital ownership, and ED staffing.
- Filter people by academic rank, role (program chairs, program directors, vice chairs, and more), degree, and Scopus or Google Scholar h-index range.
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

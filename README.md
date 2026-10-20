# 40xli.com

Static site for 40XLI — the iRacing team, the 40XLI Driver Academy and the 40XLI Broadcasting Network. Hosted on GitHub Pages at https://40xli.com.

- `index.html` — home (roster, championships, broadcasts, academy call-to-action)
- `academy/`, `broadcasting/` — service pages with the coaching application and broadcast inquiry forms
- `drivers/<name>/` — driver profiles
- `assets/site.js` — the live "Next race" box (reads the INRS League Hub's `data.json`) and form submission to the 40XLI Google Apps Script
- `assets/site.css`, `assets/img/` — shared styles and images

Form submissions go to the Apps Script web app, which posts to Discord and the "40XLI Form Submissions" Google Sheet. Webhook URLs live only in the Apps Script's properties, never in this repo.

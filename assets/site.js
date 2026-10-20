/* 40XLI site behaviour: live "Next race" box from the League Hub, and the two forms. */
(function () {
  'use strict';

  var FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzRNe2rOOaEVlfIktlL9d__EQVIEOLRgWlyVvt1DxMGvK-qhkTQX-AktbQqPY8dJFhemQ/exec';
  var HUB_DATA = 'https://jordanbooth0904-spec.github.io/inrs-league-hub/data.json';

  // League Hub driver ids for the 40XLI roster -> number shown on this site
  var ROSTER = {
    'jordan-m-booth': ['41', 'Jordan Booth'],
    'brendon-hayes': ['40', 'Brendon Hayes'],
    'kai-collymore': ['39', 'Kai Collymore'],
    'eric-labombard': ['58', 'Eric Labombard'],
    'garrett-d-walden': ['43', 'Garrett Walden'],
    'matthew-perusini': ['24', 'Matt Perusini'],
    'corey-ennis': ['27', 'Corey Ennis']
  };

  function $(id) { return document.getElementById(id); }
  function setText(id, text) { var el = $(id); if (el && text) el.textContent = text; }

  function shortTrack(t) {
    return String(t || '')
      .replace(/\s+(oval|road course|w\/.*)$/i, '')
      .replace(/\s+oval\b.*$/i, '')
      .replace(/\s+(international\s+)?(motor\s+)?(super)?(speedway|raceway)\b.*$/i, '')
      .trim();
  }
  function who(id) { var r = ROSTER[id]; return r ? '#' + r[0] + ' ' + r[1] : ''; }

  /* ---------- Next race box (home page) ---------- */
  function nextRace() {
    if (!$('nr-track') || !window.fetch) return;
    fetch(HUB_DATA, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !Array.isArray(d.races)) return;
      var races = d.races.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      var now = Date.now();
      var done = races.filter(function (r) { return r.results && r.results.length; });

      var next = races.filter(function (r) {
        return !(r.results && r.results.length) && new Date(r.date).getTime() > now - 6 * 3600e3;
      })[0];
      var series = (d.settings && d.settings.name) || 'INRS Cup Series';
      setText('nr-series', series.replace(/\s+series$/i, '').toUpperCase());
      if (next) {
        setText('nr-track', shortTrack(next.track) || next.name);
        var dt = new Date(next.date);
        try {
          var day = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
          var time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
          setText('nr-when', day + ' · ' + time + ' ET');
        } catch (e) { /* keep fallback */ }
      } else {
        setText('nr-track', 'Off-season');
        setText('nr-when', 'Schedule coming soon');
      }

      for (var i = done.length - 1; i >= 0; i--) {
        var win = done[i].results.filter(function (x) { return x.fin === 1 && ROSTER[x.driverId]; })[0];
        if (win) { setText('nr-lastwin', who(win.driverId) + ' · ' + shortTrack(done[i].track)); break; }
      }

      var last = done[done.length - 1];
      if (last) {
        var ours = last.results.filter(function (x) { return ROSTER[x.driverId]; })
          .sort(function (a, b) { return a.fin - b.fin; })[0];
        if (ours) setText('nr-best', 'P' + ours.fin + ' · ' + who(ours.driverId));
        else setText('nr-best', 'No 40XLI starters');
      }
    }).catch(function () { /* leave the built-in fallback text */ });
  }

  /* ---------- Forms ---------- */
  var FIELDS = {
    coaching: {
      'f-name': 'name', 'f-email': 'email', 'f-discord': 'discord', 'f-iracing': 'iracing',
      'f-license': 'license', 'f-ir': 'irating', 'f-pkg': 'package', 'f-heard': 'heard',
      'f-ref': 'referral', 'f-goals': 'goals', 'f-avail': 'availability'
    },
    broadcast: {
      'b-name': 'name', 'b-email': 'email', 'b-league': 'league', 'b-night': 'night',
      'b-series': 'series', 'b-msg': 'message'
    }
  };
  var SERVICES = ['svc_live', 'svc_recaps', 'svc_website'];

  function setupForm(form, kind) {
    var map = FIELDS[kind];
    Object.keys(map).forEach(function (id) { var el = $(id); if (el) el.name = map[id]; });
    ['f-name', 'f-email', 'b-name', 'b-email'].forEach(function (id) { var el = $(id); if (el) el.required = true; });
    if ($('f-email')) $('f-email').autocomplete = 'email';
    if ($('b-email')) $('b-email').autocomplete = 'email';
    if ($('f-name')) $('f-name').autocomplete = 'name';
    if ($('b-name')) $('b-name').autocomplete = 'name';
    // dropdowns start blank so an untouched answer isn't recorded as the first option
    form.querySelectorAll('select').forEach(function (sel) {
      var blank = document.createElement('option');
      blank.value = ''; blank.textContent = 'Select…';
      sel.insertBefore(blank, sel.firstChild);
      sel.value = '';
    });
    if (kind === 'broadcast') {
      form.querySelectorAll('input[type="checkbox"]').forEach(function (cb, i) { cb.name = SERVICES[i]; cb.value = 'yes'; });
    }

    // honeypot: real people never see or fill this
    var hp = document.createElement('input');
    hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true'); hp.className = 'hp-field';
    form.appendChild(hp);

    var btn = form.querySelector('button');
    if (btn) btn.type = 'submit';
    var status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      var data = new URLSearchParams();
      data.append('form', kind);
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.disabled) return;
        if (el.type === 'checkbox') { if (el.checked) data.append(el.name, el.value); return; }
        data.append(el.name, el.value.trim());
      });
      var label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      status.className = 'form-status';
      status.textContent = '';
      fetch(FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: data })
        .then(function () {
          form.reset();
          status.className = 'form-status ok';
          status.textContent = kind === 'coaching'
            ? 'Application sent. We’ll reply within 1–3 business days.'
            : 'Inquiry sent. We’ll be in touch soon.';
        })
        .catch(function () {
          status.className = 'form-status err';
          status.textContent = 'That didn’t send. Check your connection and try again, or reach us on Discord.';
        })
        .then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
    });
  }

  function forms() {
    var c = document.querySelector('form[aria-label="Coaching application"]');
    var b = document.querySelector('form[aria-label="Broadcast inquiry"]');
    if (c) setupForm(c, 'coaching');
    if (b) setupForm(b, 'broadcast');

    // "Choose ..." buttons on the Academy packages pre-select the package
    var pkg = $('f-pkg');
    if (pkg) {
      document.querySelectorAll('a[href="#apply"]').forEach(function (a) {
        var t = a.textContent.toLowerCase();
        var v = /single/.test(t) ? 'Single Session' : /race week/.test(t) ? 'Race Week' : /season/.test(t) ? 'Season Program' : null;
        if (v) a.addEventListener('click', function () { pkg.value = v; });
      });
    }
  }

  function init() { nextRace(); forms(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

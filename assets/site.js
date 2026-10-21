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

  /* ---------- Driver profiles: official results (iResultBot) + league results (League Hub) ---------- */
  var RAW = 'https://raw.githubusercontent.com/jordanbooth0904-spec/40xli-site/main/data/';

  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function num(s) { return parseInt(String(s).replace(/[^\d-]/g, ''), 10) || 0; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function shortDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }); }
    catch (e) { return ''; }
  }
  function cleanTrack(t) { return String(t || '').replace(/\s+oval\b.*$/i, '').replace(/\s+NASCAR\b.*$/i, '').trim(); }
  function byLabel(label) {
    var hits = Array.prototype.filter.call(document.querySelectorAll('main p, body p'), function (p) {
      return p.textContent.trim() === label;
    });
    return hits[0] || null;
  }
  function headingEl(text) {
    return Array.prototype.filter.call(document.querySelectorAll('h2'), function (x) { return x.textContent.trim() === text; })[0] || null;
  }
  // A results block is either <h2> followed by the list, or a header row (<h2> + link) followed by the list.
  function blockParts(h2) {
    var sib = h2.nextElementSibling;
    if (sib && sib.tagName !== 'A') return { block: h2.parentElement, list: sib, header: h2 };
    return { block: h2.parentElement.parentElement, list: h2.parentElement.nextElementSibling, header: h2.parentElement };
  }
  function fillRows(list, items, render) {
    if (!list || !list.firstElementChild) return;
    var tpl = list.firstElementChild.cloneNode(true);
    list.innerHTML = '';
    items.forEach(function (it) {
      var row = tpl.cloneNode(true);
      var v = render(it);
      var mid = row.children[1];
      row.children[0].textContent = v[0];
      if (mid && mid.children.length >= 2) { mid.children[0].textContent = v[1]; mid.children[1].textContent = v[2]; }
      if (row.children[2]) row.children[2].textContent = v[3];
      list.appendChild(row);
    });
  }

  function driverPage() {
    var m = location.pathname.match(/\/drivers\/([^/]+)\/?/);
    if (!m || !window.fetch) return;
    var slug = m[1];
    Promise.all([getJSON(RAW + 'drivers.json'), getJSON(RAW + 'official.json'), getJSON(HUB_DATA)]).then(function (res) {
      var cfg = res[0], off = res[1], hub = res[2];
      if (!cfg || !cfg.drivers || !cfg.drivers[slug]) return;
      var me = cfg.drivers[slug];
      var cutoff = new Date(cfg.cutoff).getTime();
      var o = off && off.drivers && off.drivers[slug];

      // League results after the cutoff, from the League Hub
      var lg = { starts: 0, wins: 0, top5: 0, poles: 0, laps: 0 };
      var leagueRaces = [];
      if (hub && Array.isArray(hub.races) && me.hub) {
        hub.races.forEach(function (r) {
          var res = (r.results || []).filter(function (x) { return x.driverId === me.hub; })[0];
          if (!res) return;
          leagueRaces.push({ race: r, res: res });
          if (new Date(r.date).getTime() > cutoff) {
            lg.starts++; lg.wins += res.fin === 1; lg.top5 += res.fin <= 5;
            lg.poles += res.start === 1; lg.laps += res.lapsLed || 0;
          }
        });
        leagueRaces.sort(function (a, b) { return new Date(b.race.date) - new Date(a.race.date); });
      }

      // iRating + peak
      if (o) {
        var irP = byLabel('IRATING'), pkP = byLabel('PEAK IRATING');
        if (irP && irP.previousElementSibling) irP.previousElementSibling.textContent = fmt(o.irating);
        if (pkP && pkP.previousElementSibling) pkP.previousElementSibling.textContent = fmt(o.peak);
      }

      // Career totals: baseline on the page + official races since cutoff + league races since cutoff
      var adds = {
        'STARTS': [o ? o.add.starts : 0, lg.starts],
        'WINS': [o ? o.add.wins : 0, lg.wins],
        'TOP 5': [o ? o.add.top5 : 0, lg.top5],
        'POLES': [0, lg.poles],
        'LAPS LED': [0, lg.laps]
      };
      Object.keys(adds).forEach(function (label) {
        var lab = byLabel(label);
        if (!lab) return;
        var tile = lab.parentElement, val = tile.children[0], split = tile.children[2];
        var a = adds[label];
        var sm = split && split.textContent.match(/([\d,]+)\s*official\s*·\s*([\d,]+)\s*league/i);
        if (sm) {
          var offN = num(sm[1]) + a[0], lgN = num(sm[2]) + a[1];
          val.textContent = fmt(offN + lgN);
          split.textContent = fmt(offN) + ' official · ' + fmt(lgN) + ' league';
        } else if (a[0]) {
          val.textContent = fmt(num(val.textContent) + a[0]);   // official-only totals
        }
      });

      // "Last updated"
      var lu = Array.prototype.filter.call(document.querySelectorAll('p'), function (p) { return /^Last updated/.test(p.textContent.trim()); })[0];
      if (lu && off && off.updated) {
        try { lu.textContent = 'Last updated ' + new Date(off.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }); } catch (e) {}
      }

      // Recent league results (only on profiles that show them)
      var lh = headingEl('Recent results');
      var lp = lh && blockParts(lh);
      if (lp && lp.list && leagueRaces.length) {
        var n = lp.list.children.length || 5;
        var series = ((hub.settings && hub.settings.name) || 'INRS Cup Series').replace(/\s+series$/i, '');
        fillRows(lp.list, leagueRaces.slice(0, n), function (x) {
          return ['P' + x.res.fin, cleanTrack(x.race.track) || x.race.name,
            series + (x.race.round ? ' · Rd ' + x.race.round : '') + (x.res.start ? ' · Started ' + ordinal(x.res.start) : ''),
            shortDate(x.race.date)];
        });
      }

      // Recent official races, placed just above the league list on profiles that show recent results
      if (lp && lp.list && o && o.recent && o.recent.length) {
        lh.textContent = 'Recent league results';
        var clone = lp.block.cloneNode(true);
        lp.block.parentNode.insertBefore(clone, lp.block);
        var ch2 = headingEl('Recent league results');           // first match = the clone
        ch2.textContent = 'Recent official races';
        var cp = blockParts(ch2);
        var link = cp.header.querySelector && cp.header.querySelector('a');
        if (link) link.remove();
        if (lp.block.tagName === 'SECTION') clone.style.paddingBottom = '0';
        else clone.style.marginBottom = '40px';
        fillRows(cp.list, o.recent, function (r) {
          var ch = (r.change > 0 ? '+' : '') + r.change;
          return ['P' + r.finish, r.track, r.series + ' · iRating ' + fmt(r.irating) + ' (' + ch + ')', shortDate(r.start)];
        });
      }
    });
  }

  /* ---------- Livery rotator on driver profiles: show 3, arrows rotate through the rest ---------- */
  function liveryCarousels() {
    var SHOW = 3;
    document.querySelectorAll('.livery-carousel').forEach(function (box) {
      var track = box.querySelector('.livery-track');
      var figs = track ? Array.prototype.slice.call(track.querySelectorAll(':scope > figure')) : [];
      var prev = box.querySelector('.lc-prev'), next = box.querySelector('.lc-next');
      if (figs.length <= SHOW) { box.classList.add('no-scroll'); return; }
      figs.forEach(function (f) { var im = f.querySelector('img'); if (im) im.loading = 'eager'; });
      var start = 0;
      function render() {
        figs.forEach(function (f, i) {
          var pos = (i - start + figs.length) % figs.length;
          f.hidden = pos >= SHOW;
          f.style.order = pos;
        });
      }
      prev.addEventListener('click', function () { start = (start - 1 + figs.length) % figs.length; render(); });
      next.addEventListener('click', function () { start = (start + 1) % figs.length; render(); });
      render();
    });
  }

  function init() { nextRace(); forms(); driverPage(); liveryCarousels(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

#!/usr/bin/env python3
"""Read iResultBot posts from the 40XLI Discord channel and keep data/official.json current.

Runs in GitHub Actions with the DISCORD_BOT_TOKEN secret (a read-only 40XLI bot).
Only uses the Python standard library.

Each iResultBot embed looks like:
  title:  "NASCAR iRacing Class B Series race completed at Talladega Superspeedway"
  fields: Finish "21/28 (-7)", Incidents, iRating "4338 (-63)", SOF, Tracked Driver "B6FADB", License, Car
  footer: "Session start: 2026-10-20 00:00 UTC"
"""
import json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG_PATH = os.path.join(ROOT, 'data', 'drivers.json')
OUT_PATH = os.path.join(ROOT, 'data', 'official.json')
API = 'https://discord.com/api/v10'
LOOKBACK_DAYS = 21          # how far before the cutoff to read on the first run (helps match IDs)
RECENT_COUNT = 5

OVAL_HINT = re.compile(r'nascar|arca|oval|late model|modified|legends|truck|street stock|silver crown|super speedway|superspeedway', re.I)
NOT_OVAL = re.compile(r'dirt|rallycross|road course|\broad\b|roval|gt3|gt4|imsa|formula|porsche|mx-5|skip barber|sprint car|midget', re.I)


def parse_time(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def discord_get(path, token):
    req = urllib.request.Request(API + path, headers={
        'Authorization': 'Bot ' + token,
        'User-Agent': 'DiscordBot (https://40xli.com, 1.0) 40XLI-results',
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = float(json.loads(e.read().decode() or '{}').get('retry_after', 2))
                time.sleep(wait + 0.5)
                continue
            raise
    raise RuntimeError('Discord kept rate limiting')


def fetch_messages(channel, token, after_id, oldest):
    """Yield messages newer than after_id, or (first run) back to `oldest`."""
    msgs = []
    if after_id:
        cursor = after_id
        while True:
            batch = discord_get(f'/channels/{channel}/messages?limit=100&after={cursor}', token)
            if not batch:
                break
            msgs.extend(batch)
            cursor = max(batch, key=lambda m: int(m['id']))['id']
            if len(batch) < 100:
                break
    else:
        before = None
        while True:
            q = f'/channels/{channel}/messages?limit=100' + (f'&before={before}' if before else '')
            batch = discord_get(q, token)
            if not batch:
                break
            msgs.extend(batch)
            last = min(batch, key=lambda m: int(m['id']))
            before = last['id']
            if parse_time(last['timestamp']) < oldest or len(batch) < 100:
                break
    return msgs


def field(embed, name):
    for f in embed.get('fields') or []:
        if f.get('name', '').strip().lower() == name.lower():
            return f.get('value', '').strip()
    return ''


def parse_post(msg):
    """Return a race dict from an iResultBot message, or None."""
    for e in msg.get('embeds') or []:
        title = (e.get('title') or '').strip()
        m = re.match(r'(.+?)\s+race completed at\s+(.+)$', title, re.I)
        code = field(e, 'Tracked Driver')
        ir = re.match(r'\s*([\d,]+)\s*\(([+-]?\d+)\)', field(e, 'iRating'))
        fin = re.match(r'\s*(\d+)\s*/\s*(\d+)', field(e, 'Finish'))
        if not (m and code and ir and fin):
            continue
        text = ' '.join([e.get('description') or '', (e.get('footer') or {}).get('text') or ''] +
                        [f.get('value', '') for f in e.get('fields') or []])
        st = re.search(r'Session start:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*UTC', text)
        when = f'{st.group(1)}T{st.group(2)}:00Z' if st else msg['timestamp']
        return {
            'id': msg['id'], 'code': code.upper(), 'series': m.group(1).strip(), 'track': m.group(2).strip(),
            'finish': int(fin.group(1)), 'field': int(fin.group(2)),
            'irating': int(ir.group(1).replace(',', '')), 'change': int(ir.group(2)),
            'sof': field(e, 'SOF'), 'car': field(e, 'Car'), 'start': when,
        }
    return None


def main():
    token = os.environ.get('DISCORD_BOT_TOKEN')
    if not token:
        sys.exit('DISCORD_BOT_TOKEN is not set')
    cfg = json.load(open(CFG_PATH))
    cutoff = parse_time(cfg['cutoff'])
    state = json.load(open(OUT_PATH)) if os.path.exists(OUT_PATH) else {}
    posts = {p['id']: p for p in state.get('posts', [])}

    new = fetch_messages(cfg['channel'], token, state.get('lastMessageId'), cutoff - timedelta(days=LOOKBACK_DAYS))
    for msg in new:
        p = parse_post(msg)
        if p:
            posts[p['id']] = p
    last_id = max([int(m['id']) for m in new] + [int(state.get('lastMessageId') or 0)])

    all_posts = sorted(posts.values(), key=lambda p: (p['start'], int(p['id'])))

    # --- match unknown Tracked Driver codes to roster drivers by iRating ---
    drivers = cfg['drivers']
    code_to_slug = {d['code'].upper(): s for s, d in drivers.items() if d.get('code')}
    code_to_slug.update(state.get('autoMatched', {}))
    taken = set(code_to_slug.values())
    # each code's last result before the cutoff and first result after it
    last_before, first_after = {}, {}
    for p in all_posts:
        if parse_time(p['start']) <= cutoff:
            last_before[p['code']] = p
        else:
            first_after.setdefault(p['code'], p)
    for p in list(last_before.values()) + list(first_after.values()):
        if p['code'] in code_to_slug:
            continue
        t = parse_time(p['start'])
        prev = p['irating'] - p['change']
        hits = [s for s, d in drivers.items() if s not in taken and (
            (t <= cutoff and p['irating'] == d['baseline']['irating']) or
            (t > cutoff and prev == d['baseline']['irating']))]
        if len(hits) == 1:
            code_to_slug[p['code']] = hits[0]
            taken.add(hits[0])
    auto = {c: s for c, s in code_to_slug.items() if not drivers[s].get('code')}

    # --- per-driver official stats since the cutoff ---
    out_drivers = {}
    for slug, d in drivers.items():
        codes = [c for c, s in code_to_slug.items() if s == slug]
        cur = d['baseline']['irating']
        peak = d['baseline']['peak']
        starts = wins = top5 = 0
        counted = []
        for p in all_posts:
            if p['code'] not in codes or parse_time(p['start']) <= cutoff:
                continue
            chain = (p['irating'] - p['change']) == cur
            label = p['series'] + ' ' + p['track']
            if not (chain or (OVAL_HINT.search(label) and not NOT_OVAL.search(label))):
                continue  # a road/dirt race: different iRating, not counted
            cur = p['irating']
            peak = max(peak, cur)
            starts += 1
            wins += p['finish'] == 1
            top5 += p['finish'] <= 5
            counted.append(p)
        out_drivers[slug] = {
            'irating': cur, 'peak': peak,
            'add': {'starts': starts, 'wins': wins, 'top5': top5},
            'lastRace': counted[-1]['start'] if counted else None,
            'recent': [{k: p[k] for k in ('start', 'series', 'track', 'finish', 'field', 'irating', 'change')}
                       for p in reversed(counted[-RECENT_COUNT:])],
        }

    unmatched = sorted({p['code'] for p in all_posts if p['code'] not in code_to_slug})
    # keep posts from the lookback window onward so later runs can still match IDs
    keep_from = cutoff - timedelta(days=LOOKBACK_DAYS)
    result = {
        'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'cutoff': cfg['cutoff'],
        'lastMessageId': str(last_id) if last_id else None,
        'autoMatched': auto,
        'unmatchedCodes': unmatched,
        'drivers': out_drivers,
        'posts': [p for p in all_posts if parse_time(p['start']) >= keep_from],
    }
    old = {k: v for k, v in state.items() if k != 'updated'}
    newc = {k: v for k, v in result.items() if k != 'updated'}
    if old == newc:
        print('No changes.')
        return
    with open(OUT_PATH, 'w') as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'Read {len(new)} new messages; {len(all_posts)} results on file; '
          f'matched {len(code_to_slug)} driver IDs; unmatched: {unmatched or "none"}')


if __name__ == '__main__':
    main()

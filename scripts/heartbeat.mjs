import { readFile, mkdir, writeFile } from 'node:fs/promises';
const {
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: key,
  TELEGRAM_BOT_TOKEN: token,
  TELEGRAM_CHAT_ID: chat,
} = process.env;
if (!url || !key) {
  throw new Error('Configure Supabase heartbeat Actions secrets');
}
let healthy = false;
try {
  const response = await fetch(`${url}/rest/v1/rpc/heartbeat`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15_000),
  });
  healthy = response.ok && (await response.json()) === true;
} catch {
  /* No response bodies or URLs are logged. */
}
await mkdir('.heartbeat-state', { recursive: true });
let previous;
try {
  previous = JSON.parse(await readFile('.heartbeat-state/state.json', 'utf8'));
} catch {
  previous = undefined;
}
const changed = previous?.healthy !== healthy;
let notified = !changed && previous?.notified === true;
if (changed || !notified) {
  if (token && chat && (!healthy || previous?.healthy === false)) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text: healthy ? 'ReadFold: Supabase recovered.' : 'ReadFold: Supabase heartbeat unavailable.',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      notified = response.ok && (await response.json()).ok === true;
    } catch {
      notified = false;
    }
  } else {
    notified = true;
  }
}
await writeFile('.heartbeat-state/state.json', JSON.stringify({ healthy, notified }));
console.log(healthy ? 'Heartbeat healthy' : 'Heartbeat unavailable');
if (!healthy) {
  process.exitCode = 1;
}

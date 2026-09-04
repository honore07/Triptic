// Audit d'accessibilité automatisé (axe-core) sur les pages du site en ligne,
// en Chrome headless. Rapporte les violations par page avec leur impact.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] ?? 'https://triptic.hakoe-alsace.com';
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
const PORT = 9343;
const profile = mkdtempSync(path.join(tmpdir(), 'vire-a11y-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--disable-gpu', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const list = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json()); const page = list.find((t) => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; } } catch {}
    await sleep(200);
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
const axeSource = await fetch(AXE).then((r) => r.text());

async function audit(pathname, { click } = {}) {
  await send('Page.navigate', { url: BASE + pathname }); await sleep(2500);
  if (click) { await evaluate(click); await sleep(1500); }
  await send('Runtime.evaluate', { expression: axeSource });
  const res = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }).then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) , count: v.nodes.length }))))`);
  const violations = JSON.parse(res);
  console.log(`\n=== ${pathname}${click ? ' (après clic)' : ''} — ${violations.length} règle(s) en défaut ===`);
  for (const v of violations) console.log(`${(v.impact || '?').padEnd(9)} ${v.id.padEnd(28)} ×${v.count}  ${v.help}\n           ${v.nodes.join(' | ').slice(0, 220)}`);
}

await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' }); await sleep(1500);
await evaluate("localStorage.setItem('triptic-lang','fr'); 'ok'");
await audit('/');
await audit('/', { click: "document.querySelector('button.cta-plate')?.click(); 'ok'" });
await audit('/login');
await audit('/plan');
await audit('/explore');
await audit('/trips');
await audit('/profil');
await audit('/vehicule');
await audit('/contribute');
await audit('/legal/attributions');
ws.close(); chrome.kill();

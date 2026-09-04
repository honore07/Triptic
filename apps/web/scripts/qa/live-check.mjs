// Contrôle fonctionnel du site en ligne : parcours des pages en Chrome headless,
// collecte des erreurs console, exceptions JS et requêtes en échec.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] ?? 'https://triptic.hakoe-alsace.com';
const OUT = path.resolve('live-shots');
mkdirSync(OUT, { recursive: true });
const PORT = 9337;
const profile = mkdtempSync(path.join(tmpdir(), 'vire-live-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-gpu',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pending = new Map();
const issues = []; const requests = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* pas prêt */ }
    await sleep(200);
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') issues.push({ page: current, kind: 'exception', text: msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text });
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) issues.push({ page: current, kind: 'console.' + msg.params.type, text: msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
    if (msg.method === 'Network.requestWillBeSent') requests.set(msg.params.requestId, msg.params.request.url);
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) issues.push({ page: current, kind: 'http ' + msg.params.response.status, text: msg.params.response.url });
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) issues.push({ page: current, kind: 'network-failed', text: (requests.get(msg.params.requestId) ?? '?') + ' — ' + msg.params.errorText });
  };
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
let current = '';
async function visit(pathname, { click, waitFor = 2500, shot } = {}) {
  current = pathname;
  await send('Page.navigate', { url: BASE + pathname });
  await sleep(waitFor);
  if (click) { await evaluate(click); await sleep(1500); }
  const title = await evaluate('document.title');
  const h1 = await evaluate("document.querySelector('h1')?.textContent?.trim() ?? ''");
  const text = await evaluate('document.body.innerText.length');
  console.log(`${pathname.padEnd(22)} title="${title}" h1="${h1.slice(0, 50)}" text=${text}`);
  if (shot) {
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(path.join(OUT, shot + '.jpg'), Buffer.from(data, 'base64'));
  }
}

await connect();
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

console.log('health:', JSON.stringify(await fetch(BASE + '/health').then((r) => r.json())));
console.log('api/me:', JSON.stringify(await fetch(BASE + '/api/me').then((r) => r.json())));
await visit('/', { shot: 'live-01-ouverture' });
await evaluate("localStorage.setItem('triptic-lang','fr'); 'ok'");
await visit('/', { click: "document.querySelector('button.cta-plate')?.click(); 'ok'", shot: 'live-02-accueil' });
await visit('/plan', { shot: 'live-03-plan' });
await visit('/explore', { waitFor: 4000, shot: 'live-04-explore' });
await visit('/trips');
await visit('/profil');
await visit('/vehicule');
await visit('/login', { shot: 'live-05-login' });
await visit('/legal/attributions');
await visit('/trip/inexistant-xyz');
await visit('/nulle-part');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await visit('/', { click: "document.querySelector('button.cta-plate')?.click(); 'ok'", shot: 'live-06-accueil-mobile' });

console.log('\n=== incidents (' + issues.length + ') ===');
for (const i of issues) console.log(`[${i.page}] ${i.kind}: ${i.text}`);
ws.close(); chrome.kill();

// Mesure du premier chargement (navigateur neuf, cache vide) : TTFB, FCP, LCP,
// poids transféré, nombre de requêtes — desktop puis mobile émulé.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] ?? 'https://triptic.hakoe-alsace.com';
const PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(label, { width, height, mobile, throttle }) {
  const profile = mkdtempSync(path.join(tmpdir(), 'vire-perf-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--disable-gpu', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let ws; let id = 0; const pending = new Map(); let transferred = 0; let requests = 0;
  for (let i = 0; i < 50; i++) {
    try { const list = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json()); const page = list.find((t) => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; } } catch {}
    await sleep(200);
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Network.requestWillBeSent') requests += 1;
    if (msg.method === 'Network.loadingFinished') transferred += msg.params.encodedDataLength ?? 0;
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, (r) => (r.error ? reject(new Error(JSON.stringify(r.error))) : resolve(r.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile });
  if (throttle) {
    // 4G modeste : 9 Mb/s descendant, 40 ms de latence, CPU ×4 plus lent
    await send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 });
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  // L'ouverture d'abord (page d'entrée), puis l'accueil (LCP = la vallée)
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(6000);
  const nav = await evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint'); const fcp = p.find(e => e.name === 'first-contentful-paint'); return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null }; })()`);
  const lcp = await evaluate(`new Promise((resolve) => { let last = null; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) last = e; }); po.observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => { po.disconnect(); resolve(last ? { ms: Math.round(last.startTime), el: last.element ? last.element.tagName + (last.element.className ? '.' + String(last.element.className).split(' ')[0] : '') : '?' } : null); }, 500); })`);
  const cls = await evaluate(`new Promise((resolve) => { let v = 0; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }); po.observe({ type: 'layout-shift', buffered: true }); setTimeout(() => { po.disconnect(); resolve(Math.round(v * 1000) / 1000); }, 300); })`);
  console.log(`\n=== ${label} ===`);
  console.log(`TTFB ${nav.ttfb} ms · FCP ${nav.fcp} ms · LCP ${lcp?.ms ?? '?'} ms (${lcp?.el ?? '?'}) · DOMContentLoaded ${nav.domContentLoaded} ms · load ${nav.load} ms · CLS ${cls}`);
  console.log(`${requests} requêtes · ${Math.round(transferred / 1024)} Ko transférés`);
  ws.close(); chrome.kill();
  await sleep(500);
}

await measure('Desktop, réseau libre', { width: 1280, height: 900, mobile: false, throttle: false });
await measure('Mobile 390×844, 4G modeste, CPU ×4', { width: 390, height: 844, mobile: true, throttle: true });

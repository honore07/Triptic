// Contrastes COMPOSÉS : luminance réelle du fond derrière chaque texte posé sur
// photo (voile + image), mesurée sur la capture d'écran, pas estimée.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173';
const PORT = 9341;
const profile = mkdtempSync(path.join(tmpdir(), 'vire-contrast-'));
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

// Même jeu d'exemple que shots.mjs (photos Unsplash claires — le pire cas)
const U = (id) => `https://images.unsplash.com/${id}?w=1200&q=75&auto=format`;
const wp = (name, lat, lng, day, kind) => ({ name, lat, lng, day, kind });
const trip = (title, ambiance, summary, difficulty, photo_url) => ({ title, mode: 'roadtrip', duration_days: 4, distance_km: 180, elevation_gain_m: 900, difficulty, ambiance, summary, daily_distance_km: 45, waypoints: [wp('Munster', 48.04, 7.14, 1, 'start'), wp('Grand Ballon', 47.9014, 7.0994, 4, 'end')], photo_keywords: ['vosges'], budget: { fuel_eur: 60, tolls_eur: [0, 0], nights_eur: [0, 40], meals_eur: [80, 140], activities_eur: 0, total_eur: [165, 305] }, photo_url });
const payload = { generation: { differentiator: 'x', request: { departure: 'Colmar', duration_days: 4, modes: ['roadtrip'], difficulty: 'medium', group_type: 'couple', vehicle: 'van', avoid_crowds: true, camping: true, budget: 'low', physical_level: 3, constraints: [], style: [] }, trips: [
  trip('Classique sauvage : Hohneck & Grand Ballon', 'Crêtes ouvertes, départs tôt, nuits en van sous les étoiles.', 'Résumé.', 'medium', U('photo-1573031522107-b9447e67479c')),
  trip('Arêtes discrètes : Tête des Faux & Petit Ballon', 'Sentiers confidentiels, lacs d’altitude.', 'Résumé.', 'hard', U('photo-1738663909778-6edb47db6fae')),
  trip('Lacs paisibles et forêts profondes', 'Douceur forestière, baignades, rythme lent.', 'Résumé.', 'easy', U('photo-1595757077131-e91fc687eb28')),
] }, locked_proposals: 0, validated: true, remaining: 2 };
const chatState = { state: { messages: [{ role: 'user', content: 'x' }], result: payload, overrides: {}, dates: null }, version: 0 };

await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' }); await sleep(1500);
await evaluate(`localStorage.setItem('triptic-lang','fr'); localStorage.setItem('triptic-chat', ${JSON.stringify(JSON.stringify(chatState))}); 'ok'`);
await send('Page.navigate', { url: BASE + '/plan' }); await sleep(3500);
// Volet II activé (couleur) : on mesure les trois états — gravure, couleur, et la tête d'itinéraire
await evaluate(`document.querySelectorAll('.triptych-plate')[1].dispatchEvent(new MouseEvent('click',{bubbles:true})); 'ok'`);
await sleep(1500);
await evaluate(`document.querySelector('.triptych')?.scrollIntoView({block:'start'}); 'ok'`);
await sleep(600);

async function measure(label) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const report = await evaluate(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${data}'; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const lum = (r,g,b) => { const f = (v) => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
    const targets = [...document.querySelectorAll('.triptych-plate h3, .triptych-plate p.font-display, .triptych-plate dd, .triptych-plate dt, .triptych-plate .label-mono, header.hero-open h1, header.hero-open dd, header.hero-open dt')];
    const out = [];
    for (const el of targets) {
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el); const m = cs.color.match(/\\d+/g).map(Number); const Lt = lum(m[0],m[1],m[2]);
      const px = ctx.getImageData(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)).data;
      // Fond = pixels qui ne sont PAS la couleur du texte (distance > 60) ; on retient le fond le plus CLAIR (pire cas, décile 90)
      const bg = [];
      for (let i = 0; i < px.length; i += 4) { const d = Math.abs(px[i]-m[0])+Math.abs(px[i+1]-m[1])+Math.abs(px[i+2]-m[2]); if (d > 60) bg.push(lum(px[i],px[i+1],px[i+2])); }
      if (bg.length < 20) continue;
      bg.sort((a,b)=>a-b); const worst = bg[Math.floor(bg.length*0.9)]; const median = bg[Math.floor(bg.length*0.5)];
      const ratio = (L) => { const hi = Math.max(Lt, L), lo = Math.min(Lt, L); return (hi+0.05)/(lo+0.05); };
      out.push({ el: el.tagName.toLowerCase() + (el.className.baseVal !== undefined ? '' : '.' + String(el.className).split(' ').slice(0,2).join('.')), text: el.textContent.trim().slice(0, 28), median: +ratio(median).toFixed(2), worst: +ratio(worst).toFixed(2) });
    }
    return out;
  })()`);
  console.log(`\n=== ${label} ===`);
  for (const r of report) console.log(`${r.worst < 4.5 ? '!!' : '  '} médian ${String(r.median).padStart(5)}  pire ${String(r.worst).padStart(5)}  ${r.el.padEnd(28)} ${r.text}`);
}
await measure('Triptyque — volet II en couleur, I et III en gravure');
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Choisissez cette vire'))?.click(); 'ok'`);
await sleep(3000);
await measure('Tête d’itinéraire (photo claire)');
ws.close(); chrome.kill();

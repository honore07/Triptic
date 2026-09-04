// Captures d'écran des écrans retouchés (Chrome headless + CDP brut, sans dépendance).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = path.resolve('shots-jpg');
mkdirSync(OUT, { recursive: true });
const PORT = 9333;
const profile = mkdtempSync(path.join(tmpdir(), 'vire-shots-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-gpu',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pending = new Map();
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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}
async function shot(name, { full = true } = {}) {
  if (full) {
    const h = await evaluate('document.documentElement.scrollHeight');
    const w = await evaluate('window.innerWidth');
    await viewport(w, Math.min(h, 6000), w < 700);
    await sleep(400);
  }
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(path.join(OUT, `${name}.jpg`), Buffer.from(data, 'base64'));
  console.log('shot', name);
}
async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(1800);
}

// --- Données d'exemple (mêmes formes que le moteur) pour la planche Comparer ---
const wp = (name, lat, lng, day, kind) => ({ name, lat, lng, day, kind });
const PH = {"P1": "https://images.unsplash.com/photo-1573031522107-b9447e67479c?w=1200&q=75&auto=format", "P2": "https://images.unsplash.com/photo-1738663909778-6edb47db6fae?w=1200&q=75&auto=format", "P3": "https://images.unsplash.com/photo-1595757077131-e91fc687eb28?w=1200&q=75&auto=format", "D1": "https://images.unsplash.com/photo-1704300815404-bc93117dc42d?w=1200&q=75&auto=format", "D2": "https://images.unsplash.com/photo-1576882981805-0629e8d5061f?w=1200&q=75&auto=format", "D3": "https://images.unsplash.com/photo-1603137884437-f31086c73ec4?w=1200&q=75&auto=format"};
const act = (type, title, lat, lng, extra = {}) => ({ type, time_of_day: 'morning', title, lat, lng, ...extra });
const DAYS = [
  { day: 1, title: 'Colmar → Col de la Schlucht', photo_url: PH.D1, activities: [act('drive', 'Route des Crêtes', 48.06, 7.02), act('camp', 'Bivouac au Gaschney', 48.05, 7.05)], segments: [{ distance_km: 52, duration_min: 75, mode: 'car', routed: true }] },
  { day: 2, title: 'Hohneck par les crêtes', photo_url: PH.P2, activities: [act('hike', 'Montée au Hohneck', 48.03, 7.0, { distance_km: 12, elevation_gain_m: 620 })], segments: [{ distance_km: 9, duration_min: 15, mode: 'car', routed: true }] },
  { day: 3, title: 'Lac Blanc et Lac Noir', photo_url: PH.D3, activities: [act('hike', 'Boucle des deux lacs', 48.13, 7.08, { distance_km: 9, elevation_gain_m: 330 })], segments: [{ distance_km: 38, duration_min: 55, mode: 'car', routed: true }] },
  { day: 4, title: 'Grand Ballon, retour par Munster', photo_url: PH.D2, activities: [act('hike', 'Grand Ballon', 47.9, 7.1, { distance_km: 8, elevation_gain_m: 280 }), act('drive', 'Retour Colmar', 48.08, 7.36)], segments: [{ distance_km: 101, duration_min: 130, mode: 'car', routed: false }] },
];
const trip = (title, ambiance, summary, difficulty, days, km, dplus, budget, photo_url, withDays) => ({
  photo_url, days: withDays ? DAYS : undefined,
  title, mode: 'roadtrip', duration_days: days, distance_km: km, elevation_gain_m: dplus, difficulty,
  ambiance, summary, daily_distance_km: Math.round(km / days),
  waypoints: [wp('Munster', 48.04, 7.14, 1, 'start'), wp('Col de la Schlucht', 48.063, 7.021, 2, 'stage'), wp('Hohneck', 48.03, 7.0, 3, 'stage'), wp('Grand Ballon', 47.9014, 7.0994, 4, 'end')],
  photo_keywords: ['vosges'], budget: { fuel_eur: 60, tolls_eur: [0, 0], nights_eur: [0, 40], meals_eur: [80, 140], activities_eur: 0, total_eur: budget },
});
const payload = {
  generation: {
    differentiator: "Le premier joue les grands classiques Hohneck et Grand Ballon, le second préfère les sommets confidentiels Tête des Faux et Petit Ballon, le troisième mise sur les lacs forestiers et une allure tranquille.",
    request: { departure: 'Colmar', duration_days: 4, modes: ['roadtrip'], difficulty: 'medium', group_type: 'couple', vehicle: 'van', avoid_crowds: true, camping: true, budget: 'low', physical_level: 3, constraints: [], style: ['sauvage'] },
    trips: [
      trip('Classique sauvage : Hohneck & Grand Ballon', 'Crêtes ouvertes, départs tôt, nuits en van sous les étoiles.', 'Les deux grands sommets des Vosges, le Hohneck et le Grand Ballon, reliés par la Route des Crêtes. Deux belles randonnées à la journée et des campements sauvages mais faciles d’accès.', 'medium', 4, 200, 950, [165, 305], PH.P1, true),
      trip('Arêtes discrètes : Tête des Faux & Petit Ballon', 'Sentiers confidentiels, lacs d’altitude, ambiance plus technique.', 'Une version plus sauvage et technique autour des sommets moins fréquentés. Deux belles journées de crêtes, des nuitées en van très isolées.', 'hard', 4, 160, 1070, [155, 290], PH.P2, false),
      trip('Lacs paisibles et forêts profondes', 'Douceur forestière, baignades, rythme lent et nuit au bord de l’eau.', 'Deux randonnées légères entre lacs et cirques glaciaires, sans obsession du sommet. Le van roule peu, l’eau est partout et les journées s’étirent.', 'easy', 4, 185, 500, [180, 315], PH.P3, false),
    ],
  },
  locked_proposals: 0, validated: true, remaining: 2,
};
const chatState = { state: { messages: [{ role: 'user', content: 'Road trip van 4 jours dans les Vosges, spots sauvages, deux treks à la journée' }], result: payload, overrides: {}, dates: { start: '2026-09-12', end: '2026-09-15' } }, version: 0 };

await connect();
await send('Page.enable'); await send('Runtime.enable');
await viewport(1280, 900);

// 1. Ouverture + accueil (desktop)
await goto(`${BASE}/?lng=fr`);
await evaluate(`localStorage.setItem('triptic-lang','fr'); localStorage.setItem('triptic-chat', ${JSON.stringify(JSON.stringify(chatState))}); 'ok'`);
await goto(`${BASE}/`);
await shot('01-ouverture', { full: false });
await evaluate(`document.querySelector('button.cta-plate')?.click(); 'ok'`);
await sleep(1500);
await viewport(1280, 900);
await shot('02-accueil', { full: false });

// 2. Planche Comparer — les 3 vires (données d'exemple)
await viewport(1280, 900);
await goto(`${BASE}/plan`);
await sleep(2500);
await shot('03-plan-trois-vires');
// Survol du volet II : il prend ses couleurs
await evaluate(`document.querySelectorAll('.triptych-plate')[1].dispatchEvent(new MouseEvent('click',{bubbles:true})); 'ok'`);
await sleep(1200);
await shot('03b-plan-volet-actif');
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Choisissez cette vire'))?.click(); 'ok'`);
await sleep(2500);
await viewport(1280, 900);
await shot('07-itineraire');
// Une journée ouverte : fiche d'étape (PL.11) puis nuitée (PL.10)
await evaluate(`[...document.querySelectorAll('button')].find(b=>/^Jour 2/.test(b.getAttribute('aria-label')||''))?.click(); 'ok'`);
await sleep(1800);
await evaluate(`document.getElementById('etape-title')?.scrollIntoView({block:'start'}); window.scrollBy(0,-24); 'ok'`);
await sleep(900);
await viewport(1280, 900);
await shot('09-etape', { full: false });
// Édition manuelle du programme (DayEditor) — le dernier écran passé en planches
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Modifier le programme'))?.click(); 'ok'`);
await sleep(900);
await evaluate(`document.querySelector('main')?.scrollTo?.(0,0); [...document.querySelectorAll('h2,p')].find(e=>/Programme jour par jour/i.test(e.textContent))?.scrollIntoView({block:'start'}); 'ok'`);
await sleep(600);
await viewport(1280, 900);
await shot('14-editeur', { full: false });

// 3. Relevé (PL.06) — on bloque l'appel réseau pour figer la planche en cours
await viewport(1280, 900);
await evaluate(`localStorage.setItem('triptic-chat', ${JSON.stringify(JSON.stringify(chatState))}); 'ok'`);
await goto(`${BASE}/plan`);
await sleep(1500);
await evaluate(`const f=window.fetch.bind(window); window.fetch=(u,o)=>String(u).includes('generate-trips')?new Promise(()=>{}):f(u,o); 'ok'`);
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Éviter la foule')?.click(); 'ok'`);
await sleep(300);
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Régénérer'))?.click(); 'ok'`);
await sleep(6500);
await shot('04-releve-generation');

// 4. Mobile : accueil + trois vires
await viewport(390, 844, true);
await goto(`${BASE}/`);
await evaluate(`document.querySelector('button.cta-plate')?.click(); 'ok'`);
await sleep(1500);
await viewport(390, 844, true);
await shot('05-accueil-mobile', { full: false });
await evaluate(`localStorage.setItem('triptic-chat', ${JSON.stringify(JSON.stringify(chatState))}); 'ok'`);
await goto(`${BASE}/plan`);
await sleep(2500);
await evaluate(`document.querySelector('.triptych')?.scrollIntoView({block:'start'}); window.scrollBy(0,-8); 'ok'`);
await sleep(600);
await shot('06-trois-vires-mobile', { full: false });
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Choisissez cette vire'))?.click(); 'ok'`);
await sleep(2500);
await viewport(390, 844, true);
await shot('08-itineraire-mobile');

// Fenêtre (PL.04) avec ses raccourcis, puis le carnet (PL.12)
await viewport(1280, 900);
const noResult = { state: { ...chatState.state, result: null }, version: 0 };
await evaluate(`localStorage.setItem('triptic-chat', ${JSON.stringify(JSON.stringify(noResult))}); 'ok'`);
await goto(`${BASE}/plan`);
await sleep(1200);
await shot('10-fenetre', { full: false });
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Continuer')?.click(); 'ok'`);
await sleep(1200);
await shot('12-precisions');
await goto(`${BASE}/trips`);
await sleep(2500);
await shot('11-carnet', { full: false });

await viewport(1280, 900);
await goto(`${BASE}/explore`);
await sleep(2500);
await shot('13-explore', { full: false });

ws.close(); chrome.kill();
console.log('done', OUT);

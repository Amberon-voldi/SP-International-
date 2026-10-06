// Dependency-free browser smoke checks. Requires Node 22+ and Google Chrome.
import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let server, chrome, profile, cdp, session, base;
// Test-only config overrides and HTTP fixture. No production endpoint is used.
let fixtureConfig = null;
const fixtureRequests = [];
const fixtureFailures = [];
const errors = [];
const navigations = [];
const loadedDocuments = new Set();

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params, message.sessionId);
      }
    });
  }
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }
  send(method, params = {}, sessionId = session) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.equal(result.exceptionDetails, undefined, `Browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Browser condition did not become true: ${expression}`);
}
async function navigate(path) {
  const url = new URL(path, base).href;
  const { loaderId } = await cdp.send('Page.navigate', { url });
  if (loaderId) {
    for (let i = 0; i < 100 && !loadedDocuments.has(loaderId); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(loadedDocuments.has(loaderId), `Page did not finish loading: ${path}`);
  }
  await until(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`);
  await evaluate('document.fonts.ready.then(() => true)');
}
async function viewport(width, height = 900) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
}
async function fill(id, value) {
  await evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function formalDetails(product = 'Cumin') {
  await fill('product', product);
  await fill('country', 'United Arab Emirates');
  await fill('email', 'buyer@example.com');
}
async function configuredPage(mode, timeoutMs = 2000) {
  fixtureRequests.length = 0;
  fixtureConfig = { endpoint: `https://localhost:${server.address().port}/__quote-fixture/${mode}`, timeoutMs };
  await navigate('contact.html?product=Cumin');
  await formalDetails();
  assert.equal(await evaluate('document.getElementById("submit-quote").textContent'), 'Send quote request');
}
async function fixtureCount(count) {
  for (let i = 0; i < 100 && fixtureRequests.length < count; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fixtureRequests.length, count);
}
async function snapshot(name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { captureBeyondViewport: false });
  await writeFile(join(process.env.SCREENSHOT_DIR, name + '.png'), Buffer.from(data, 'base64'));
}

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.startsWith('/__quote-fixture/')) {
        response.setHeader('Access-Control-Allow-Origin', new URL(base).origin);
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
        let body = '';
        for await (const chunk of request) body += chunk;
        const mode = pathname.split('/').pop();
        fixtureRequests.push({ method: request.method, headers: request.headers, mode, body: JSON.parse(body) });
        // An invalid HTTP response causes a real fetch network error without
        // Chrome's transparent retry of an abruptly closed keep-alive socket.
        if (mode === 'network') { request.socket.end('HTTP/1.1 200 OK\r\nContent-Length: invalid\r\n\r\n'); return; }
        if (mode === 'timeout') await new Promise(resolve => setTimeout(resolve, 700));
        if (mode === 'duplicate') await new Promise(resolve => setTimeout(resolve, 250));
        response.writeHead(mode === 'service' ? 503 : 200, { 'Content-Type': 'application/json' });
        response.end(mode === 'invalid-json' ? 'not JSON' : JSON.stringify({ received: mode !== 'service' && mode !== 'no-ack' }));
        return;
      }
      if (pathname === '/js/quote-config.js' && fixtureConfig) {
        response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        response.end('window.SP_QUOTE_CONFIG = Object.freeze(' + JSON.stringify(fixtureConfig) + ');');
        return;
      }
      const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(root + sep)) throw new Error('Invalid path');
      const body = await readFile(path);
      response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  profile = await mkdtemp(join(tmpdir(), 'sp-quotation-chrome-'));
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not expose DevTools')), 15000);
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.once('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited before starting')); });
    chrome.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  cdp = new CDP(socket);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  cdp.on('Runtime.exceptionThrown', (event, id) => { if (id === session) errors.push(event.exceptionDetails.text); });
  cdp.on('Page.frameRequestedNavigation', (event, id) => { if (id === session) navigations.push(event.url); });
  cdp.on('Page.lifecycleEvent', (event, id) => { if (id === session && event.name === 'load') loadedDocuments.add(event.loaderId); });
  await cdp.send('Page.enable');
  await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  // The production code still requires HTTPS. Chrome rewrites ONLY this
  // loopback fixture URL to our local HTTP server; no external lead is sent.
  cdp.on('Fetch.requestPaused', (event, id) => {
    if (id !== session) return;
    const url = new URL(event.request.url);
    cdp.send('Fetch.continueRequest', { requestId: event.requestId, url: new URL(url.pathname, base).href }).catch(error => fixtureFailures.push(error.message));
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `https://localhost:${server.address().port}/__quote-fixture/*`, requestStage: 'Request' }] });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // Never deliver smoke-test enquiries or contact external messaging services.
  await cdp.send('Network.setBlockedURLs', { urls: ['*://wa.me/*'] });
}, { timeout: 30000 });

afterEach(() => { fixtureConfig = null; });

after(async () => {
  cdp?.socket.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await new Promise(resolve => { const timer = setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 3000); chrome.once('exit', () => { clearTimeout(timer); resolve(); }); });
  }
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('all pages fit desktop, tablet and small phones; images and local links work', { timeout: 60000 }, async () => {
  const links = new Set();
  for (const width of [1440, 768, 390, 320]) {
    await viewport(width, width < 640 ? 844 : 1000);
    for (const page of ['index.html', 'products.html', 'about.html', 'contact.html']) {
      await navigate(page);
      assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1, page);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${page} overflows at ${width}px`);
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".mobile-enquiry")).display !== "none"'), width < 880);
      assert.deepEqual(await evaluate(`(async () => { const bad = []; for (const img of document.images) { img.loading = 'eager'; try { await img.decode(); } catch { bad.push(img.getAttribute('src')); } } return bad; })()`), [], `${page} has broken images`);
      for (const href of await evaluate('Array.from(document.querySelectorAll("a[href], link[href], img[src], script[src]")).map(el => el.href || el.src).filter(url => url.startsWith(location.origin))')) links.add(href);
      if (page === 'index.html' && [1440, 390].includes(width)) {
        await snapshot(`home-${width}`);
        await evaluate('document.querySelector(".card-grid").scrollIntoView({ block: "start" })');
        await snapshot(`home-products-${width}`);
      }
      if (page === 'contact.html') {
        assert.equal(await evaluate('["product", "country", "email", "name", "company", "whatsapp", "quantity", "quantity-unit-kg", "quantity-unit-tonnes", "message"].every(id => { const el = document.getElementById(id); return el.getBoundingClientRect().height > 0 && !el.closest("details"); })'), true, `All quote fields must be expanded at ${width}px`);
      }
      if (page === 'products.html' && width === 1440) {
        await evaluate('document.querySelector(".card-grid").scrollIntoView({ block: "center" })');
        await snapshot('products-desktop');
      }
    }
  }
  // Check actual target pages and fragment IDs, not just file names.
  await navigate('index.html');
  for (const href of links) {
    const result = await evaluate(`(async () => { const url = new URL(${JSON.stringify(href)}); const response = await fetch(url); let fragmentExists = true; if (url.hash && response.ok) { const doc = new DOMParser().parseFromString(await response.text(), 'text/html'); fragmentExists = !!doc.getElementById(decodeURIComponent(url.hash.slice(1))); } return { ok: response.ok, fragmentExists }; })()`);
    assert.equal(result.ok, true, href);
    assert.equal(result.fragmentExists, true, href);
  }
  assert.deepEqual(errors, []);
});

test('every product quotation link preselects a supported product', async () => {
  const links = new Set();
  for (const page of ['index.html', 'products.html']) {
    await navigate(page);
    for (const href of await evaluate(`Array.from(document.querySelectorAll('a[href*="product="]')).map(a => a.href)`)) links.add(href);
  }
  assert.equal(links.size, 6);
  for (const href of links) {
    await navigate(href);
    assert.equal(await evaluate('document.getElementById("product").value'), new URL(href).searchParams.get('product'));
  }
  await navigate('contact.html?product=unknown');
  assert.equal(await evaluate('document.getElementById("product").value'), '');
});

test('preselected product opens a WhatsApp draft with zero typing', async () => {
  fixtureConfig = null;
  await navigate('contact.html?product=Cumin');
  navigations.length = 0;
  const draft = await evaluate(`(() => {
    document.getElementById('send-whatsapp').click();
    return {
      body: document.getElementById('enquiry-draft').value,
      url: document.getElementById('draft-whatsapp-link').href,
      status: document.getElementById('form-status').textContent,
      fields: ['country', 'email', 'name', 'whatsapp', 'quantity', 'message'].map(id => document.getElementById(id).value),
      invalid: document.querySelectorAll('[aria-invalid="true"]').length
    };
  })()`);
  assert.match(draft.body, /Product: Cumin seeds/);
  assert.match(draft.status, /press Send in WhatsApp/);
  assert.deepEqual(draft.fields, ['', '', '', '', '', '']);
  assert.equal(draft.invalid, 0);
  assert.equal(new URL(draft.url).searchParams.get('text'), draft.body);
  for (let i = 0; i < 20 && !navigations.includes(draft.url); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(navigations.includes(draft.url), 'The action must actually request WhatsApp, not just render a draft');
});

test('formal quotes require product, destination and valid email, not a name or generic message', async () => {
  await navigate('contact.html');
  await click('#submit-quote');
  assert.equal(await evaluate('document.activeElement.id'), 'product');
  await fill('product', 'Cumin');
  await click('#submit-quote');
  assert.equal(await evaluate('document.activeElement.id'), 'country');
  assert.equal(await evaluate('document.getElementById("country").getAttribute("aria-invalid")'), 'true');
  await fill('country', 'United Arab Emirates');
  await click('#submit-quote');
  assert.equal(await evaluate('document.activeElement.id'), 'email');
  await fill('email', 'invalid-address');
  await click('#submit-quote');
  assert.equal(await evaluate('document.activeElement.id'), 'email');
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /check your email/);
  assert.equal(await evaluate('document.getElementById("draft-preview").hidden'), true);
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#quote-form [required]")).map(el => el.id)'), ['product', 'country', 'email']);
  // An unfinished formal route must not block a product-only draft / WhatsApp.
  await click('#preview-enquiry');
  assert.equal(await evaluate('document.getElementById("draft-preview").hidden'), false);
  assert.equal(await evaluate('document.querySelectorAll("[aria-invalid=true]").length'), 0);
});

test('formal draft keeps all buying fields visible; email and WhatsApp preserve the same buying brief', async () => {
  await viewport(1440, 1000);
  await navigate('contact.html?product=Turmeric#quote-form');
  await formalDetails('Turmeric');
  await click('#preview-enquiry');
  assert.equal(await evaluate('document.getElementById("draft-preview").hidden'), false);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("quote-details")).display !== "none"'), true);
  assert.equal(await evaluate('["name", "company", "whatsapp", "quantity", "message"].every(id => { const el = document.getElementById(id); const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })'), true);
  const body = await evaluate('document.getElementById("enquiry-draft").value');
  assert.match(body, /Product: Turmeric powder/);
  assert.match(body, /Name: Not provided/);
  assert.match(body, /Delivery country: United Arab Emirates/);
  assert.match(body, /Quantity: To be discussed/);
  const email = new URL(await evaluate('document.getElementById("draft-email-link").href'));
  const whatsapp = new URL(await evaluate('document.getElementById("draft-whatsapp-link").href'));
  assert.equal(email.pathname, 'info@spinternationalpvtltd.com');
  assert.equal(email.searchParams.get('body'), body);
  assert.equal(whatsapp.pathname, '/919286492989');
  assert.equal(whatsapp.searchParams.get('text'), body);
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /press Send/);
  await snapshot('quote-desktop');
  await fill('country', 'United Kingdom');
  assert.equal(await evaluate('document.getElementById("draft-preview").hidden'), true, 'Do not show a stale draft after editing');
});

test('optional buying details preserve kg by default and tonnes without restating the product', async () => {
  await navigate('contact.html?product=Red%20chilli%20powder');
  await formalDetails('Red chilli powder');
  await fill('name', 'Test & Buyer');
  await fill('whatsapp', '+971 50 123 4567');
  await fill('company', 'Example Company');
  await fill('message', 'Packing: 25 kg bags\nDocuments & specifications to discuss.');
  await fill('quantity', '500');
  assert.equal(await evaluate('document.getElementById("quantity-unit-kg").checked'), true);
  await click('#preview-enquiry');
  let body = await evaluate('document.getElementById("enquiry-draft").value');
  assert.match(body, /Quantity: 500 kg/);
  assert.match(body, /Name: Test & Buyer/);
  assert.match(body, /Company: Example Company/);
  assert.match(body, /WhatsApp: \+971 50 123 4567/);
  assert.match(body, /Documents & specifications to discuss\./);
  await click('#quantity-unit-tonnes');
  await fill('quantity', '2.5');
  await click('#preview-enquiry');
  assert.match(await evaluate('document.getElementById("enquiry-draft").value'), /Quantity: 2.5 tonnes/);
  await evaluate('document.querySelectorAll("input[name=quantity_unit]").forEach(el => el.checked = false)');
  await click('#submit-quote');
  assert.equal(await evaluate('getComputedStyle(document.getElementById("quote-details")).display !== "none"'), true);
  assert.equal(await evaluate('document.activeElement.id'), 'quantity-unit-kg');
  await fill('quantity', '');
  assert.equal(await evaluate('document.getElementById("quantity-unit-kg").required'), false);
  await click('#preview-enquiry');
  assert.match(await evaluate('document.getElementById("enquiry-draft").value'), /Quantity: To be discussed/);
});

test('copying works, and blocked clipboard access offers a manual-copy fallback', async () => {
  await navigate('contact.html?product=Cumin');
  // Copy must also work for a zero-typing product-only draft.
  await click('#preview-enquiry');
  await cdp.send('Browser.grantPermissions', { origin: new URL(base).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }, null);
  await click('#copy-enquiry');
  await until('document.getElementById("form-status").textContent.startsWith("Enquiry copied")');
  assert.equal(await evaluate('navigator.clipboard.readText()'), await evaluate('document.getElementById("enquiry-draft").value'));
  await evaluate('navigator.clipboard.writeText = () => Promise.reject(new Error("Clipboard unavailable"))');
  await click('#copy-enquiry');
  await until('document.activeElement.id === "enquiry-draft"');
  assert.equal(await evaluate('document.getElementById("enquiry-draft").selectionEnd'), (await evaluate('document.getElementById("enquiry-draft").value')).length);
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /Ctrl\+C \/ Command\+C/);
  await evaluate('Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })');
  await click('#copy-enquiry');
  assert.equal(await evaluate('document.activeElement.id'), 'enquiry-draft');
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /Ctrl\+C \/ Command\+C/);
});

test('mobile navigation, keyboard focus and enquiry shortcuts remain usable', async () => {
  await viewport(390, 844);
  await navigate('index.html');
  await click('.nav-toggle');
  assert.equal(await evaluate('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'), 'true');
  await until('document.body.classList.contains("nav-open") && getComputedStyle(document.querySelector(".mobile-enquiry")).visibility === "hidden"');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert.equal(await evaluate('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'), 'false');
  assert.equal(await evaluate('document.activeElement.className'), 'nav-toggle');
  await viewport(667, 375);
  await navigate('index.html');
  await click('.nav-toggle');
  await evaluate('document.getElementById("site-nav").scrollTop = document.getElementById("site-nav").scrollHeight');
  assert.equal(await evaluate('document.querySelector("#site-nav .btn").getBoundingClientRect().bottom <= innerHeight'), true, 'Landscape menu must scroll to its quote button');
  await viewport(390, 844);
  await navigate('contact.html?product=Cumin#quote-form');
  await fill('name', 'Test Buyer');
  await fill('email', 'buyer@example.com');
  await evaluate('document.getElementById("email").focus()');
  await until('getComputedStyle(document.querySelector(".mobile-enquiry")).visibility === "hidden"');
  assert.deepEqual(await evaluate('({ focused: document.activeElement.id, hasFocus: document.hasFocus(), focusMatches: document.getElementById("email").matches(":focus"), barVisibility: getComputedStyle(document.querySelector(".mobile-enquiry")).visibility })'), { focused: 'email', hasFocus: true, focusMatches: true, barVisibility: 'hidden' });
  await snapshot('quote-mobile');
  await click('#preview-enquiry');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
});

test('empty submission config honestly opens a mailto draft, not an online submission', async () => {
  fixtureConfig = null;
  fixtureRequests.length = 0;
  await navigate('contact.html?product=Cumin');
  assert.equal(await evaluate('window.SP_QUOTE_CONFIG.endpoint'), '');
  assert.match(await evaluate('document.getElementById("submit-quote").textContent'), /email draft.*Send/);
  assert.match(await evaluate('document.getElementById("quote-form-note").textContent'), /opening a draft does not submit/);
  await formalDetails();
  navigations.length = 0;
  await click('button[type="submit"]');
  await until('document.getElementById("form-status").textContent.includes("email draft")');
  const emailUrl = navigations.find(url => url.startsWith('mailto:info@spinternationalpvtltd.com?'));
  assert.ok(emailUrl);
  assert.equal(new URL(emailUrl).searchParams.get('body'), await evaluate('document.getElementById("enquiry-draft").value'));
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /Nothing has been submitted/);
  assert.equal(fixtureRequests.length, 0);
  const expected = await evaluate('document.getElementById("draft-whatsapp-link").href');
  await click('#send-whatsapp');
  for (let i = 0; i < 20 && !navigations.includes(expected); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(navigations.includes(expected), 'WhatsApp action must use the composed enquiry');
});

test('configured HTTPS route actually POSTs buying details and requires explicit local service acknowledgement', async () => {
  await configuredPage('success');
  await fill('name', 'Fixture Buyer');
  await fill('company', 'Local Fixture Company');
  await fill('whatsapp', '+971 50 123 4567');
  await fill('quantity', '2.5');
  await click('#quantity-unit-tonnes');
  await fill('message', 'Local fixture only — packing and documents to discuss.');
  navigations.length = 0;
  await click('#submit-quote');
  await until('document.getElementById("quote-form").dataset.submissionState === "received"');
  await fixtureCount(1);
  assert.equal(fixtureRequests[0].method, 'POST');
  assert.match(fixtureRequests[0].headers['content-type'], /application\/json/);
  assert.equal(fixtureRequests[0].headers.cookie, undefined, 'No service credentials are sent');
  const { enquiry, ...details } = fixtureRequests[0].body;
  assert.deepEqual(details, {
    product: 'Cumin', productLabel: 'Cumin seeds', country: 'United Arab Emirates', email: 'buyer@example.com',
    name: 'Fixture Buyer', company: 'Local Fixture Company', whatsapp: '+971 50 123 4567',
    quantity: '2.5', unit: 'tonnes', message: 'Local fixture only — packing and documents to discuss.'
  });
  assert.equal(enquiry, await evaluate('document.getElementById("enquiry-draft").value'));
  assert.match(enquiry, /Quantity: 2.5 tonnes/);
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /service acknowledgement, not delivery to the company inbox/);
  assert.equal(await evaluate('document.getElementById("quote-form").getAttribute("aria-busy")'), 'false');
  assert.equal(await evaluate('document.getElementById("email").disabled'), false);
  assert.equal(navigations.some(url => url.startsWith('mailto:')), false, 'Configured submission should not silently open an email draft');
  assert.deepEqual(fixtureFailures, []);
});

test('pending and acknowledged submissions cannot duplicate; changing buying details allows a new local request', async () => {
  await configuredPage('duplicate');
  await evaluate(`(() => {
    const form = document.getElementById('quote-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  assert.equal(await evaluate('document.getElementById("quote-form").dataset.submissionState'), 'sending');
  assert.equal(await evaluate('document.getElementById("quote-form").getAttribute("aria-busy")'), 'true');
  assert.equal(await evaluate('Array.from(document.querySelectorAll("[data-enquiry-action]")).every(button => button.disabled)'), true);
  assert.doesNotMatch(await evaluate('document.getElementById("form-status").textContent'), /^Request received/);
  await until('document.getElementById("quote-form").dataset.submissionState === "received"');
  await fixtureCount(1);
  assert.equal(await evaluate('document.getElementById("submit-quote").disabled'), true);
  assert.equal(fixtureRequests[0].body.name, '');
  assert.equal(fixtureRequests[0].body.quantity, '');
  assert.equal(fixtureRequests[0].body.message, '');
  await evaluate('document.getElementById("quote-form").dispatchEvent(new Event("submit", { cancelable: true }))');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(fixtureRequests.length, 1);
  await fill('country', 'United Kingdom');
  assert.equal(await evaluate('document.getElementById("submit-quote").disabled'), false);
  await click('#submit-quote');
  await until('document.getElementById("quote-form").dataset.submissionState === "received"');
  await fixtureCount(2);
  assert.equal(fixtureRequests[1].body.country, 'United Kingdom');
});

test('service, missing acknowledgement, invalid JSON and network failures retain usable draft fallbacks', async () => {
  for (const mode of ['service', 'no-ack', 'invalid-json', 'network']) {
    await configuredPage(mode);
    await click('#submit-quote');
    await until('document.getElementById("quote-form").dataset.submissionState === "error"');
    assert.equal(fixtureRequests.length, 1, `${mode} fixture should receive one POST`);
    assert.equal(await evaluate('document.getElementById("submit-quote").disabled'), false, mode);
    assert.equal(await evaluate('document.getElementById("draft-preview").hidden'), false, mode);
    assert.equal(await evaluate('document.getElementById("email").value'), 'buyer@example.com');
    assert.match(await evaluate('document.getElementById("draft-hint").textContent'), /may or may not have reached/);
    assert.doesNotMatch(await evaluate('document.getElementById("form-status").textContent'), /^Request received/);
    const email = new URL(await evaluate('document.getElementById("draft-email-link").href'));
    const whatsapp = new URL(await evaluate('document.getElementById("draft-whatsapp-link").href'));
    assert.equal(email.searchParams.get('body'), fixtureRequests[0].body.enquiry);
    assert.equal(whatsapp.searchParams.get('text'), fixtureRequests[0].body.enquiry);
    await evaluate('navigator.clipboard.writeText = () => Promise.reject(new Error("Clipboard unavailable"))');
    await click('#copy-enquiry');
    await until('document.activeElement.id === "enquiry-draft"');
    assert.equal(await evaluate('document.getElementById("enquiry-draft").selectionEnd'), fixtureRequests[0].body.enquiry.length);
    if (mode === 'service') {
      await click('#submit-quote');
      await until('document.getElementById("quote-form").dataset.submissionState === "error"');
      await fixtureCount(2);
    }
  }
});

test('timeout aborts the configured request, restores controls and never turns a late response into received', async () => {
  await configuredPage('timeout', 150);
  await click('#submit-quote');
  await until('document.getElementById("quote-form").dataset.submissionState === "error"');
  await fixtureCount(1);
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /took too long/);
  assert.equal(await evaluate('document.getElementById("submit-quote").disabled'), false);
  assert.equal(await evaluate('document.getElementById("email").disabled'), false);
  assert.equal(await evaluate('document.getElementById("draft-preview").hidden'), false);
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(await evaluate('document.getElementById("quote-form").dataset.submissionState'), 'error');
  assert.equal(fixtureRequests.length, 1, 'No automatic retry after an uncertain receipt');
  assert.match(await evaluate('document.getElementById("enquiry-draft").value'), /Product: Cumin seeds/);
});

test('non-HTTPS or credential-bearing endpoints are rejected with a working email draft instead', async () => {
  for (const endpoint of [new URL('/__quote-fixture/success', base).href, `https://unused@localhost:${server.address().port}/__quote-fixture/success`]) {
    fixtureRequests.length = 0;
    fixtureConfig = { endpoint, timeoutMs: 2000 };
    await navigate('contact.html?product=Cumin');
    await formalDetails();
    assert.match(await evaluate('document.getElementById("submit-quote").textContent'), /email draft/);
    assert.match(await evaluate('document.getElementById("quote-form-note").textContent'), /current configuration/);
    navigations.length = 0;
    await click('#submit-quote');
    assert.equal(fixtureRequests.length, 0);
    assert.ok(navigations.some(url => url.startsWith('mailto:info@spinternationalpvtltd.com?')));
    assert.match(await evaluate('document.getElementById("form-status").textContent'), /Nothing has been submitted/);
  }
});

test('without JavaScript, direct contact links remain available and draft buttons are disabled', async () => {
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  try {
    await navigate('contact.html');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[data-enquiry-action]")).every(button => button.disabled)'), true);
    assert.match(await evaluate('document.querySelector("noscript").textContent'), /contact us directly/);
    assert.equal(await evaluate('document.querySelector("noscript a[href^=mailto]").getAttribute("href")'), 'mailto:info@spinternationalpvtltd.com');
    assert.equal(await evaluate('document.querySelector("noscript a[href^=https]").href'), 'https://wa.me/919286492989');
    assert.equal(await evaluate('["product", "country", "email", "name", "company", "whatsapp", "quantity", "message"].every(id => document.getElementById(id).getBoundingClientRect().height > 0)'), true, 'All buying fields must also be visible without JavaScript');
    await navigate('index.html');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("[data-reveal]")).every(el => getComputedStyle(el).opacity === "1" && getComputedStyle(el).filter === "none")'), true, 'Motion must fail open without JavaScript');
  } finally {
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
  }
  assert.deepEqual(errors, []);
});

test('search metadata, business structured data and accessible label targets are consistent', async () => {
  const titles = new Set();
  for (const page of ['index.html', 'products.html', 'about.html', 'contact.html']) {
    await navigate(page);
    const metadata = await evaluate(`(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        uniqueIds: new Set(ids).size === ids.length,
        labelsValid: Array.from(document.querySelectorAll('label[for]')).every(label => !!document.getElementById(label.htmlFor)),
        schema: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(script => JSON.parse(script.textContent))
      };
    })()`);
    assert.ok(metadata.title.length > 10 && metadata.description.length > 50);
    assert.equal(titles.has(metadata.title), false);
    titles.add(metadata.title);
    assert.equal(metadata.canonical, 'https://spinternationalpvtltd.com/' + (page === 'index.html' ? '' : page));
    assert.equal(metadata.uniqueIds, true);
    assert.equal(metadata.labelsValid, true);
    if (page === 'index.html') {
      assert.equal(metadata.schema[0]['@type'], 'Organization');
      assert.equal(metadata.schema[0].address.addressLocality, 'Sikandrabad');
      assert.equal(metadata.schema[0].contactPoint.contactType, 'sales');
    }
  }
  assert.deepEqual(errors, []);
});

test('motion is progressive, revealable and pausable', async () => {
  await viewport(1440, 1000);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await navigate('index.html');
  assert.equal(await evaluate('document.documentElement.classList.contains("motion-enabled")'), true);
  assert.equal(await evaluate('document.querySelector("[data-motion-toggle]").hidden'), false);
  assert.equal(await evaluate('document.querySelectorAll("[data-reveal]").length > 0'), true);
  assert.equal(await evaluate('document.querySelector(".story-image").classList.contains("is-revealed")'), false, 'Below-fold content should be waiting to reveal');
  assert.match(await evaluate('getComputedStyle(document.querySelector(".story-image")).filter'), /blur\(/, 'Waiting reveals should start softly blurred');
  await evaluate('document.querySelector(".card-grid").scrollIntoView({ block: "center" })');
  await until('document.querySelector(".card-grid [data-reveal]").classList.contains("is-revealed")');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".product-card"), "::after").animationName'), 'reveal-sheen');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Animated cards must not create horizontal scroll');
  await evaluate('document.querySelector(".story-image").scrollIntoView({ block: "center" })');
  await until('document.querySelector(".story-image").classList.contains("is-revealed")');
  await until('getComputedStyle(document.querySelector(".story-image")).filter === "none"');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".story-image"), "::after").animationName'), 'none', 'The story caption contrast overlay must not sweep off the image');
  await snapshot('story-reveal-complete');
  await evaluate('document.querySelector(".cta-inner a").focus()');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".cta-inner")).opacity'), '1', 'Keyboard-focused content must be immediately visible');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".cta-inner")).filter'), 'none');
  await click('[data-motion-toggle]');
  assert.equal(await evaluate('document.documentElement.classList.contains("motion-paused")'), true);
  assert.equal(await evaluate('Array.from(document.querySelectorAll("[data-reveal]")).every(el => el.classList.contains("is-revealed"))'), true);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await until('document.documentElement.classList.contains("motion-paused")');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-reveal]")).opacity'), '1');
  assert.equal(await evaluate('Array.from(document.querySelectorAll("[data-reveal]")).every(el => getComputedStyle(el).filter === "none" && getComputedStyle(el).transform === "none")'), true, 'Reduced motion must leave every section clear and static');
  assert.deepEqual(errors, []);
});

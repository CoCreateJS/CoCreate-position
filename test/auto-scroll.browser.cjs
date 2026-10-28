const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

const root = path.resolve(__dirname, '..');
let directory, browser, server, origin;
before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'position-auto-scroll-'));
    const config = await require('../webpack.config.js')({}, { mode: 'development' });
    config.context = root;
    config.output.path = directory;
    config.devtool = false;
    config.plugins = config.plugins.filter(plugin => plugin.constructor.name !== 'FileUploader');
    const compiler = require('webpack')(config);
    try {
        await new Promise((resolve, reject) => compiler.run((error, stats) => {
            if (error) return reject(error);
            if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
            resolve();
        }));
    } finally { await new Promise(resolve => compiler.close(resolve)); }
    server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/') {
            response.setHeader('Content-Type', 'text/html');
            return response.end('<!doctype html><body></body>');
        }
        if (pathname === '/api/ping') return response.writeHead(204, { Date: new Date().toUTCString() }).end();
        const file = path.resolve(directory, '.' + pathname);
        if (!file.startsWith(directory + '/') || !fs.existsSync(file)) return response.writeHead(404).end();
        response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
});
after(async () => {
    await browser?.close();
    if (server) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

async function fixture(run, { nested = false, clone = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.setDefaultTimeout(5000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    try {
        await page.goto(origin);
        await page.evaluate(() => {
            window.positionErrors = [];
            document.addEventListener('position-error', event => positionErrors.push(event.detail.error.message), true);
        });
        await page.evaluate(({ nested, clone }) => {
            document.body.style.margin = '0';
            const scope = document.createElement('section');
            scope.id = 'scope';
            scope.setAttribute(clone ? 'clonable-query' : 'draggable-query', '.card[]');
            scope.setAttribute('droppable-query', '.drop[]');
            scope.innerHTML = '<header style="height:36px"><div id="source" class="card" style="width:100px;height:36px;user-select:none">drag</div></header>';
            const scroller = document.createElement('div');
            scroller.id = 'scroller';
            scroller.className = 'drop';
            scroller.style.cssText = 'margin:40px 80px;width:260px;height:220px;overflow-y:auto;scroll-behavior:smooth';
            for (let index = 0; index < 30; index++) {
                const item = document.createElement('div');
                item.textContent = `item ${index}`;
                item.style.height = '44px';
                scroller.append(item);
            }
            if (nested) {
                const outer = document.createElement('div');
                outer.id = 'outer';
                outer.style.cssText = 'margin:40px 80px;width:280px;height:220px;overflow-y:auto';
                scroller.style.margin = '0';
                outer.append(scroller);
                const tail = document.createElement('div');
                tail.style.height = '900px';
                outer.append(tail);
                scope.append(outer);
            } else scope.append(scroller);
            document.body.append(scope);
        }, { nested, clone });
        await page.addStyleTag({ url: origin + '/CoCreate-position.css' });
        await page.addScriptTag({ url: origin + '/CoCreate-position.js' });
        await page.waitForFunction(() => !!document.querySelector('#scope').positionDragDelegation);
        await run(page, requests);
        assert.deepEqual(errors, []);
        assert.deepEqual(await page.evaluate(() => positionErrors), []);
    } finally { await page.close(); }
}

async function startDrag(page) {
    await page.locator('#source').hover();
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('#source').position?.clickedInfo?.isMoving);
}
async function pointAt(page, edge, inset = 3) {
    const box = await page.locator('#scroller').boundingBox();
    await page.mouse.move(box.x + box.width / 2,
        edge === 'top' ? box.y + inset : edge === 'middle' ? box.y + box.height / 2 : box.y + box.height - inset);
}
async function scrollTop(page) { return page.locator('#scroller').evaluate(node => node.scrollTop); }

// Real browser drag sessions exercise the module loader, engine, hit testing,
// scroll containers, and insertion references together.
test('auto-scroll loads only when a drag is active and continues under a stationary pointer', () => fixture(async (page, requests) => {
    assert.equal(requests.some(name => name.includes('position-auto-scroll')), false);
    await startDrag(page);
    await pointAt(page, 'bottom');
    await page.waitForFunction(() => document.querySelector('#scroller').scrollTop > 80);
    assert.equal(requests.some(name => name.includes('position-auto-scroll')), true);
    const first = await scrollTop(page);
    await page.waitForFunction(first => document.querySelector('#scroller').scrollTop > first + 50, first);
    assert.equal(await page.evaluate(() => {
        const source = document.querySelector('#source');
        const reference = source.position.reference;
        return reference?.container === document.querySelector('#scroller') && reference.element.isConnected;
    }), true);
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('#source').position.autoScroll);
    const stopped = await scrollTop(page);
    await page.waitForTimeout(100);
    assert.equal(await scrollTop(page), stopped);
}));

test('scrolling stops when the pointer returns to the center', () => fixture(async page => {
    await startDrag(page);
    await pointAt(page, 'bottom');
    await page.waitForFunction(() => document.querySelector('#scroller').scrollTop > 60);
    await pointAt(page, 'middle');
    await page.waitForTimeout(40);
    const stopped = await scrollTop(page);
    await page.waitForTimeout(150);
    assert.equal(await scrollTop(page), stopped);
    await page.mouse.up();
}));

test('the top edge scrolls upward', () => fixture(async page => {
    await page.locator('#scroller').evaluate(node => node.scrollTo({ top: 400, behavior: 'instant' }));
    await startDrag(page);
    await pointAt(page, 'top');
    await page.waitForFunction(() => document.querySelector('#scroller').scrollTop < 320);
    await page.mouse.up();
}));

test('nested containers scroll the inner container before the outer container', () => fixture(async page => {
    await startDrag(page);
    await pointAt(page, 'bottom');
    await page.waitForFunction(() => document.querySelector('#scroller').scrollTop > 60);
    assert.equal(await page.locator('#outer').evaluate(node => node.scrollTop), 0);
    await page.locator('#scroller').evaluate(node => node.scrollTo({ top: node.scrollHeight, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('#outer').scrollTop > 30);
    await page.mouse.up();
}, { nested: true }));

test('speed increases as the pointer approaches the edge', async () => {
    const distances = [];
    for (const inset of [35, 3]) {
        await fixture(async page => {
            await startDrag(page);
            await pointAt(page, 'bottom', inset);
            await page.waitForFunction(() => document.querySelector('#scroller').scrollTop > 0);
            const before = await scrollTop(page);
            await page.waitForTimeout(200);
            distances.push(await scrollTop(page) - before);
            await page.mouse.up();
        });
    }
    assert.ok(distances[1] > distances[0] * 2, `expected faster scrolling near the edge: ${distances}`);
});

test('cloning retains its source while auto-scrolling toward a drop destination', () => fixture(async page => {
    await startDrag(page);
    await pointAt(page, 'bottom');
    await page.waitForFunction(() => document.querySelector('#scroller').scrollTop > 60);
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#scroller .card'));
    assert.equal(await page.locator('#scope > header > .card').count(), 1);
    assert.equal(await page.locator('#scroller .card').count(), 1);
}, { clone: true }));

test('blur and source removal stop an active scroll loop', async () => {
    for (const remove of [false, true]) await fixture(async page => {
        await startDrag(page);
        await pointAt(page, 'bottom');
        await page.waitForFunction(() => document.querySelector('#scroller').scrollTop > 60);
        await page.evaluate(remove => {
            if (remove) document.querySelector('#source').remove();
            else window.dispatchEvent(new Event('blur'));
        }, remove);
        await page.waitForTimeout(40);
        const stopped = await scrollTop(page);
        await page.waitForTimeout(150);
        assert.equal(await scrollTop(page), stopped);
        await page.mouse.up();
    });
});

test('releasing a drag while the auto-scroll chunk loads cannot start a later session', () => fixture(async (page, requests) => {
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    await page.route('**/position-auto-scroll.js', async route => { await delayed; await route.continue(); });
    const requested = page.waitForRequest(request => request.url().includes('position-auto-scroll'));
    try {
        await startDrag(page);
        await pointAt(page, 'bottom');
        await requested;
        assert.equal(requests.some(name => name.includes('position-auto-scroll')), true);
        await page.mouse.up();
    } finally { release(); }
    await page.waitForTimeout(150);
    assert.equal(await scrollTop(page), 0);
    assert.equal(await page.evaluate(() => !!document.querySelector('#source').position.autoScroll), false);
}));

test('the viewport scrolls at its edge and respects a page scroll lock', async () => {
    for (const locked of [false, true]) await fixture(async page => {
        await page.evaluate(locked => {
            document.body.style.minHeight = '2000px';
            if (locked) document.body.style.overflow = 'hidden';
        }, locked);
        await startDrag(page);
        await page.mouse.move(700, 697);
        if (locked) {
            await page.waitForTimeout(200);
            assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0);
        } else {
            await page.waitForFunction(() => document.scrollingElement.scrollTop > 60);
        }
        await page.mouse.up();
    });
});

for (const scale of [1, 0.75]) {
    test(`same-origin iframe drop containers auto-scroll with frame scale ${scale}`, () => fixture(async page => {
        await page.evaluate(async scale => {
            const scope = document.querySelector('#scope');
            scope.setAttribute('droppable-query', '#frame $contentDocument .drop');
            document.querySelector('#scroller').remove();
            window.dragSource = document.querySelector('#source');
            const frame = document.createElement('iframe');
            frame.id = 'frame';
            frame.style.cssText = `margin:40px 80px;width:300px;height:260px;border:4px solid;transform:scale(${scale});transform-origin:top left`;
            frame.srcdoc = '<!doctype html><style>body{margin:0}.drop{width:260px;height:220px;overflow-y:auto}.row{height:44px}</style><div class="drop">' +
                Array.from({ length: 30 }, (_, index) => `<div class="row">frame item ${index}</div>`).join('') + '</div>';
            const ready = new Promise(resolve => frame.onload = resolve);
            scope.append(frame);
            await ready;
        }, scale);
        await startDrag(page);
        await page.mouse.move(150, 50);
        const box = await page.frameLocator('#frame').locator('.drop').boundingBox();
        const pointer = { x: box.x + box.width / 2, y: box.y + box.height - 3 };
        await page.mouse.move(pointer.x, pointer.y);
        await page.waitForFunction(() => document.querySelector('#frame').contentDocument.querySelector('.drop').scrollTop > 60);
        assert.equal(await page.evaluate(() => dragSource.position.reference.document ===
            document.querySelector('#frame').contentDocument), true);
        const ghost = await page.locator('.position-moving-preview').boundingBox();
        const offset = await page.evaluate(() => dragSource.position.clickedInfo.x);
        assert.ok(Math.abs(ghost.x - (pointer.x - offset)) < 2, 'the preview must retain its pointer offset across frame coordinates');
        await page.mouse.up();
        assert.equal(await page.evaluate(() => !!dragSource.position.autoScroll), false);
    }));
}

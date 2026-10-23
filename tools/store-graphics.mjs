// Google Play's graphics: phone screenshots (1080×1920) of the demo, and the feature graphic
// (1024×500). Run `npm run build` first. Usage: node tools/store-graphics.mjs [out-dir]
// (then tools/make-icons.py makes store/icon-512.png; Play wants PNGs without transparency,
// which `python3 tools/flatten.py` sees to)
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'

const out = resolve(process.argv[2] ?? 'store')
mkdirSync(join(out, 'screenshots'), { recursive: true })
const dist = resolve('dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  let path = decodeURIComponent((req.url ?? '/').split('?')[0])
  if (path === '/') path = '/index.html'
  try {
    const body = await readFile(join(dist, path))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(0)
const base = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch()

async function shot(name, path, { dark = false, before, width = 360, height = 640 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true, timezoneId: 'Europe/London', locale: 'en-GB' })
  await context.clock.install({ time: new Date(2026, 9, 23, 10, 0) })
  await context.addInitScript(() => sessionStorage.getItem('setup') || localStorage.setItem('taskhaven.demo', 'true'))
  const page = await context.newPage()
  // "{Home}/list": a project by its title (the demo's ids are the server's numbers)
  if (path.includes('{')) {
    await page.goto(base)
    await page.waitForSelector('main')
    for (const [, title] of path.matchAll(/\{([^}]+)\}/g)) {
      const href = await page.locator('.sidebar a.name', { hasText: new RegExp(`^${title}$`) }).first().getAttribute('href')
      path = path.replace(`{${title}}`, href.replace(/^#/, ''))
    }
  }
  await page.goto(`${base}#${path}`)
  await page.waitForSelector('main, .setup')
  await page.waitForTimeout(400)
  if (before) await before(page)
  await page.waitForTimeout(300)
  const file = join(out, 'screenshots', `${name}.png`)
  await page.screenshot({ path: file })
  await context.close()
  console.log(`  screenshots/${name}.png`)
  return file
}

await shot('1-overview', '/')
await shot('2-project', '{Home}/list')
await shot('3-kanban', '{Home}/kanban')
await shot('4-task', '{Home}/list', {
  before: async (p) => {
    await p.locator('.task-row', { hasText: 'Take out the bins' }).click()
    await p.locator('.task-page').waitFor()
  },
})
await shot('5-share', '{Home}/share', { before: (p) => p.getByLabel('Username').fill('jordan') })
await shot('6-server', '/', {
  before: async (p) => {
    await p.evaluate(() => {
      sessionStorage.setItem('setup', '1')
      localStorage.removeItem('taskhaven.demo')
    })
    await p.reload()
    await p.getByText('I have a server').click()
    await p.getByLabel('Server address').fill('192.168.1.20:3456')
  },
})
await shot('7-quick-add', '/', { before: (p) => p.getByLabel('New task').fill('Take out the bins every tuesday at 7pm *chores @sam') })
const darkFile = await shot('8-dark', '{Home}/list', { dark: true })

// the feature graphic: the name and what it's for, beside the app
const phone = readFileSync(await shot('_feature-phone', '/', { width: 360, height: 700 })).toString('base64')
const icon = readFileSync(resolve('art/icon.svg'), 'utf8')
void darkFile
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })
await page.setContent(`<!doctype html><html><head><style>
  body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: system-ui, sans-serif;
    background: radial-gradient(circle at 15% 20%, #ff9a6b, #f2683a 45%, #d9532a); color: #fff; position: relative; }
  .text { position: absolute; left: 64px; top: 120px; width: 520px; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 54px; font-weight: 800; letter-spacing: -0.02em; }
  .brand svg { width: 76px; height: 76px; filter: drop-shadow(0 6px 14px rgba(0,0,0,.18)); }
  .brand svg rect:first-child { fill: #fff; } .brand svg rect:nth-child(2), .brand svg path { stroke: #f2683a; }
  p { margin: 26px 0 0; font-size: 30px; line-height: 1.3; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.12); }
  .phone { position: absolute; right: 70px; top: 46px; width: 300px; padding: 9px; border-radius: 40px; background: #17171a;
    box-shadow: 0 30px 60px rgba(60, 20, 0, .4); transform: rotate(4deg); }
  .phone img { display: block; width: 300px; border-radius: 32px; }
</style></head><body>
  <div class="text"><div class="brand">${icon}TaskHaven</div><p>Your family’s to-do lists,<br>on your own server.</p></div>
  <div class="phone"><img src="data:image/png;base64,${phone}"></div>
</body></html>`)
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, 'feature-graphic.png') })
console.log('  feature-graphic.png')
await browser.close()
server.close()

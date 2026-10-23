// Screenshots of the demo family (for the README and for checking the screens by eye).
// Builds nothing: run `npm run build` first. Usage: node tests/shots.mjs [out-dir]
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const out = resolve(process.argv[2] ?? '.build/shots')
mkdirSync(out, { recursive: true })
const dist = resolve('dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined })
const errors = []

async function shoot(name, path, { width = 412, height = 915, dark = false, scale = 2, before } = {}) {
  const context = await browser.newContext({ timezoneId: 'Europe/London', locale: 'en-GB', viewport: { width, height }, deviceScaleFactor: scale, colorScheme: dark ? 'dark' : 'light', hasTouch: width < 700, isMobile: width < 700 })
  await context.clock.install({ time: new Date(2026, 9, 23, 10, 0) })
  // (the setup screen is the one shown without the demo)
  await context.addInitScript(() => sessionStorage.getItem('setup') || localStorage.setItem('taskhaven.demo', 'true'))
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  // "{Home}/list": a project by its title (the demo's ids are the server's numbers)
  if (path.includes('{')) {
    await page.goto(base)
    await page.waitForSelector('main', { timeout: 10000 })
    for (const [, title] of path.matchAll(/\{([^}]+)\}/g)) {
      const href = await page.locator('.sidebar a.name', { hasText: new RegExp(`^${title}$`) }).first().getAttribute('href')
      path = path.replace(`{${title}}`, href.replace(/^#/, ''))
    }
  }
  await page.goto(`${base}#${path}`)
  await page.waitForSelector('main, .setup', { timeout: 10000 })
  await page.waitForTimeout(400)
  if (before) await before(page)
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(out, `${name}.png`) })
  await context.close()
  console.log(`  ${name}.png`)
}

const shots = process.env.ONLY ? process.env.ONLY.split(',') : null
const want = (n) => !shots || shots.includes(n)

if (want('home')) await shoot('home', '/')
if (want('list')) await shoot('list', '{Home}/list')
if (want('task')) {
  await shoot('task', '{Home}/list', {
    before: async (page) => {
      await page.locator('.task-row', { hasText: 'Take out the bins' }).click()
      await page.locator('.task-page').waitFor()
      await page.waitForTimeout(300)
    },
  })
}
if (want('share')) await shoot('share', '{Home}/share')
if (want('setup')) {
  await shoot('setup', '/', {
    before: async (page) => {
      await page.evaluate(() => {
        sessionStorage.setItem('setup', '1')
        localStorage.removeItem('taskhaven.demo')
      })
      await page.reload()
      await page.getByText('I have a server').click()
      await page.getByLabel('Server address').fill('192.168.1.20:3456')
    },
  })
}
if (want('desktop-kanban')) await shoot('desktop-kanban', '{Home}/kanban', { width: 1280, height: 760, scale: 1 })

await browser.close()
server.close()
if (errors.length) {
  console.error('Errors on the page:\n' + errors.join('\n'))
  process.exit(1)
}

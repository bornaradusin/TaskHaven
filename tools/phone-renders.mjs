// Renders of TaskHaven on a phone (the demo family, in an Android phone frame), for showing it.
// Run `npm run build` first. Usage: node tools/phone-renders.mjs [out-dir]
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const out = resolve(process.argv[2] ?? '.build/phones')
mkdirSync(out, { recursive: true })
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

const W = 393
const H = 852 // a 20:9 phone, less the status and gesture bars

async function screen(path, { dark = false, before } = {}) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true, timezoneId: 'Europe/London', locale: 'en-GB' })
  await context.clock.install({ time: new Date(2026, 9, 23, 10, 0) })
  await context.addInitScript(() => localStorage.setItem('taskhaven.demo', 'true'))
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
  await page.waitForSelector('main')
  await page.waitForTimeout(400)
  if (before) await before(page)
  await page.waitForTimeout(300)
  const png = await page.screenshot()
  await context.close()
  return { png: png.toString('base64'), dark }
}

const wifi = (c) => `<svg width="17" height="13" viewBox="0 0 17 13"><path d="M8.5 12.5 0.8 4.3A11 11 0 0 1 16.2 4.3Z" fill="${c}"/></svg>`
const battery = (c) => `<svg width="26" height="13" viewBox="0 0 26 13"><rect x="0.5" y="0.5" width="22" height="12" rx="3.5" fill="none" stroke="${c}" opacity=".5"/><rect x="2.5" y="2.5" width="15" height="8" rx="2" fill="${c}"/><rect x="23.5" y="4" width="2" height="5" rx="1" fill="${c}" opacity=".5"/></svg>`
const signal = (c) => `<svg width="16" height="13" viewBox="0 0 16 13"><path d="M15 0.5V12.5H1Z" fill="${c}"/></svg>`

function phone({ png, dark }, caption) {
  const bg = dark ? '#121315' : '#f4f4f2'
  const fg = dark ? '#e9eaec' : '#1f2328'
  return `<figure>
  <div class="phone">
    <div class="screen" style="background:${bg}">
      <div class="status" style="color:${fg}"><b>10:00</b><span class="cam"></span><span class="icons">${wifi(fg)}${signal(fg)}${battery(fg)}</span></div>
      <img src="data:image/png;base64,${png}" width="${W}" height="${H}">
      <div class="nav"><span style="background:${fg}"></span></div>
    </div>
    <span class="btn power"></span><span class="btn vol"></span>
  </div>
  <figcaption>${caption}</figcaption>
</figure>`
}

async function sheet(name, phones, title) {
  const page = await browser.newPage({ viewport: { width: 1840, height: 1160 }, deviceScaleFactor: 2 })
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; padding: 56px 40px 40px; font: 15px system-ui, sans-serif; background: radial-gradient(circle at 30% 0%, #fff4ee, #ece8e4 60%, #e2ddd8); }
    h1 { margin: 0 0 34px; text-align: center; font-size: 26px; font-weight: 700; color: #2a2522; }
    h1 b { color: #e0592b; }
    .row { display: flex; justify-content: center; gap: 40px; }
    figure { margin: 0; display: grid; justify-items: center; gap: 18px; }
    figcaption { color: #5b524c; font-weight: 600; font-size: 16px; }
    .phone { position: relative; padding: 11px; border-radius: 54px; background: linear-gradient(145deg, #3a3a3e, #121214); box-shadow: 0 30px 60px rgba(40, 20, 10, .28), 0 4px 10px rgba(0,0,0,.25), inset 0 0 0 1.5px #55555a; }
    .screen { position: relative; width: ${W}px; border-radius: 44px; overflow: hidden; }
    .status { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 26px 0 30px; font-size: 14px; position: relative; }
    .status .icons { display: flex; gap: 6px; align-items: center; }
    .cam { position: absolute; left: 50%; top: 10px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: #0b0b0c; box-shadow: inset 0 0 0 3px #1d1d20; }
    .screen img { display: block; }
    .nav { height: 22px; display: grid; place-items: center; }
    .nav span { width: 110px; height: 4px; border-radius: 3px; opacity: .55; }
    .btn { position: absolute; right: -3px; width: 4px; border-radius: 2px; background: #2a2a2d; }
    .power { top: 190px; height: 70px; } .vol { top: 290px; height: 120px; }
  </style></head><body><h1>${title}</h1><div class="row">${phones.join('')}</div></body></html>`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, `${name}.png`) })
  await page.close()
  console.log(`  ${name}.png`)
}

const overview = await screen('/')
const list = await screen('{Home}/list')
const kanban = await screen('{Home}/kanban')
const task = await screen('{Home}/list', {
  before: async (p) => {
    await p.locator('.task-row', { hasText: 'Take out the bins' }).click()
    await p.locator('.task-page').waitFor()
  },
})
await sheet('phones-1', [phone(overview, 'Overview'), phone(list, 'A project'), phone(kanban, 'Kanban board'), phone(task, 'A task')], '<b>TaskHaven</b> on a phone')

const menu = await screen('/', { before: (p) => p.click('.menu-button') })
const share = await screen('{Home}/share')
const upcoming = await screen('/upcoming')
const dark = await screen('{Home}/list', { dark: true })
await sheet('phones-2', [phone(menu, 'The menu'), phone(share, 'Sharing by username'), phone(upcoming, 'Upcoming'), phone(dark, 'Dark mode')], '<b>TaskHaven</b> on a phone')

const quick = await screen('/', { before: async (p) => { await p.getByLabel('New task').fill('Take out the bins every tuesday at 7pm *chores @sam') } })
const add = await screen('{Groceries}/list')
const gantt = await screen('{Garden}/gantt')
const setup = await (async () => {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto(base)
  await page.getByText('I have a server').click()
  await page.getByLabel('Server address').fill('192.168.1.20:3456')
  await page.waitForTimeout(300)
  const png = (await page.screenshot()).toString('base64')
  await context.close()
  return { png, dark: false }
})()
await sheet('phones-3', [phone(setup, 'Your server'), phone(quick, 'Quick add'), phone(add, 'Groceries'), phone(gantt, 'Gantt chart')], '<b>TaskHaven</b> on a phone')

await browser.close()
server.close()

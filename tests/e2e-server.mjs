// The app in a browser against a real Vikunja server: VIKUNJA_URL=http://127.0.0.1:3456 npm run e2e:server
// (the server must take new accounts, and let pages from http://127.0.0.1 in: Vikunja's default
// CORS setting does). Run `npm run build` first. Each run makes two new accounts.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const SERVER = (process.env.VIKUNJA_URL ?? '').replace(/\/+$/, '')
if (!SERVER) {
  console.log('VIKUNJA_URL isn’t set: skipped.')
  process.exit(0)
}
const API = `${SERVER}/api/v1`
const tag = Math.random().toString(36).slice(2, 7)
const me = `kim_${tag}`
const partner = `lee_${tag}`

const dist = resolve('dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const web = createServer(async (req, res) => {
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
})
await new Promise((r) => web.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${web.address().port}/`

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`)
  return json
}

// the partner has an account already (made the way the server's own web pages make one)
await api('POST', '/register', { username: partner, email: `${partner}@example.com`, password: 'secret-password' })
const partnerToken = (await api('POST', '/login', { username: partner, password: 'secret-password' })).token

const browser = await chromium.launch()
const errors = []
let passed = 0
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' })
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (e) => errors.push(e.message))
// (refusals the app shows in words are 4xx; a 500 is the server's SQLite being busy, which the
// app tries again, and the step fails if that didn't work)
page.on('console', (m) => m.type() === 'error' && !/status of (4\d\d|500)/.test(m.text()) && errors.push(m.text()))

async function step(name, work) {
  try {
    await work()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e) {
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/server-fail-${passed}.png` }).catch(() => undefined)
    console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`)
    errors.push(`${name}: ${e.message.split('\n')[0]}`)
  }
}

let homePath = ''

await step('connects to the server and makes an account', async () => {
  await page.goto(base)
  await page.getByText('I have a server').click()
  await page.getByLabel('Server address').fill(SERVER)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByText(/Vikunja v?\d/).waitFor()
  await page.getByRole('button', { name: 'Create account' }).first().click()
  await page.getByLabel('Username').fill(me)
  await page.getByLabel('Email').fill(`${me}@example.com`)
  await page.getByLabel('Password').fill('secret-password')
  await page.locator('form').getByRole('button', { name: 'Create account' }).click()
  await page.getByText(`Good`).first().waitFor()
  // a new account has its Inbox, from the server
  await page.locator('.sidebar a.name', { hasText: 'Inbox' }).waitFor()
})

await step('quick add puts a task in the Inbox, on the server', async () => {
  await page.getByLabel('New task').fill('Book the dentist tomorrow at 9am !3')
  await page.getByLabel('New task').press('Enter')
  await page.locator('.task-row', { hasText: 'Book the dentist' }).waitFor()
  const mine = (await api('POST', '/login', { username: me, password: 'secret-password' })).token
  const tasks = await api('GET', '/tasks', null, mine)
  const t = tasks.find((x) => x.title === 'Book the dentist')
  assert.ok(t, 'not on the server')
  assert.equal(t.priority, 3)
  assert.equal(new Date(t.due_date).getHours(), 9)
})

await step('a new project, with tasks, shared by username', async () => {
  await page.goto(`${base}#/projects/new`)
  await page.locator('input[placeholder^="Home, Groceries"]').fill(`Home ${tag}`)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.locator('h1', { hasText: `Home ${tag}` }).waitFor()
  homePath = (await page.evaluate(() => location.hash)).replace(/^#/, '').replace(/\/(list|kanban|table|gantt)$/, '')
  await page.getByLabel('New task').fill('Take out the bins *chores')
  await page.getByLabel('New task').press('Enter')
  await page.locator('.task-row', { hasText: 'Take out the bins' }).getByText('Chores').waitFor()
  await page.getByLabel('New task').fill('Clean the oven')
  await page.getByLabel('New task').press('Enter')
  await page.locator('.task-row', { hasText: 'Clean the oven' }).waitFor()
  await page.goto(`${base}#${homePath}/share`)
  await page.getByLabel('Username').fill(partner)
  await page.locator('form.add').first().getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByText(`Shared with ${partner}.`).waitFor()
  const theirs = await api('GET', '/projects', null, partnerToken)
  assert.ok(theirs.some((p) => p.title === `Home ${tag}`), 'the partner doesn’t see it')
})

await step('assigning the partner tells them (on the server)', async () => {
  await page.goto(`${base}#${homePath}/list`)
  await page.locator('.task-row', { hasText: 'Take out the bins' }).click()
  await page.locator('.action', { hasText: 'Assign' }).click()
  await page.locator('#field-assignees').getByRole('button', { name: 'Assign' }).click()
  await page.locator('.menu .item', { hasText: partner }).click()
  await page.locator('#field-assignees .who', { hasText: partner }).waitFor()
  let found = false
  for (let i = 0; i < 20 && !found; i++) {
    const notices = await api('GET', '/notifications', null, partnerToken)
    found = notices.some((n) => n.name === 'task.assigned')
    if (!found) await new Promise((r) => setTimeout(r, 300))
  }
  assert.ok(found, 'no notification')
})

await step('the partner’s change shows after checking the server', async () => {
  const tasks = await api('GET', '/tasks', null, partnerToken)
  const oven = tasks.find((t) => t.title === 'Clean the oven')
  await api('POST', `/tasks/${oven.id}`, { ...oven, title: 'Clean the oven and the hob' }, partnerToken)
  await page.goto(`${base}#${homePath}/list`)
  await page.getByRole('button', { name: 'Check for changes' }).click()
  await page.locator('.task-row', { hasText: 'Clean the oven and the hob' }).waitFor()
})

await step('the board: columns from the server, and Done marks a task done', async () => {
  await page.goto(`${base}#${homePath}/kanban`)
  await page.locator('.col-title').first().waitFor()
  const done = page.locator('.column', { has: page.locator('.done-mark') })
  await done.waitFor()
  const card = page.locator('.kcard', { hasText: 'Clean the oven' })
  const from = await card.boundingBox()
  const to = await done.locator('.cards').boundingBox()
  await page.mouse.move(from.x + 40, from.y + 20)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 })
  await page.mouse.move(to.x + 60, to.y + 30, { steps: 12 })
  await page.mouse.up()
  await done.locator('.kcard', { hasText: 'Clean the oven' }).waitFor()
  let isDone = false
  for (let i = 0; i < 10 && !isDone; i++) {
    const tasks = await api('GET', '/tasks', null, partnerToken)
    isDone = tasks.find((t) => t.title.startsWith('Clean the oven'))?.done === true
    if (!isDone) await new Promise((r) => setTimeout(r, 300))
  }
  assert.ok(isDone, 'not done on the server')
})

await step('a repeating task comes back with its next date', async () => {
  await page.goto(`${base}#${homePath}/list`)
  await page.getByLabel('New task').fill('Water the plants every day')
  await page.getByLabel('New task').press('Enter')
  const row = page.locator('.task-row', { hasText: 'Water the plants' })
  await row.waitFor()
  await row.getByRole('checkbox').click()
  await page.getByText('it’s back for next time').waitFor()
})

await step('settings: the server, a name, the theme, kept on the server', async () => {
  await page.goto(`${base}#/settings`)
  await page.getByText(/Vikunja v?\d/).waitFor()
  await page.getByText('connected').waitFor()
  await page.getByLabel('Name').fill('Kim Tanaka')
  await page.getByLabel('Name').press('Enter')
  await page.getByText('Saved.').waitFor()
  await page.getByRole('button', { name: 'Dark' }).click()
  const mine = (await api('POST', '/login', { username: me, password: 'secret-password' })).token
  let user = null
  for (let i = 0; i < 20; i++) {
    user = await api('GET', '/user', null, mine)
    if (user.settings.frontend_settings?.taskhaven?.theme === 'dark') break
    await new Promise((r) => setTimeout(r, 250))
  }
  assert.equal(user.name, 'Kim Tanaka')
  assert.equal(user.settings.frontend_settings?.taskhaven?.theme, 'dark')
})

await step('signs out and in again, and the data is still there', async () => {
  await page.getByLabel('Your account').click()
  await page.locator('.menu .item', { hasText: 'Sign out' }).click()
  await page.getByLabel('Username or email').fill(`${me}@example.com`)
  await page.getByLabel('Password').fill('secret-password')
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
  await page.locator('.sidebar a.name', { hasText: `Home ${tag}` }).waitFor()
  // reopening the app: still signed in
  await page.reload()
  await page.locator('.sidebar a.name', { hasText: `Home ${tag}` }).waitFor()
})

await browser.close()
web.close()
console.log(`\n${passed} passed${errors.length ? `, problems:\n  ${errors.join('\n  ')}` : ''}`)
process.exit(errors.length ? 1 : 0)

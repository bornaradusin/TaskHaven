// Goes through the app in a browser (the demo family, on a server in memory): every screen, and
// the main things people do. Fails on any error on the page. Run `npm run build` first.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import assert from 'node:assert/strict'

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
const errors = []
let passed = 0

async function fresh(width = 1280, height = 900, demo = true, expected = []) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'Europe/London', locale: 'en-GB' })
  await context.clock.install({ time: new Date(2026, 9, 23, 10, 0) })
  if (demo) await context.addInitScript(() => localStorage.setItem('taskhaven.demo', 'true'))
  const page = await context.newPage()
  page.setDefaultTimeout(6000)
  page.on('pageerror', (e) => errors.push(e.message))
  // (some errors are what a step checks for: an address where nothing answers)
  page.on('console', (m) => m.type() === 'error' && !expected.some((e) => m.text().includes(e)) && errors.push(m.text()))
  page.on('dialog', (d) => d.dismiss())
  return { context, page }
}

let current = null
async function step(name, work) {
  try {
    await work()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e) {
    if (current && process.env.SHOTS) await current.screenshot({ path: `${process.env.SHOTS}/fail-${passed + errors.length}.png` }).catch(() => undefined)
    console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`)
    errors.push(`${name}: ${e.message.split('\n')[0]}`)
  }
}

const go = async (page, path) => {
  await page.goto(`${base}#${path}`)
  await page.waitForSelector('main')
}

/** A project's page by its title (the demo's ids are the server's numbers). */
async function projectPath(page, title) {
  const href = await page.locator('.sidebar a.name', { hasText: new RegExp(`^${title}$`) }).first().getAttribute('href')
  return href.replace(/^#/, '')
}

/** A project's view, by the project's title. */
async function openProject(page, title, view = 'list') {
  if (!(await page.locator('.sidebar').count())) await go(page, '/')
  await go(page, `${await projectPath(page, title)}/${view}`)
}

/** A task's page, from its project's list. */
async function openTask(page, project, title) {
  await openProject(page, project)
  await page.locator('.task-row', { hasText: title }).first().click()
  await page.locator('.task-page').waitFor()
}

// ---- the first start ----
{
  const { context, page } = await fresh(412, 900, false, ['ERR_CONNECTION_REFUSED'])
  current = page
  await step('the first start asks for a server (https over the internet), or the demo', async () => {
    await page.goto(base)
    await page.getByText('I have a server').waitFor()
    await page.getByText('I don’t have one yet').click()
    await page.getByText('vikunja.io/docs').waitFor()
    await page.getByRole('button', { name: 'I have a server' }).click()
    await page.getByLabel('Server address').fill('http://tasks.example.com')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByText('must use https://').waitFor()
    // nothing answers there: it says so
    await page.getByLabel('Server address').fill('127.0.0.1:59999')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByText('Can’t reach http://127.0.0.1:59999').waitFor()
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByText('Try the demo').click()
    await page.getByText('Good morning, Alex!').waitFor()
  })
  await context.close()
}

const { page } = await fresh()
current = page

await step('overview shows current tasks and the last viewed projects', async () => {
  await go(page, '/')
  await page.getByText('Current tasks').waitFor()
  assert.ok(await page.getByText('Pay the electricity bill').isVisible())
  assert.equal(await page.locator('.project-card').count(), 4)
})

await step('quick add makes a task with a label, a person and a date', async () => {
  await page.getByLabel('New task').fill('Buy light bulbs tomorrow at 5pm *shopping @sam +Home !3')
  await page.locator('.hints', { hasText: 'Tomorrow at 17:00' }).waitFor()
  await page.getByLabel('New task').press('Enter')
  await page.locator('.task-row', { hasText: 'Buy light bulbs' }).waitFor()
  const row = page.locator('.task-row', { hasText: 'Buy light bulbs' })
  assert.ok(await row.getByText('Shopping').isVisible())
  assert.ok(await row.getByText('Tomorrow at 17:00').isVisible())
  assert.ok(await row.getByText('HOME-11').isVisible())
})

await step('ticking a task off, and undoing it', async () => {
  const row = page.locator('.task-row', { hasText: 'Buy light bulbs' })
  await row.getByRole('checkbox').click()
  await page.getByText('“Buy light bulbs” is done.').waitFor()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.task-row', { hasText: 'Buy light bulbs' }).getByRole('checkbox').getAttribute('aria-checked'), 'false')
})

await step('a repeating task comes back with its next date', async () => {
  await openProject(page, 'Home')
  const row = page.locator('.task-row', { hasText: 'Clean the bathroom' })
  await row.getByText('In 2 days').waitFor()
  await row.getByRole('checkbox').click()
  await page.getByText('it’s back for next time').waitFor()
  await page.locator('.task-row', { hasText: 'Clean the bathroom' }).getByText('In a week').waitFor()
})

await step('the task page: title, priority, due date, labels, comment', async () => {
  await page.locator('.task-row', { hasText: 'Book the boiler service' }).click()
  await page.getByLabel('Title').waitFor()
  await page.getByLabel('Title').fill('Book the boiler service (annual)')
  await page.getByLabel('Title').press('Enter')
  await page.locator('.action', { hasText: 'Due date' }).click()
  await page.locator('.date-button').first().click()
  await page.locator('.picker .item', { hasText: 'Next Monday' }).click()
  await page.getByText('Mon 26 Oct, 12:00').waitFor()
  await page.locator('.action', { hasText: 'Priority' }).click()
  await page.locator('#field-priority select').selectOption('4')
  await page.getByLabel('Add a label').fill('Bills')
  await page.getByLabel('Add a label').press('Enter')
  await page.locator('#field-labels .chip', { hasText: 'Bills' }).waitFor()
  await page.locator('.comments .area').click()
  await page.keyboard.type('Called them, booked for Monday.')
  await page.getByRole('button', { name: 'Comment' }).click()
  await page.locator('.comment', { hasText: 'Called them, booked for Monday.' }).waitFor()
  await openProject(page, 'Home')
  const row = page.locator('.task-row', { hasText: 'Book the boiler service (annual)' })
  await row.getByText('!Urgent').waitFor()
})

await step('the description editor saves a checklist', async () => {
  await openTask(page, 'Home', 'Water the plants')
  await page.getByText('Add a description…').click()
  await page.locator('.description').getByTitle('Checklist').click()
  await page.keyboard.type('Living room')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Bedroom')
  await page.locator('.description').getByRole('button', { name: 'Save' }).click()
  await page.locator('.description li[data-checked="false"]', { hasText: 'Bedroom' }).waitFor()
  // ticking it in place
  const box = await page.locator('.description li', { hasText: 'Living room' }).boundingBox()
  await page.mouse.click(box.x + 6, box.y + box.height / 2)
  await page.locator('.description li[data-checked="true"]', { hasText: 'Living room' }).waitFor()
})

await step('reminders and repeats', async () => {
  await page.locator('.action', { hasText: 'Reminders' }).click()
  await page.locator('#field-reminders').getByRole('button', { name: 'Add' }).click()
  await page.locator('#field-reminders').getByText('1 hour before the due date').waitFor()
  await page.locator('#field-repeat').getByRole('button', { name: 'Change' }).click()
  await page.locator('#field-repeat').getByRole('button', { name: 'Every 2 weeks' }).click()
  await page.locator('#field-repeat').getByText('Every 2 weeks', { exact: true }).last().waitFor()
})

await step('relating two tasks shows on both', async () => {
  await page.locator('.action', { hasText: 'Relate a task' }).click()
  await page.getByLabel('Kind of relation').selectOption('subtask')
  await page.getByLabel('Find a task').fill('kettle')
  await page.locator('.results .item', { hasText: 'Descale the kettle' }).click()
  await page.locator('.relations', { hasText: 'Descale the kettle' }).waitFor()
  await page.locator('.relations a', { hasText: 'Descale the kettle' }).click()
  await page.locator('.relations', { hasText: 'Parent tasks' }).waitFor()
})

await step('the kanban board: drag a card to Done', async () => {
  await openProject(page, 'Home', 'kanban')
  const card = page.locator('.kcard', { hasText: 'Pay the electricity bill' })
  const done = page.locator('.column', { hasText: 'Done' }).first().locator('.cards')
  const from = await card.boundingBox()
  const to = await done.boundingBox()
  await page.mouse.move(from.x + 40, from.y + 20)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 })
  await page.mouse.move(to.x + 60, to.y + 30, { steps: 12 })
  await page.mouse.up()
  await page.locator('.column', { hasText: 'Done' }).locator('.kcard', { hasText: 'Pay the electricity bill' }).waitFor()
})

await step('the kanban board: a new column, renamed, with a limit', async () => {
  await page.getByLabel('New column').fill('Waiting')
  await page.getByLabel('New column').press('Enter')
  await page.locator('.col-title', { hasText: 'Waiting' }).waitFor()
  await page.getByLabel('Waiting menu').click()
  await page.locator('.menu .item', { hasText: 'Limit' }).click()
  await page.locator('.modal input').fill('2')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.locator('.column', { hasText: 'Waiting' }).getByText('0/2').waitFor()
})

await step('the table: columns and sorting', async () => {
  await openProject(page, 'Home', 'table')
  await page.locator('th', { hasText: 'Due date' }).click()
  const first = await page.locator('tbody tr td.title').first().textContent()
  assert.ok(first && first.length > 0)
  await page.getByRole('button', { name: 'Columns' }).click()
  await page.locator('.columns label', { hasText: 'Created by' }).click()
  await page.locator('th', { hasText: 'Created by' }).waitFor()
})

await step('the Gantt chart shows bars and dots', async () => {
  await openProject(page, 'Garden', 'gantt')
  await page.locator('.bar', { hasText: 'Plant the tulip bulbs' }).waitFor()
  await page.locator('.milestone-wrap', { hasText: 'Mow the lawn' }).waitFor()
  // dragging a bar a day on
  const bar = await page.locator('.bar', { hasText: 'Trim the hedge' }).boundingBox()
  await page.mouse.move(bar.x + 30, bar.y + 10)
  await page.mouse.down()
  await page.mouse.move(bar.x + 30 + 38 * 2, bar.y + 10, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const after = await page.locator('.bar', { hasText: 'Trim the hedge' }).boundingBox()
  assert.equal(Math.round(after.x - bar.x), 76)
})

await step('filters on a view', async () => {
  await openProject(page, 'Home')
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.locator('.filters input.mono').fill('priority >= 3')
  await page.locator('.filters input.mono').press('Tab')
  await page.waitForTimeout(150)
  const rows = await page.locator('.tasks .task-row').count()
  assert.ok(rows >= 1 && rows <= 4, `${rows} rows`)
  await page.locator('.filters input.mono').fill('priority >>')
  await page.locator('.filters input.mono').press('Tab')
  await page.locator('.filters .error-text').waitFor()
  await page.getByRole('button', { name: 'Clear all' }).click()
})

await step('a new project, a sub-project, edited and archived', async () => {
  await go(page, '/projects/new')
  await page.locator('input[placeholder^="Home, Groceries"]').fill('Car')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.locator('h1', { hasText: 'Car' }).waitFor()
  await page.getByLabel('New task').fill('MOT on 12/11')
  await page.getByLabel('New task').press('Enter')
  await page.locator('.task-row', { hasText: 'MOT' }).getByText('CAR-1').waitFor()
  await page.getByLabel('Car menu').first().click()
  await page.locator('.menu .item', { hasText: 'Edit' }).click()
  await page.locator('input[placeholder^="Home, Groceries"]').fill('The car')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.locator('h1', { hasText: 'The car' }).waitFor()
  await page.getByLabel('The car menu').first().click()
  await page.locator('.menu .item', { hasText: 'Archive' }).click()
  await page.getByText('This project is archived').waitFor()
  assert.equal(await page.getByLabel('New task').count(), 0)
})

await step('sharing: by username, with a team, and a link', async () => {
  await go(page, `${await projectPath(page, 'Garden')}/share`)
  await page.locator('.member', { hasText: 'Riley Chen' }).waitFor()
  // others' emails aren't shown; only exact usernames find people
  assert.equal(await page.getByText('riley@example.com').count(), 0)
  const people = page.locator('form.add').first()
  await page.getByLabel('Username').fill('sa')
  await people.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByText('There’s nobody with that username').waitFor()
  await page.getByLabel('Username').fill('sam')
  await people.getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByText('Shared with sam.').waitFor()
  await page.locator('.member', { hasText: 'Sam Morgan' }).waitFor()
  await page.getByLabel('Team', { exact: true }).selectOption({ label: 'Family' })
  await page.locator('form.add').nth(1).getByRole('button', { name: 'Share' }).click()
  await page.getByText('Shared with Family.').waitFor()
  await page.getByLabel('Link name').fill('Neighbours')
  await page.getByRole('button', { name: 'Make a link' }).click()
  await page.locator('.member', { hasText: 'Neighbours' }).waitFor()
  await page.getByLabel('Stop sharing with Sam Morgan').click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.member', { hasText: 'Sam Morgan' }).count(), 0)
})

await step('labels, teams, search, notifications, settings, upcoming, favorites', async () => {
  await go(page, '/labels')
  await page.getByLabel('New label').fill('Pets')
  await page.getByLabel('New label').press('Enter')
  await page.locator('.label-row', { hasText: 'Pets' }).waitFor()
  await go(page, '/teams')
  await page.locator('.team-row', { hasText: 'Family' }).click()
  await page.getByText('Add someone').waitFor()
  await page.getByLabel('Username').fill('riley')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.locator('.member', { hasText: 'Riley Chen' }).waitFor()
  await go(page, '/search')
  await page.getByPlaceholder('Search tasks').fill('HOME-1')
  await page.locator('.task-row', { hasText: 'Take out the bins' }).waitFor()
  await go(page, '/notifications')
  await page.getByText('Sam Morgan commented on “Take out the bins”').waitFor()
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  await page.waitForTimeout(100)
  assert.equal(await page.locator('.notice.unread').count(), 0)
  await go(page, '/settings')
  await page.getByRole('button', { name: 'Dark' }).click()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await page.getByRole('button', { name: 'Light' }).click()
  await go(page, '/upcoming')
  await page.getByText('Overdue').first().waitFor()
  await openProject(page, 'Home')
  await page.locator('.task-row', { hasText: 'Fix the dripping tap' }).hover()
  await page.locator('.task-row', { hasText: 'Fix the dripping tap' }).getByLabel('Star', { exact: true }).click()
  await go(page, '/favorites')
  await page.locator('.task-row', { hasText: 'Fix the dripping tap' }).waitFor()
  await page.locator('.task-row', { hasText: 'Take out the bins' }).waitFor()
})

await step('a saved filter', async () => {
  await go(page, '/filters/new')
  await page.getByRole('button', { name: 'Important' }).click()
  await page.getByRole('button', { name: 'Save filter' }).click()
  await page.locator('h1', { hasText: 'Important' }).waitFor()
  await page.locator('.sidebar .project', { hasText: 'Important' }).waitFor()
})

await step('changing the password', async () => {
  await go(page, '/settings')
  await page.getByRole('button', { name: 'Change password' }).click()
  await page.getByLabel('Your password now').fill('wrong-password')
  await page.getByLabel('A new password').fill('new-password')
  await page.getByRole('button', { name: 'Change it' }).click()
  await page.getByText('don’t match').first().waitFor()
  await page.getByLabel('Your password now').fill('taskhaven')
  await page.getByRole('button', { name: 'Change it' }).click()
  await page.getByText('Your password is changed.').waitFor()
})

await step('signing out and in again', async () => {
  await page.getByLabel('Your account').click()
  await page.locator('.menu .item', { hasText: 'Sign out' }).click()
  await page.getByRole('button', { name: 'Sign in' }).last().waitFor()
  await page.getByLabel('Password').fill('new-password')
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
  await page.getByText('Good morning, Alex!').waitFor()
})

await step('deleting the account asks for the password, then the server emails a link', async () => {
  await go(page, '/settings')
  await page.getByRole('button', { name: 'Delete account' }).click()
  await page.locator('.modal input[type="password"]').fill('wrong')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page.getByText('don’t match').first().waitFor()
  await page.locator('.modal input[type="password"]').fill('new-password')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page.getByText('with a link to confirm').waitFor()
})

// ---- on a phone ----
{
  const { context, page: phone } = await fresh(390, 844)
  await step('on a phone: the menu opens and closes, and the task page fits', async () => {
    await go(phone, '/')
    await phone.getByRole('button', { name: 'Menu', exact: true }).click()
    await phone.locator('.sidebar .nav', { hasText: 'Upcoming' }).click()
    await phone.locator('h1', { hasText: 'Upcoming' }).waitFor()
    assert.equal(await phone.evaluate(() => document.querySelector('.shell')?.classList.contains('menu')), false)
    await openTask(phone, 'Home', 'Take out the bins')
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(wide <= 391, `page is ${wide}px wide`)
  })
  await context.close()
}

await browser.close()
server.close()
console.log(`\n${passed} passed${errors.length ? `, problems:\n  ${errors.join('\n  ')}` : ''}`)
process.exit(errors.length ? 1 : 0)

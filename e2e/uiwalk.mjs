/**
 * Walks the back office the way a data manager would, and fails loudly on any
 * console error, page error, 5xx or missing screen. A build passing proves the
 * code parses; this proves it runs.
 *
 * Needs the API on 8080 against a seeded database, and the built front end
 * served on 4173:
 *
 *   npm run dev:api
 *   cd frontend && VITE_API_URL=http://127.0.0.1:8080/api/v1 npm run build \
 *     && npx vite preview --port 4173
 *   node e2e/uiwalk.mjs [--shots]
 *
 * UI_BASE overrides the front end URL. PW_CHROMIUM points at a Chromium binary
 * where Playwright's own download is not available.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.UI_BASE || 'http://127.0.0.1:4173'
const SHOTS = process.argv.includes('--shots')
const OUT = process.env.UI_SHOTS || 'e2e/shots'
if (SHOTS) mkdirSync(OUT, { recursive: true })

const problems = []
const seen = []

function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const text = m.text()
      // React dev warnings are not what this is looking for.
      if (/Failed to load resource/.test(text)) return
      problems.push(`console: ${text}`)
    }
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`)
  })
}

/**
 * Click a nav item and wait for the screen itself, not merely for a table. The
 * previous screen's table is still in the DOM the instant after a click, and
 * reading it produces a confident wrong answer.
 */
async function go(page, nav, heading) {
  await page.click(`.nav-item:has-text("${nav}")`)
  await page.locator('.topbar h1', { hasText: heading }).first()
    .waitFor({ timeout: 15000 })
  await page.waitForTimeout(350)
}

async function step(page, name, fn) {
  const before = problems.length
  try {
    await fn()
    await page.waitForTimeout(450)
  } catch (e) {
    problems.push(`${name}: ${e.message.split('\n')[0]}`)
    // A failed step often leaves a modal or drawer open, and its backdrop eats
    // every later click. Clear it so one failure reports one failure.
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
  }
  if (SHOTS) {
    await page.screenshot({ path: `${OUT}/${name.replace(/[^a-z0-9]+/gi, '-')}.png`,
                            fullPage: false }).catch(() => {})
  }
  const added = problems.length - before
  seen.push(`${added === 0 ? 'ok  ' : 'FAIL'} ${name}${added ? ` (${added} problem)` : ''}`)
}

const ARGS = ['--no-sandbox', '--disable-background-networking',
              '--disable-component-update', '--disable-sync', '--no-first-run',
              '--disable-features=Translate,OptimizationHints,MediaRouter']
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM, args: ARGS }
                          : { args: ARGS })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
watch(page)

await step(page, 'login', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.fill('input[name="username"], input:not([type="password"])', 'admin')
  await page.fill('input[type="password"]', 'openadms')
  await page.click('button[type="submit"], .btn.primary')
  await page.waitForSelector('.sidebar', { timeout: 15000 })
})

await step(page, 'projects-list', async () => {
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
  const rows = await page.locator('table.data tbody tr').count()
  if (rows < 1) throw new Error('no projects listed')
  const stats = await page.locator('.card.stat').count()
  if (stats < 4) throw new Error('portfolio summary tiles missing')
})

await step(page, 'projects-sort-and-filter', async () => {
  await page.click('th:has-text("Billed")')
  await page.waitForTimeout(400)
  await page.selectOption('.card-head select >> nth=0', 'active')
  await page.waitForTimeout(400)
})

await step(page, 'portfolio-contracts', async () => {
  await go(page, 'Contracts', 'Contracts')
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
})

await step(page, 'contract-detail-drawer', async () => {
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.drawer', { timeout: 10000 })
  // The drawer renders a loading state first, so wait for the content itself
  // rather than for the element.
  await page.locator('.drawer').getByText(/not to exceed/i)
    .first().waitFor({ timeout: 15000 })
  const text = await page.locator('.drawer').innerText()
  if (!/billed across all projects/i.test(text)) {
    throw new Error('NTE burn across projects is missing from the drawer')
  }
  await page.keyboard.press('Escape')
  await page.waitForSelector('.drawer', { state: 'detached', timeout: 10000 })
})

await step(page, 'portfolio-workers', async () => {
  await go(page, 'Workers', 'Workers')
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
  // Table headings are uppercased by CSS, so compare on lowercase.
  const head = (await page.locator('table.data thead').innerText()).toLowerCase()
  for (const col of ['employee id', 'employer', 'last login']) {
    if (!head.includes(col)) throw new Error(`the workers list is missing ${col}`)
  }
})

await step(page, 'worker-paste-import', async () => {
  const stamp = Date.now().toString().slice(-5)
  await page.click('button:has-text("Paste a crew list")')
  await page.waitForSelector('textarea', { timeout: 10000 })
  await page.fill('textarea',
    `Name\tEmployee ID\tEmail\n` +
    `Walk Carter${stamp}\tW${stamp}1\twc${stamp}@example.com\n` +
    `de la Cruz, Ana${stamp}\tW${stamp}2\tac${stamp}@example.com\n` +
    `\tW${stamp}3\tnobody${stamp}@example.com`)
  await page.click('button:has-text("Read it")')
  // The workers table behind the modal is also table.data, so wait for the
  // preview's own summary rather than for any row.
  await page.locator('.modal').getByText(/^Read \d+ rows?/).first()
    .waitFor({ timeout: 20000 })

  const body = await page.locator('.modal').innerText()
  if (!/Read 3 rows/.test(body)) throw new Error('the preview did not read three rows')
  if (!/no name in this row/.test(body)) {
    throw new Error('the unusable row is not explained in plain language')
  }

  // J1: nobody should have to invent a monitor ID. The ones filled in are
  // marked, so they can be trusted at a glance or typed over.
  const filled = await page.locator('.modal input.suggested').count()
  if (filled === 0) throw new Error('nothing was suggested, so IDs are still manual')
  const suggested = await page.locator('.modal input.suggested').first().inputValue()
  if (!suggested) throw new Error('a cell is marked as filled in but is empty')
  // The bad row stays editable rather than being silently dropped.
  const firstCell = page.locator('.modal table.data tbody tr').nth(2).locator('input').first()
  await firstCell.fill(`Fixed${stamp}`)
  await page.waitForTimeout(300)
  const after = await page.locator('.modal').innerText()
  if (!/Import 3 workers/.test(after)) {
    throw new Error('correcting the row did not bring it back into the import')
  }
  await page.click('button:has-text("Import 3 workers")')
  // A modal that stays open is showing a refusal. Report what it says, because
  // "timed out waiting for the modal" names the symptom and not the cause.
  try {
    await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 })
  } catch {
    const refusal = (await page.locator('.modal').innerText())
      .split('\n').map((l) => l.trim())
      .filter((l) => l && !/^Paste a crew list$|^Cancel$|^Import /.test(l))
      .join(' | ')
    throw new Error(`the import did not go through: ${refusal.slice(0, 260)}`)
  }

  await page.fill('.search input', `W${stamp}`)
  await page.waitForTimeout(900)
  const rows = await page.locator('table.data tbody tr').count()
  if (rows !== 3) throw new Error(`expected the three imported workers, saw ${rows}`)
})

await step(page, 'worker-bulk-password', async () => {
  // Only ever the rows this walk created. Selecting all of an unfiltered list
  // would set a password on the demo accounts, which is exactly the mistake
  // this guard exists to make impossible.
  const rows = await page.locator('table.data tbody tr').count()
  if (rows !== 3 || !(await page.locator('.search input').inputValue())) {
    throw new Error('refusing to bulk-set a password on an unfiltered list')
  }
  await page.click('table.data thead input[type="checkbox"]')
  await page.click('button:has-text("Set password for")')
  await page.waitForSelector('.modal', { timeout: 10000 })
  await page.fill('.modal input', 'walkthrough-temp-1')
  await page.click('.modal button:has-text("Set it")')
  await page.waitForSelector('.modal', { state: 'detached', timeout: 10000 })
})

await step(page, 'enter-project', async () => {
  await go(page, 'Projects', 'Projects')
  await page.waitForSelector('table.data tbody tr')
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.nav-item:has-text("Dashboard")', { timeout: 10000 })
})

for (const [label, nav] of [
  ['dashboard', 'Dashboard'],
  ['tickets', 'Tickets'],
  ['project-setup', 'Project Setup'],
  ['rules', 'Rules'],
  ['service-codes', 'Service Codes'],
  ['transactions', 'Transactions'],
  ['invoices', 'Invoices'],
]) {
  await step(page, label, async () => {
    await go(page, nav, nav === 'Dashboard' ? 'Dashboard' : nav)
    const body = await page.locator('.main').innerText()
    if (/No project in context/i.test(body)) throw new Error('lost project context')
  })
}

/* -------------------------------------------------------------------------
 * Sprint 2: the dashboard answering the questions it was asked.
 * ---------------------------------------------------------------------- */

await step(page, 'the-dashboard-leads-with-what-is-wrong', async () => {
  await go(page, 'Dashboard', 'Dashboard')
  await page.waitForSelector('.card.stat', { timeout: 15000 })
  const body = await page.locator('.main').innerText()
  if (!/Needs attention|Nothing needs attention/.test(body)) {
    throw new Error('the dashboard does not open on what needs attention')
  }
  if (!/Outstanding work/.test(body)) throw new Error('the outstanding tile is gone')
  // C2 asked for the explanation to go.
  if (/None of this stops field work\. It is here so nobody/.test(body)) {
    throw new Error('the outstanding tile still explains itself at length')
  }
})

await step(page, 'production-against-the-estimate', async () => {
  const body = await page.locator('.main').innerText()
  if (!/Against the estimate/.test(body)) {
    throw new Error('E1 has no panel: production against the estimate')
  }
  if (!/%/.test(body)) throw new Error('no percentage of estimate is shown')
})

await step(page, 'the-breakdowns-answer-a-period', async () => {
  const seg = page.locator('.seg').last()
  await seg.locator('button:has-text("This week")').click()
  await page.waitForTimeout(1500)
  const body = await page.locator('.main').innerText()
  if (!/the last seven days/.test(body)) {
    throw new Error('the period selector does not say what it is counting')
  }
  await seg.locator('button:has-text("All")').click()
  await page.waitForTimeout(1200)
})

/* -------------------------------------------------------------------------
 * Sprint 2: lists that keep their state.
 *
 * C13: "When I filter VOID and then page back back and forward forward I see
 * the default list of tickets again without any filters."
 * ---------------------------------------------------------------------- */

await step(page, 'filters-survive-the-back-button', async () => {
  await go(page, 'Tickets', 'Tickets')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  await page.selectOption('.card-head select >> nth=0', 'completed')
  await page.waitForTimeout(900)
  if (!page.url().includes('status=completed')) {
    throw new Error('the filter is not in the address, so nothing can restore it')
  }
  const filtered = await page.locator('table.data tbody tr').count()

  await page.click('button:has-text("Next")')
  await page.waitForTimeout(900)
  await page.goBack()
  await page.waitForTimeout(1200)

  const after = await page.locator('.card-head select').first().inputValue()
  if (after !== 'completed') {
    throw new Error('the filter was lost going back a page')
  }
  if (await page.locator('table.data tbody tr').count() !== filtered) {
    throw new Error('the list came back showing something else')
  }
})

await step(page, 'search-waits-to-be-submitted', async () => {
  const before = await page.locator('table.data tbody tr').count()
  await page.fill('.card-head input[type="search"], .card-head input', 'STL')
  await page.waitForTimeout(900)
  // Nothing should have moved yet: a list that refetches on every keystroke
  // fights whoever is still typing.
  if (page.url().includes('q=STL')) {
    throw new Error('the search applied itself before it was submitted')
  }
  await page.click('.card-head button:has-text("Search")')
  await page.waitForTimeout(1200)
  if (!page.url().includes('q=STL')) throw new Error('submitting the search did nothing')
  await page.click('button:has-text("Clear")')
  await page.waitForTimeout(900)
})

await step(page, 'an-incident-is-not-a-load-ticket', async () => {
  await go(page, 'Incidents', 'Incidents')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  const head = (await page.locator('table.data thead').first().innerText()).toLowerCase()
  for (const col of ['severity', 'what happened']) {
    if (!head.includes(col)) throw new Error(`the incident list is missing ${col}`)
  }
  for (const col of ['load call', 'cy']) {
    if (head.includes(col)) {
      throw new Error(`the incident list still shows ${col}, which an incident has none of`)
    }
  }
})

await step(page, 'transactions-can-be-narrowed-to-one-contractor', async () => {
  await go(page, 'Transactions', 'Transactions')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  const all = await page.locator('table.data tbody tr').count()
  const picker = page.locator('.card-head select').nth(1)
  const options = await picker.locator('option').count()
  if (options < 2) throw new Error('there is no contractor to choose')
  await picker.selectOption({ index: 1 })
  await page.waitForTimeout(1200)
  if (!page.url().includes('contractor_id=')) {
    throw new Error('the contractor filter is not in the address')
  }
  const narrowed = await page.locator('table.data tbody tr').count()
  if (narrowed > all) throw new Error('narrowing produced more rows')
})

/* -------------------------------------------------------------------------
 * Sprint 2: the money surfaces.
 *
 * Suite H judged this screen the way the recipient would, and found no way to
 * take a line off, no way to record an adjustment, and a rejection that
 * required no reason and had no way back.
 * ---------------------------------------------------------------------- */

await step(page, 'an-invoice-line-can-come-off-a-draft', async () => {
  await go(page, 'Invoices', 'Invoices')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.modal', { timeout: 15000 })
  await page.locator('.modal').getByText(/Lines \(/i).first().waitFor({ timeout: 15000 })

  const rows = page.locator('.modal table.data').last().locator('tbody tr')
  const before = await rows.count()
  const remove = page.locator('.modal button:has-text("Remove")').first()
  if (await remove.count()) {
    await remove.click()
    await page.waitForTimeout(1800)
    if (await rows.count() >= before) throw new Error('the line did not come off')
  }
})

await step(page, 'an-adjustment-says-what-it-is-for', async () => {
  await page.click('.modal button:has-text("Adjustment")')
  await page.waitForTimeout(600)
  const save = page.locator('.modal button:has-text("Save adjustment")')
  await page.fill('.modal input[type="number"]', '-250')
  // The dialog loads any reason already on the invoice, so the walk clears it
  // to test the rule rather than the previous run's answer.
  await page.fill('.modal textarea', '')
  await page.waitForTimeout(250)
  if (!(await save.isDisabled())) {
    throw new Error('an adjustment with no reason was accepted')
  }
  await page.fill('.modal textarea', 'Credit agreed for the two loads rejected at the gate')
  await save.click()
  await page.waitForTimeout(1800)
  const body = await page.locator('.modal').innerText()
  if (!/Credit agreed/i.test(body)) {
    throw new Error('the adjustment reason is not shown on the invoice')
  }
})

await step(page, 'rejecting-needs-a-reason-and-reopening-works', async () => {
  await page.click('.modal button:has-text("Submit")')
  await page.waitForTimeout(1800)
  await page.click('.modal button:has-text("Reject")')
  await page.waitForTimeout(600)
  const confirm = page.locator('.modal button:has-text("Reject invoice")')
  if (!(await confirm.isDisabled())) throw new Error('a rejection with no reason was accepted')
  await page.fill('.modal textarea', 'Two load calls look high against the photos')
  await confirm.click()
  await page.waitForTimeout(1800)

  const body = await page.locator('.modal').innerText()
  if (!/Rejected/.test(body)) throw new Error('the rejection is not shown')
  if (!/Two load calls look high/.test(body)) {
    throw new Error('the rejection reason is not carried on the invoice')
  }
  await page.click('.modal button:has-text("Reopen")')
  await page.waitForTimeout(1800)
  const after = await page.locator('.modal').innerText()
  if (/Two load calls look high/.test(after)) {
    throw new Error('reopening left the old rejection on the invoice')
  }
})

await step(page, 'the-printed-invoice-is-a-document', async () => {
  // Printing used to print the screen, which capped the lines at a scrolling
  // box and framed the result in a border.
  const doc = page.locator('.print-doc')
  if (await doc.count() === 0) throw new Error('no printable document is rendered')
  // .print-doc-table is the summary and the detail; the totals are their own
  // table, so counting the last table would count the totals.
  const lines = await doc.locator('table.print-doc-table').last()
    .locator('tbody tr').count()
  const onScreen = await page.locator('.modal table.data').last()
    .locator('tbody tr').count()
  if (lines < onScreen) {
    throw new Error('the document has fewer lines than the screen')
  }
  const text = await doc.innerText()
  for (const want of ['Invoice', 'Subtotal', 'Total']) {
    if (!text.includes(want)) throw new Error(`the document has no ${want}`)
  }
  await page.keyboard.press('Escape')
  await page.waitForSelector('.modal', { state: 'detached', timeout: 10000 })
})

/* -------------------------------------------------------------------------
 * Sprint 2: the review queue.
 *
 * C1 and B12 describe the same screen, and this is the one the product did not
 * have at all: the morning job of hunting for what looks wrong.
 * ---------------------------------------------------------------------- */

await step(page, 'review-queue', async () => {
  await go(page, 'Review', 'Review')
  await page.waitForSelector('.card.stat', { timeout: 15000 })
  const stats = await page.locator('.card.stat').count()
  if (stats < 4) throw new Error('review summary tiles missing')
})

await step(page, 'the-detector-runs-and-reports', async () => {
  await page.click('button:has-text("Re-check everything")')
  await page.locator('.toast, .toasts').first().waitFor({ timeout: 25000 })
  await page.waitForTimeout(1200)
  const body = await page.locator('.main').innerText()
  if (!/What the checks are finding/i.test(body)) {
    throw new Error('the screen does not say what the checks found')
  }
  // The wording is the product: a reviewer reads a sentence, not a rule name.
  if (!/No photo|photos for tree work|does not match/i.test(body)) {
    throw new Error('flags are not described in words a reviewer would use')
  }
})

await step(page, 'the-queue-answers-the-eight-questions', async () => {
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  // Two data tables on this screen: the queue, then monitor accuracy.
  const head = (await page.locator('table.data thead').first().innerText()).toLowerCase()
  for (const col of ['record', 'type', 'who', 'why it needs review',
                     'waiting', 'state']) {
    if (!head.includes(col)) throw new Error(`the review queue is missing ${col}`)
  }
})

await step(page, 'the-queue-carries-more-than-tickets', async () => {
  const body = await page.locator('.main').innerText()
  // The requirement is explicit that certifications are reviewed the same way
  // tickets are, and that invoices are not part of this queue at all.
  if (!/Certifications/i.test(body)) {
    throw new Error('the queue does not offer certifications as a kind')
  }
  if (/\bInvoices\b/i.test(await page.locator('.card-head').first().innerText())) {
    throw new Error('invoices are in the data review queue')
  }
})

await step(page, 'a-selection-is-approved-in-one-action', async () => {
  const row = page.locator('table.data tbody tr').first()
  const title = (await row.locator('td').nth(1).innerText()).split('\n')[0].trim()
  await row.locator('input[type="checkbox"]').click()
  await page.click('button:has-text("Approve 1")')
  // The queue reloads three reads: the page, the overview and the accuracy
  // panel. Waiting for the row to go is more honest than waiting a fixed time.
  await page.locator(`table.data tbody tr:has-text("${title}")`).first()
    .waitFor({ state: 'detached', timeout: 20000 })
})

await step(page, 'flagging-asks-what-is-wrong', async () => {
  await page.locator('table.data tbody tr').first()
    .locator('input[type="checkbox"]').click()
  await page.click('button:has-text("Flag these")')
  await page.waitForSelector('.modal', { timeout: 10000 })
  const flag = page.locator('.modal button:has-text("Flag")').last()
  if (!(await flag.isDisabled())) {
    throw new Error('a flag with no issue and no note was accepted')
  }
  await page.fill('.modal textarea', 'Monitor needs to re-shoot the pre photo')
  await flag.click()
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 })
})

/* -------------------------------------------------------------------------
 * Sprint 3: the record as one scrollable read rather than five tabs.
 * ---------------------------------------------------------------------- */

await step(page, 'a-record-opens-as-one-scrollable-view', async () => {
  await page.selectOption('select[aria-label="Review state"]', 'pending')
  await page.waitForTimeout(900)
  await page.selectOption('select[aria-label="Record type"]', 'load')
  await page.waitForTimeout(1200)
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.review-sheet', { timeout: 15000 })
  await page.locator('.review-jump button').first().waitFor({ timeout: 20000 })
  // No tabs. The steps are sections in the page, and the rail jumps to them.
  if (await page.locator('.review-sheet .tabs').count() > 0) {
    throw new Error('the review record still uses tabs')
  }
  const rail = await page.locator('.review-jump button').count()
  if (rail < 6) throw new Error('the jump list does not cover the record')
  const body = await page.locator('.review-sheet-body').innerText()
  for (const heading of ['Why it needs review', 'Location', 'Time',
                         'Evidence', 'Project rules', 'Review history']) {
    if (!body.includes(heading)) throw new Error(`the record has no ${heading} step`)
  }
})

await step(page, 'the-evidence-says-what-was-required', async () => {
  await page.click('.review-jump button:has-text("Evidence")')
  await page.waitForTimeout(700)
  const body = await page.locator('.review-sheet-body').innerText()
  // The reviewer's question is what was supposed to be collected, which a grid
  // of whatever arrived cannot answer.
  if (!/requires? \d+ photograph|does not require photographs/i.test(body)) {
    throw new Error('the record does not say what evidence was required')
  }
})

await step(page, 'the-location-is-on-imagery-with-the-rest-of-the-day', async () => {
  await page.click('.review-jump button:has-text("Location")')
  await page.waitForTimeout(1400)
  const hasMap = await page.locator('.review-map').count()
  const noCoords = /Nothing to put on a map/i.test(
    await page.locator('.review-sheet-body').innerText())
  if (!hasMap && !noCoords) {
    throw new Error('no map and no explanation of why there is none')
  }
  if (hasMap) {
    await page.locator('.review-map .leaflet-container').first()
      .waitFor({ timeout: 20000 })
  }
})

await step(page, 'time-is-a-sequence-with-the-gaps-named', async () => {
  await page.click('.review-jump button:has-text("Time")')
  await page.waitForTimeout(700)
  const body = await page.locator('.review-sheet-body').innerText()
  if (!/minutes later|No times recorded/i.test(body)) {
    throw new Error('the time step does not name the gaps between events')
  }
})

await step(page, 'void-is-behind-a-menu-and-correct-is-now-update', async () => {
  const bar = await page.locator('.decide-bar').innerText()
  if (!/Approve/.test(bar)) throw new Error('no approve action')
  if (!/Update/.test(bar)) throw new Error('Correct was not renamed to Update')
  if (/Void/i.test(bar)) throw new Error('Void is still an exposed action')
  await page.click('.decide-bar button[aria-label="More actions"]')
  await page.waitForSelector('.more-menu', { timeout: 8000 })
  const menu = await page.locator('.more-menu').innerText()
  for (const item of ['Re-run the rules', 'Void this ticket']) {
    if (!menu.includes(item)) throw new Error(`${item} is not in the menu`)
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
})

await step(page, 'a-record-is-approved-by-keystroke', async () => {
  const before = await page.locator('.review-sheet-head h2').innerText()
  await page.locator('.review-sheet-body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('a')
  await page.waitForTimeout(2200)
  const after = await page.locator('.review-sheet-head h2').innerText()
  // Approving steps to the next record rather than dropping back to the list,
  // because working a queue means deciding over and over.
  if (after === before) {
    throw new Error('approving did not move to the next record')
  }
  await page.keyboard.press('Escape')
  await page.waitForSelector('.review-sheet', { state: 'detached', timeout: 10000 })
})

await step(page, 'a-certification-is-reviewed-the-same-way', async () => {
  await page.selectOption('select[aria-label="Record type"]', 'certification')
  await page.selectOption('select[aria-label="Review state"]', 'all')
  await page.waitForTimeout(1400)
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.review-sheet', { timeout: 15000 })
  await page.locator('.review-jump button').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  const body = await page.locator('.review-sheet-body').innerText()
  if (!/Measurements/.test(body)) {
    throw new Error('a certification review does not lead with its measurements')
  }
  // Either it was measured and the sections are there, or it says plainly that
  // nothing behind the number says how it was reached.
  if (!/cubic inches|Nothing says how this number was reached/i.test(body)) {
    throw new Error('the certification review does not show the arithmetic')
  }
  await page.keyboard.press('Escape')
  await page.waitForSelector('.review-sheet', { state: 'detached', timeout: 10000 })
  await page.selectOption('select[aria-label="Record type"]', '')
  await page.selectOption('select[aria-label="Review state"]', 'pending')
  await page.waitForTimeout(900)
})

await step(page, 'monitor-accuracy-is-a-rate', async () => {
  const body = await page.locator('.main').innerText()
  if (!/Monitor accuracy/i.test(body)) throw new Error('no monitor accuracy panel')
  if (!/Approval rate over reviewed work/i.test(body)) {
    throw new Error('the panel does not explain what the rate counts')
  }
})

/* -------------------------------------------------------------------------
 * Sprint 2: correcting work the field has already finished.
 *
 * These are the steps the second walkthrough could not perform at all, so they
 * exist to prove the screens are reachable and do what they claim, not merely
 * that they render.
 * ---------------------------------------------------------------------- */

await step(page, 'certifications-screen', async () => {
  await go(page, 'Certifications', 'Certifications')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  const head = (await page.locator('table.data thead').innerText()).toLowerCase()
  for (const col of ['unit', 'capacity', 'how it was reached', 'tickets',
                     'expires']) {
    if (!head.includes(col)) throw new Error(`certifications list is missing ${col}`)
  }
  const stats = await page.locator('.card.stat').count()
  if (stats < 4) throw new Error('certification summary tiles missing')
})

await step(page, 'a-typed-capacity-is-called-out-as-unmeasured', async () => {
  // Every capacity carried over from before measurements existed says so, on
  // the list and in the drawer. That is the honest answer to "how did we
  // determine this trailer is 30 CY".
  const body = await page.locator('.main').innerText()
  if (!/Typed, not measured/i.test(body)) {
    throw new Error('the list does not distinguish a measured capacity from a typed one')
  }
  if (!/no measurements behind/i.test(body)) {
    throw new Error('the screen does not say what an unmeasured capacity means')
  }
})

await step(page, 'a-measured-capacity-shows-its-sections', async () => {
  const measured = page.locator('table.data tbody tr:has-text("section")').first()
  if (await measured.count() === 0) {
    throw new Error('the demo has no measured certification to read')
  }
  await measured.click()
  await page.waitForSelector('.drawer', { timeout: 10000 })
  await page.locator('.drawer').getByText(/How the number was reached/i)
    .first().waitFor({ timeout: 15000 })
  const text = await page.locator('.drawer').innerText()
  // The requirement: not the answer, the measurements that produced it.
  if (!/cubic inches/i.test(text)) {
    throw new Error('the worksheet does not show the arithmetic')
  }
  if (!/ft|in\b/.test(text)) {
    throw new Error('the sections do not show what came off the tape')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
})

await step(page, 'measuring-a-unit-calculates-as-you-type', async () => {
  await page.click('button:has-text("Measure a unit")')
  await page.waitForSelector('.modal', { timeout: 10000 })
  const blurb = await page.locator('.modal').innerText()
  if (!/No capacity is entered here/i.test(blurb)) {
    throw new Error('the dialog does not say the capacity comes from the measurements')
  }
  // There is deliberately no capacity field on this screen at all.
  const caps = await page.locator('.modal input[placeholder*="44"]').count()
  if (caps > 0) throw new Error('a capacity can still be typed directly')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
})

await step(page, 'certification-chain-reads-as-history', async () => {
  // Sort by the ticket count so the row opened is one a correction would
  // actually reprice. On a row that has priced nothing the impact panel says
  // so, correctly, and there would be no difference to assert on.
  await page.click('th:has-text("Tickets")')
  await page.waitForTimeout(500)
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.drawer', { timeout: 10000 })
  await page.locator('.drawer').getByText(/Measurement history/i)
    .first().waitFor({ timeout: 15000 })
  const text = await page.locator('.drawer').innerText()
  if (!/Counts from/i.test(text)) {
    throw new Error('the drawer does not say when a capacity counts from')
  }
})

await step(page, 'a-correction-prices-itself-before-it-is-written', async () => {
  await page.click('.drawer button:has-text("Correct")')
  await page.waitForSelector('.modal', { timeout: 10000 })
  const blurb = await page.locator('.modal').innerText()
  if (!/says the previous number was/i.test(blurb)) {
    throw new Error('the correction dialog does not explain what a correction does')
  }
  // A correction is a measurement too, so it opens a worksheet rather than
  // asking for a replacement number. What it will reprice is shown first,
  // because this is the E10 case: a measurement found wrong after days of
  // hauling.
  await page.waitForTimeout(1400)
  const priced = await page.locator('.modal').innerText()
  if (!/What this will reprice/i.test(priced)) {
    throw new Error('the correction dialog does not show what it would reprice')
  }
  if (!/ticket/i.test(priced)) throw new Error('no ticket count shown')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForSelector('.drawer', { state: 'detached', timeout: 10000 })
})

await step(page, 'a-completed-ticket-can-be-corrected', async () => {
  await go(page, 'Tickets', 'Tickets')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  // A load ticket, completed. A void one offers Restore rather than Update,
  // and a ticket billed under a flat or per-unit code prices the same whatever
  // the load call says, so correcting one would make a working engine look
  // broken. The filters are in the URL, so the walk asks for exactly that.
  await page.goto(`${page.url().split('?')[0]}?status=completed&ticket_type=LOAD`)
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.drawer', { timeout: 10000 })
  // Correct was confusing terminology for what this does, so it is Update now.
  await page.locator('.drawer button:has-text("Update")').first()
    .waitFor({ timeout: 15000 })
  await page.click('.drawer button:has-text("Update")')
  await page.waitForSelector('.modal', { timeout: 10000 })

  const save = page.locator('.modal button:has-text("Save the update")')
  if (!(await save.isDisabled())) {
    throw new Error('an update saved with no reason and no change')
  }
  // Always move the load call somewhere it is not, so the walk survives being
  // run twice against the same database. A correction that changes nothing is
  // correctly refused, and this step is not what tests that.
  const call = page.locator('.modal input[type="number"] >> nth=0')
  const now = Number(await call.inputValue()) || 50
  await call.fill(String(now > 30 ? now - 7 : now + 7))
  await page.fill('.modal textarea', 'Load call corrected after reviewing the photos')
  const summary = await page.locator('.modal').innerText()
  if (!/Changing/i.test(summary)) {
    throw new Error('the update does not summarise what it will change')
  }
  if (await save.isDisabled()) throw new Error('a complete update stayed disabled')
  await save.click()
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 })
})

await step(page, 'the-ticket-says-it-is-waiting-to-be-repriced', async () => {
  await page.locator('.drawer').getByText(/Waiting to be repriced/i)
    .first().waitFor({ timeout: 15000 })
  const text = await page.locator('.drawer').innerText()
  if (!/before the change/i.test(text)) {
    throw new Error('the banner does not say the figures are pre-correction')
  }
})

await step(page, 'repricing-reports-what-it-cost', async () => {
  await page.click('.drawer button:has-text("Reprice")')
  await page.waitForSelector('.modal', { timeout: 10000 })
  await page.fill('.modal textarea', 'Load call corrected after reviewing the photos')
  await page.click('.modal button.primary:has-text("Reprice")')
  await page.waitForSelector('.modal', { state: 'detached', timeout: 20000 })
  await page.locator('.toast, .toasts').first().waitFor({ timeout: 10000 })
})

await step(page, 'the-ledger-keeps-the-superseded-rows', async () => {
  await page.click('.drawer .tabs button:has-text("Transactions")')
  await page.waitForTimeout(600)
  const text = await page.locator('.drawer').innerText()
  if (!/Superseded/i.test(text)) {
    throw new Error('superseded transactions are not shown as evidence')
  }
  if (!/Billing now/i.test(text)) {
    throw new Error('the live total is missing from the transactions tab')
  }
  await page.keyboard.press('Escape')
  await page.waitForSelector('.drawer', { state: 'detached', timeout: 10000 })
})

await step(page, 'dashboard-alerts-tile', async () => {
  await go(page, 'Dashboard', 'Dashboard')
  await page.waitForSelector('.card:has-text("Outstanding")', { timeout: 10000 })
  const tile = await page.locator('.card:has-text("Outstanding")').first().innerText()
  if (!/permit/i.test(tile)) throw new Error('the pending permit is not on the dashboard')
  // C2 asked for the long explanation to go and the promise to stay, so the
  // assertion follows the shorter wording.
  if (!/stops the field|does not stop|stops field work/i.test(tile)) {
    throw new Error('the tile should say plainly that it blocks nothing')
  }

  // C2's other half: "each item is a link into the list that holds it."
  const first = page.locator('.card:has-text("Outstanding") .alert-row').first()
  if (await first.count() === 0) throw new Error('the outstanding items are not links')
  await first.click()
  await page.locator('.topbar h1', { hasText: 'Project Setup' }).first()
    .waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)
  if (!/tab=sites/.test(page.url())) {
    throw new Error(`the permit did not open the sites panel: ${page.url()}`)
  }
  const panel = await page.locator('.main').innerText()
  if (!/Disposal sites/i.test(panel)) throw new Error('the sites panel did not open')
})

// C20: the trail splits by domain rather than reading as one undifferentiated
// list of every write in the system.
await step(page, 'the-audit-trail-splits-by-domain', async () => {
  await go(page, 'Audit History', 'Audit History')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  const tabs = await page.locator('.seg.wide').first().innerText()
  for (const name of ['Everything', 'Operations', 'Billing', 'Records', 'Security']) {
    if (!tabs.includes(name)) throw new Error(`the ${name} domain is missing`)
  }

  // Counted from the total the screen reports, not from the rows on the first
  // page: a page cap of sixty makes any two busy tabs look identical.
  const total = async () => {
    const text = await page.locator('.card-head').first().innerText()
    const found = text.match(/([\d,]+)\s+artifacts/)
    if (!found) throw new Error(`the trail does not report a total: ${text}`)
    return Number(found[1].replace(/,/g, ''))
  }

  const all = await total()
  await page.click('.seg.wide button:has-text("Billing")')
  await page.waitForTimeout(900)
  const billing = await total()
  if (billing === 0) throw new Error('the billing domain is empty')
  if (billing >= all) throw new Error(`the domain tab did not narrow ${all} down`)

  // The tab has to survive the back button, like every other list filter.
  await page.goBack()
  await page.waitForTimeout(900)
  if (await total() !== all) throw new Error('going back did not restore the whole trail')
})

// K2: "the chain described here isn't clearly visible.. i just see a list of
// changes and no way to click and view any updates from the past".
await step(page, 'a-row-opens-the-records-whole-chain', async () => {
  await page.click('.seg.wide button:has-text("Operations")')
  await page.waitForTimeout(800)
  await page.click('table.data tbody tr:first-child')
  await page.waitForSelector('.modal', { timeout: 10000 })
  // Wait for the chain itself, not for the skeleton that stands in for it.
  await page.waitForSelector('.modal .chain, .modal .empty', { timeout: 10000 })

  const body = await page.locator('.modal').innerText()
  if (!/oldest first|artifact/i.test(body)) {
    throw new Error(`the chain does not say what it is showing: ${body.slice(0, 120)}`)
  }
  const events = await page.locator('.modal .chain li').count()
  if (events === 0) throw new Error('the chain is empty on a record that has history')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
})

await step(page, 'rules-read-as-a-list', async () => {
  await go(page, 'Rules', 'Rules')
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
  const head = (await page.locator('table.data thead').innerText()).toLowerCase()
  for (const col of ['service code', 'rate', 'contract', 'priority', 'matches']) {
    if (!head.includes(col)) throw new Error(`the rules list is missing ${col}`)
  }
  const before = await page.locator('.main').innerText()
  if (/then bill/.test(before)) throw new Error('the statement view is showing by default')
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForTimeout(500)
  const after = await page.locator('.main').innerText()
  if (!/then bill/.test(after)) throw new Error('the statement view did not open')
  if (!/Dry run/.test(after)) throw new Error('the dry run is not in the expansion')
})

await step(page, 'service-codes-read-as-a-list', async () => {
  await go(page, 'Service Codes', 'Service Codes')
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForTimeout(500)
  const body = await page.locator('.main').innerText()
  if (!/rate history/i.test(body)) throw new Error('rate history is not in the expansion')
})

await step(page, 'documents-on-a-record', async () => {
  await go(page, 'Project Setup', 'Project Setup')
  await page.waitForSelector('.tabs', { timeout: 10000 })
  await page.click('.tabs button:has-text("Documents")')
  await page.waitForTimeout(700)
  const body = await page.locator('.main').innerText()
  if (!/Add document link/.test(body)) throw new Error('the documents panel is missing')
})

await step(page, 'contract-intake', async () => {
  await go(page, 'Contract Intake', 'Contract Intake')
  const body = await page.locator('.main').innerText()
  if (!/later pass/i.test(body)) {
    throw new Error('the screen has to be honest that nothing reads the PDF yet')
  }
  await page.click('button:has-text("Register a PDF")')
  await page.waitForSelector('.modal', { timeout: 10000 })
  const stamp = Date.now().toString().slice(-6)
  await page.fill('.modal input >> nth=0', `Walk contract ${stamp}`)
  await page.fill('.modal input >> nth=1', `https://example.sharepoint.com/walk-${stamp}.pdf`)
  await page.click('.modal button:has-text("Register and stage")')
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 })
  const after = await page.locator('.main').innerText()
  if (!/Not read yet/i.test(after)) throw new Error('the staged document is not marked')
})

await step(page, 'contract-intake-seed-and-review', async () => {
  await page.click('button:has-text("Enter the lines") >> nth=0')
  await page.waitForSelector('.modal table.data', { timeout: 10000 })
  // A line number is unique per contract, so the walk has to pick a fresh one
  // rather than the same one every run.
  const line = 900 + (Date.now() % 90)
  await page.fill('.modal table.data tbody tr >> nth=0 >> input >> nth=2',
                  `Walkthrough proposed line ${line}`)
  await page.fill('.modal table.data tbody tr >> nth=0 >> input >> nth=0', String(line))
  await page.click('.modal button:has-text("Add for review")')
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 })
  // The card reloads its staged documents after the write, so wait for the
  // state to change rather than for the modal to go.
  await page.locator('.badge', { hasText: /Proposals ready/i }).first()
    .waitFor({ timeout: 15000 })
})

await step(page, 'closeout-manifest-and-package', async () => {
  await go(page, 'Closeout', 'Closeout')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  const body = await page.locator('.main').innerText()
  if (!/manifest/i.test(body)) throw new Error('the manifest is missing')
  if (!/naming convention/i.test(body)) throw new Error('the naming template is missing')

  const rows = await page.locator('table.data tbody tr').count()
  if (rows < 4) throw new Error(`the manifest lists only ${rows} documents`)

  // K11: the convention has to reach the file on disk, not only the manifest.
  if (!/What the package will be called/i.test(body)) {
    throw new Error('the screen does not show what the package files will be named')
  }

  const download = page.waitForEvent('download', { timeout: 30000 })
  await page.click('button:has-text("Build the package")')
  const file = await download
  if (!/^STL-2026-ROW_closeout_Package_\d{4}-\d{2}-\d{2}\.zip$/.test(file.suggestedFilename())) {
    throw new Error(`unexpected download: ${file.suggestedFilename()}`)
  }
})

// K13: "Can I package closeout for a date range only? I dont see any way to do
// this in the UI."
await step(page, 'closeout-takes-a-date-range', async () => {
  await page.click('button:has-text("Last 90 days")')
  await page.waitForTimeout(900)
  const body = await page.locator('.main').innerText()
  if (!/on the project/.test(body)) {
    throw new Error('a narrowed package does not say what it is leaving out')
  }

  const download = page.waitForEvent('download', { timeout: 30000 })
  await page.click('button:has-text("Build the package")')
  const file = await download
  if (!/-to-\d{4}-\d{2}-\d{2}\.zip$/.test(file.suggestedFilename())) {
    throw new Error(`the period is not in the filename: ${file.suggestedFilename()}`)
  }

  await page.click('button:has-text("Whole project")')
  await page.waitForTimeout(700)
})

// M13: "if i tab down to a row and press enter it should open that row".
await step(page, 'enter-opens-a-focused-row', async () => {
  await page.click('button:has-text("All projects")')
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
  await page.focus('table.data tbody tr:first-child')
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  if (focused !== 'TR') throw new Error(`a row cannot take focus, got ${focused}`)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.sidebar .project-switch', { timeout: 10000 })
  const scope = await page.locator('.project-switch').innerText()
  if (/All projects/.test(scope)) throw new Error('Enter did not enter the project')
})

// C18: "the images are just icons, i cant actually see anything".
await step(page, 'a-photo-opens-full-screen', async () => {
  await go(page, 'Tickets', 'Tickets')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  // Load tickets carry a photograph. Incidents do not, and the list opens on
  // whatever was created last, so ask for the kind this step is about.
  await page.goto(`${page.url().split('?')[0]}?ticket_type=LOAD`)
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })

  // Even inside one kind, a ticket can be missing its photo. Open rows until
  // one has images rather than asserting against whichever sorts first.
  let shown = 0
  for (let row = 0; row < 12 && shown === 0; row += 1) {
    await page.click(`table.data tbody tr >> nth=${row}`)
    await page.waitForSelector('.drawer', { timeout: 10000 })
    const images = page.locator('.drawer .tabs button:has-text("Images")')
    if (await images.count()) {
      await images.click()
      await page.waitForTimeout(600)
      shown = await page.locator('.photo img').count()
    }
    if (shown === 0) {
      await page.keyboard.press('Escape')
      await page.waitForSelector('.drawer', { state: 'detached', timeout: 10000 })
    }
  }
  if (shown === 0) throw new Error('the images still render as icons')

  await page.click('button.photo:first-child')
  await page.waitForSelector('.lightbox', { timeout: 8000 })
  if (await page.locator('.lightbox-stage img').count() === 0) {
    throw new Error('the lightbox opened without an image in it')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (await page.locator('.lightbox').count() !== 0) {
    throw new Error('Escape did not close the lightbox')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
})

// M12: "the back office does not navigate on mobile whatsoever and it should
// be 100% compatible". Walked at phone width, on the real build.
await step(page, 'the-back-office-navigates-at-phone-width', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)

  // The sidebar is off screen, and the button that brings it back is not.
  const hidden = await page.locator('.sidebar').evaluate(
    (el) => el.getBoundingClientRect().right <= 1)
  if (!hidden) throw new Error('the sidebar still eats the screen at 390px')
  if (await page.locator('.nav-toggle').isVisible() === false) {
    throw new Error('there is no way to open the navigation')
  }

  await page.click('.nav-toggle')
  await page.waitForTimeout(400)
  const open = await page.locator('.sidebar').evaluate(
    (el) => el.getBoundingClientRect().left >= -1)
  if (!open) throw new Error('the navigation drawer did not open')

  // Navigating from it closes it, and lands on the screen asked for.
  await page.click('.sidebar .nav-item:has-text("Invoices")')
  await page.locator('.topbar h1', { hasText: 'Invoices' }).first()
    .waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)
  if (await page.locator('.nav-scrim').count() !== 0) {
    throw new Error('the drawer stayed open over the screen it opened')
  }

  // And the page itself never scrolls sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 2) throw new Error(`the page scrolls sideways by ${overflow}px`)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(400)
})

await step(page, 'new-project-wizard', async () => {
  await page.click('button:has-text("All projects")')
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
  await page.click('button:has-text("New project")')
  await page.waitForSelector('input[placeholder*="St. Louis"]', { timeout: 10000 })
  const stamp = Date.now().toString().slice(-6)
  await page.fill('input[placeholder*="St. Louis"]', `Walkthrough Project ${stamp}`)
  await page.fill('input[placeholder="STL-2026-ROW"]', `WALK-${stamp}`)
  await page.selectOption('.field:has-text("Client") select', { index: 1 })
  await page.click('button:has-text("Create and continue")')
  await page.waitForSelector('.card:has-text("Debris streams")', { timeout: 15000 })
})

await step(page, 'wizard-scope-and-estimate', async () => {
  await page.click('.card button:has-text("Vegetative")')
  await page.waitForTimeout(600)
  await page.click('button:has-text("Next: Estimate")')
  await page.waitForTimeout(700)
  await page.click('button:has-text("1,000")')
  await page.click('button:has-text("Record")')
  await page.waitForTimeout(700)
  const body = await page.locator('.main').innerText()
  if (!/Now: 1,000/.test(body)) throw new Error('the estimate did not stick')
})

await step(page, 'wizard-through-to-review', async () => {
  for (const label of ['Contractors', 'Contracts', 'Disposal sites', 'Ticket types',
                       'Service codes', 'Workers', 'Review']) {
    await page.click(`button:has-text("Next: ${label}")`)
    await page.waitForTimeout(600)
  }
  const body = await page.locator('.main').innerText()
  if (!/Field work is blocked until you add/.test(body)) {
    throw new Error('the review step is not reading readiness from the database')
  }
})

await step(page, 'wizard-resumes-on-setup', async () => {
  await page.click('button:has-text("Open the project")')
  await page.locator('.topbar h1', { hasText: 'Project Setup' }).first()
    .waitFor({ timeout: 15000 })
  await page.waitForSelector('.card:has-text("Contractors")', { timeout: 15000 })
  // Readiness is its own fetch, so wait for it rather than reading the page the
  // instant the tabs appear and calling a race a missing panel.
  await page.locator('.main').getByText(/Field work is blocked/).first()
    .waitFor({ timeout: 15000 })

  // The tab is in the URL now, so setup opens where it is asked to open.
  await page.click('.tabs button:has-text("Disposal sites")')
  await page.waitForTimeout(500)
  if (!/tab=sites/.test(page.url())) {
    throw new Error(`the setup tab is not in the URL: ${page.url()}`)
  }
  await page.goBack()
  await page.waitForTimeout(500)
  if (/tab=sites/.test(page.url())) throw new Error('back did not leave the sites tab')
})

await step(page, 'back-to-all-projects', async () => {
  await page.click('button:has-text("All projects")')
  await page.waitForSelector('table.data tbody tr', { timeout: 10000 })
  const nav = await page.locator('.sidebar').innerText()
  if (/Dashboard/.test(nav)) throw new Error('project navigation is still showing')
})

await browser.close()

console.log(seen.join('\n'))
if (problems.length) {
  console.log('\nPROBLEMS:')
  console.log(problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log('\nUI walk clean.')

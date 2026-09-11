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
  // The bad row stays editable rather than being silently dropped.
  const firstCell = page.locator('.modal table.data tbody tr').nth(2).locator('input').first()
  await firstCell.fill(`Fixed${stamp}`)
  await page.waitForTimeout(300)
  const after = await page.locator('.modal').innerText()
  if (!/Import 3 workers/.test(after)) {
    throw new Error('correcting the row did not bring it back into the import')
  }
  await page.click('button:has-text("Import 3 workers")')
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 })

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
  await page.click('button:has-text("Re-check every ticket")')
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

await step(page, 'the-queue-leads-with-the-worst', async () => {
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  // Two data tables on this screen: the queue, then monitor accuracy.
  const head = (await page.locator('table.data thead').first().innerText()).toLowerCase()
  for (const col of ['ticket', 'monitor', 'what the check saw', 'state']) {
    if (!head.includes(col)) throw new Error(`the review queue is missing ${col}`)
  }
})

await step(page, 'a-ticket-is-approved-from-the-row', async () => {
  const row = page.locator('table.data tbody tr').first()
  const ticket = (await row.locator('td').nth(1).innerText()).split('\n')[0].trim()
  await row.locator('button:has-text("Approve")').click()
  await page.waitForTimeout(2000)
  const still = await page.locator(`table.data tbody tr:has-text("${ticket}")`).count()
  if (still > 0) {
    throw new Error(`${ticket} is still in the unreviewed queue after approval`)
  }
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
  for (const col of ['unit', 'capacity', 'tickets', 'expires']) {
    if (!head.includes(col)) throw new Error(`certifications list is missing ${col}`)
  }
  const stats = await page.locator('.card.stat').count()
  if (stats < 4) throw new Error('certification summary tiles missing')
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
  // Halving the capacity has to show a negative difference before anything is
  // committed. This is the E10 case: a measurement found wrong after days of
  // hauling.
  await page.fill('.modal input[type="number"] >> nth=0', '11')
  await page.waitForTimeout(1200)
  const priced = await page.locator('.modal').innerText()
  if (!/What this reprices/i.test(priced)) {
    throw new Error('the correction dialog does not show what it would reprice')
  }
  if (!/Difference/i.test(priced)) throw new Error('no difference shown')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForSelector('.drawer', { state: 'detached', timeout: 10000 })
})

await step(page, 'a-completed-ticket-can-be-corrected', async () => {
  await go(page, 'Tickets', 'Tickets')
  await page.waitForSelector('table.data tbody tr', { timeout: 15000 })
  // A void ticket offers Restore, not Correct, which is the intended
  // behaviour rather than something to work around.
  await page.selectOption('.card-head select >> nth=0', 'completed')
  await page.waitForTimeout(700)
  await page.click('table.data tbody tr >> nth=0')
  await page.waitForSelector('.drawer', { timeout: 10000 })
  await page.locator('.drawer button:has-text("Correct")').first()
    .waitFor({ timeout: 15000 })
  await page.click('.drawer button:has-text("Correct")')
  await page.waitForSelector('.modal', { timeout: 10000 })

  const save = page.locator('.modal button:has-text("Save correction")')
  if (!(await save.isDisabled())) {
    throw new Error('a correction saved with no reason and no change')
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
    throw new Error('the correction does not summarise what it will change')
  }
  if (await save.isDisabled()) throw new Error('a complete correction stayed disabled')
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

  const download = page.waitForEvent('download', { timeout: 30000 })
  await page.click('button:has-text("Build the package")')
  const file = await download
  if (!/^STL-2026-ROW-closeout-\d{4}-\d{2}-\d{2}\.zip$/.test(file.suggestedFilename())) {
    throw new Error(`unexpected download: ${file.suggestedFilename()}`)
  }
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
  await page.waitForSelector('.card:has-text("Contractors")', { timeout: 15000 })
  const body = await page.locator('.main').innerText()
  if (!/Field work is blocked/.test(body)) throw new Error('setup lost the readiness panel')
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

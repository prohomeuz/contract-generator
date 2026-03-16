const express = require('express')
const { chromium } = require('playwright')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const app = express()
const port = process.env.PORT || 3000
const host = process.env.HOST || '0.0.0.0'
const nodeEnv = process.env.NODE_ENV || 'development'

const { gallery } = require('./images')

app.disable('x-powered-by')
app.set('etag', false)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

const templatePath = path.join(__dirname, 'templates', 'bron.html')
const stylePath = path.join(__dirname, 'style', 'output.css')

const templateHtml = fs.readFileSync(templatePath, 'utf-8')
const styleCss = fs.readFileSync(stylePath, 'utf-8')

const htmlDocumentStart = `<!doctype html><html><head><meta charset="utf-8" /><style>${styleCss}</style></head><body>`
const htmlDocumentEnd = `</body></html>`

const templatePlaceholders = Array.from(
  new Set([...templateHtml.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1])),
).sort()

const viewport = { width: 794, height: 1123 }
const launchArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--single-process',
  '--no-zygote',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--metrics-recording-only',
  '--mute-audio',
]

const pdfOptions = {
  format: 'A4',
  printBackground: true,
  landscape: true,
  preferCSSPageSize: true,
  margin: { top: 0, bottom: 0, left: 0, right: 0 },
}

let browser
let context
let contextPromise

async function getContext() {
  if (context) return context
  if (!contextPromise) {
    contextPromise = (async () => {
      browser = await chromium.launch({
        headless: true,
        timeout: 0,
        args: launchArgs,
      })

      context = await browser.newContext({
        viewport,
      })

      context.setDefaultNavigationTimeout(0)
      context.setDefaultTimeout(0)

      return context
    })().catch((error) => {
      contextPromise = undefined
      throw error
    })
  }

  return contextPromise
}

async function warmupPlaywright() {
  const browserContext = await getContext()
  const page = await browserContext.newPage()

  try {
    await page.setContent('<!doctype html><html><body></body></html>', {
      waitUntil: 'load',
    })

    await page.pdf(pdfOptions)
  } finally {
    await page.close().catch(() => {})
  }
}

async function closeBrowser() {
  const currentContext = context
  const currentBrowser = browser
  context = undefined
  browser = undefined
  contextPromise = undefined

  await currentContext?.close().catch(() => {})
  await currentBrowser?.close().catch(() => {})
}

process.once('beforeExit', () => {
  void closeBrowser()
})

const pdfCacheEnabled = process.env.PDF_CACHE !== 'false'
const pdfCacheMaxItems = Number.parseInt(process.env.PDF_CACHE_MAX_ITEMS || '200', 10)
const pdfCacheMaxBytes = Number.parseInt(process.env.PDF_CACHE_MAX_BYTES || String(100 * 1024 * 1024), 10)
const pdfCacheTtlMs = Number.parseInt(process.env.PDF_CACHE_TTL_MS || '0', 10)

const pdfCache = new Map()
let pdfCacheBytes = 0

function cacheDelete(key, entry) {
  if (!entry) return
  pdfCache.delete(key)
  if (entry.buffer) pdfCacheBytes -= entry.buffer.length
}

function cacheGetEntry(key, now) {
  const entry = pdfCache.get(key)
  if (!entry) return undefined

  if (entry.expiresAt && entry.expiresAt <= now) {
    cacheDelete(key, entry)
    return undefined
  }

  if (entry.buffer) {
    pdfCache.delete(key)
    pdfCache.set(key, entry)
  }

  return entry
}

function cacheEvictIfNeeded() {
  while (pdfCache.size > pdfCacheMaxItems || pdfCacheBytes > pdfCacheMaxBytes) {
    const oldestKey = pdfCache.keys().next().value
    const oldestEntry = pdfCache.get(oldestKey)
    cacheDelete(oldestKey, oldestEntry)
  }
}

function resolveImageToken(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:')) {
    return crypto.createHash('sha256').update(trimmed).digest('base64url')
  }

  const ext = path.extname(trimmed).toLowerCase()
  if (!ext) return `${trimmed}.png`
  return trimmed
}

function getPdfCacheKey(data) {
  const inputData = data || {}
  const hash = crypto.createHash('sha256')

  let monthlyPayment = inputData.MONTHLY_PAYMENT
  let period = inputData.PERIOD

  const hasMonthlyPayment = typeof monthlyPayment === 'string' && monthlyPayment.trim()
  const periodValue = typeof period === 'string' ? period.trim() : ''
  const periodLooksLikeMoney = !!periodValue && !/[a-zа-я]/i.test(periodValue) && /\d/.test(periodValue)

  if (!hasMonthlyPayment && periodLooksLikeMoney) {
    monthlyPayment = periodValue
    period = '60 oy'
  }

  for (const key of templatePlaceholders) {
    let value
    if (key === '2D' || key === '3D' || key === 'PLAN') value = resolveImageToken(inputData[key])
    else if (key === 'MONTHLY_PAYMENT') value = monthlyPayment
    else if (key === 'PERIOD') value = period
    else value = inputData[key]

    if (value === undefined || value === null) value = ''
    else value = String(value)

    hash.update(key)
    hash.update('\0')
    hash.update(value)
    hash.update('\0')
  }

  return hash.digest('base64url')
}

async function getOrCreatePdf(cacheKey, createPdf) {
  if (!pdfCacheEnabled) return await createPdf()

  const now = Date.now()
  const existing = cacheGetEntry(cacheKey, now)
  if (existing?.buffer) return existing.buffer
  if (existing?.promise) return await existing.promise

  const expiresAt = pdfCacheTtlMs > 0 ? now + pdfCacheTtlMs : 0
  const promise = (async () => {
    try {
      const buffer = await createPdf()
      if (!Buffer.isBuffer(buffer)) return Buffer.from(buffer)

      if (buffer.length > pdfCacheMaxBytes) {
        cacheDelete(cacheKey, pdfCache.get(cacheKey))
        return buffer
      }

      const previous = pdfCache.get(cacheKey)
      cacheDelete(cacheKey, previous)

      pdfCache.set(cacheKey, { buffer, expiresAt })
      pdfCacheBytes += buffer.length
      cacheEvictIfNeeded()

      return buffer
    } catch (error) {
      cacheDelete(cacheKey, pdfCache.get(cacheKey))
      throw error
    }
  })()

  pdfCache.set(cacheKey, { promise, expiresAt })
  return await promise
}

function sanitizeFilename(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replaceAll(/[\\/:*?"<>|\n\r\t]+/g, ' ').replaceAll(/\s+/g, ' ')
}

function resolveGalleryImage(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:')) return trimmed

  const ext = path.extname(trimmed).toLowerCase()
  const candidate = ext ? trimmed : `${trimmed}.png`
  return gallery[candidate] || gallery[trimmed] || trimmed
}

function replaceData(htmlString, data = {}) {
  const normalizedData = { ...(data || {}) }

  normalizedData['2D'] = resolveGalleryImage(normalizedData['2D'])
  normalizedData['3D'] = resolveGalleryImage(normalizedData['3D'])
  normalizedData.PLAN = resolveGalleryImage(normalizedData.PLAN)

  const hasMonthlyPayment = typeof normalizedData.MONTHLY_PAYMENT === 'string' && normalizedData.MONTHLY_PAYMENT.trim()
  const periodValue = typeof normalizedData.PERIOD === 'string' ? normalizedData.PERIOD.trim() : ''
  const periodLooksLikeMoney = !!periodValue && !/[a-zа-я]/i.test(periodValue) && /\d/.test(periodValue)

  if (!hasMonthlyPayment && periodLooksLikeMoney) {
    normalizedData.MONTHLY_PAYMENT = periodValue
    normalizedData.PERIOD = '60 oy'
  }

  return htmlString.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    const value = normalizedData[key]
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

async function generateBron(data) {
  const browserContext = await getContext()
  const page = await browserContext.newPage()

  try {
    const htmlString = `${htmlDocumentStart}${replaceData(templateHtml, data)}${htmlDocumentEnd}`

    await page.setContent(htmlString, {
      waitUntil: 'load',
    })

    return await page.pdf(pdfOptions)
  } finally {
    await page.close().catch(() => {})
  }
}

app.get('/health', (_req, res) => {
  res.status(200).send('ok')
})

app.post('/bron', async (req, res) => {
  try {
    const data = req.body || {}
    const startNs = process.hrtime.bigint()

    const cacheKey = pdfCacheEnabled ? getPdfCacheKey(data) : ''
    const cacheStatus = cacheKey ? (cacheGetEntry(cacheKey, Date.now()) ? 'HIT' : 'MISS') : 'BYPASS'
    const pdf = pdfCacheEnabled
      ? await getOrCreatePdf(cacheKey, () => generateBron(data))
      : await generateBron(data)
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6

    const safeName = sanitizeFilename(data.FILE_NAME) || 'bron'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
    res.setHeader('X-PDF-Time-Ms', durationMs.toFixed(2))
    res.setHeader('X-PDF-Cache', cacheStatus)
    res.setHeader('Content-Length', pdf.length)
    res.end(pdf)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'PDF generation failed' })
  }
})

const server = app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port} (${nodeEnv})`)

  if (process.env.PLAYWRIGHT_PRELAUNCH !== 'false') {
    void getContext().catch((error) => {
      console.error('Playwright prelaunch failed:', error)
    })

    if (process.env.PLAYWRIGHT_WARMUP !== 'false') {
      void warmupPlaywright().catch((error) => {
        console.error('Playwright warmup failed:', error)
      })
    }
  }
})

let isShuttingDown = false
async function shutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`Shutting down (${signal})...`)
  await new Promise((resolve) => server.close(() => resolve()))
  await closeBrowser()
  process.exit(0)
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})

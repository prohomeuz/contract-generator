const express = require('express')
const { chromium } = require('playwright')

const app = express()
const port = process.env.PORT || 3000
const nodeEnv = process.env.NODE_ENV || 'development'

// Basic request logger
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const durationMs = Date.now() - start
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      }),
    )
  })
  next()
})

async function htmlToPdf(htmlString) {
  const browser = await chromium.launch({
    headless: true,
    timeout: 0,
    args: [
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
    ],
  })

  const page = await browser.newPage()

  await page.setViewportSize({ width: 794, height: 1123 })

  page.setDefaultNavigationTimeout(0)
  page.setDefaultTimeout(0)

  await page.setContent(htmlString, {
    waitUntil: 'networkidle',
  })

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  })

  await browser.close()
  return pdfBuffer
}

app.post('/', async (req, res) => {
  const pdf = await htmlToPdf(req.body.html)
  res.sendFile(pdf)
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on ${port} (${nodeEnv})`)
})

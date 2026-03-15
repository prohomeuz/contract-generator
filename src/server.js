const express = require('express')

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

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'mini-backend ready',
    timestamp: new Date().toISOString(),
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on ${port} (${nodeEnv})`)
})

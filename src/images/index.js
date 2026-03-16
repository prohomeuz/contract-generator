const fs = require('fs')
const path = require('path')

const MIME_TYPES_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

const galleryDir = path.join(__dirname, 'gallery')
const gallery = {}

for (const filename of fs.readdirSync(galleryDir).sort()) {
  if (filename.startsWith('.')) continue

  const ext = path.extname(filename).toLowerCase()
  const mimeType = MIME_TYPES_BY_EXT[ext]
  if (!mimeType) continue

  const imageBuffer = fs.readFileSync(path.join(galleryDir, filename))
  gallery[filename] = `data:${mimeType};base64,${imageBuffer.toString('base64')}`
}

// DO NOT TOUCH START =========
const format = {
  CREATED: '2026-yil 17-mart',
  FILE_NAME: 'Hoshim aka bron hujjat',
  ROOM: '2x',
  BLOCK: '15-BLOK',
  FLOOR: '6-QAVAT',
  HOUSE_NUMBER: 'Nº 76 XONADON',
  PRICE_PER_METR: '6 000 000',
  PERIOD: '5 600 000',
  SIZE: '44.35',
  STATE: 'Karobka',
  DOWN_PAYMENT: '60 000 000',
  TOTAL_PRICE: '600 000 000',
  '2D': '44.35-2D.png',
  '3D': '44.35-3D.png',
  PLAN: '44.35-plan.png',
}
// DO NOT TOUCH END =========

module.exports = { gallery }

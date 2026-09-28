'use strict'

const fs = require('fs')
const path = require('path')
const { isoLocal } = require('./db.js')

function ejecutarBackup (db, carpeta, tags = '') {
  if (!carpeta) {
    return { ok: false, error: 'No hay carpeta de backup configurada' }
  }
  carpeta = String(carpeta).trim()
  if (!fs.existsSync(carpeta)) {
    try {
      fs.mkdirSync(carpeta, { recursive: true })
    } catch (e) {
      return { ok: false, error: `No se pudo crear la carpeta: ${e.message}` }
    }
  }

  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}--${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  const nombre = `vitpos-backup-${ts}${tags ? '-' + tags : ''}.db`
  const destino = path.join(carpeta, nombre)

  try {
    // snapshot consistente aunque la base este abierta (no copia WAL a medias)
    if (fs.existsSync(destino)) fs.unlinkSync(destino)
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`)
    const tamano = fs.statSync(destino).size
    const res = { ok: true, archivo: destino, tamano, fecha: isoLocal() }
    // las facturas viven fuera de la base: copiar la carpeta junto al backup
    try {
      const fila = db.prepare('SELECT valor FROM settings WHERE clave = ?').get('facturas_carpeta')
      const origen = String((fila && fila.valor) || '').trim()
      if (origen && fs.existsSync(origen) && fs.statSync(origen).isDirectory()) {
        const destinoFacturas = path.join(carpeta, `vitpos-facturas-${ts}${tags ? '-' + tags : ''}`)
        fs.cpSync(origen, destinoFacturas, { recursive: true })
        res.facturas = destinoFacturas
      }
    } catch (_) { /* el backup de la base ya esta hecho; no fallar por las facturas */ }
    return res
  } catch (e) {
    return { ok: false, error: `Error al hacer el backup: ${e.message}` }
  }
}

module.exports = { ejecutarBackup }
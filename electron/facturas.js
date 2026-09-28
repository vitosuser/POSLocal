'use strict'

// Archivos de facturas de compra (reposicion).
// Los archivos se COPIAN a la carpeta configurada (settings.facturas_carpeta);
// en la base solo se guarda la ruta del archivo copiado.

const fs = require('fs')
const path = require('path')

const FACTURA_MAX_BYTES = 10 * 1024 * 1024
const FACTURA_MIMES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
}

function carpetaFacturas (db) {
  let carpeta = ''
  try {
    const fila = db.prepare('SELECT valor FROM settings WHERE clave = ?').get('facturas_carpeta')
    carpeta = String((fila && fila.valor) || '').trim()
  } catch (_) { carpeta = '' }
  if (!carpeta) {
    throw new Error('Configurá la carpeta de facturas en Configuración')
  }
  return carpeta
}

function nombreSeguro (s) {
  const base = path.basename(String(s || 'factura'))
  const sinAcentos = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return sinAcentos.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'factura'
}

function adjuntarFactura (db, compraId, origen) {
  const compra = db.prepare('SELECT * FROM compras WHERE id = ?').get(Number(compraId))
  if (!compra) throw new Error('Compra no encontrada')
  if (!origen) throw new Error('No se eligió ningún archivo')

  const stat = fs.statSync(origen, { throwIfNoEntry: false })
  if (!stat || !stat.isFile()) throw new Error('El archivo elegido no existe')
  if (stat.size > FACTURA_MAX_BYTES) {
    throw new Error(`La factura supera el máximo de ${FACTURA_MAX_BYTES / 1024 / 1024} MB`)
  }
  const ext = path.extname(String(origen)).toLowerCase()
  const mime = FACTURA_MIMES[ext]
  if (!mime) throw new Error('Formato no admitido: usá PDF, JPG o PNG')

  const carpeta = carpetaFacturas(db)
  fs.mkdirSync(carpeta, { recursive: true })

  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const destino = path.join(carpeta, `compra-${compra.id}-${ts}-${nombreSeguro(origen)}`)
  fs.copyFileSync(origen, destino)

  if (compra.factura_archivo && compra.factura_archivo !== destino) {
    try { if (fs.existsSync(compra.factura_archivo)) fs.unlinkSync(compra.factura_archivo) } catch (_) {}
  }

  const { isoLocal } = require('./db.js')
  db.prepare(`UPDATE compras SET factura_archivo=?, factura_nombre=?, factura_mime=?, actualizado_en=? WHERE id=?`)
    .run(destino, path.basename(String(origen)), mime, isoLocal(), compra.id)

  return db.prepare('SELECT * FROM compras WHERE id = ?').get(compra.id)
}

module.exports = { adjuntarFactura, carpetaFacturas, FACTURA_MAX_BYTES, FACTURA_MIMES }

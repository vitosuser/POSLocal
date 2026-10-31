'use strict'

// Verificacion de carpetas configurables (backup, facturas).
// Normaliza la ruta, la crea si no existe y comprueba escritura real.

const fs = require('fs')
const os = require('os')
const path = require('path')

function verificarCarpeta (ruta) {
  const original = String(ruta || '').trim()
  if (!original) throw new Error('Ingresá una carpeta primero')
  const resuelta = path.resolve(original.replace(/^~(?=$|[\\/])/, os.homedir()))

  let creada = false
  try {
    if (!fs.existsSync(resuelta)) {
      fs.mkdirSync(resuelta, { recursive: true })
      creada = true
    } else if (!fs.statSync(resuelta).isDirectory()) {
      throw new Error('La ruta existe pero no es una carpeta')
    }
    // prueba de escritura real
    const prueba = path.join(resuelta, `.vitpos-escritura-${process.pid}.tmp`)
    fs.writeFileSync(prueba, 'ok')
    fs.unlinkSync(prueba)
  } catch (e) {
    if (e.message === 'La ruta existe pero no es una carpeta') throw e
    throw new Error(`No se puede escribir en la carpeta: ${e.message}`)
  }
  return { ruta: resuelta, creada }
}

module.exports = { verificarCarpeta }

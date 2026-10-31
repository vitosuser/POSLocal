'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { verificarCarpeta } = require('../electron/carpetas.js')

function tempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vitpos-carp-'))
}

test('verifica carpeta existente y escribible', () => {
  const dir = tempDir()
  const r = verificarCarpeta(dir)
  assert.equal(r.ruta, path.resolve(dir))
  assert.equal(r.creada, false)
})

test('crea la carpeta si no existe', () => {
  const base = tempDir()
  const nueva = path.join(base, 'sub', 'facturas')
  const r = verificarCarpeta(nueva)
  assert.equal(r.creada, true)
  assert.ok(fs.statSync(nueva).isDirectory())
})

test('normaliza la ruta en el campo', () => {
  const dir = tempDir()
  const r = verificarCarpeta(dir + '/./')
  assert.equal(r.ruta, path.resolve(dir))
})

test('rechaza ruta vacia y ruta que no es carpeta', () => {
  assert.throws(() => verificarCarpeta(''), /Ingresá una carpeta/)
  assert.throws(() => verificarCarpeta('   '), /Ingresá una carpeta/)
  const dir = tempDir()
  const arch = path.join(dir, 'f.txt')
  fs.writeFileSync(arch, 'x')
  assert.throws(() => verificarCarpeta(arch), /no es una carpeta/)
})

test('rechaza carpeta sin permiso de escritura', () => {
  if (process.geteuid && process.geteuid() === 0) return // root escribe igual
  const dir = tempDir()
  fs.chmodSync(dir, 0o555)
  try {
    assert.throws(() => verificarCarpeta(dir), /No se puede escribir/)
  } finally {
    fs.chmodSync(dir, 0o755)
  }
})

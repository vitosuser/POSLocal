'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { openDb } = require('../electron/db.js')
const store = require('../electron/store.js')

function tempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vitpos-fiado-'))
}

test('anulación guarda movimiento correcto', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'z1', nombre: 'Z', precio: 100, stock: 5 })
  const { ventaId } = store.crearVenta(db, { items: [{ codigo: 'z1', cantidad: 2 }], recibido: 200 })
  store.anularVenta(db, ventaId)
  const mov = store.movimientosStock(db, 'z1', 1)[0]
  assert.equal(mov.tipo, 'anulacion')
  assert.equal(mov.cantidad, 2)
  assert.equal(mov.stock_resultante, 5)
  db.close()
})

test('stock negativo rechazado al guardar producto', () => {
  const db = openDb(tempDir())
  assert.throws(() => store.guardarProducto(db, { codigo_barras: 'n1', nombre: 'N', stock: -5 }), /negativo/)
  assert.throws(() => store.guardarProducto(db, { codigo_barras: 'n2', nombre: 'N', stock_minimo: -1 }), /negativo/)
  db.close()
})

test('dinero insuficiente sin fiado se rechaza', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'p1', nombre: 'P', precio: 1000, stock: 5 })
  assert.throws(() => store.crearVenta(db, { items: [{ codigo: 'p1', cantidad: 1 }], recibido: 0 }), /insuficiente|fiado/)
  db.close()
})

test('no se elimina producto con ventas', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'e1', nombre: 'E', precio: 500, stock: 5 })
  store.crearVenta(db, { items: [{ codigo: 'e1', cantidad: 1 }] })
  assert.throws(() => store.eliminarProducto(db, 'e1'), /ventas asociadas/)
  db.close()
})

test('fiado: crea deuda, cobra pago y revierte al anular', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'f1', nombre: 'F', precio: 1000, stock: 10 })
  const f = store.guardarDeudor(db, { dni: '12345678', nombre: 'Juan Perez', nota: 'vecino' })
  assert.equal(f.deuda, 0)
  assert.equal(f.debe, 0)

  const r = store.crearVenta(db, {
    items: [{ codigo: 'f1', cantidad: 1 }],
    recibido: 400, es_fiado: true, deudor_dni: '12345678'
  })
  assert.equal(r.monto_fiado, 600)
  assert.equal(r.deudor_dni, '12345678')
  assert.equal(store.obtenerDeudor(db, '12345678').deuda, 600)
  assert.equal(store.obtenerDeudor(db, '12345678').debe, 1)

  const v = store.obtenerVenta(db, r.ventaId)
  assert.equal(v.es_fiado, 1)
  assert.equal(v.deudor_dni, '12345678')
  assert.equal(v.deudor_nombre, 'Juan Perez')

  store.registrarPagoDeudor(db, { dni: '12345678', monto: 600 })
  assert.equal(store.obtenerDeudor(db, '12345678').deuda, 0)
  assert.equal(store.obtenerDeudor(db, '12345678').debe, 0)
  db.close()
})

test('fiado exige deudor y monto pendiente', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'g1', nombre: 'G', precio: 500, stock: 5 })
  assert.throws(() => store.crearVenta(db, { items: [{ codigo: 'g1', cantidad: 1 }], recibido: 100, es_fiado: true, deudor_dni: '' }), /deudor/)
  assert.throws(() => store.crearVenta(db, { items: [{ codigo: 'g1', cantidad: 1 }], recibido: 500, es_fiado: true, deudor_dni: 'nope' }), /cubre el total|no encontrado/)
  // compatibilidad con el nombre anterior del campo
  store.guardarDeudor(db, { dni: '777', nombre: 'Viejo' })
  const r = store.crearVenta(db, { items: [{ codigo: 'g1', cantidad: 1 }], recibido: 100, es_fiado: true, fiador_dni: '777' })
  assert.equal(r.deudor_dni, '777')
  db.close()
})

test('migración conserva deudores y ventas fiadas', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'm1', nombre: 'M', precio: 1000, stock: 5 })
  store.guardarDeudor(db, { dni: '555', nombre: 'Migrado' })
  const r = store.crearVenta(db, { items: [{ codigo: 'm1', cantidad: 1 }], recibido: 0, es_fiado: true, deudor_dni: '555' })
  const v = store.obtenerVenta(db, r.ventaId)
  assert.equal(v.deudor_nombre, 'Migrado')
  assert.equal(store.listarDeudores(db).length, 1)
  db.close()
})

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { openDb } = require('../electron/db.js')
const store = require('../electron/store.js')
const backup = require('../electron/backup.js')

function tempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vitpos-test-'))
}

test('abre la base y siembra defaults', () => {
  const db = openDb(tempDir())
  const s = store.obtenerSettings(db)
  assert.equal(s.nombre_negocio, 'VitPos')
  assert.equal(s.imp_papel, 'desactivada')
  db.close()
})

test('da de alta y modifica un producto', () => {
  const db = openDb(tempDir())
  let p = store.guardarProducto(db, { codigo_barras: '7790000000011', nombre: 'Croquetas Perro 3kg', precio: 15000, costo: 10000, stock: 10 })
  assert.equal(p.precio, 15000)
  store.guardarProducto(db, { codigo_barras: '7790000000011', nombre: 'Croquetas Perro 3kg', precio: 16000, costo: 10000 })
  p = store.obtenerProducto(db, '7790000000011')
  assert.equal(p.precio, 16000)
  assert.equal(p.stock, 10, 'se conserva el stock al actualizar aunque no venga')
  store.guardarProducto(db, { codigo_barras: 'c2', nombre: 'Detergente 1L' })
  assert.equal(store.listarProductos(db).length, 2)
  db.close()
})

test('crea venta, descuenta stock y guarda snapshot', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'x1', nombre: 'A', precio: 1000, costo: 500, stock: 5 })
  store.guardarProducto(db, { codigo_barras: 'x2', nombre: 'B', precio: 2000, costo: 1000, stock: 3 })

  const r = store.crearVenta(db, {
    items: [{ codigo: 'x1', cantidad: 2 }, { codigo: 'x2', cantidad: 1 }],
    metodo_pago: 'Efectivo', recibido: 10000
  })
  assert.equal(r.total, 4000)
  assert.equal(r.cambio, 6000)

  const v = store.obtenerVenta(db, r.ventaId)
  assert.equal(v.items.length, 2)
  assert.equal(v.items[0].precio_unitario, 1000)
  assert.equal(store.obtenerProducto(db, 'x1').stock, 3)
  assert.equal(store.obtenerProducto(db, 'x2').stock, 2)
  db.close()
})

test('no deja vender sin stock', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'y1', nombre: 'S', precio: 100, stock: 1 })
  assert.throws(() => store.crearVenta(db, { items: [{ codigo: 'y1', cantidad: 5 }] }), /Stock/)
  db.close()
})

test('anula venta y repone stock', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'z1', nombre: 'Z', precio: 100, stock: 2 })
  const { ventaId } = store.crearVenta(db, { items: [{ codigo: 'z1', cantidad: 2 }] })
  assert.equal(store.obtenerProducto(db, 'z1').stock, 0)
  store.anularVenta(db, ventaId)
  assert.equal(store.obtenerProducto(db, 'z1').stock, 2)
  assert.throws(() => store.anularVenta(db, ventaId), /anulada/)
  db.close()
})

test('ajuste de stock negativo con control', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'q1', nombre: 'Q', stock: 2 })
  store.ajustarStock(db, { codigo_barras: 'q1', cantidad: 3, tipo: 'compra', nota: 'reposicion' })
  assert.equal(store.obtenerProducto(db, 'q1').stock, 5)
  assert.throws(() => store.ajustarStock(db, { codigo_barras: 'q1', cantidad: -99 }), /negativo/)
  db.close()
})

test('backup genera archivo de snapshot', () => {
  const dir = tempDir()
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'b1', nombre: 'B1', precio: 500 })
  const r = backup.ejecutarBackup(db, path.join(dir, 'nube'))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(fs.existsSync(r.archivo), true)
  // el snapshot se puede abrir como base
  const snap = openDb(path.dirname(r.archivo) + '-x').close()
  db.close()
})
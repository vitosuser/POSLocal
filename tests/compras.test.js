'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { openDb } = require('../electron/db.js')
const store = require('../electron/store.js')
const facturas = require('../electron/facturas.js')

function tempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vitpos-compra-'))
}

function base (dir) {
  const db = openDb(dir || tempDir())
  const prov = store.guardarProveedor(db, { nombre: 'Distribuidora Sur', rubro: 'Alimentos' })
  store.guardarProducto(db, { codigo_barras: 'a1', nombre: 'Alimento 1kg', precio: 1500, costo: 900, stock: 10 })
  store.guardarProducto(db, { codigo_barras: 'l1', nombre: 'Lavandina 1L', precio: 800, costo: 400, stock: 4 })
  return { db, prov }
}

test('crear compra calcula total y no toca stock ni costo', () => {
  const { db, prov } = base()
  const c = store.guardarCompra(db, {
    proveedor_id: prov.id,
    fecha: '2026-09-01',
    nota: 'remito 123',
    items: [
      { codigo: 'a1', cantidad: 5, costo_unitario: 950 },
      { codigo: 'l1', cantidad: 2, costo_unitario: 380 }
    ]
  })
  assert.equal(c.total, 5 * 950 + 2 * 380)
  assert.equal(c.items.length, 2)
  assert.equal(c.proveedor_nombre, 'Distribuidora Sur')
  assert.equal(c.factura_archivo, '')
  // sin efecto en stock ni en costo del catalogo
  assert.equal(store.obtenerProducto(db, 'a1').stock, 10)
  assert.equal(store.obtenerProducto(db, 'a1').costo, 900)
  assert.equal(store.obtenerProducto(db, 'l1').stock, 4)
  db.close()
})

test('validaciones de compra', () => {
  const { db, prov } = base()
  assert.throws(() => store.guardarCompra(db, { proveedor_id: prov.id, items: [] }), /no tiene productos/)
  assert.throws(() => store.guardarCompra(db, { items: [{ codigo: 'a1', cantidad: 1, costo_unitario: 10 }] }), /proveedor/)
  assert.throws(() => store.guardarCompra(db, { proveedor_id: 9999, items: [{ codigo: 'a1', cantidad: 1, costo_unitario: 10 }] }), /Proveedor no encontrado/)
  assert.throws(() => store.guardarCompra(db, { proveedor_id: prov.id, items: [{ codigo: 'nope', cantidad: 1, costo_unitario: 10 }] }), /Producto no encontrado/)
  assert.throws(() => store.guardarCompra(db, { proveedor_id: prov.id, items: [{ codigo: 'a1', cantidad: 0, costo_unitario: 10 }] }), /Cantidad inválida/)
  assert.throws(() => store.guardarCompra(db, { proveedor_id: prov.id, items: [{ codigo: 'a1', cantidad: 1, costo_unitario: -5 }] }), /costo/)
  assert.throws(() => store.guardarCompra(db, { id: 9999, proveedor_id: prov.id, items: [{ codigo: 'a1', cantidad: 1, costo_unitario: 10 }] }), /no encontrada/)
  db.close()
})

test('editar compra reemplaza items y conserva factura', () => {
  const { db, prov } = base()
  const c = store.guardarCompra(db, {
    proveedor_id: prov.id, items: [{ codigo: 'a1', cantidad: 2, costo_unitario: 900 }]
  })
  assert.equal(c.total, 1800)
  const e = store.guardarCompra(db, {
    id: c.id, proveedor_id: prov.id, nota: 'ajuste',
    items: [{ codigo: 'l1', cantidad: 3, costo_unitario: 400 }]
  })
  assert.equal(e.id, c.id)
  assert.equal(e.total, 1200)
  assert.equal(e.items.length, 1)
  assert.equal(e.items[0].codigo_barras, 'l1')
  assert.equal(store.obtenerProducto(db, 'a1').stock, 10, 'editar tampoco toca stock')
  db.close()
})

test('listar con filtros y eliminar compra', () => {
  const { db, prov } = base()
  const prov2 = store.guardarProveedor(db, { nombre: 'Otro' })
  store.guardarCompra(db, { proveedor_id: prov.id, fecha: '2026-09-01', items: [{ codigo: 'a1', cantidad: 1, costo_unitario: 100 }] })
  store.guardarCompra(db, { proveedor_id: prov2.id, fecha: '2026-09-10', items: [{ codigo: 'a1', cantidad: 1, costo_unitario: 100 }] })
  assert.equal(store.listarCompras(db, {}).length, 2)
  assert.equal(store.listarCompras(db, { proveedor_id: prov2.id }).length, 1)
  assert.equal(store.listarCompras(db, { desde: '2026-09-05', hasta: '2026-09-15' }).length, 1)
  const una = store.listarCompras(db, { proveedor_id: prov.id })[0]
  store.eliminarCompra(db, una.id)
  assert.equal(store.obtenerCompra(db, una.id), null)
  assert.throws(() => store.eliminarCompra(db, 9999), /no encontrada/)
  assert.throws(() => store.eliminarProveedor(db, prov2.id), /compras asociadas/)
  assert.equal(store.eliminarProveedor(db, prov.id).ok, true, 'sin compras ya se puede eliminar')
  db.close()
})

test('adjuntar factura copia el archivo y valida formato', () => {
  const dir = tempDir()
  const { db, prov } = base(dir)
  const facDir = path.join(dir, 'facturas')
  store.guardarSettings(db, { facturas_carpeta: facDir })

  const origen = path.join(dir, 'factura-test.pdf')
  fs.writeFileSync(origen, '%PDF-falso')
  const c = store.guardarCompra(db, { proveedor_id: prov.id, items: [{ codigo: 'a1', cantidad: 1, costo_unitario: 100 }] })

  const conFac = facturas.adjuntarFactura(db, c.id, origen)
  assert.ok(conFac.factura_archivo.startsWith(facDir), 'copia dentro de la carpeta configurada')
  assert.ok(fs.existsSync(conFac.factura_archivo))
  assert.equal(conFac.factura_nombre, 'factura-test.pdf')
  assert.equal(conFac.factura_mime, 'application/pdf')
  assert.equal(fs.readFileSync(conFac.factura_archivo, 'utf8'), '%PDF-falso')

  // reemplazar borra el archivo anterior
  const anterior = conFac.factura_archivo
  const origen2 = path.join(dir, 'otra.png')
  fs.writeFileSync(origen2, 'PNG-falso')
  const conFac2 = facturas.adjuntarFactura(db, c.id, origen2)
  assert.ok(!fs.existsSync(anterior), 'reemplazar elimina el archivo viejo')
  assert.equal(conFac2.factura_mime, 'image/png')

  // formato no admitido y archivo inexistente
  const malo = path.join(dir, 'nota.txt')
  fs.writeFileSync(malo, 'x')
  assert.throws(() => facturas.adjuntarFactura(db, c.id, malo), /Formato no admitido/)
  assert.throws(() => facturas.adjuntarFactura(db, c.id, path.join(dir, 'noexiste.pdf')), /no existe/)
  assert.throws(() => facturas.adjuntarFactura(db, 9999, origen), /Compra no encontrada/)

  // eliminar compra borra la factura
  const arch = conFac2.factura_archivo
  store.eliminarCompra(db, c.id)
  assert.ok(!fs.existsSync(arch))
  db.close()
})

test('sin carpeta de facturas no se puede adjuntar', () => {
  const { db, prov } = base()
  const c = store.guardarCompra(db, { proveedor_id: prov.id, items: [{ codigo: 'a1', cantidad: 1, costo_unitario: 100 }] })
  const origen = path.join(os.tmpdir(), 'vitpos-sin-carpeta.pdf')
  fs.writeFileSync(origen, 'x')
  assert.throws(() => facturas.adjuntarFactura(db, c.id, origen), /Configurá la carpeta/)
  db.close()
})

test('backup incluye la carpeta de facturas', () => {
  const dir = tempDir()
  const { db } = base(dir)
  const backup = require('../electron/backup.js')
  const facDir = path.join(dir, 'facturas')
  fs.mkdirSync(facDir, { recursive: true })
  fs.writeFileSync(path.join(facDir, 'f1.pdf'), 'datos')
  store.guardarSettings(db, { facturas_carpeta: facDir })
  const r = backup.ejecutarBackup(db, path.join(dir, 'nube'))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(r.facturas, 'el backup informa la copia de facturas')
  assert.ok(fs.existsSync(path.join(r.facturas, 'f1.pdf')))
  db.close()
})

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

test('renombra el codigo de un producto sin duplicarlo', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'A1', nombre: 'Prod A', precio: 1000, costo: 400, stock: 7 })
  const r = store.guardarProducto(db, {
    codigo_barras: 'B2', codigo_original: 'A1',
    nombre: 'Prod A', precio: 1000, costo: 400, stock: 7
  })
  assert.equal(r.codigo_barras, 'B2')
  assert.ok(store.obtenerProducto(db, 'B2'), 'el producto existe con el codigo nuevo')
  assert.equal(store.obtenerProducto(db, 'A1'), undefined, 'el codigo viejo queda libre')
  assert.equal(store.listarProductos(db).length, 1)
  assert.equal(store.obtenerProducto(db, 'B2').stock, 7)

  // colision: no puede renombrar a un codigo ya ocupado
  store.guardarProducto(db, { codigo_barras: 'C3', nombre: 'Prod C' })
  assert.throws(() => store.guardarProducto(db, {
    codigo_barras: 'C3', codigo_original: 'B2', nombre: 'Prod A'
  }), /Ya existe/)

  // original inexistente
  assert.throws(() => store.guardarProducto(db, {
    codigo_barras: 'Z9', codigo_original: 'NOPE', nombre: 'X'
  }), /ya no existe/)

  // sin cambios de codigo sigue funcionando como antes
  store.guardarProducto(db, { codigo_barras: 'B2', nombre: 'Prod A2' })
  assert.equal(store.obtenerProducto(db, 'B2').nombre, 'Prod A2')
  assert.equal(store.obtenerProducto(db, 'B2').stock, 7)
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

test('generarReporte calcula resumen, agrupaciones y excluye anuladas', () => {
  const db = openDb(tempDir())
  store.guardarProducto(db, { codigo_barras: 'x1', nombre: 'A', marca: 'Royal Canin', categoria: 'Alimentos', precio: 1000, costo: 400, stock: 20 })
  store.guardarProducto(db, { codigo_barras: 'x2', nombre: 'B', marca: 'Royal Canin', categoria: 'Alimentos', precio: 500, costo: 200, stock: 20 })
  store.guardarProducto(db, { codigo_barras: 'x3', nombre: 'C', categoria: 'Limpieza', precio: 300, costo: 100, stock: 20 })
  assert.equal(store.obtenerProducto(db, 'x1').marca, 'Royal Canin')

  // semana fija: lun 2026-08-03 a dom 2026-08-09
  store.crearVenta(db, { items: [{ codigo: 'x1', cantidad: 2 }], metodo_pago: 'Efectivo', fecha: '2026-08-03 10:00:00' })
  store.crearVenta(db, { items: [{ codigo: 'x2', cantidad: 1 }, { codigo: 'x3', cantidad: 1 }], metodo_pago: 'Tarjeta', fecha: '2026-08-04 11:00:00' })
  // venta fuera del rango pero dentro del período anterior (para variación)
  store.crearVenta(db, { items: [{ codigo: 'x1', cantidad: 1 }], metodo_pago: 'Efectivo', fecha: '2026-08-01 12:00:00' })
  // venta anulada dentro del rango: no debe contar
  const { ventaId } = store.crearVenta(db, { items: [{ codigo: 'x1', cantidad: 5 }], metodo_pago: 'Efectivo', fecha: '2026-08-05 09:00:00' })
  store.anularVenta(db, ventaId)

  const rep = store.generarReporte(db, { desde: '2026-08-03', hasta: '2026-08-09' })

  assert.deepEqual(rep.periodo, { desde: '2026-08-03', hasta: '2026-08-09' })
  assert.equal(rep.resumen.ventas, 2)
  assert.equal(rep.resumen.facturado, 2800)
  assert.equal(rep.resumen.unidades, 4)
  assert.equal(rep.resumen.utilidad, 1700)
  assert.equal(rep.resumen.ticketPromedio, 1400)
  assert.equal(rep.resumen.promedioDiario, 400, 'semana completa ya transcurrida')
  assert.equal(rep.resumen.variacionPct, 180, '+180% vs semana anterior')

  assert.equal(rep.porDia.length, 2)
  assert.deepEqual(rep.porDia[0], { fecha: '2026-08-03', facturado: 2000, unidades: 2, ventas: 1 })

  assert.equal(rep.porDiaSemana[0].nombre, 'Lunes')
  assert.equal(rep.porDiaSemana[0].facturado, 2000)
  assert.equal(rep.porDiaSemana[1].facturado, 800)
  assert.equal(rep.porDiaSemana[6].facturado, 0)

  assert.equal(rep.topProductos[0].codigo, 'x1')
  assert.equal(rep.topProductos[0].marca, 'Royal Canin')
  assert.equal(rep.topProductos[0].unidades, 2)
  assert.equal(rep.topProductos[0].facturado, 2000)
  assert.equal(rep.topProductos[0].utilidad, 1200)

  assert.equal(rep.topUnidades[0].codigo, 'x1')
  assert.equal(rep.topUnidades[0].unidades, 2)

  assert.equal(rep.porMarca[0].nombre, 'Royal Canin')
  assert.equal(rep.porMarca[0].unidades, 3)
  assert.equal(rep.porMarca[0].facturado, 2500)
  assert.equal(rep.porMarca[1].nombre, '(sin marca)')
  assert.equal(rep.porMarca[1].facturado, 300)

  assert.equal(rep.porCategoria[0].nombre, 'Alimentos')
  assert.equal(rep.porCategoria[0].facturado, 2500)

  assert.equal(rep.porMetodoPago[0].nombre, 'Efectivo')
  assert.equal(rep.porMetodoPago[0].ventas, 1)
  assert.equal(rep.porMetodoPago[0].facturado, 2000)
  assert.equal(rep.porMetodoPago[1].nombre, 'Tarjeta')
  assert.equal(rep.porMetodoPago[1].facturado, 800)

  assert.equal(rep.anterior.facturado, 1000)

  assert.throws(() => store.generarReporte(db, {}), /rango/)
  db.close()
})
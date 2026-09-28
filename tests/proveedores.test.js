'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { openDb } = require('../electron/db.js')
const store = require('../electron/store.js')

function tempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vitpos-prov-'))
}

test('alta y edición de proveedor con id autoincremental', () => {
  const db = openDb(tempDir())
  const p1 = store.guardarProveedor(db, { nombre: 'Distribuidora Sur', rubro: 'Alimentos', contacto: '11 5555 1111', nota: 'Reparte martes' })
  assert.equal(p1.id, 1)
  assert.equal(p1.nombre, 'Distribuidora Sur')
  assert.equal(p1.rubro, 'Alimentos')

  const p2 = store.guardarProveedor(db, { nombre: 'Limpieza Total', rubro: 'Limpieza' })
  assert.equal(p2.id, 2)

  const edit = store.guardarProveedor(db, { id: p1.id, nombre: 'Distribuidora Sur SRL', rubro: 'Alimentos', contacto: '11 5555 2222' })
  assert.equal(edit.nombre, 'Distribuidora Sur SRL')
  assert.equal(edit.contacto, '11 5555 2222')
  assert.equal(store.obtenerProveedor(db, p1.id).nota, 'Reparte martes')
  db.close()
})

test('el nombre de proveedor es obligatorio', () => {
  const db = openDb(tempDir())
  assert.throws(() => store.guardarProveedor(db, { nombre: '' }), /obligatorio/)
  assert.throws(() => store.guardarProveedor(db, { id: 9999, nombre: 'X' }), /no encontrado/)
  assert.equal(store.obtenerProveedor(db, 9999), undefined)
  db.close()
})

test('listar y eliminar proveedor', () => {
  const db = openDb(tempDir())
  store.guardarProveedor(db, { nombre: 'B', rubro: 'R1' })
  store.guardarProveedor(db, { nombre: 'A', rubro: 'R2' })
  const lista = store.listarProveedores(db)
  assert.equal(lista.length, 2)
  assert.equal(lista[0].nombre, 'A', 'ordena por nombre')
  store.eliminarProveedor(db, lista[0].id)
  assert.equal(store.listarProveedores(db).length, 1)
  assert.throws(() => store.eliminarProveedor(db, 9999), /no encontrado/)
  db.close()
})

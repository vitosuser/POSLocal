'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Regresion: los wrappers conOK/conOKAsync ya separan el evento IPC,
// asi que los callbacks internos reciben UN solo argumento (los datos).
// Si un handler declara (_e, arg), arg queda undefined silenciosamente.
// Este archivo carga ipc.js con un electron falso para probar los
// handlers exactamente como los invoca ipcRenderer.invoke.

const handlers = new Map()
const electronPath = require.resolve('electron')
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    ipcMain: {
      handle: (canal, fn) => handlers.set(canal, fn)
    },
    BrowserWindow: class {
      async loadURL () {}
      get webContents () { return this }
      async printToPDF () { return Buffer.from('%PDF-falso') }
      destroy () {}
    },
    dialog: {
      showSaveDialog: async () => ({ canceled: true })
    }
  }
}

const { openDb } = require('../electron/db.js')
const store = require('../electron/store.js')
const { registrarIpc } = require('../electron/ipc.js')

function tempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vitpos-ipc-'))
}

function setup () {
  const dir = tempDir()
  const db = openDb(dir)
  handlers.clear()
  registrarIpc({ db, app: { getPath: () => dir } })
  return { db }
}

test('reportes:pdf recibe el rango y llega hasta el dialogo de guardado', async () => {
  const { db } = setup()
  store.guardarProducto(db, { codigo_barras: 'r1', nombre: 'A', precio: 1000, costo: 400, stock: 5, marca: 'M', categoria: 'C' })
  store.crearVenta(db, { items: [{ codigo: 'r1', cantidad: 1 }] })

  const exportar = handlers.get('reportes:pdf')
  const bien = await exportar(null, { desde: '2020-01-01', hasta: '2030-12-31' })
  assert.equal(bien.ok, true, JSON.stringify(bien))
  assert.deepEqual(bien.datos, { ok: false, cancelado: true }, 'debe llegar al dialogo, no fallar por rango')

  const mal = await exportar(null, {})
  assert.equal(mal.ok, false)
  assert.match(mal.error, /rango/)
  db.close()
})

test('printer:imprimirVenta recibe el id de la venta', async () => {
  const { db } = setup()
  store.guardarProducto(db, { codigo_barras: 'p1', nombre: 'A', precio: 500, costo: 200, stock: 3 })
  const { ventaId } = store.crearVenta(db, { items: [{ codigo: 'p1', cantidad: 1 }] })

  const reimprimir = handlers.get('printer:imprimirVenta')
  // papel desactivado por defecto: encuentra la venta y omite la impresion
  const r = await reimprimir(null, ventaId)
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(r.datos, { ok: false, omitido: true })

  const inexistente = await reimprimir(null, 99999)
  assert.equal(inexistente.ok, false)
  assert.match(inexistente.error, /no encontrada/)
  db.close()
})
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { JSDOM } = require('jsdom')

const DEFAULT_SETTINGS = {
  nombre_negocio: 'Mi Tienda', direccion: '', telefono: '', pie_ticket: 'Gracias',
  simbolo_moneda: '$', metodo_pago_default: 'Efectivo',
  lect_tipo: 'teclado',
  imp_papel: 'desactivada', imp_tipo_conexion: 'red', imp_ip: '', imp_puerto_red: '9100',
  imp_serie_puerto: '', imp_serie_baudrate: '9600', imp_ancho: '58',
  backup_activado: '0', backup_carpeta: '', backup_frecuencia: 'cierre', backup_hora: '20:00',
  backup_ultimo: '', backup_ultimo_archivo: ''
}

const PRODUCTOS = [
  { codigo_barras: '7790001', nombre: 'Croquetas Perro 3kg', categoria: 'Alimentos', precio: 15000, costo: 10000, stock: 10, stock_minimo: 3, activo: 1 },
  { codigo_barras: '7790002', nombre: 'Detergente 1L', categoria: 'Limpieza', precio: 2400, costo: 1500, stock: 0, stock_minimo: 5, activo: 1 }
]

function crearApi () {
  return {
    settings: {
      getAll: async () => ({ ok: true, datos: { ...DEFAULT_SETTINGS } }),
      setMany: async (d) => ({ ok: true, datos: { ...DEFAULT_SETTINGS, ...d } })
    },
    productos: {
      listar: async () => ({ ok: true, datos: PRODUCTOS.map(p => ({ ...p })) }),
      obtener: async (codigo) => ({ ok: true, datos: PRODUCTOS.find(p => p.codigo_barras === codigo) || null }),
      guardar: async (p) => ({ ok: true, datos: p }),
      eliminar: async () => ({ ok: true, datos: { ok: true } })
    },
    ventas: {
      crear: async (d) => ({ ok: true, datos: { ventaId: 42, cambio: 0, total: d.total } }),
      listar: async () => ({ ok: true, datos: [] }),
      detalle: async () => ({ ok: true, datos: null }),
      anular: async () => ({ ok: true, datos: { ok: true } }),
      totales: async () => ({ ok: true, datos: { cantidad: 0, total: 0, porMetodo: {} } })
    },
    stock: {
      ajustar: async () => ({ ok: true, datos: { stock: 5 } }),
      movimientos: async () => ({ ok: true, datos: [] })
    },
    backup: {
      ahora: async () => ({ ok: true, datos: { ok: true, archivo: '/nube/x.db' } }),
      estado: async () => ({ ok: true, datos: { activado: false, carpeta: '', frecuencia: 'cierre', hora: '20:00', ultimo: '', ultimoArchivo: '' } })
    },
    impresora: {
      estado: async () => ({ ok: true, datos: { papel: 'desactivada', descripcion: 'desactivada' } }),
      probar: async () => ({ ok: true, datos: { ok: true } }),
      imprimirVenta: async () => ({ ok: true, datos: { ok: true, omitido: true } })
    },
    app: {
      info: async () => ({ ok: true, datos: { version: '0.1.0', nombre: 'VitPos', userData: '/tmp/x', dbPath: '/tmp/x/vitpos.db', plataforma: 'linux' } })
    }
  }
}

async function cargarApp () {
  const index = path.join(__dirname, '..', 'src', 'index.html')
  const errors = []
  const dom = new JSDOM(fs.readFileSync(index, 'utf8'), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: pathToFileURL(index).href,
    beforeParse (window) {
      window.api = crearApi()
      window.addEventListener('error', e => { errors.push(e.error || e.message) })
      window.confirm = () => true
    }
  })
  await new Promise(res => {
    dom.window.document.addEventListener('DOMContentLoaded', () => setTimeout(res, 150))
  })
  return { dom, errors, document: dom.window.document, kw: dom.window }
}

function tocarEnter (document, kw, input) {
  input.dispatchEvent(new kw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  input.dispatchEvent(new kw.Event('input', { bubbles: true }))
  input.dispatchEvent(new kw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

test('la app carga sin errores y renderiza los datos', async () => {
  const { dom, document, errors } = await cargarApp()
  try {
    assert.deepEqual(errors, [], `errores de runtime: ${errors.map(e => e && e.message).join('; ')}`)
    assert.equal(document.querySelectorAll('#metodos-pago .metodo-btn').length, 6)
    assert.equal(document.querySelector('#brand-negocio').textContent, 'Mi Tienda')
    assert.equal(document.querySelectorAll('#productos-body tr').length, 2)
    assert.equal(document.querySelectorAll('#stock-body tr').length, 2)
    assert.equal(document.querySelector('#ventas-hoy-total').textContent, '$ 0,00')
    assert.equal(document.querySelector('[name="nombre_negocio"]').value, 'Mi Tienda')
    assert.equal(document.querySelector('[name="imp_papel"]').value, 'desactivada')
  } finally { dom.window.close() }
})

test('agregar producto al carrito desde el buscador', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    const input = document.querySelector('#buscador-venta')
    input.value = '7790001'
    tocarEnter(document, kw, input)
    await new Promise(r => setTimeout(r, 150))
    const filas = document.querySelectorAll('#carrito-body tr')
    assert.ok(filas.length >= 1, `carrito sin filas: ${filas.length}`)
    assert.match(document.querySelector('#total-carrito').textContent, /300,00/)
    assert.equal(document.querySelector('#btn-cobrar').disabled, false)
  } finally { dom.window.close() }
})

test('agregar varias unidades suma total', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    const input = document.querySelector('#buscador-venta')
    input.value = '7790001'
    tocarEnter(document, kw, input)
    await new Promise(r => setTimeout(r, 80))
    const mas = document.querySelector('#carrito-body tr [data-accion="mas"]')
    assert.ok(mas, 'botón + no presente')
    mas.dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 20))
    assert.match(document.querySelector('#total-carrito').textContent, /450,00/)
  } finally { dom.window.close() }
})
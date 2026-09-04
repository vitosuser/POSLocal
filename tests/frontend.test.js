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
  { codigo_barras: '7790001', nombre: 'Croquetas Perro 3kg', categoria: 'Alimentos', marca: 'Royal Canin', precio: 15000, costo: 10000, stock: 10, stock_minimo: 3, activo: 1 },
  { codigo_barras: '7790002', nombre: 'Detergente 1L', categoria: 'Limpieza', precio: 2400, costo: 1500, stock: 0, stock_minimo: 5, activo: 1 }
]

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function armarReporte () {
  return {
    periodo: { desde: '2026-08-17', hasta: '2026-08-23' },
    moneda: '$',
    resumen: { ventas: 2, facturado: 17400, descuentos: 0, unidades: 3, utilidad: 4900, ticketPromedio: 8700, promedioDiario: 2486, variacionPct: 12.5 },
    porDia: [
      { fecha: '2026-08-17', facturado: 15000, unidades: 1, ventas: 1 },
      { fecha: '2026-08-18', facturado: 2400, unidades: 2, ventas: 1 }
    ],
    porDiaSemana: DIAS_SEMANA.map((nombre, dia) => ({
      dia, nombre,
      facturado: dia === 0 ? 15000 : dia === 1 ? 2400 : 0,
      unidades: dia === 0 ? 1 : dia === 1 ? 2 : 0
    })),
    topProductos: [
      { codigo: '7790001', nombre: 'Croquetas Perro 3kg', marca: 'Royal Canin', categoria: 'Alimentos', unidades: 1, facturado: 15000, utilidad: 5000 },
      { codigo: '7790002', nombre: 'Detergente 1L', marca: '', categoria: 'Limpieza', unidades: 2, facturado: 2400, utilidad: -100 }
    ],
    topUnidades: [
      { codigo: '7790002', nombre: 'Detergente 1L', marca: '', unidades: 2, facturado: 2400 },
      { codigo: '7790001', nombre: 'Croquetas Perro 3kg', marca: 'Royal Canin', unidades: 1, facturado: 15000 }
    ],
    porMarca: [
      { nombre: 'Royal Canin', unidades: 1, facturado: 15000 },
      { nombre: '(sin marca)', unidades: 2, facturado: 2400 }
    ],
    porCategoria: [
      { nombre: 'Alimentos', unidades: 1, facturado: 15000 },
      { nombre: 'Limpieza', unidades: 2, facturado: 2400 }
    ],
    porMetodoPago: [
      { nombre: 'Efectivo', ventas: 1, facturado: 15000 },
      { nombre: 'Tarjeta', ventas: 1, facturado: 2400 }
    ],
    anterior: { ventas: 1, facturado: 15466 }
  }
}

function crearApi () {
  const contadores = { listarProductos: 0, generarReporte: 0, exportarPdf: 0, ultimoGuardar: null }
  return {
    __contadores: contadores,
    settings: {
      getAll: async () => ({ ok: true, datos: { ...DEFAULT_SETTINGS } }),
      setMany: async (d) => ({ ok: true, datos: { ...DEFAULT_SETTINGS, ...d } })
    },
    productos: {
      listar: async () => { contadores.listarProductos++; return { ok: true, datos: PRODUCTOS.map(p => ({ ...p })) } },
      obtener: async (codigo) => ({ ok: true, datos: PRODUCTOS.find(p => p.codigo_barras === codigo) || null }),
      guardar: async (p) => { contadores.ultimoGuardar = p; return { ok: true, datos: p } },
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
    reportes: {
      generar: async () => { contadores.generarReporte++; return { ok: true, datos: armarReporte() } },
      exportarPdf: async () => { contadores.exportarPdf++; return { ok: true, datos: { ok: true, archivo: '/tmp/reporte.pdf' } } }
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
  const api = crearApi()
  const dom = new JSDOM(fs.readFileSync(index, 'utf8'), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: pathToFileURL(index).href,
    beforeParse (window) {
      window.api = api
      window.addEventListener('error', e => { errors.push(e.error || e.message) })
      window.confirm = () => true
    }
  })
  await new Promise(res => {
    dom.window.document.addEventListener('DOMContentLoaded', () => setTimeout(res, 150))
  })
  return { dom, errors, document: dom.window.document, kw: dom.window, api }
}

function tocarEnter (document, kw, input) {
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
    assert.match(document.querySelector('#total-carrito').textContent, /150,00/)
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
    assert.match(document.querySelector('#total-carrito').textContent, /300,00/)
  } finally { dom.window.close() }
})

test('escribir un codigo completo solo muestra sugerencias, sin auto-agregar', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    const input = document.querySelector('#buscador-venta')
    input.value = '7790001'
    input.dispatchEvent(new kw.Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 80))
    // no se agrega automaticamente: el carrito queda vacio
    assert.equal(document.querySelectorAll('#carrito-body tr').length, 0)
    assert.equal(input.value, '7790001', 'el input conserva el texto')
    // si aparecen sugerencias parciales
    const caja = document.querySelector('#sugerencias')
    assert.equal(caja.classList.contains('oculto'), false, 'deben aparecer sugerencias')
  } finally { dom.window.close() }
})

test('sugerencias por nombre navegables con teclado', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    const input = document.querySelector('#buscador-venta')
    input.value = 'Detergente'
    input.dispatchEvent(new kw.Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 300))
    const caja = document.querySelector('#sugerencias')
    assert.equal(caja.classList.contains('oculto'), false, 'no aparecieron sugerencias')
    assert.ok(caja.querySelector('.sug-item.colocada'), 'primera sugerencia resaltada')
    input.dispatchEvent(new kw.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    input.dispatchEvent(new kw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 50))
    assert.match(document.querySelector('#total-carrito').textContent, /24,00/)
    assert.equal(input.value, '')
    assert.equal(caja.classList.contains('oculto'), true)
  } finally { dom.window.close() }
})

test('el escaner con Enter agrega el producto al carrito', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    const input = document.querySelector('#buscador-venta')
    input.value = '7790001'
    tocarEnter(document, kw, input)
    await new Promise(r => setTimeout(r, 80))
    assert.equal(document.querySelectorAll('#carrito-body tr').length, 1)
    assert.match(document.querySelector('#total-carrito').textContent, /150,00/)
    assert.equal(input.value, '', 'el buscador queda limpio tras agregar')
  } finally { dom.window.close() }
})

test('tipear en otros inputs no roba el foco al buscador de venta', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    document.querySelector('.nav-item[data-seccion="productos"]').dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 80))
    const buscadorProductos = document.querySelector('#buscar-productos')
    assert.ok(buscadorProductos, 'input de productos presente')
    // el usuario ya esta escribiendo en el input de productos
    buscadorProductos.focus()
    const ev = new kw.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    buscadorProductos.dispatchEvent(ev)
    assert.equal(document.activeElement, buscadorProductos, 'el foco no se mueve al escribir en otro input')
    // el buscador de venta no recibe el texto ni roba el foco
    const buscadorVenta = document.querySelector('#buscador-venta')
    assert.equal(buscadorVenta.value, '', 'el buscador de venta queda intacto')
    assert.notEqual(document.activeElement, buscadorVenta)
  } finally { dom.window.close() }
})

test('navegar por el menu refresca los datos de la base', async () => {
  const { dom, document, kw, api } = await cargarApp()
  try {
    assert.equal(api.__contadores.listarProductos, 1, 'carga inicial')
    document.querySelector('.nav-item[data-seccion="productos"]').dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 80))
    assert.equal(api.__contadores.listarProductos, 2, 'refresco al entrar a productos')
    assert.equal(document.querySelectorAll('#productos-body tr').length, 2)
  } finally { dom.window.close() }
})

test('el carrito sobrevive la navegacion entre secciones', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    const input = document.querySelector('#buscador-venta')
    input.value = '7790001'
    tocarEnter(document, kw, input)
    await new Promise(r => setTimeout(r, 80))
    document.querySelector('.nav-item[data-seccion="stock"]').dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 60))
    document.querySelector('.nav-item[data-seccion="venta"]').dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 100))
    assert.equal(document.querySelectorAll('#carrito-body tr').length, 1, 'carrito vaciado al navegar')
    assert.match(document.querySelector('#total-carrito').textContent, /150,00/)
  } finally { dom.window.close() }
})

test('la tabla de productos muestra la marca', async () => {
  const { dom, document } = await cargarApp()
  try {
    const primeraFila = document.querySelector('#productos-body tr')
    assert.match(primeraFila.textContent, /Royal Canin/)
  } finally { dom.window.close() }
})

test('las sugerencias muestran el codigo a la izquierda del nombre', async () => {
  const { dom, document, kw } = await cargarApp()
  try {
    const input = document.querySelector('#buscador-venta')
    input.value = 'Detergente'
    input.dispatchEvent(new kw.Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 300))
    const item = document.querySelector('#sugerencias .sug-item')
    assert.ok(item, 'no aparecieron sugerencias')
    const codigo = item.querySelector('.sug-codigo')
    assert.ok(codigo, 'falta el codigo en la sugerencia')
    assert.equal(codigo.textContent.trim(), '7790002')
    // el codigo debe aparecer antes que el nombre en el orden del DOM
    assert.ok(codigo.nextElementSibling.classList.contains('sug-nombre'))
  } finally { dom.window.close() }
})

test('editar y cambiar el codigo envia codigo_original', async () => {
  const { dom, document, kw, api } = await cargarApp()
  try {
    document.querySelector('#productos-body tr [data-accion="editar"]')
      .dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 50))
    assert.equal(document.querySelector('#p-codigo').value, '7790001', 'el modal carga con el codigo actual')

    const inputCodigo = document.querySelector('#p-codigo')
    inputCodigo.value = '9999'
    document.querySelector('#btn-guardar-producto').dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 100))

    const guardado = api.__contadores.ultimoGuardar
    assert.ok(guardado, 'no se llamo a guardar')
    assert.equal(guardado.codigo_barras, '9999')
    assert.equal(guardado.codigo_original, '7790001', 'debe indicar el codigo original para renombrar')
  } finally { dom.window.close() }
})

test('la seccion reportes renderiza el reporte semanal', async () => {
  const { dom, document, kw, api } = await cargarApp()
  try {
    assert.equal(api.__contadores.generarReporte, 1, 'reporte inicial al cargar')
    document.querySelector('.nav-item[data-seccion="reportes"]').dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 100))
    assert.equal(api.__contadores.generarReporte, 2, 'refresco al entrar a reportes')

    // tarjetas resumen
    const resumen = document.querySelector('#rep-resumen').textContent
    assert.match(resumen, /174,00/, 'facturado')
    assert.match(resumen, /87,00/, 'ticket promedio')
    assert.match(resumen, /49,00/, 'utilidad')
    assert.match(resumen, /12\.5% vs anterior/)

    // grafico con 7 columnas (semana)
    assert.equal(document.querySelectorAll('#rep-chart .rep-col').length, 7)

    // dias de la semana
    const dias = document.querySelector('#rep-dias').textContent
    assert.match(dias, /Lunes/)
    assert.match(dias, /150,00/)

    // tablas
    assert.match(document.querySelector('#rep-topfac-body').textContent, /Croquetas Perro 3kg/)
    assert.match(document.querySelector('#rep-topuni-body').textContent, /Detergente 1L/)
    assert.match(document.querySelector('#rep-marcas-body').textContent, /Royal Canin/)
    assert.match(document.querySelector('#rep-categorias-body').textContent, /Limpieza/)
    assert.match(document.querySelector('#rep-metodos-body').textContent, /Efectivo/)

    // etiqueta del periodo semanal lun-dom
    assert.match(document.querySelector('#rep-label').textContent, /^Semana del/)
    assert.equal(document.querySelector('#rep-next').disabled, true, 'no se puede avanzar mas alla del periodo actual')
  } finally { dom.window.close() }
})

test('cambiar a mensual y exportar pdf llaman a la api', async () => {
  const { dom, document, kw, api } = await cargarApp()
  try {
    const tipo = document.querySelector('#rep-tipo')
    tipo.value = 'mes'
    tipo.dispatchEvent(new kw.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 80))
    assert.equal(api.__contadores.generarReporte, 2)
    assert.doesNotMatch(document.querySelector('#rep-label').textContent, /^Semana del/)

    document.querySelector('#rep-pdf').dispatchEvent(new kw.MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 80))
    assert.equal(api.__contadores.exportarPdf, 1)
  } finally { dom.window.close() }
})
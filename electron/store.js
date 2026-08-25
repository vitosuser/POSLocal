'use strict'

const { SETTING_DEFAULTS, isoLocal } = require('./db.js')

function transaccion (db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (_) {}
    throw e
  }
}

// ---------------- Productos ----------------

function listarProductos (db, { incluirInactivos = true } = {}) {
  let sql = `SELECT * FROM productos`
  if (!incluirInactivos) sql += ` WHERE activo = 1`
  sql += ` ORDER BY activo DESC, nombre COLLATE NOCASE`
  return db.prepare(sql).all()
}

function obtenerProducto (db, codigo) {
  return db.prepare('SELECT * FROM productos WHERE codigo_barras = ?').get(String(codigo).trim())
}

function guardarProducto (db, datos) {
  const codigo = String(datos.codigo_barras || '').trim()
  const nombre = String(datos.nombre || '').trim()
  if (!codigo) throw new Error('El codigo de barras es obligatorio')
  if (!nombre) throw new Error('El nombre es obligatorio')

  // renombrado: cambiar el codigo de un producto existente por otro
  const original = String(datos.codigo_original || '').trim()
  let filaOriginal = null
  if (original && original !== codigo) {
    filaOriginal = obtenerProducto(db, original)
    if (!filaOriginal) throw new Error(`El producto con código ${original} ya no existe`)
    if (obtenerProducto(db, codigo)) {
      throw new Error(`Ya existe un producto con el código ${codigo}`)
    }
  }

  const existente = obtenerProducto(db, codigo)

  const precio = centsValido(datos.precio, 'precio', existente ? existente.precio : 0)
  const costo = centsValido(datos.costo, 'costo', existente ? existente.costo : 0)
  const stock = numValido(datos.stock, 'stock', existente ? existente.stock : 0)
  const stockMinimo = numValido(datos.stock_minimo, 'stock minimo', existente ? existente.stock_minimo : 0)
  const categoria = String(datos.categoria || '').trim()
  const marca = String(datos.marca || '').trim()
  const activo = datos.activo === false || datos.activo === 0 ? 0 : 1

  if (filaOriginal) {
    db.prepare(`UPDATE productos SET codigo_barras=?, nombre=?, categoria=?, marca=?, precio=?, costo=?, stock=?, stock_minimo=?, activo=?, actualizado_en=? WHERE codigo_barras=?`)
      .run(codigo, nombre, categoria, marca, precio, costo, stock, stockMinimo, activo, isoLocal(), original)
  } else if (existente) {
    db.prepare(`UPDATE productos SET nombre=?, categoria=?, marca=?, precio=?, costo=?, stock=?, stock_minimo=?, activo=?, actualizado_en=? WHERE codigo_barras=?`)
      .run(nombre, categoria, marca, precio, costo, stock, stockMinimo, activo, isoLocal(), codigo)
  } else {
    db.prepare(`INSERT INTO productos (codigo_barras, nombre, categoria, marca, precio, costo, stock, stock_minimo, activo)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(codigo, nombre, categoria, marca, precio, costo, stock, stockMinimo, activo)
  }
  return obtenerProducto(db, codigo)
}

function eliminarProducto (db, codigo) {
  const p = obtenerProducto(db, codigo)
  if (!p) throw new Error('Producto no encontrado')
  db.prepare('DELETE FROM productos WHERE codigo_barras = ?').run(String(codigo).trim())
  return { ok: true }
}

// ---------------- Ventas ----------------

function crearVenta (db, datos) {
  const items = Array.isArray(datos.items) ? datos.items : []
  if (!items.length) throw new Error('No hay productos en la venta')

  return transaccion(db, () => {
    const filas = []
    let subtotal = 0
    for (const it of items) {
      const p = obtenerProducto(db, it.codigo)
      if (!p) throw new Error(`Producto no encontrado: ${it.codigo}`)
      if (!p.activo) throw new Error(`El producto "${p.nombre}" esta desactivado`)
      const cantidad = Number(it.cantidad)
      if (!(cantidad > 0) || !Number.isFinite(cantidad)) {
        throw new Error(`Cantidad invalida para "${p.nombre}"`)
      }
      if (p.stock < cantidad) {
        throw new Error(`Stock insuficiente de "${p.nombre}" (disponible: ${fmtStock(p.stock)})`)
      }
      const totalLinea = Math.round(p.precio * cantidad)
      subtotal += totalLinea
      filas.push({ p, cantidad, totalLinea })
    }

    const descuento = Math.min(Math.max(Math.round(Number(datos.descuento) || 0), 0), subtotal)
    const total = subtotal - descuento
    const metodo = String(datos.metodo_pago || '').trim() || 'Efectivo'
    const recibido = Math.max(0, Math.round(Number(datos.recibido) || 0))
    const cambio = Math.max(0, recibido - total)
    const operador = String(datos.operador || '').trim().slice(0, 80) || ''

    // fecha opcional (para tests / importaciones); formato 'YYYY-MM-DD HH:MM:SS'
    const fecha = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(datos.fecha || '') ? datos.fecha : isoLocal()
    const info = db.prepare(`INSERT INTO ventas (fecha_hora, subtotal, descuento, total, metodo_pago, recibido, cambio, estado, operador)
                             VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(fecha, subtotal, descuento, total, metodo, recibido, cambio, 'completada', operador)
    const ventaId = Number(info.lastInsertRowid)

    const insItem = db.prepare(`INSERT INTO ventas_items (venta_id, codigo_barras, nombre, cantidad, precio_unitario, costo_unitario, total_linea)
                                VALUES (?,?,?,?,?,?,?)`)
    const updStock = db.prepare(`UPDATE productos SET stock = ?, actualizado_en = ? WHERE codigo_barras = ?`)
    const mov = db.prepare(`INSERT INTO stock_movimientos (codigo_barras, tipo, cantidad, stock_resultante, nota, fecha)
                            VALUES (?,?,?,?,?,?)`)
    for (const f of filas) {
      insItem.run(ventaId, f.p.codigo_barras, f.p.nombre, f.cantidad, f.p.precio, f.p.costo, f.totalLinea)
      const nuevo = Number((f.p.stock - f.cantidad).toFixed(3))
      updStock.run(nuevo, isoLocal(), f.p.codigo_barras)
      mov.run(f.p.codigo_barras, 'venta', f.cantidad, nuevo, '', fecha)
    }

    return { ventaId, subtotal, descuento, total, cambio, metodo, fecha }
  })
}

function obtenerVenta (db, id) {
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(Number(id))
  if (!venta) return null
  venta.items = db.prepare('SELECT * FROM ventas_items WHERE venta_id = ? ORDER BY id').all(venta.id)
  return venta
}

function listarVentas (db, { desde, hasta, estado } = {}) {
  const conds = []
  const params = []
  if (desde) { conds.push(`date(fecha_hora) >= date(?)`); params.push(desde) }
  if (hasta) { conds.push(`date(fecha_hora) <= date(?)`); params.push(hasta) }
  if (estado) { conds.push(`estado = ?`); params.push(estado) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const ventas = db.prepare(`SELECT * FROM ventas ${where} ORDER BY id DESC`).all(...params)
  if (!ventas.length) return ventas
  const ids = ventas.map(v => v.id)
  const placeholders = ids.map(() => '?').join(',')
  const items = db.prepare(`SELECT * FROM ventas_items WHERE venta_id IN (${placeholders}) ORDER BY id`).all(...ids)
  const porVenta = new Map()
  for (const it of items) {
    if (!porVenta.has(it.venta_id)) porVenta.set(it.venta_id, [])
    porVenta.get(it.venta_id).push(it)
  }
  for (const v of ventas) v.items = porVenta.get(v.id) || []
  return ventas
}

function anularVenta (db, id) {
  return transaccion(db, () => {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(Number(id))
    if (!venta) throw new Error('Venta no encontrada')
    if (venta.estado !== 'completada') throw new Error('La venta ya fue anulada')

    const items = db.prepare('SELECT * FROM ventas_items WHERE venta_id = ?').all(venta.id)
    const getProd = db.prepare('SELECT stock FROM productos WHERE codigo_barras = ?')
    const updStock = db.prepare(`UPDATE productos SET stock = ?, actualizado_en = ? WHERE codigo_barras = ?`)
    const mov = db.prepare(`INSERT INTO stock_movimientos (codigo_barras, tipo, cantidad, stock_resultante, nota, fecha)
                            VALUES (?,?,'anulacion',?,?,?)`)
    const fecha = isoLocal()
    for (const it of items) {
      const prod = getProd.get(it.codigo_barras)
      if (prod) {
        const nuevo = Number((prod.stock + it.cantidad).toFixed(3))
        updStock.run(nuevo, isoLocal(), it.codigo_barras)
        mov.run(it.codigo_barras, it.cantidad, nuevo, `Anulacion de venta N° ${venta.id}`, fecha)
      }
    }
    db.prepare(`UPDATE ventas SET estado = 'anulada' WHERE id = ?`).run(venta.id)
    return { ok: true, venta: obtenerVenta(db, venta.id) }
  })
}

function totalesDelDia (db, { desde, hasta } = {}) {
  const ventas = listarVentas(db, { desde, hasta, estado: 'completada' })
  const res = { cantidad: ventas.length, total: 0, porMetodo: {} }
  for (const v of ventas) {
    res.total += v.total
    const m = v.metodo_pago
    res.porMetodo[m] = (res.porMetodo[m] || 0) + v.total
  }
  return res
}

// ---------------- Stock ----------------

function ajustarStock (db, datos) {
  const codigo = String(datos.codigo_barras || '').trim()
  const cantidad = numValido(datos.cantidad, 'cantidad')
  const tipo = String(datos.tipo || 'ajuste').trim()
  const nota = String(datos.nota || '').trim().slice(0, 200)

  return transaccion(db, () => {
    const p = obtenerProducto(db, codigo)
    if (!p) throw new Error('Producto no encontrado')
    const nuevo = Number((p.stock + cantidad).toFixed(3))
    if (nuevo < 0) throw new Error(`El stock no puede quedar negativo (actual: ${fmtStock(p.stock)})`)
    db.prepare(`UPDATE productos SET stock = ?, actualizado_en = ? WHERE codigo_barras = ?`)
      .run(nuevo, isoLocal(), codigo)
    db.prepare(`INSERT INTO stock_movimientos (codigo_barras, tipo, cantidad, stock_resultante, nota, fecha)
                VALUES (?,?,?,?,?,?)`)
      .run(codigo, tipo, cantidad, nuevo, nota, isoLocal())
    return { codigo_barras: codigo, stock: nuevo }
  })
}

function movimientosStock (db, codigo, limite = 100) {
  if (codigo) {
    return db.prepare(`SELECT * FROM stock_movimientos WHERE codigo_barras = ? ORDER BY id DESC LIMIT ?`)
      .all(String(codigo).trim(), Number(limite))
  }
  return db.prepare(`SELECT * FROM stock_movimientos ORDER BY id DESC LIMIT ?`).all(Number(limite))
}

// ---------------- Settings ----------------

function obtenerSettings (db) {
  const filas = db.prepare('SELECT clave, valor FROM settings').all()
  const res = { ...SETTING_DEFAULTS }
  for (const f of filas) res[f.clave] = f.valor
  return res
}

function guardarSettings (db, datos) {
  const stmt = db.prepare(`INSERT INTO settings (clave, valor) VALUES (?,?)
                           ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`)
  let n = 0
  for (const [clave, valor] of Object.entries(datos)) {
    if (!(clave in SETTING_DEFAULTS)) continue
    stmt.run(clave, String(valor ?? ''))
    n++
  }
  return obtenerSettings(db)
}

// ---------------- Reportes ----------------

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function parseDia (s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function aFecha (d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function diffDias (desde, hasta) {
  return Math.round((parseDia(hasta) - parseDia(desde)) / 86400000)
}

function restarDias (fechaStr, n) {
  const d = parseDia(fechaStr)
  d.setDate(d.getDate() - n)
  return aFecha(d)
}

// dias del periodo ya transcurridos (si incluye hoy, cuenta hasta hoy)
function contarDiasTranscurridos (desde, hasta) {
  const hoy = isoLocal().slice(0, 10)
  const limite = hasta > hoy ? hoy : hasta
  return Math.max(1, diffDias(desde, limite) + 1)
}

function indiceDiaSemana (fechaStr) {
  return (parseDia(fechaStr).getDay() + 6) % 7 // lunes = 0
}

function totalesPeriodo (db, desde, hasta) {
  const row = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS t
                          FROM ventas WHERE estado='completada'
                          AND date(fecha_hora) >= date(?) AND date(fecha_hora) <= date(?)`)
    .get(desde, hasta)
  return { ventas: Number(row.n), facturado: Number(row.t) }
}

function agruparEn (mapa, clave, filasBase) {
  if (!mapa.has(clave)) mapa.set(clave, { ...filasBase, nombre: clave })
  return mapa.get(clave)
}

function generarReporte (db, { desde, hasta } = {}) {
  if (!desde || !hasta) throw new Error('Falta el rango de fechas del reporte')
  const settings = obtenerSettings(db)
  const ventas = listarVentas(db, { desde, hasta, estado: 'completada' })

  const infoProd = new Map()
  for (const p of db.prepare('SELECT codigo_barras, marca, categoria FROM productos').all()) {
    infoProd.set(p.codigo_barras, p)
  }

  let facturado = 0
  let descuentos = 0
  let unidades = 0
  let utilidad = 0
  const porDia = new Map()
  const prods = new Map()
  const marcas = new Map()
  const cats = new Map()
  const metodos = new Map()

  for (const v of ventas) {
    facturado += v.total
    descuentos += v.descuento

    const met = agruparEn(metodos, v.metodo_pago || '(sin dato)', { ventas: 0, facturado: 0 })
    met.ventas++
    met.facturado += v.total

    const dia = String(v.fecha_hora).slice(0, 10)
    if (!porDia.has(dia)) porDia.set(dia, { fecha: dia, facturado: 0, unidades: 0, ventas: 0 })
    const pd = porDia.get(dia)
    pd.ventas++
    pd.facturado += v.total

    for (const it of v.items) {
      const u = it.cantidad
      const ut = Math.round(it.total_linea - it.costo_unitario * u)
      unidades += u
      utilidad += ut
      pd.unidades += u

      const info = infoProd.get(it.codigo_barras) || {}
      if (!prods.has(it.codigo_barras)) {
        prods.set(it.codigo_barras, {
          codigo: it.codigo_barras, nombre: it.nombre,
          marca: info.marca || '', categoria: info.categoria || '',
          unidades: 0, facturado: 0, utilidad: 0
        })
      }
      const pr = prods.get(it.codigo_barras)
      pr.unidades += u
      pr.facturado += it.total_linea
      pr.utilidad += ut

      const mk = agruparEn(marcas, info.marca || '(sin marca)', { unidades: 0, facturado: 0, utilidad: 0 })
      mk.unidades += u; mk.facturado += it.total_linea; mk.utilidad += ut

      const ck = agruparEn(cats, info.categoria || '(sin categoría)', { unidades: 0, facturado: 0, utilidad: 0 })
      ck.unidades += u; ck.facturado += it.total_linea; ck.utilidad += ut
    }
  }

  const semana = DIAS_SEMANA.map((nombre, dia) => ({ dia, nombre, facturado: 0, unidades: 0 }))
  for (const pd of porDia.values()) {
    const idx = indiceDiaSemana(pd.fecha)
    semana[idx].facturado += pd.facturado
    semana[idx].unidades += pd.unidades
  }

  const largo = diffDias(desde, hasta) + 1
  const prevHasta = restarDias(desde, 1)
  const prevDesde = restarDias(prevHasta, largo - 1)
  const anterior = totalesPeriodo(db, prevDesde, prevHasta)

  const porFacturado = (mapa) => [...mapa.values()].sort((a, b) => b.facturado - a.facturado)

  return {
    periodo: { desde, hasta },
    moneda: settings.simbolo_moneda || '$',
    resumen: {
      ventas: ventas.length,
      facturado,
      descuentos,
      unidades: Math.round(unidades * 1000) / 1000,
      utilidad,
      ticketPromedio: ventas.length ? Math.round(facturado / ventas.length) : 0,
      promedioDiario: Math.round(facturado / contarDiasTranscurridos(desde, hasta)),
      variacionPct: anterior.facturado > 0
        ? Math.round(((facturado - anterior.facturado) / anterior.facturado) * 1000) / 10
        : null
    },
    porDia: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porDiaSemana: semana,
    topProductos: porFacturado(prods).slice(0, 10),
    topUnidades: [...prods.values()].sort((a, b) => b.unidades - a.unidades).slice(0, 10),
    porMarca: porFacturado(marcas),
    porCategoria: porFacturado(cats),
    porMetodoPago: porFacturado(metodos),
    anterior
  }
}

// ---------------- Helpers ----------------

function centsValido (v, campo, defecto = 0) {
  if (v === undefined || v === null || v === '') return defecto
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor invalido para ${campo}`)
  return n
}

function numValido (v, campo, defecto = 0) {
  if (v === undefined || v === null || v === '') return defecto
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Valor invalido para ${campo}`)
  return n
}

function fmtStock (n) {
  return String(Math.round(n * 1000) / 1000)
}

module.exports = {
  transaccion,
  listarProductos, obtenerProducto, guardarProducto, eliminarProducto,
  crearVenta, obtenerVenta, listarVentas, anularVenta, totalesDelDia,
  ajustarStock, movimientosStock,
  obtenerSettings, guardarSettings,
  generarReporte
}
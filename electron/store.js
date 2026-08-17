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

  const existente = obtenerProducto(db, codigo)

  const precio = centsValido(datos.precio, 'precio', existente ? existente.precio : 0)
  const costo = centsValido(datos.costo, 'costo', existente ? existente.costo : 0)
  const stock = numValido(datos.stock, 'stock', existente ? existente.stock : 0)
  const stockMinimo = numValido(datos.stock_minimo, 'stock minimo', existente ? existente.stock_minimo : 0)
  const categoria = String(datos.categoria || '').trim()
  const activo = datos.activo === false || datos.activo === 0 ? 0 : 1

  if (existente) {
    db.prepare(`UPDATE productos SET nombre=?, categoria=?, precio=?, costo=?, stock=?, stock_minimo=?, activo=?, actualizado_en=? WHERE codigo_barras=?`)
      .run(nombre, categoria, precio, costo, stock, stockMinimo, activo, isoLocal(), codigo)
  } else {
    db.prepare(`INSERT INTO productos (codigo_barras, nombre, categoria, precio, costo, stock, stock_minimo, activo)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(codigo, nombre, categoria, precio, costo, stock, stockMinimo, activo)
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

    const fecha = isoLocal()
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
  obtenerSettings, guardarSettings
}
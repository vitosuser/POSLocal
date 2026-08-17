'use strict'

const { ipcMain, BrowserWindow } = require('electron')
const store = require('./store.js')
const backup = require('./backup.js')
const ticket = require('./printer/ticket.js')
const red = require('./printer/red.js')

const pkg = require('../package.json')

function registrarIpc (ctx) {
  const { db, app } = ctx

  const enviarBuffer = async (settings, buffer) => {
    const modo = settings.imp_tipo_conexion
    if (modo === 'red') {
      return red.imprimirPorRed(settings.imp_ip, settings.imp_puerto_red, buffer)
    }
    if (modo === 'serie') {
      return imprimirPorSerie(settings.imp_serie_puerto, settings.imp_serie_baudrate, buffer)
    }
    throw new Error('Tipo de impresora no soportado: usa Red o Serie')
  }

  const imprimirTicket = async (venta, settings) => {
    const papel = settings.imp_papel
    if (papel === 'desactivada') return { ok: false, omitido: true }

    const datos = {
      settings, ventaId: venta.id, fecha: venta.fecha_hora,
      operador: venta.operador, items: venta.items,
      subtotal: venta.subtotal, descuento: venta.descuento, total: venta.total,
      recibido: venta.recibido, cambio: venta.cambio, metodo_pago: venta.metodo_pago
    }

    try {
      if (papel === 'sistema') {
        await imprimirComoSistema(ticket.ticketVentaHtml(datos))
      } else {
        await enviarBuffer(settings, ticket.ticketVenta(datos))
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  const conOK = (f) => async (_e, arg) => {
    try { return { ok: true, datos: f(arg) } }
    catch (err) { return { ok: false, error: err.message } }
  }
  const conOKAsync = (f) => async (_e, arg) => {
    try { return { ok: true, datos: await f(arg) } }
    catch (err) { return { ok: false, error: err.message } }
  }

  // ---- Productos ----
  ipcMain.handle('productos:list', conOK((filtro) => store.listarProductos(db, filtro || {})))
  ipcMain.handle('productos:get', conOK((codigo) => store.obtenerProducto(db, codigo)))
  ipcMain.handle('productos:save', conOK((p) => store.guardarProducto(db, p || {})))
  ipcMain.handle('productos:remove', conOK((codigo) => store.eliminarProducto(db, codigo)))

  // ---- Ventas ----
  ipcMain.handle('ventas:create', conOK((d) => store.crearVenta(db, d || {})))
  ipcMain.handle('ventas:list', conOK((d) => store.listarVentas(db, d || {})))
  ipcMain.handle('ventas:detail', conOK((id) => store.obtenerVenta(db, id)))
  ipcMain.handle('ventas:annul', conOK((id) => store.anularVenta(db, id)))
  ipcMain.handle('ventas:totales', conOK((d) => store.totalesDelDia(db, d || {})))

  // ---- Stock ----
  ipcMain.handle('stock:adjust', conOK((d) => store.ajustarStock(db, d || {})))
  ipcMain.handle('stock:movimientos', conOK((d) => store.movimientosStock(db, d && d.codigo_barras, d && d.limite)))

  // ---- Settings ----
  ipcMain.handle('settings:getAll', conOK(() => store.obtenerSettings(db)))
  ipcMain.handle('settings:setMany', conOK((d) => store.guardarSettings(db, d || {})))

  // ---- Backup ----
  ipcMain.handle('backup:now', conOK(() => {
    const s = store.obtenerSettings(db)
    const r = backup.ejecutarBackup(db, s.backup_carpeta)
    if (r.ok) {
      store.guardarSettings(db, { backup_ultimo: r.fecha, backup_ultimo_archivo: r.archivo })
    }
    return r
  }))
  ipcMain.handle('backup:estado', conOK(() => {
    const s = store.obtenerSettings(db)
    return {
      activado: s.backup_activado === '1',
      carpeta: s.backup_carpeta,
      frecuencia: s.backup_frecuencia,
      hora: s.backup_hora,
      ultimo: s.backup_ultimo,
      ultimoArchivo: s.backup_ultimo_archivo
    }
  }))

  // ---- Impresora ----
  ipcMain.handle('printer:estado', conOK(() => {
    const s = store.obtenerSettings(db)
    return descripcionImpresora(s)
  }))
  ipcMain.handle('printer:probar', conOKAsync(async () => {
    const s = store.obtenerSettings(db)
    if (s.imp_papel === 'desactivada') {
      throw new Error('La impresora esta desactivada. Activala en Configuracion')
    }
    if (s.imp_papel === 'sistema') {
      await imprimirComoSistema(ticket.ticketVentaHtml({ settings: s, ventaId: 'TEST', fecha: new Date().toLocaleString(), operador: '', items: [{ nombre: 'Prueba de impresion', cantidad: 1, precio_unitario: 12345, total_linea: 12345 }], subtotal: 12345, descuento: 0, total: 12345, recibido: 12345, cambio: 0, metodo_pago: 'PRUEBA' }))
      return { ok: true }
    }
    await enviarBuffer(s, ticket.ticketPrueba(s))
    return { ok: true }
  }))
  ipcMain.handle('printer:imprimirVenta', conOKAsync(async (_e, id) => {
    const venta = store.obtenerVenta(db, id)
    if (!venta) throw new Error('Venta no encontrada')
    const s = store.obtenerSettings(db)
    return imprimirTicket(venta, s)
  }))

  // ---- App ----
  ipcMain.handle('app:info', conOK(() => ({
    version: pkg.version,
    nombre: 'VitPos',
    userData: app.getPath('userData'),
    dbPath: db.name,
    plataforma: process.platform
  })))
}

async function imprimirComoSistema (html) {
  return new Promise((resolve, reject) => {
    const ventana = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false }
    })
    const terminar = (error, res) => {
      try { ventana.destroy() } catch (_) {}
      error ? reject(error) : resolve(res)
    }
    ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch(terminar)
    ventana.webContents.once('did-finish-load', () => {
      ventana.webContents.print({
        printBackground: true,
        silent: true,
        copies: 1,
        margins: { marginType: 'none' }
      }, (exito, motivo) => {
        if (exito) terminar(null, { ok: true })
        else terminar(new Error('La impresora del sistema no respondio: ' + (motivo || '?')))
      })
    })
  })
}

function imprimirPorSerie (puerto, baudrate, buffer) {
  return new Promise((resolve, reject) => {
    let SerialPort
    try {
      SerialPort = require('serialport').SerialPort
    } catch (_) {
      return reject(new Error('El driver de impresora por Serie/USB no esta instalado. Usa el modo "Red" o "Sistema", o ejecuta: npm install serialport'))
    }
    const port = new SerialPort({ path: puerto, baudRate: Number(baudrate) || 9600 })
    port.on('open', () => {
      port.write(buffer, (err) => {
        port.close()
        err ? reject(err) : resolve({ ok: true })
      })
    })
    port.on('error', (e) => reject(new Error('Error en puerto serie: ' + e.message)))
  })
}

function descripcionImpresora (s) {
  const papel = s.imp_papel
  let descripcion
  if (papel === 'desactivada') descripcion = 'Impresora desactivada'
  else if (papel === 'red') descripcion = `Red TCP/IP -> ${s.imp_ip}:${s.imp_puerto_red}`
  else if (papel === 'sistema') descripcion = 'Impresora del sistema (Windows/Linux)'
  else if (papel === 'serie') descripcion = `Serie/USB -> ${s.imp_serie_puerto} @ ${s.imp_serie_baudrate}`
  else descripcion = 'Desconocido'
  return { papel, tipo: s.imp_tipo_conexion, descripcion, ancho: s.imp_ancho }
}

module.exports = { registrarIpc, imprimirComoSistema }
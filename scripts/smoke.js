'use strict'

// Smoke test de extremo a extremo dentro de Electron real:
// abre la ventana de VitPos (preload + IPC + SQLite), revisa que la UI
// cargó datos de la base y termina con 0/1 segun resultado.

const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const dbModule = require('../electron/db.js')
const store = require('../electron/store.js')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vitpos-smoke-'))
app.setPath('userData', tmp)

let salida = 1

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(() => {
  const db = dbModule.openDb(tmp)
  const { registrarIpc } = require('../electron/ipc.js')
  registrarIpc({ db, app })

  // datos de prueba
  store.guardarProducto(db, { codigo_barras: '7790000000011', nombre: 'Croquetas Perro 3kg', categoria: 'Alimentos', precio: 15000, costo: 10000, stock: 10 })
  store.guardarProducto(db, { codigo_barras: '7790000000022', nombre: 'Detergente 1L', categoria: 'Limpieza', precio: 2400, costo: 1500, stock: 3 })

  const win = new BrowserWindow({
    width: 1280, height: 840, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })

  win.on('console-message', (_e, _lvl, msg) => { process.stdout.write(`[consola] ${msg}\n`) })

  win.webContents.on('render-process-gone', (_e, det) => {
    process.stdout.write('RENDER-PROCESS-GONE: ' + JSON.stringify(det) + '\n')
    app.exit(1)
  })

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'))

  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        // 1) venta real a traves del puente preload -> ipcMain -> sqlite
        const venta = await win.webContents.executeJavaScript(`(() => window.api.ventas.crear({
          items: [{ codigo: '7790000000011', cantidad: 2 }],
          metodo_pago: 'Efectivo', recibido: 40000
        }))()`)
        // 2) estado de la UI + stock despues de la venta
        const resultado = await win.webContents.executeJavaScript(`(async () => {
          const r = await window.api.ventas.totales({ desde: ${JSON.stringify(new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-' + String(new Date().getDate()).padStart(2,'0'))}, hasta: ${JSON.stringify(new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-' + String(new Date().getDate()).padStart(2,'0'))} })
          return {
            titulo: document.title,
            negocio: document.getElementById('brand-negocio').textContent,
            metodos: document.querySelectorAll('#metodos-pago .metodo-btn').length,
            productosTabla: document.querySelectorAll('#productos-body tr').length,
            stockTabla: document.querySelectorAll('#stock-body tr').length,
            seccionActiva: document.querySelector('.seccion.activa')?.id,
            ventaTotal: r.datos.total,
            errorGlobal: window.__errorGlobal || null
          }
        })()`)
        if (!venta.ok || venta.datos.total !== 30000 || venta.datos.cambio !== 10000) {
          process.stdout.write('SMOKE FAIL venta: ' + JSON.stringify(venta) + '\n')
        } else if (resultado.seccionActiva !== 'seccion-venta' || resultado.ventaTotal !== 30000 ||
            resultado.metodos !== 6) {
          process.stdout.write('SMOKE FAIL ui: ' + JSON.stringify(resultado) + '\n')
        } else {
          // 3) seccion reportes: navegar y verificar render con la venta recien hecha
          const rep = await win.webContents.executeJavaScript(`(async () => {
            document.querySelector('.nav-item[data-seccion="reportes"]').click()
            await new Promise(r => setTimeout(r, 400))
            return {
              activa: document.querySelector('.seccion.activa')?.id,
              tarjetas: document.querySelectorAll('#rep-resumen .rep-card').length,
              facturado: document.querySelector('#rep-resumen .rep-card strong')?.textContent,
              columnas: document.querySelectorAll('#rep-chart .rep-col').length,
              topFilas: document.querySelectorAll('#rep-topfac-body tr').length,
              marcaFila: document.querySelector('#rep-marcas-body')?.textContent || ''
            }
          })()`)
          if (rep.activa !== 'seccion-reportes' || rep.tarjetas < 5 || !/\$/.test(rep.facturado) ||
              rep.columnas !== 7 || rep.topFilas < 1) {
            process.stdout.write('SMOKE FAIL reportes: ' + JSON.stringify(rep) + '\n')
          } else {
            // 4) renombrado de codigo via IPC: nuevo responde, viejo queda libre
            const ren = await win.webContents.executeJavaScript(`(async () => {
              const g = await window.api.productos.guardar({
                codigo_barras: '7790000000099', codigo_original: '7790000000011',
                nombre: 'Croquetas Perro 3kg', precio: 15000, costo: 10000, stock: 8
              })
              const nuevo = await window.api.productos.obtener('7790000000099')
              const viejo = await window.api.productos.obtener('7790000000011')
              return { ok: g.ok, nuevoExiste: !!(nuevo.ok && nuevo.datos), viejoLibre: !(viejo.ok && viejo.datos) }
            })()`)
            if (!ren.ok || !ren.nuevoExiste || !ren.viejoLibre) {
              process.stdout.write('SMOKE FAIL renombrado: ' + JSON.stringify(ren) + '\n')
            } else {
              process.stdout.write('SMOKE OK: ' + JSON.stringify({ ...resultado, reportes: rep, renombrado: ren }) + '\n')
              salida = 0
            }
          }
        }
      } catch (e) {
        process.stdout.write('SMOKE ERROR: ' + (e && e.message) + '\n')
      }
      app.exit(salida)
    }, 1800)
  })
})

app.on('window-all-closed', () => {})
setTimeout(() => { process.stdout.write('SMOKE TIMEOUT\n'); app.exit(1) }, 20000)
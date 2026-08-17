'use strict'

const { app, BrowserWindow } = require('electron')
const path = require('path')

const dbModule = require('./db.js')
const store = require('./store.js')
const backup = require('./backup.js')

app.setName('VitPos')

let mainWindow = null
let db = null

const pkg = require('../package.json')

function crearVentana () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#f5f7f6',
    autoHideMenuBar: true,
    show: false,
    title: 'VitPos',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.removeMenu()
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

function programarBackupDiario () {
  setInterval(() => {
    try {
      db.exec('SELECT 1')
    } catch (_) { return }
    const s = store.obtenerSettings(db)
    if (s.backup_activado !== '1' || s.backup_frecuencia !== 'diario') return
    if (!s.backup_hora) return
    const hoy = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const ahora = `${p(hoy.getHours())}:${p(hoy.getMinutes())}`
    const fechaHoy = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`
    // solo un backup por dia
    if (/^\d{4}-\d{2}-\d{2}/.test(s.backup_ultimo) && s.backup_ultimo.startsWith(fechaHoy)) return
    if (ahora >= s.backup_hora) {
      const r = backup.ejecutarBackup(db, s.backup_carpeta)
      if (r.ok) {
        store.guardarSettings(db, { backup_ultimo: r.fecha, backup_ultimo_archivo: r.archivo })
      }
    }
  }, 60 * 1000)
}

function backupAlCerrar () {
  try {
    db.exec('SELECT 1')
  } catch (_) { return }
  const s = store.obtenerSettings(db)
  if (s.backup_activado === '1' && s.backup_frecuencia === 'cierre') {
    const r = backup.ejecutarBackup(db, s.backup_carpeta)
    if (r.ok) {
      store.guardarSettings(db, { backup_ultimo: r.fecha, backup_ultimo_archivo: r.archivo })
    }
  }
}

app.whenReady().then(() => {
  db = dbModule.openDb(app.getPath('userData'))

  // expone db para que ipc.js y demas lo usen
  const { registrarIpc } = require('./ipc.js')
  registrarIpc({ db, app })

  crearVentana()
  programarBackupDiario()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('before-quit', () => {
  if (db) backupAlCerrar()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
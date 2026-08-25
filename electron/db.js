'use strict'

const path = require('path')
const fs = require('fs')
const { DatabaseSync } = require('node:sqlite')

const MIGRATIONS = [
  // ---- v1: esquema inicial ----
  `
  CREATE TABLE IF NOT EXISTS productos (
    codigo_barras   TEXT PRIMARY KEY,
    nombre          TEXT NOT NULL,
    categoria       TEXT NOT NULL DEFAULT '',
    precio          INTEGER NOT NULL DEFAULT 0,      -- centavos
    costo           INTEGER NOT NULL DEFAULT 0,      -- centavos
    stock           REAL NOT NULL DEFAULT 0,
    stock_minimo    REAL NOT NULL DEFAULT 0,
    activo          INTEGER NOT NULL DEFAULT 1,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    actualizado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS ventas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_hora    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    subtotal      INTEGER NOT NULL DEFAULT 0,        -- centavos
    descuento     INTEGER NOT NULL DEFAULT 0,        -- centavos
    total         INTEGER NOT NULL DEFAULT 0,        -- centavos
    metodo_pago   TEXT NOT NULL DEFAULT '',
    recibido      INTEGER NOT NULL DEFAULT 0,        -- centavos
    cambio        INTEGER NOT NULL DEFAULT 0,        -- centavos
    estado        TEXT NOT NULL DEFAULT 'completada',-- 'completada' | 'anulada'
    operador      TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS ventas_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    codigo_barras   TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    cantidad        REAL NOT NULL,
    precio_unitario INTEGER NOT NULL,                -- centavos (snapshot)
    costo_unitario  INTEGER NOT NULL DEFAULT 0,      -- centavos (snapshot)
    total_linea     INTEGER NOT NULL                 -- centavos
  );

  CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_hora);
  CREATE INDEX IF NOT EXISTS idx_ventas_items_venta ON ventas_items(venta_id);

  CREATE TABLE IF NOT EXISTS stock_movimientos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras   TEXT NOT NULL,
    tipo            TEXT NOT NULL,                   -- 'venta' | 'anulacion' | 'compra' | 'ajuste'
    cantidad        REAL NOT NULL,
    stock_resultante REAL NOT NULL,
    nota            TEXT NOT NULL DEFAULT '',
    fecha           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_stock_mov_codigo ON stock_movimientos(codigo_barras);

  CREATE TABLE IF NOT EXISTS settings (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
  // ---- v2: marca del producto (para reportes) ----
  `ALTER TABLE productos ADD COLUMN marca TEXT NOT NULL DEFAULT '';`
]

const SETTING_DEFAULTS = {
  // Negocio
  nombre_negocio: 'VitPos',
  direccion: '',
  telefono: '',
  pie_ticket: 'Gracias por su compra',
  simbolo_moneda: '$',
  // Venta
  metodo_pago_default: 'Efectivo',
  // Lectora de codigo de barras
  lect_tipo: 'teclado',           // 'teclado' | 'serie'
  lect_serie_puerto: '',
  lect_serie_baudrate: '9600',
  // Impresora termica
  imp_papel: 'desactivada',       // 'desactivada' | 'red' | 'serie' | 'sistema'
  imp_tipo_conexion: 'red',
  imp_ip: '',
  imp_puerto_red: '9100',
  imp_serie_puerto: '',
  imp_serie_baudrate: '9600',
  imp_ancho: '58',                // 58 | 80 mm
  // Backup
  backup_activado: '0',
  backup_carpeta: '',
  backup_frecuencia: 'cierre',    // 'cierre' | 'diario' | 'manual'
  backup_hora: '20:00',
  backup_ultimo: '',
  backup_ultimo_archivo: ''
}

function openDb (dataDir) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  const db = new DatabaseSync(path.join(dataDir, 'vitpos.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrar(db)
  sembrarDefaults(db)
  return db
}

function migrar (db) {
  let version = Number(db.prepare('PRAGMA user_version').get().user_version || 0)
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[version])
      version = version + 1
      db.exec(`PRAGMA user_version = ${version}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
}

function sembrarDefaults (db) {
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (clave, valor) VALUES (?, ?)')
  for (const [clave, valor] of Object.entries(SETTING_DEFAULTS)) {
    stmt.run(clave, String(valor))
  }
}

function isoLocal (d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

module.exports = { openDb, SETTING_DEFAULTS, isoLocal }
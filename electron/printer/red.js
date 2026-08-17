'use strict'

const net = require('net')

function imprimirPorRed (host, port, buffer, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('Falta la direccion IP de la impresora'))
    const sock = net.createConnection({ host, port: Number(port) || 9100, timeout: timeoutMs })
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new Error('Tiempo de espera agotado conectando a la impresora'))
    }, timeoutMs)

    sock.on('connect', () => {
      sock.write(buffer, () => sock.end())
    })
    sock.on('end', () => {
      clearTimeout(timer)
      resolve({ ok: true })
    })
    sock.on('timeout', () => {
      clearTimeout(timer)
      sock.destroy()
      reject(new Error('Timeout esperando respuesta de la impresora'))
    })
    sock.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`No se pudo conectar a ${host}:${port} (${e.message})`))
    })
  })
}

module.exports = { imprimirPorRed }
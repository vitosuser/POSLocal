'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function invoke (canal, arg) {
  return ipcRenderer.invoke(canal, arg)
}

const api = {
  productos: {
    listar: (filtro) => invoke('productos:list', filtro),
    obtener: (codigo) => invoke('productos:get', codigo),
    guardar: (producto) => invoke('productos:save', producto),
    eliminar: (codigo) => invoke('productos:remove', codigo)
  },
  ventas: {
    crear: (datos) => invoke('ventas:create', datos),
    listar: (filtro) => invoke('ventas:list', filtro),
    detalle: (id) => invoke('ventas:detail', id),
    anular: (id) => invoke('ventas:annul', id),
    totales: (filtro) => invoke('ventas:totales', filtro)
  },
  stock: {
    ajustar: (datos) => invoke('stock:adjust', datos),
    movimientos: (datos) => invoke('stock:movimientos', datos)
  },
  settings: {
    getAll: () => invoke('settings:getAll'),
    setMany: (datos) => invoke('settings:setMany', datos)
  },
  backup: {
    ahora: () => invoke('backup:now'),
    estado: () => invoke('backup:estado')
  },
  impresora: {
    estado: () => invoke('printer:estado'),
    probar: () => invoke('printer:probar'),
    imprimirVenta: (id) => invoke('printer:imprimirVenta', id)
  },
  app: {
    info: () => invoke('app:info')
  }
}

contextBridge.exposeInMainWorld('api', api)
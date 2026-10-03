import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type FocusFlightApi } from '../shared/ipc'
import type { Snapshot } from '../shared/controller'

const api: FocusFlightApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  onSnapshot: (cb) => {
    const listener = (_e: IpcRendererEvent, s: Snapshot): void => cb(s)
    ipcRenderer.on(IPC.snapshot, listener)
    return () => ipcRenderer.removeListener(IPC.snapshot, listener)
  },
  board: (from, to) => ipcRenderer.invoke(IPC.board, from, to),
  cancel: () => ipcRenderer.invoke(IPC.cancel),
  pause: () => ipcRenderer.invoke(IPC.pause),
  resume: () => ipcRenderer.invoke(IPC.resume),
  abort: () => ipcRenderer.invoke(IPC.abort),
  reset: () => ipcRenderer.invoke(IPC.reset),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  clearRecords: () => ipcRenderer.invoke(IPC.clearRecords)
}

contextBridge.exposeInMainWorld('focusFlight', api)

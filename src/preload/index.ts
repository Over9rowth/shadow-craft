// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('shadowcraft', {
  exportPrintPdf: (pages: unknown) => ipcRenderer.invoke('export-print-pdf', pages),
  exportManualPdf: () => ipcRenderer.invoke('export-manual-pdf'),
  savePng: (dataUrl: string) => ipcRenderer.invoke('save-png', dataUrl),
  smokeReady: (p: { mounted: boolean; geometryOk: boolean }) => ipcRenderer.send('smoke-ready', p),
  onSmokeRun: (cb: () => void) => ipcRenderer.on('smoke:run', () => cb()),
  smokeResult: (payload: string) => ipcRenderer.invoke('smoke:result', payload),
});

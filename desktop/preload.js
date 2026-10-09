const { contextBridge, ipcRenderer } = require('electron');

// The only things the page can ask the desktop shell for. The page itself
// gets no Node access — everything here is a narrow, explicit hole.
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,

  // Native "pick a folder" dialog; resolves to the path, or null if cancelled.
  chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),

  // Tells the shell which theme the page is showing so the native frame,
  // menus and scrollbars can follow it.
  setTheme: (mode) => ipcRenderer.send('desktop:set-theme', mode),

  // Menu actions that need the page to do something.
  onNavigate: (callback) => {
    const handler = (_event, route) => callback(route);
    ipcRenderer.on('desktop:navigate', handler);
    return () => ipcRenderer.removeListener('desktop:navigate', handler);
  },
  onTheme: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on('desktop:theme', handler);
    return () => ipcRenderer.removeListener('desktop:theme', handler);
  },
});

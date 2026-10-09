const { Menu } = require('electron');

// The application menu — File / Edit / View / Window / Help, laid out the
// way Claude's own desktop app does it: File holds the app-level actions
// and Settings, View is where you move around and change how it looks.
const LIBRARIES = [
  ['Movies', '/movies'],
  ['TV Shows', '/tv'],
  ['Audiobooks', '/audiobooks'],
  ['Comics', '/comics'],
  ['Ebooks', '/ebooks'],
  ['Digital', '/music/albums'],
  ['Vinyl', '/music/vinyl'],
  ['Games', '/games'],
];

function buildMenu({ actions, themeMode, repoUrl }) {
  const themeItem = (label, mode) => ({
    label,
    type: 'radio',
    checked: themeMode === mode,
    click: () => actions.setTheme(mode),
  });

  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'Scan All Libraries', accelerator: 'CmdOrCtrl+Shift+S', click: () => actions.scanAll() },
        { label: 'Back Up Now', click: () => actions.backUp() },
        {
          label: 'Export',
          submenu: [
            { label: 'To Text', click: () => actions.exportText() },
            { label: 'To HTML', click: () => actions.exportHtml() },
            { type: 'separator' },
            { label: 'Open Exports Folder', click: () => actions.openExports() },
          ],
        },
        { type: 'separator' },
        { label: 'Open Data Folder', click: () => actions.openData() },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => actions.navigate('/settings') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        ...LIBRARIES.map(([label, route], i) => ({
          label,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => actions.navigate(route),
        })),
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [themeItem('System', 'system'), themeItem('Light', 'light'), themeItem('Dark', 'dark')],
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: '&Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Documentation', click: () => actions.openExternal(`${repoUrl}#readme`) },
        { label: 'Release Notes', click: () => actions.openExternal(`${repoUrl}/blob/main/CHANGELOG.md`) },
        { label: 'Check for Updates…', click: () => actions.openExternal(`${repoUrl}/releases/latest`) },
        { label: 'Report an Issue', click: () => actions.openExternal(`${repoUrl}/issues`) },
        { type: 'separator' },
        { label: 'About Media Catalog', click: () => actions.about() },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };

const { isString } = require('lodash');

exports.createTemplate = (options, messages) => {
  if (!isString(options.platform)) {
    throw new TypeError('`options.platform` must be a string');
  }

  const {
    includeSetup,
    openNewBugForm,
    openReleaseNotes,
    openSupportPage,
    platform,
    setupWithImport,
    showAbout,
    showDebugLog,
  } = options;

  const template = [
    {
      label: messages.mainMenuFile,
      submenu: [
        {
          type: 'separator',
        },
        {
          role: 'quit',
          label: messages.appMenuQuit,
        },
      ],
    },
    {
      label: messages.mainMenuEdit,
      submenu: [
        {
          role: 'undo',
          label: messages.editMenuUndo,
        },
        {
          role: 'redo',
          label: messages.editMenuRedo,
        },
        {
          type: 'separator',
        },
        {
          role: 'cut',
          label: messages.editMenuCut,
        },
        {
          role: 'copy',
          label: messages.editMenuCopy,
        },
        {
          role: 'paste',
          label: messages.editMenuPaste,
        },
        {
          role: 'pasteandmatchstyle',
          label: messages.editMenuPasteAndMatchStyle,
        },
        {
          role: 'delete',
          label: messages.editMenuDelete,
        },
        {
          role: 'selectall',
          label: messages.editMenuSelectAll,
        },
      ],
    },
    {
      label: messages.mainMenuView,
      submenu: [
        {
          role: 'resetzoom',
          label: messages.viewMenuResetZoom,
        },
        {
          accelerator: platform === 'darwin' ? 'Command+=' : 'Control+Plus',
          role: 'zoomin',
          label: messages.viewMenuZoomIn,
        },
        {
          role: 'zoomout',
          label: messages.viewMenuZoomOut,
        },
        {
          type: 'separator',
        },
        {
          role: 'togglefullscreen',
          label: messages.viewMenuToggleFullScreen,
        },
        {
          type: 'separator',
        },
        {
          label: messages.debugLog,
          click: showDebugLog,
        },
        {
          type: 'separator',
        },
        {
          role: 'toggledevtools',
          label: messages.viewMenuToggleDevTools,
        },
      ],
    },
    {
      label: messages.mainMenuWindow,
      role: 'window',
      submenu: [
        {
          role: 'minimize',
          label: messages.windowMenuMinimize,
        },
      ],
    },
    {
      label: messages.mainMenuHelp,
      role: 'help',
      submenu: [
        {
          label: messages.goToReleaseNotes,
          click: openReleaseNotes,
        },
        {
          type: 'separator',
        },
        {
          label: messages.goToSupportPage,
          click: openSupportPage,
        },
        {
          label: messages.menuReportIssue,
          click: openNewBugForm,
        },
        {
          type: 'separator',
        },
        {
          label: messages.about,
          click: showAbout,
        },
      ],
    },
  ];

  if (includeSetup) {
    const fileMenu = template[0];

    // These are in reverse order, since we're prepending them one at a time

    fileMenu.submenu.unshift({
      type: 'separator',
    });
    fileMenu.submenu.unshift({
      label: messages.menuSetupWithImport,
      click: setupWithImport,
    });
  }

  if (platform === 'darwin') {
    return updateForMac(template, messages, options);
  }

  return template;
};

function updateForMac(template, messages, options) {
  const { includeSetup, setupWithImport, showAbout, showWindow } = options;

  // Remove About item and separator from Help menu, since it's on the first menu
  template[4].submenu.pop();
  template[4].submenu.pop();

  // Remove File menu
  template.shift();

  if (includeSetup) {
    // Add a File menu just for these setup options. Because we're using unshift(), we add
    //   the file menu first, though it ends up to the right of the Signal Desktop menu.
    const fileMenu = {
      label: messages.mainMenuFile,
      submenu: [
        {
          label: messages.menuSetupWithImport,
          click: setupWithImport,
        },
      ],
    };

    template.unshift(fileMenu);
  }

  // Add the OSX-specific Signal Desktop menu at the far left
  template.unshift({
    label: messages.sessionMessenger,
    submenu: [
      {
        label: messages.about,
        click: showAbout,
      },
      {
        type: 'separator',
      },
      {
        type: 'separator',
      },
      {
        label: messages.appMenuHide,
        role: 'hide',
      },
      {
        label: messages.appMenuHideOthers,
        role: 'hideothers',
      },
      {
        label: messages.appMenuUnhide,
        role: 'unhide',
      },
      {
        type: 'separator',
      },
      {
        label: messages.appMenuQuit,
        role: 'quit',
      },
    ],
  });

  // Add to Edit menu
  const editIndex = includeSetup ? 2 : 1;
  template[editIndex].submenu.push(
    {
      type: 'separator',
    },
    {
      label: messages.speech,
      submenu: [
        {
          role: 'startspeaking',
          label: messages.editMenuStartSpeaking,
        },
        {
          role: 'stopspeaking',
          label: messages.editMenuStopSpeaking,
        },
      ],
    }
  );

  // Replace Window menu
  const windowMenuTemplateIndex = includeSetup ? 4 : 3;
  // eslint-disable-next-line no-param-reassign
  template[windowMenuTemplateIndex].submenu = [
    {
      label: messages.windowMenuClose,
      accelerator: 'CmdOrCtrl+W',
      role: 'close',
    },
    {
      label: messages.windowMenuMinimize,
      accelerator: 'CmdOrCtrl+M',
      role: 'minimize',
    },
    {
      label: messages.windowMenuZoom,
      role: 'zoom',
    },
    {
      label: messages.show,
      click: showWindow,
    },
    {
      type: 'separator',
    },
    {
      role: 'front',
      label: messages.windowMenuBringAllToFront,
    },
  ];

  return template;
}

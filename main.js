const { app, BrowserWindow, Menu, shell, dialog, ipcMain, protocol, net, Tray } = require('electron')
const path = require('node:path')
const expressApp = require('./node-app/app')
const { spawn, exec } = require('child_process')
const fs = require('fs-extra')

// 使用app.isPackaged判断是否是打包后的环境
if (app.isPackaged) {
  require('bytenode');
}

// 在文件顶部定义静态资源目录
function getMMDDir() {
  console.log('App Path:', app.getAppPath());
  console.log('Resources Path:', process.resourcesPath);

  // 使用 app.getPath('userData') 来存储用户数据
  const userDataPath = path.join(app.getPath('userData'), '/customize/mmd');
  console.log('Production MMD Path:', userDataPath);
  return userDataPath;
}

// 确保目录存在前先检查
const MMD_DIR = getMMDDir();
try {
  if (!fs.existsSync(MMD_DIR)) {
    fs.mkdirSync(MMD_DIR, { recursive: true });
  }
} catch (error) {
  console.error('创建MMD目录失败:', error);
  // 可以添加错误处理逻辑
}

// 在文件顶部定义托盘变量
let tray = null;

// 在文件顶部添加当前窗口引用
let currentWindow = null;

async function initializeStore() {
  const Store = await import('electron-store');
  const store = new Store.default();

  // 扩展 store 对象，添加自定义方法
  store.getApiSettings = function () {
    const keys = Object.keys(this.store).filter(key => key.startsWith('api_settings_'));
    return keys.map(key => this.get(key));
  };

  store.getTTSSettings = function () {
    const keys = Object.keys(this.store).filter(key => key.startsWith('tts_settings_'));
    return keys.map(key => this.get(key));
  };

  store.getSTTSettings = function () {
    const keys = Object.keys(this.store).filter(key => key.startsWith('stt_settings_'));
    return keys.map(key => this.get(key));
  };

  store.saveApiSettings = function (settings) {
    if (!Array.isArray(settings)) {
      throw new Error('设置必须是数组格式');
    }

    // 清除旧的设置
    const oldKeys = Object.keys(this.store).filter(key => key.startsWith('api_settings_'));
    oldKeys.forEach(key => this.delete(key));

    // 保存新的设置
    settings.forEach((setting, index) => {
      this.set(`api_settings_${index}`, setting);
    });
  };

  store.saveTTSSettings = function (settings) {
    if (!Array.isArray(settings)) {
      throw new Error('设置必须是数组格式');
    }

    const keys = Object.keys(this.store).filter(key => key.startsWith('tts_settings_'));
    keys.forEach(key => this.delete(key));
    settings.forEach((setting, index) => {
      this.set(`tts_settings_${index}`, setting);
    });
  };

  store.saveSTTSettings = function (settings) {
    if (!Array.isArray(settings)) {
      throw new Error('设置必须是数组格式');
    }
    const keys = Object.keys(this.store).filter(key => key.startsWith('stt_settings_'));
    keys.forEach(key => this.delete(key));
    settings.forEach((setting, index) => {
      this.set(`stt_settings_${index}`, setting);
    });
  };

  // 扩展 store 的方法,添加到 initializeStore() 中
  store.saveModelSettings = function (settings) {
    this.set('model_settings', settings);
  };

  store.getModelSettings = function () {
    return this.get('model_settings') || {};
  };

  return store;
}

let store;


// 必须在app.ready之前注册协议方案
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-model',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      secure: true,
      corsEnabled: true,
      allowServiceWorkers: true,
      stream: true,
      bypassCSP: true  // 允许绕过内容安全策略
    }
  }
]);

// 在导入之后再设置环境变量和命令行开关
app.whenReady().then(async () => {
  // 设置默认编码为 UTF-8
  process.env.LANG = 'zh_CN.UTF-8';
  app.commandLine.appendSwitch('lang', 'zh-CN');
  app.commandLine.appendSwitch('force-chinese-ime', 'true');

  // addFirewallRule()

  // 确保store初始化
  store = await initializeStore();
  console.log('store初始化完成:', store);

  // store 初始化完成后再创建窗口
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // 注册协议处理器
  protocol.handle('local-model', (request) => {
    try {
      const url = request.url.replace('local-model://', '');
      const decodedPath = decodeURIComponent(url);
      console.log('访问本地文件:', decodedPath);

      // 使用 net.fetch 处理文件请求
      return net.fetch(`file://${decodedPath}`, {
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      console.error('处理文件请求失败:', error);
      return new Response('File not found', { status: 404 });
    }
  });
})

let serverInstance = null
let ttsProcess = null

// 添加 IPC 监听器
ipcMain.on('open-software', (event, softwareName) => {
  console.log('收到打开软件请求:', softwareName);

  // 使用 Get-StartApps 获取应用列表，并设置正确的编码
  exec('powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json"',
    { encoding: 'utf8' },
    (err, stdout, stderr) => {
      if (err) {
        console.error('获取应用列表失败:', err);
        event.reply('open-software-result', { success: false, error: err.message });
        return;
      }

      try {
        // 解析应用列表
        const apps = JSON.parse(stdout);
        console.log('应用列表:', apps);

        // 使用中文称查找应用
        const app = apps.find(app =>
          app.Name.toLowerCase().includes(softwareName.toLowerCase()) ||
          (app.AppID && app.AppID.toLowerCase().includes(softwareName.toLowerCase()))
        );

        if (!app) {
          console.log('未找到应用:', softwareName);
          return;
        } else {
          console.log('找到应用:', app);
        }

        if (app.AppID.includes('.exe')) {
          // 如果 AppID 包含 .exe，说明是本地安装的应用
          const programFilesPath = process.env['ProgramFiles'];
          const exePath = app.AppID
            .replace('{6D809377-6AF0-444B-8957-A3773F02200E}\\', `${programFilesPath}\\`);

          console.log('尝试启动程序:', exePath);  // 添加日志便于调试

          exec(`"${exePath}"`, (error) => {
            if (error) {
              console.error('启动失败:', error);
              // 尝试 Program Files (x86)
              const programFilesx86Path = process.env['ProgramFiles(x86)'];
              const altExePath = app.AppID
                .replace('{6D809377-6AF0-444B-8957-A3773F02200E}\\', `${programFilesx86Path}\\`);

              console.log('尝试备用路径:', altExePath);  // 添加日志

              exec(`"${altExePath}"`, (error2) => {
                if (error2) {
                  console.error('备用路径也启动失败:', error2);
                  event.reply('open-software-result', { success: false, error: error2.message });
                  return;
                }
                console.log('通过备用路径启动成功:', app.Name);
                event.reply('open-software-result', { success: true });
              });
              return;
            }
            console.log('启动成功:', app.Name);
            event.reply('open-software-result', { success: true });
          });
        } else {
          // 对于 UWP 应用，继续使用原来的方式
          shell.openExternal(`shell:AppsFolder\\${app.AppID}`)
            .then(() => {
              console.log('启动成功:', app.Name);
              event.reply('open-software-result', { success: true });
            })
            .catch(error => {
              console.error('启动失败:', error);
              event.reply('open-software-result', { success: false, error: error.message });
            });
        }

      } catch (error) {
        console.error('解析应用列表失败:', error);
        event.reply('open-software-result', { success: false, error: error.message });
      }
    });
});

function getTTSServerPath() {
  if (app.isPackaged) {
    // 生产环境路径
    return path.join(process.resourcesPath, 'tts-server', 'tts_server.exe')
  } else {
    // 开发环境路径
    return path.join(__dirname, 'resources', 'tts-server', 'tts_server.exe')
  }
}

function startTTSServer() {
  // 启动 TTS 服务器
  const ttsServerPath = getTTSServerPath()
  ttsProcess = spawn(ttsServerPath, [], {
    windowsHide: true  // 隐藏命令行窗口
  })

  ttsProcess.stdout.on('data', (data) => {
    console.log(`TTS Server: ${data}`)
  })

  ttsProcess.stderr.on('data', (data) => {
    console.error(`TTS Server Error: ${data}`)
  })

  ttsProcess.on('close', (code) => {
    console.log(`TTS Server exited with code ${code}`)
  })
}

function createWindow() {
  // 先启动 TTS 服务器
  startTTSServer()

  // 启动 Express 服务器,传入配置
  const port = 3000
  const config = {
    userDataPath: app.getPath('userData')
  }

  // 修改为传入配置
  serverInstance = expressApp(config).listen(port, () => {
    console.log(`Express server running on port ${port}`)
  })

  // 启动成功后再创建主窗口
  createMainWindow()
  addWindowCloseHandler(mainWindow)

  // 创建托盘图标
  createTray();
}

let mainWindow = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: false,
    menuBarVisible: false,
    // 添加以下样式设置
    backgroundColor: '#ffffff',  // 设置背景色
  })
  currentWindow = mainWindow; // 更新当前窗口引用

  // 创建自定义菜单
  const template = [
    {
      label: '设置',
      submenu: [
        {
          label: 'API设置',
          click: () => {
            createSettingsWindow()
          }
        },
        { type: 'separator' },
        {
          label: 'TTS设置',
          click: () => {
            createTTSSettingsWindow()
          }
        },
        { type: 'separator' },
        {
          label: 'STT设置',
          click: () => {
            createSTTSettingsWindow()
          }
        },
        { type: 'separator' },
        {
          label: '模型设置',
          click: async () => {
            try {
              const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: '选择本地模型文件夹'
              });

              if (!result.canceled) {
                const folderPath = result.filePaths[0];
                const modelName = path.basename(folderPath);

                // 创建模型专属目录
                const modelDir = path.join(MMD_DIR, modelName);

                console.log('正在复制模型文件夹...');
                console.log('源路径:', folderPath);
                console.log('目标路径:', modelDir);

                // 复制整个文件夹到静态目录
                await fs.copy(folderPath, modelDir, {
                  overwrite: true,  // 如果目录已存在则覆盖
                  errorOnExist: false
                });

                console.log('文件夹复制完成');

                // 查找文件夹中的模型文件
                const files = await fs.readdir(folderPath);
                const modelFile = files.find(file =>
                  file.toLowerCase().endsWith('.pmx') ||
                  file.toLowerCase().endsWith('.pmd')
                );

                if (!modelFile) {
                  throw new Error('未找到PMX或PMD模型文件');
                }

                console.log('找到的模型文件:', modelFile);

                // 把modelName和modelFile写入store
                // 在保存模型时使用
                const modelSettings = {
                  name: modelName,
                  file: modelFile,
                  path: `/customize/mmd/${modelName}/${modelFile}`,
                  lastModified: new Date().toISOString()
                };

                store.saveModelSettings(modelSettings);
                console.log('保存模型设置:', modelSettings);

                // 使用找到的模型文件名
                mainWindow.loadURL(
                  `http://localhost:3000/?motion=vmd/idle.vmd&window=main`
                );
              }
            } catch (error) {
              console.error('处理模型文件失败:', error);
              dialog.showErrorBox('错误', '处理模型文件失败: ' + error.message);
            }
          }
        }
      ]
    },
    {
      label: '操作',
      submenu: [
        {
          label: '打开透明窗口', click: () => {
            // 关闭主窗口，打开一个透明窗口
            mainWindow.close()
            createTransparentWindow()
          }
        },
        { type: 'separator' },
        {
          label: '隐藏菜单栏',
          accelerator: 'CommandOrControl+H',  // 添加快捷键
          click: (menuItem, browserWindow) => {
            if (browserWindow) {
              browserWindow.setAutoHideMenuBar(!browserWindow.isMenuBarAutoHide());
              browserWindow.setMenuBarVisibility(!browserWindow.isMenuBarVisible());
            }
          }
        },
        { type: 'separator' },
        { role: 'reload', label: '刷新' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '请开发者喝杯奶茶 ❤️',  // 更温和的表述，加上爱心emoji增加亲和力
          click: () => {
            dialog.showMessageBox({
              icon: path.join(__dirname, 'assets/icon.ico'),
              title: '桌面世界',
              message: '您的支持是我持续更新的动力 🚀',
              detail: `如果喜欢这个软件，可以考虑赞赏支持一下开发者~
感谢您的支持！`,
              buttons: ['去买奶茶', '下次一定'],
              defaultId: 0,
              cancelId: 1
            }).then(result => {
              if (result.response === 0) {
                shell.openExternal('ms-windows-store://pdp/?ProductId=9PDZ7S5Z1ZH2')
              }
            })
          }
        },
        { type: 'separator' },
        // 版本信息 弹框显示
        {
          label: '版本信息', click: () => {
            dialog.showMessageBox({
              icon: path.join(__dirname, 'assets/icon.ico'),
              title: '桌面世界',
              message: '版本信息',
              detail: `版本号：1.0.9
开发者：canghaicheng
反馈邮箱：canghaicheng@2925.com
版权所有：zhuomianshijie.com`,
              buttons: ['访问官网', '确定'],
              defaultId: 1,
              cancelId: 1
            }).then(result => {
              if (result.response === 0) {
                shell.openExternal('https://zhuomianshijie.com')
              }
            })
          }
        }
        , { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  //读取时使用
  const settings = store.getModelSettings();
  console.log('main.js中读取的模型设置:', settings);
  mainWindow.loadURL(
    `http://localhost:3000/?motion=vmd/idle.vmd&window=main`
  );

}

let transparentWindow = null

function createTransparentWindow() {
  transparentWindow = new BrowserWindow({
    width: 400,
    height: 600,
    icon: path.join(__dirname, 'assets/icon.png'),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000', // 确保背景色透明
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  currentWindow = transparentWindow; // 更新当前窗口引用

  // 创建右键菜单模板
  const contextMenuTemplate = [
    {
      label: '显示/隐藏控制面板',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        // 向渲染进程发送消息，控制控制面板的显示/隐藏
        transparentWindow.webContents.send('toggle-control-panel', menuItem.checked)
      }
    },
    { type: 'separator' },
    // {
    //   label: '显示/隐藏聊天面板',
    //   type: 'checkbox',
    //   checked: false,
    //   click: (menuItem) => {
    //     // 向渲染进程发送消息，控制控制面板的显示/隐藏
    //     transparentWindow.webContents.send('toggle-chat-panel', menuItem.checked)
    //   }
    // },
    // { type: 'separator' },
    {
      label: '返回主窗口',
      click: () => {
        // 关闭透明窗口，创建主窗口
        transparentWindow.close()
        createMainWindow()
        currentWindow = mainWindow; // 更新当前窗口引用
        addWindowCloseHandler(mainWindow)
      }
    }
  ]



  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)

  // 监听右键点击事件
  transparentWindow.webContents.on('context-menu', (event) => {
    contextMenu.popup()
  })

  transparentWindow.loadURL(
    `http://localhost:3000/transparent?motion=vmd/idle.vmd&window=transparent`
  );

  // transparentWindow.webContents.openDevTools()
}




// 添加设置窗口创建函数
let settingsWindow = null

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 600,
    icon: path.join(__dirname, 'assets/icon.png'),
    parent: BrowserWindow.getFocusedWindow(),
    modal: true,
    autoHideMenuBar: true,
    menuBarVisible: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (app.isPackaged) {
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'))
  } else {
    settingsWindow.loadFile('settings.html')
  }
  // 调试用
  // settingsWindow.webContents.openDevTools() 
}

let ttsSettingsWindow = null

function createTTSSettingsWindow() {
  ttsSettingsWindow = new BrowserWindow({
    width: 600,
    height: 600,
    icon: path.join(__dirname, 'assets/icon.png'),
    parent: BrowserWindow.getFocusedWindow(),
    modal: true,
    autoHideMenuBar: true,
    menuBarVisible: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (app.isPackaged) {
    ttsSettingsWindow.loadFile(path.join(__dirname, 'tts-settings.html'))
  } else {
    ttsSettingsWindow.loadFile('tts-settings.html')
  }
  // ttsSettingsWindow.webContents.openDevTools() 
}

let sttSettingsWindow = null

function createSTTSettingsWindow() {
  sttSettingsWindow = new BrowserWindow({
    width: 600,
    height: 600,
    icon: path.join(__dirname, 'assets/icon.png'),
    parent: BrowserWindow.getFocusedWindow(),
    modal: true,
    autoHideMenuBar: true,
    menuBarVisible: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (app.isPackaged) {
    sttSettingsWindow.loadFile(path.join(__dirname, 'stt-settings.html'))
  } else {
    sttSettingsWindow.loadFile('stt-settings.html')
  }
  // sttSettingsWindow.webContents.openDevTools() 
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  // 关闭 TTS 服务器
  if (ttsProcess) {
    ttsProcess.kill()
    console.log('TTS Server closed')
  }

  // 关闭 Express 服务器
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('Express server closed')
    })
  }

  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

if (require('electron').app.isPackaged) {
  app.commandLine.appendSwitch('no-sandbox');
}

// 在应用启动时添加防火墙规则
function addFirewallRule() {
  const ttsPath = path.join(process.resourcesPath, 'tts-server', 'tts_server.exe');
  const commands = [
    `netsh advfirewall firewall add rule name="TTS Server" dir=in action=allow program="${ttsPath}" enable=yes`,
    `netsh advfirewall firewall add rule name="TTS Server" dir=out action=allow program="${ttsPath}" enable=yes`
  ];

  commands.forEach(cmd => {
    exec(cmd, { shell: 'cmd.exe', env: process.env }, (error) => {
      if (error) console.error('添加防火墙规则失败:', error);
    });
  });
}

// 处理从设置窗口发来的设置变更事件
ipcMain.on('send-api-settings-change', (event, settings) => {
  console.log('main.js收到模型设置更新:', settings);

  // 广播到所有窗口，并传递更新后的设置
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('api-settings-change', settings);
  });
});

// 处理从渲染进程发出的 'send-tts-settings-change' 请求
ipcMain.on('send-tts-settings-change', (event, settings) => {
  console.log('main.js收到TTS设置更新:', settings);
  // 广播到所有窗口，并传递更新后的设置
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('tts-settings-change', settings);
  });
});

ipcMain.on('close-settings-window', () => {
  if (settingsWindow) {
    settingsWindow.close()
  }
})

ipcMain.on('close-tts-settings-window', () => {
  if (ttsSettingsWindow) {
    ttsSettingsWindow.close()
  }
})



// 暴露给渲染进程的方法
ipcMain.handle('store-get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-set', (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('store-delete', (event, key) => {
  store.delete(key);
});

// 添加readdir处理程序
ipcMain.handle('readdir', async (event, dirPath) => {
  try {
    // 构建完整路径
    const fullPath = path.join(app.getPath('userData'), dirPath);
    // 读取目录内容
    const files = await fs.readdir(fullPath);
    return files;
  } catch (error) {
    console.error('读取目录失败:', error);
    throw error; // 将错误传递给渲染进程
  }
});

// 修改 main.js 中的处理程序:
ipcMain.handle('readdirfiles', async (event, dirPath) => {
  try {
    const fullPath = path.join(app.getPath('userData'), dirPath);
    // 直接读取指定目录下的文件
    const files = await fs.readdir(fullPath);
    return files; // 返回文件列表
  } catch (error) {
    console.error('读取目录失败:', error);
    throw error;
  }
});


// 处理从渲染进程发出的 'get-api-settings' 请求
ipcMain.handle('get-api-settings', async () => {
  try {
    // 获取所有以 api_settings_ 开头的键
    const keys = Object.keys(store.store).filter(key => key.startsWith('api_settings_'));
    // 获取所有设置
    const settings = keys.map(key => store.get(key));
    return settings;
  } catch (error) {
    console.error('获取设置失败:', error);
    return [];
  }
});

ipcMain.handle('get-tts-settings', async () => {
  try {
    // 获取所有以 tts_settings_ 开头的键
    const keys = Object.keys(store.store).filter(key => key.startsWith('tts_settings_'));
    // 获取所有设置
    const settings = keys.map(key => store.get(key));
    return settings;
  } catch (error) {
    console.error('获取TTS设置失败:', error);
    return [];
  }
});

ipcMain.handle('get-stt-settings', async () => {
  try {
    const keys = Object.keys(store.store).filter(key => key.startsWith('stt_settings_'));
    const settings = keys.map(key => store.get(key));
    return settings;
  } catch (error) {
    console.error('获取STT设置失败:', error);
    return [];
  }
});

console.log('应用根目录:', app.getAppPath());

function createTray() {
  // 创建托盘图标
  tray = new Tray(path.join(__dirname, 'assets/icon.png'));

  // 设置托盘图标提示文本
  tray.setToolTip('桌面世界');

  // 创建托盘右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      click: () => {
        if (currentWindow) {
          currentWindow.isVisible() ? currentWindow.hide() : currentWindow.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: '请开发者喝杯奶茶 ❤️',  // 更温和的表述，加上爱心emoji增加亲和力
      click: () => {
        dialog.showMessageBox({
          icon: path.join(__dirname, 'assets/icon.ico'),
          title: '桌面世界',
          message: '您的支持是我持续更新的动力 🚀',
          detail: `如果喜欢这个软件，可以考虑赞赏支持一下开发者~
感谢您的支持！`,
          buttons: ['去买奶茶', '下次一定'],
          defaultId: 0,
          cancelId: 1
        }).then(result => {
          if (result.response === 0) {
            shell.openExternal('ms-windows-store://pdp/?ProductId=9PDZ7S5Z1ZH2')
          }
        })
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  // 设置托盘右键菜单
  tray.setContextMenu(contextMenu);

  // 托盘图标被点击时显示窗口
  tray.on('click', () => {
    if (currentWindow) {
      currentWindow.isVisible() ? currentWindow.hide() : currentWindow.show();
    }
  });
}

// 在应用退出前销毁托盘图标
app.on('before-quit', () => {
  app.isQuitting = true;
});

// 在切换窗口时添加关闭事件处理
function addWindowCloseHandler(window) {
  window.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      window.hide();
    }
    return false;
  });
}



import { SentencePreloadQueue, speakContent } from './audioHelper.js';

// 在文件开头添加
console.log('chatHelper electronAPI available:', !!window.electronAPI);

// 定义一个messages为jsonArray
let messages = [];

export async function setupGUI(chatGui) {
    // 添加移动设备的响应式处理
    if (window.innerWidth <= 500) { // 移动设备宽度阈值
        chatGui.domElement.style.position = 'fixed';
        chatGui.domElement.style.width = '100%';  // 设置宽度为100%
        chatGui.domElement.style.maxWidth = '100%'; // 覆盖lil-gui的默认最大宽度
        // 确保子元素也是100%宽度
        const root = chatGui.domElement.querySelector('.root');
        if (root) {
            root.style.width = '100%';
            root.style.maxWidth = '100%';
        }

        // 在移动设备上默认收起
        chatGui.close();
    }

   


    // 创建AI设置文件夹
    const aiFolder = chatGui.addFolder('设置');
    // 保存监听器的清理函数
    const cleanupListener = window.electronAPI.onApiSettingsChange((settings) => {
        console.log('chatHelper收到API设置更新:', settings);
        // 清理现有内容
        clearAiFolder(aiFolder);
        setupAiFolder(aiFolder);
    });

    const cleanupListener2 = window.electronAPI.onTTSSettingsChange((settings) => {
        console.log('chatHelper收到TTS设置更新:', settings);
        // 清理现有内容
        clearAiFolder(aiFolder);
        setupAiFolder(aiFolder);
    });


    // 在窗口卸载时清理监听器
    window.addEventListener('unload', () => {
        if (cleanupListener) {
            cleanupListener();
        }
        if (cleanupListener2) {
            cleanupListener2();
        }
    });
    await setupAiFolder(aiFolder);

    // 创建人设文件夹
    const characterFolder = chatGui.addFolder('角色设定');
    setupCharacterFolder(characterFolder);

    const urlParams = new URLSearchParams(window.location.search);
    const windowType = urlParams.get('window');
    if (windowType === 'transparent') {
        aiFolder.domElement.style.display = 'none';
        characterFolder.domElement.style.display = 'none';
    }

    // 创建聊天框文件夹
    const messageFolder = chatGui.addFolder('聊天框');
    setupMessageFolder(messageFolder);
}



// 添加新的清理函数
function clearAiFolder(aiFolder) {
    // 获取 aiFolder 的 DOM 元素
    const folderElement = aiFolder.domElement;

    // 保留标题元素（title），清除其他所有内容
    const children = Array.from(folderElement.children);
    console.log(children);
    children.forEach(child => {
        if (!child.classList || !child.classList.contains('title')) {
            folderElement.removeChild(child);
        }
    });
}

async function setupAiFolder(aiFolder) {
    const siliconflowContainer = document.createElement('div');
    siliconflowContainer.style.padding = '0 6px';
    siliconflowContainer.style.width = '100%';

    // 获取API设置
    const settings = await window.electronAPI.getApiSettings();
    const sortedSettings = settings.sort((a, b) =>
        (b.timestamp || 0) - (a.timestamp || 0)
    );
    console.log('sortedSettings:', sortedSettings);

    // 获取TTS设置
    const ttsSettings = await window.electronAPI.getTTSSettings();
    const sortedTtsSettings = ttsSettings.sort((a, b) =>
        (b.timestamp || 0) - (a.timestamp || 0)
    );
    console.log('sortedTtsSettings:', sortedTtsSettings);

    // gui下拉
    const apiSelect = document.createElement('select');
    apiSelect.id = 'api-select';
    apiSelect.style.width = '100%';

    //tts下拉
    const ttsSelect = document.createElement('select');
    ttsSelect.id = 'tts-select';
    ttsSelect.style.width = '100%';

    // 添加一个默认的空选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '请选择API设置...';
    apiSelect.appendChild(defaultOption);

    // 添加一个默认的空选项
    const defaultTtsOption = document.createElement('option');
    defaultTtsOption.value = 'edgetts';
    defaultTtsOption.textContent = '默认';
    ttsSelect.appendChild(defaultTtsOption);

    // 将sortedSettings里的key值添加到apiSelect中
    sortedSettings.forEach(setting => {
        const option = document.createElement('option');
        option.value = setting.name;
        option.textContent = setting.name;
        apiSelect.appendChild(option);
    });

    // 将sortedTtsSettings里的key值添加到ttsSelect中
    sortedTtsSettings.forEach(setting => {
        const option = document.createElement('option');
        option.value = setting.ttsName;
        option.textContent = setting.ttsName;
        ttsSelect.appendChild(option);
    });

    // 创建API容器
    const apiContainer = document.createElement('div');
    apiContainer.style.display = 'flex';
    apiContainer.style.alignItems = 'center';
    apiContainer.style.gap = '8px'; // 标签和下拉框之间的间距
    apiContainer.style.marginBottom = '8px';

    // 创建TTS容器
    const ttsContainer = document.createElement('div');
    ttsContainer.style.display = 'flex';
    ttsContainer.style.alignItems = 'center';
    ttsContainer.style.gap = '8px';

    // API标题
    const apiLabel = document.createElement('div');
    apiLabel.textContent = 'API';
    apiLabel.style.color = '#fff';
    apiLabel.style.fontSize = '12px';
    apiLabel.style.minWidth = '30px'; // 固定标签宽度

    // TTS标题
    const ttsLabel = document.createElement('div');
    ttsLabel.textContent = 'TTS';
    ttsLabel.style.color = '#fff';
    ttsLabel.style.fontSize = '12px';
    ttsLabel.style.minWidth = '30px'; // 固定标签宽度

    // 将标签和下拉框添加到各自的容器中
    apiContainer.appendChild(apiLabel);
    apiContainer.appendChild(apiSelect);
    ttsContainer.appendChild(ttsLabel);
    ttsContainer.appendChild(ttsSelect);

    // 将容器添加到主容器中
    siliconflowContainer.appendChild(apiContainer);
    siliconflowContainer.appendChild(ttsContainer);

    const apiDomain = document.createElement('input');
    // 隐藏输入框
    apiDomain.style.display = 'none';
    apiDomain.type = 'text';
    setupInputArea(apiDomain, 'api-domain', '输入API域名...');
    siliconflowContainer.appendChild(apiDomain);

    const apiPath = document.createElement('input');
    // 隐藏输入框
    apiPath.style.display = 'none';
    apiPath.type = 'text';
    setupInputArea(apiPath, 'api-path', '输入API路径...');
    siliconflowContainer.appendChild(apiPath);

    const maxSize = document.createElement('input');
    // 隐藏输入框
    maxSize.style.display = 'none';
    maxSize.type = 'text';
    setupInputArea(maxSize, 'max-size', '输入上下文限制大小...');
    maxSize.value = localStorage.getItem('max-size');
    siliconflowContainer.appendChild(maxSize);

    const apiKey = document.createElement('input');
    // 隐藏输入框   
    apiKey.style.display = 'none';
    apiKey.type = 'text';
    setupInputArea(apiKey, 'api-key', '输入API密钥...');
    siliconflowContainer.appendChild(apiKey);

    const modelName = document.createElement('input');
    modelName.type = 'text';
    // 隐藏输入框
    modelName.style.display = 'none';
    setupInputArea(modelName, 'model-name', '输入模型...');
    siliconflowContainer.appendChild(modelName);

    // 新增tts字段
    const ttsDomain = document.createElement('input');
    ttsDomain.type = 'text';
    ttsDomain.style.display = 'none';
    setupInputArea(ttsDomain, 'tts-domain', '输入TTS API域名...');
    siliconflowContainer.appendChild(ttsDomain);

    const ttsPath = document.createElement('input');
    ttsPath.type = 'text';
    ttsPath.style.display = 'none';
    setupInputArea(ttsPath, 'tts-path', '输入TTS API路径...');
    siliconflowContainer.appendChild(ttsPath);

    const ttsKey = document.createElement('input');
    ttsKey.type = 'text';
    ttsKey.style.display = 'none';
    setupInputArea(ttsKey, 'tts-key', '输入TTS API密钥...');
    siliconflowContainer.appendChild(ttsKey);

    const ttsModel = document.createElement('input');
    ttsModel.type = 'text';
    ttsModel.style.display = 'none';
    setupInputArea(ttsModel, 'tts-model', '输入TTS模型...');
    siliconflowContainer.appendChild(ttsModel);

    const ttsVoiceId = document.createElement('input');
    ttsVoiceId.type = 'text';
    ttsVoiceId.style.display = 'none';
    setupInputArea(ttsVoiceId, 'tts-voice-id', '输入音色编号...');
    siliconflowContainer.appendChild(ttsVoiceId);


    hideEmptyText(aiFolder);
    aiFolder.domElement.appendChild(siliconflowContainer);
    aiFolder.open();

    // 从store中读取上次选择的API设置
    const lastSelected = await window.electronAPI.storeGet('selectedApiSetting');
    console.log('last selected ApiSetting:', lastSelected);
    if (lastSelected && sortedSettings.some(s => s.name === lastSelected)) {
        // 移除defaultOption
        apiSelect.removeChild(defaultOption);
        apiSelect.value = lastSelected;
        // 将选中的setting赋值给下面的input
        const selectedSetting = sortedSettings.find(s => s.name === lastSelected);
        if (selectedSetting) {
            apiDomain.value = selectedSetting.apiDomain;
            apiPath.value = selectedSetting.apiPath;
            maxSize.value = selectedSetting.maxSize;
            apiKey.value = selectedSetting.apiKey;
            modelName.value = selectedSetting.model;
        }
    }
    // 从store中读取上次选择的tts设置
    const lastSelectedTts = await window.electronAPI.storeGet('selectedTtsSetting');
    console.log('last selected TtsSetting:', lastSelectedTts);
    if (lastSelectedTts && sortedTtsSettings.some(s => s.ttsName === lastSelectedTts)) {
        ttsSelect.value = lastSelectedTts;
        // 将选中的setting赋值给下面的input
        const selectedTtsSetting = sortedTtsSettings.find(s => s.ttsName === lastSelectedTts);
        if (selectedTtsSetting) {
            ttsDomain.value = selectedTtsSetting.ttsApiDomain;
            ttsPath.value = selectedTtsSetting.ttsApiPath;
            ttsKey.value = selectedTtsSetting.ttsApiKey;
            ttsModel.value = selectedTtsSetting.ttsModel;
            ttsVoiceId.value = selectedTtsSetting.ttsVoiceId;
        }
    }

    // 添加change事件监听器
    apiSelect.addEventListener('change', async () => {
        const selectedValue = apiSelect.value;
        console.log('change selectedValue:', selectedValue);
        // 将选中的setting赋值给下面的input
        if (selectedValue && sortedSettings.some(s => s.name === selectedValue)) {
            await window.electronAPI.storeSet('selectedApiSetting', selectedValue);

            const selectedSetting = sortedSettings.find(s => s.name === selectedValue);
            console.log('change selectedSetting:', selectedSetting);
            if (selectedSetting) {
                apiDomain.value = selectedSetting.apiDomain;
                apiPath.value = selectedSetting.apiPath;
                maxSize.value = selectedSetting.maxSize;
                apiKey.value = selectedSetting.apiKey;
                modelName.value = selectedSetting.model;
            }
        }
    });

    // 添加change事件监听器
    ttsSelect.addEventListener('change', async () => {
        const selectedValue = ttsSelect.value;
        console.log('change selectedValue:', selectedValue);
        // 将选中的tts setting赋值给下面的input
        if (selectedValue) {
            await window.electronAPI.storeSet('selectedTtsSetting', selectedValue);
            const selectedTtsSetting = sortedTtsSettings.find(s => s.ttsName === selectedValue);
            if (selectedTtsSetting) {
                ttsDomain.value = selectedTtsSetting.ttsApiDomain;
                ttsPath.value = selectedTtsSetting.ttsApiPath;
                ttsKey.value = selectedTtsSetting.ttsApiKey;
                ttsModel.value = selectedTtsSetting.ttsModel;
                ttsVoiceId.value = selectedTtsSetting.ttsVoiceId;
            }
        }
    });

    setupFolderToggle(aiFolder, siliconflowContainer);
}

function setupCharacterFolder(characterFolder) {
    const characterContainer = document.createElement('div');
    characterContainer.style.padding = '0 6px';
    characterContainer.style.width = '100%';

    const textarea = document.createElement('textarea');
    const textareaContainer = setupTextAreaUp(
        textarea,  // 保存 textarea 引用
        'chat-history',
        '输入角色设定...'
    );
    // 从 localStorage 读取保存的值
    textarea.value = localStorage.getItem('chat-history') || '';
    // 监听输入变化并保存
    textarea.addEventListener('input', () => {
        localStorage.setItem('chat-history', textarea.value);
    });

    characterContainer.appendChild(textareaContainer);

    hideEmptyText(characterFolder);
    characterFolder.domElement.appendChild(characterContainer);
    characterFolder.open();

    setupFolderToggle(characterFolder, characterContainer);
}

function setupMessageFolder(messageFolder) {
    const folderContainer = document.createElement('div');
    folderContainer.style.padding = '0 6px';
    folderContainer.style.width = '100%';
    // 命名
    folderContainer.id = 'message-folder';


    const sendButtonContainer = createSendButton();
    // 分开获取container 和 sendButton
    const container = sendButtonContainer.container;
    const recordButton = sendButtonContainer.recordButton;

    // 独立处理语音识别初始化
    initSpeechRecognition(recordButton).catch(error => {
        console.warn('语音识别初始化失败，禁用录音功能:', error);
        recordButton.style.display = 'none';
    });


    folderContainer.appendChild(container);

    hideEmptyText(messageFolder);
    messageFolder.domElement.appendChild(folderContainer);
    messageFolder.open();

    setupFolderToggle(messageFolder, folderContainer);
}

// 录音相关变量
let mediaRecorder = null;  // MediaRecorder实例
let audioChunks = [];     // 用于存储录音数据

// 将语音识别初始化独立为一个函数
async function initSpeechRecognition(recordButton) {
    // 获取stt设置
    const sttSettings = await window.electronAPI.getSTTSettings();
    // 如果为空
    if (sttSettings.length === 0) {
        throw new Error('stt未配置');
    }
    // 最新的stt设置
    const latestSttSetting = sttSettings[sttSettings.length - 1];
    console.log('latestSttSetting:', latestSttSetting);

    const sttApiDomain = latestSttSetting.sttApiDomain;
    const sttApiKey = latestSttSetting.sttApiKey;
    const sttApiPath = latestSttSetting.sttApiPath;
    const sttModel = latestSttSetting.sttModel;

    // recordButton的click事件绑定CapsLock键
    // 记录上一次的CapsLock状态
    let lastCapsLockState = false;

    // 监听keydown事件
    document.addEventListener('keydown', (e) => {
        // 使用setTimeout确保获取到正确的CapsLock状态
        setTimeout(() => {
            const capsLockState = e.getModifierState('CapsLock');
            // 只在状态发生变化时触发
            if (capsLockState !== lastCapsLockState) {
                recordButton.click();
                lastCapsLockState = capsLockState;
            }
        }, 0);
    });


    let isRecording = false;
    try {
        // 请求麦克风权限并获取音频流
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 创建 MediaRecorder 实例
        mediaRecorder = new MediaRecorder(stream);

        // 监听录音数据
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        // 监听录音结束
        mediaRecorder.onstop = async () => {
            // 将录音数据转换为wav文件
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });

            // 准备FormData
            const form = new FormData();
            form.append('file', audioFile);
            form.append('model', sttModel);

            try {
                // 调用语音识别接口
                const response = await fetch(sttApiDomain + sttApiPath, {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + sttApiKey
                    },
                    body: form
                });

                const result = await response.json();
                console.log('语音识别结果:', result.text);
                if (result.text) {
                    sendMessage(result.text);
                }

                // 清空录音数据
                audioChunks = [];

            } catch (error) {
                console.error('语音识别失败:', error);
            }
        };

        // 设置录音按钮点击事件
        recordButton.addEventListener('click', () => {
            if (!isRecording) {
                // 开始录音
                console.log('开始录音');
                audioChunks = []; // 清空之前的录音数据
                mediaRecorder.start(); // MediaRecorder的start方法
                isRecording = true;
                updateButtonState(true);
            } else {
                // 停止录音
                console.log('停止录音');
                mediaRecorder.stop(); // MediaRecorder的stop方法
                isRecording = false;
                updateButtonState(false);
            }
        });

        return true;

    } catch (error) {
        console.error('录音初始化失败:', error);
        return false;
    }

    function updateButtonState(recording) {
        const micIcon = recordButton.querySelector('img');
        if (recording) {
            micIcon.src = 'pictures/voice-off.png';
            recordButton.title = '点击停止录音';
        } else {
            micIcon.src = 'pictures/voice.png';
            recordButton.title = '点击开始录音';
        }
    }
}





function setupInputArea(textarea, className, placeholder) {
    textarea.className = className;
    textarea.placeholder = placeholder;
    textarea.style.width = '100%';
    textarea.style.minHeight = '25px';
    textarea.style.margin = '6px 0';
    textarea.style.padding = '4px';
    textarea.style.boxSizing = 'border-box';
    textarea.style.backgroundColor = '#1a1a1a';
    textarea.style.color = '#fff';
    textarea.style.border = '1px solid #333';
    textarea.style.borderRadius = '4px';
    textarea.style.resize = 'vertical';
    textarea.style.fontSize = '12px';

    // 添加焦点样式
    textarea.addEventListener('focus', () => {
        textarea.style.outline = 'none';
        textarea.style.border = '1px solid #ffffff';
    });

    // 添加失去焦点时的样式
    textarea.addEventListener('blur', () => {
        textarea.style.border = '1px solid #333';
    });
}

function setupTextAreaUp(textarea, className, placeholder) {
    textarea.className = className;
    textarea.placeholder = placeholder;
    textarea.style.width = '100%';
    textarea.style.minHeight = '32px';
    textarea.style.lineHeight = '32px';  //
    textarea.style.height = '32px';     // 添加这行,设置初始高度
    textarea.style.margin = '4px 0';
    textarea.style.boxSizing = 'border-box';
    textarea.style.backgroundColor = '#1a1a1a';
    textarea.style.color = '#fff';
    textarea.style.border = '1px solid #333';
    textarea.style.borderRadius = '4px';
    textarea.style.resize = 'none';      // 禁用原生resize
    textarea.style.fontSize = '12px';


    // 创建自定义resize手柄
    const resizer = document.createElement('div');
    resizer.style.position = 'absolute';
    resizer.style.right = '4px';         // 调整到输入框内部右上角
    resizer.style.top = '10px';          // 调整到输入框内部上
    resizer.style.width = '6px';         // 更小的手柄
    resizer.style.height = '6px';        // 更小的手柄
    resizer.style.cursor = 'n-resize';   // 上下拖动的光标
    resizer.style.borderRight = '2px solid #666';  // 使用边框创建手柄样式
    resizer.style.borderTop = '2px solid #666';
    resizer.style.zIndex = '10';         // 确保手柄在最上层
    resizer.style.pointerEvents = 'all'; // 确保可以点击

    // 添加拖动逻辑
    let startY, startHeight;
    resizer.addEventListener('mousedown', (e) => {
        startY = e.clientY;
        startHeight = parseInt(getComputedStyle(textarea).height);
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
        // e.preventDefault(); // 防止文本选择
    });

    function resize(e) {
        const deltaY = startY - e.clientY;
        textarea.style.height = `${startHeight + deltaY}px`;
    }

    function stopResize() {
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
    }

    // 将resize手柄添加到textarea的容器中
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '100%';      // 保容器宽度正确

    container.appendChild(textarea);
    container.appendChild(resizer);

    // 添加焦点样式
    textarea.addEventListener('focus', () => {
        textarea.style.outline = 'none';
        textarea.style.border = '1px solid #ffffff';
    });

    // 添加失去焦点时的样式
    textarea.addEventListener('blur', () => {
        textarea.style.border = '1px solid #333';
    });

    return container;
}

function setupTextArea(textarea, className, placeholder) {
    textarea.className = className;
    textarea.placeholder = placeholder;
    textarea.style.width = '100%';
    textarea.style.minHeight = '50px';
    textarea.style.margin = '6px 0';
    textarea.style.padding = '4px';
    textarea.style.boxSizing = 'border-box';
    textarea.style.backgroundColor = '#1a1a1a';
    textarea.style.color = '#fff';
    textarea.style.border = '1px solid #333';
    textarea.style.borderRadius = '4px';
    textarea.style.resize = 'vertical';
    textarea.style.fontSize = '12px';

    // 添加焦点样式
    textarea.addEventListener('focus', () => {
        textarea.style.outline = 'none';
        textarea.style.border = '1px solid #ffffff';
    });

    // 添加失去焦点时的样式
    textarea.addEventListener('blur', () => {
        textarea.style.border = '1px solid #333';
    });
}

function createSendButton() {
    const urlParams = new URLSearchParams(window.location.search);
    const windowType = urlParams.get('window');
    console.log('windowType:', windowType);

    // 创建容器来包含点阵、录音按钮和发送按钮
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';

    // 创建录音按钮
    const recordButton = document.createElement('button');
    recordButton.style.background = 'none';
    recordButton.style.border = 'none';
    recordButton.style.cursor = 'pointer';
    recordButton.style.padding = '0';
    recordButton.style.width = '40px'; // 调整宽度
    recordButton.title = '点击开始录音'; // 添加鼠标悬浮提示

    const micIcon = document.createElement('img');
    micIcon.src = 'pictures/voice.png';
    micIcon.alt = '录音';
    micIcon.style.width = '24px';
    micIcon.style.height = '24px';

    recordButton.appendChild(micIcon);

    const textarea = document.createElement('textarea');
    const textareaContainer = setupTextAreaUp(textarea, 'message-input', '');


    // 创建发送按钮
    const sendButton = document.createElement('button');
    sendButton.className = 'send-button';
    sendButton.textContent = '发送';
    sendButton.disabled = true;

    Object.assign(sendButton.style, {
        padding: '6px 12px',
        backgroundColor: '#363636',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '24px',
        lineHeight: '1',
        fontSize: '12px',
        opacity: '0.5',
        minWidth: '48px',
        flex: '1'  // 发送按钮占据剩余空间
    });

    if (windowType === 'transparent') {
        // 创建点阵容器
        const dragHandle = document.createElement('div');
        dragHandle.style.display = 'grid';
        dragHandle.style.gridTemplateColumns = 'repeat(3, 2px)';
        dragHandle.style.gap = '2px';
        dragHandle.style.padding = '4px';
        dragHandle.style.cursor = 'move';
        dragHandle.style.webkitAppRegion = 'drag';  // 使其可拖动
        dragHandle.title = '点击拖动窗口'; // 添加鼠标悬浮提示

        for (let i = 0; i < 9; i++) {
            const dot = document.createElement('div');
            dot.style.width = '2px';
            dot.style.height = '2px';
            dot.style.backgroundColor = '#666';
            dot.style.borderRadius = '50%';
            dragHandle.appendChild(dot);
        }

        container.appendChild(dragHandle);
    }

    container.appendChild(recordButton);
    container.appendChild(textareaContainer);
    container.appendChild(sendButton);

    setupMessageHandling(textarea, sendButton);

    return {
        container,
        recordButton,
        sendButton
    };
}

// 创建预加载队列实例
const queue = new SentencePreloadQueue(3);

// 开启自动播放
queue.setAutoPlay(true);

async function sendMessage(message) {
    try {

        // 定义一个usercontent为jsonObject
        let userContent = {
            role: "user",
            content: message
        };

        const characterSetting = document.querySelector('.chat-history').value.trim();
        // 定义一个systemContent为jsonObject
        let systemContent = {
            role: "system",
            content: characterSetting
        };
        // messages中有且只有一个systemContent
        // 检查并处理 messages 数组
        if (messages.length === 0) {
            // 如果是空数组，添加 systemContent
            messages.push(systemContent);
        } else if (messages[0].role !== "system") {
            // 如果第一条不是 system 消息，在开头插入
            messages.unshift(systemContent);
        } else {
            // 如果第一条是 system 消息，更新它的内容
            messages[0] = systemContent;
        }

        // 将usercontent添加到messages中
        trimMessages(userContent);
        console.log(userContent);
        // 获取域名api-domain
        const target = document.querySelector('.api-domain').value.trim();
        // console.log('target:', target);
        // 获取api-path
        const path = document.querySelector('.api-path').value.trim();
        // console.log('path:', path);
        // 获取api-key
        const token = document.querySelector('.api-key').value.trim();
        // console.log('token:', token);
        // 获取model-name
        const model = document.querySelector('.model-name').value.trim();
        // console.log('model:', model);
        // 获取tts设置
        const ttsSetting = document.querySelector('#tts-select').value.trim();
        const options = {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'X-Target-URL': target
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: true,
                max_tokens: 4096,
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                frequency_penalty: 0.5,
                n: 1
            })
        };

        // 简单的异步生成器函数来读取流数据
        async function* readStream(reader) {
            let buffer = '';  // 用于存储未完成的数据
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // 按行分割，处理每个完整的data块
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留最后一个不完整的行

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('data: ')) {
                        const jsonStr = trimmedLine.slice(5); // 移除 "data: "
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const json = JSON.parse(jsonStr);
                            yield json;
                        } catch (e) {
                            console.warn('跳过不完整的JSON:', jsonStr);
                            continue;
                        }
                    }
                }
            }

            // 处理最后可能剩余的数据
            if (buffer.trim()) {
                const trimmedLine = buffer.trim();
                if (trimmedLine.startsWith('data: ')) {
                    const jsonStr = trimmedLine.slice(5);
                    if (jsonStr !== '[DONE]') {
                        try {
                            const json = JSON.parse(jsonStr);
                            yield json;
                        } catch (e) {
                            console.warn('跳过最后不完整的JSON:', jsonStr);
                        }
                    }
                }
            }
        }

        const response = await fetch('/proxy/api' + path, options);
        const reader = response.body.getReader();
        let content = '';
        let buffer = '';

        // 使用修改后的readStream处理流数据
        for await (const chunk of readStream(reader)) {
            const chunkContent = chunk.choices?.[0]?.delta?.content;
            if (chunkContent) {
                // console.log('chunkContent:', chunkContent);
                content += chunkContent;
                buffer += chunkContent;

                // 接口有速率限制，逻辑也有问题，先预留流式播放功能。。。
                // 累积chunkContent,如果遇到句号。或者.就开始播放之前的句子
                // if (chunkContent.includes('.') || chunkContent.includes('。') ) {
                //     // 去除content里的*
                //     const replaceContent = buffer.replace(/\*/g, '');
                //     if (ttsSetting === 'edgetts') {
                //         queue.addSentence(replaceContent);
                //     } else {

                //         // 获取ttsSetting对应的隐藏输入框值放入一个对象
                //         const ttsSettingObject = {
                //             ttsDomain: document.querySelector('.tts-domain').value.trim(),
                //             ttsPath: document.querySelector('.tts-path').value.trim(),
                //             ttsKey: document.querySelector('.tts-key').value.trim(),
                //             ttsModel: document.querySelector('.tts-model').value.trim(),
                //             ttsVoiceId: document.querySelector('.tts-voice-id').value.trim()
                //         };
                //         queue.addSentence(replaceContent, ttsSettingObject);
                //     }

                //     console.log('buffer:', buffer);
                //     buffer = '';
                // }
            }
        }

        // 定义一个assistantContent为jsonObject
        let assistantContent = {
            role: "assistant",
            content: content
        };
        trimMessages(assistantContent);
        console.log("content：" + content);
        // 不是undefined    

        // console.log('ttsSetting:', ttsSetting);
        if (content) {
            // 去除content里的*
            const replaceContent = content.replace(/\*/g, '');
            // 去除content里以<think>开头以</think>结尾的内容
            const replaceThinkContent = replaceContent.replace(/<think>[\s\S]*?<\/think>/g, '');

            // console.log("替换后的内容:", replaceThinkContent);

            // 如果ttsSetting为edgetts，则使用edgetts播放
            if (ttsSetting === 'edgetts') {
                speakContent(replaceThinkContent);
            } else {
                const ttsSettingObject = {
                    ttsDomain: document.querySelector('.tts-domain').value.trim(),
                    ttsPath: document.querySelector('.tts-path').value.trim(),
                    ttsKey: document.querySelector('.tts-key').value.trim(),
                    ttsModel: document.querySelector('.tts-model').value.trim(),
                    ttsVoiceId: document.querySelector('.tts-voice-id').value.trim()
                };
                speakContentWithTtsSetting(replaceThinkContent, ttsSettingObject);
            }
        }

        return response.data;
    } catch (error) {
        console.error('发送消息时出错:', error);
        alert('发送消息失败: ' + error.message);
    }
}

// 添加消息前检查裁剪消息史
function trimMessages(newMessage) {
    // 计算当前消息的长度（包括新消息）
    const getMessageSize = msg => JSON.stringify(msg).length;
    // 获取max-size
    const maxSize = document.querySelector('.max-size').value.trim();
    const MAX_SIZE = maxSize * 1024; // 31K

    // 计算新消息的大小
    const newMessageSize = getMessageSize(newMessage);

    // 当前所有消息的总大小
    let totalSize = messages.reduce((size, msg) => size + getMessageSize(msg), 0) + newMessageSize;

    // 如果超过限制，从第二条消息开始删除（保留system消息）
    while (totalSize > MAX_SIZE && messages.length > 1) {
        // 每次删除一对对话（user和assistant消息）
        const removed1 = messages.splice(1, 1)[0]; // 删除用户消息
        const removed2 = messages.splice(1, 1)[0]; // 删除助手消息

        // 重新计算大小
        totalSize -= (getMessageSize(removed1) + getMessageSize(removed2));
    }

    // 添加新消息
    messages.push(newMessage);
}




function setupMessageHandling(textarea, sendButton) {
    let message = '';

    textarea.addEventListener('input', () => {
        message = textarea.value;
        sendButton.disabled = !message.trim();
        sendButton.style.opacity = sendButton.disabled ? '0.5' : '1';
        sendButton.style.cursor = sendButton.disabled ? 'not-allowed' : 'pointer';
    });

    sendButton.addEventListener('click', async () => {
        if (message.trim()) {
            // 当前选中的settings是否为空
            const selectedApiSetting = document.querySelector('#api-select').value.trim();
            console.log('selectedApiSetting:', selectedApiSetting);
            if (!selectedApiSetting) {
                alert('请选择API设置');
                return;
            }
            // 清空输入框
            textarea.value = '';
            await sendMessage(message);

            message = '';
            sendButton.disabled = true;
            sendButton.style.opacity = '0.5';
            sendButton.style.cursor = 'not-allowed';
        }
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendButton.disabled) {
                sendButton.click();
            }
        }
    });
}

function hideEmptyText(folder) {
    const emptyText = folder.domElement.querySelector('.children');
    if (emptyText) {
        emptyText.style.display = 'none';
    }
}

function setupFolderToggle(folder, container) {
    let isOpen = true;
    folder.$title.addEventListener('click', () => {
        if (isOpen) {
            folder.close();
            container.style.display = 'none';
        } else {
            folder.open();
            container.style.display = 'block';
        }
        isOpen = !isOpen;
    });
}

console.log('可用的 API:', window.electronAPI);
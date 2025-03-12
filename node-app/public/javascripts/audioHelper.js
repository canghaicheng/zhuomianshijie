class LipSync {
    constructor(mesh) {
        this.mesh = mesh;
        this.morphTargets = mesh.morphTargetDictionary;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // 优化分析器参数
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;  // 提高到512以获得更精确的频率分析
        this.analyser.smoothingTimeConstant = 0.4;  // 增加平滑度
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        // 复合音素配置
        this.compoundPhonemes = {
            // 双元音
            'ai': ['a', 'i'],
            'ei': ['e', 'i'],
            'ui': ['u', 'i'],
            'ao': ['a', 'o'],
            'ou': ['o', 'u'],
            'iu': ['i', 'u'],
            'ie': ['i', 'e'],
            'üe': ['u', 'e'],

            // 前鼻音韵母
            'an': ['a', 'n'],
            'en': ['e', 'n'],
            'in': ['i', 'n'],
            'un': ['u', 'n'],
            'ün': ['u', 'n'],

            // 后鼻音韵母
            'ang': ['a', 'ng'],
            'eng': ['e', 'ng'],
            'ing': ['i', 'ng'],
            'ong': ['o', 'ng'],

            // 整体认读音节
            'zhi': ['zh', 'i'],
            'chi': ['ch', 'i'],
            'shi': ['sh', 'i'],
            'ri': ['r', 'i'],
            'zi': ['z', 'i'],
            'ci': ['c', 'i'],
            'si': ['s', 'i']
        };

        // 口型映射
        this.morphNames = {
            // 声母（23个）
            // 双唇音
            'b': 'ん',    // 不送气双唇塞音
            'p': 'ん',    // 送气双唇塞音
            'm': 'ん',    // 双唇鼻音

            // 唇齿音
            'f': 'う',    // 唇齿擦音

            // 舌尖前音
            'd': 'え',    // 不送气舌尖前塞音
            't': 'え',    // 送气舌尖前塞音
            'n': 'ん',    // 舌尖前鼻音
            'l': 'え',    // 舌尖前边音
            'z': 'い',    // 不送气舌尖前擦音
            'c': 'い',    // 送气舌尖前擦音
            's': 'い',    // 清舌尖前擦音

            // 舌尖后音
            'zh': 'い',   // 不送气舌尖后擦音
            'ch': 'い',   // 送气舌尖后擦音
            'sh': 'い',   // 清舌尖后擦音
            'r': 'う',    // 浊舌尖后擦音

            // 舌面音
            'j': 'い',    // 不送气舌面前塞擦音
            'q': 'い',    // 送气舌面前塞擦音
            'x': 'い',    // 舌面前擦音

            // 舌根音
            'g': 'お',    // 不送气舌根塞音
            'k': 'お',    // 送气舌根塞音
            'h': 'う',    // 舌根擦音

            // 元音
            'a': 'あ',    // 开口呼，低母音
            'o': 'お',    // 合口呼，中母音
            'e': 'え',    // 开口呼，中母音
            'i': 'い',    // 齐齿呼，高母音
            'u': 'う',    // 合口呼，高母音
            'v': 'う',    // 撮口呼高母音

            // 默认音素
            'default': 'あ'
        };

        // 为不同音素设置不同的最大张开程度
        this.morphWeights = {
            // 声母权重
            'b': 0.1,     // 双唇完全闭合
            'p': 0.1,     // 双唇完全闭合
            'm': 0.1,     // 双唇完全闭合
            'f': 0.3,     // 上齿轻触下唇
            'd': 0.4,     // 舌尖抵上齿龈
            't': 0.4,     // 舌尖抵上齿龈
            'n': 0.2,     // 舌尖鼻音
            'l': 0.5,     // 舌侧音
            'z': 0.4,     // 舌尖前擦音
            'c': 0.4,     // 舌尖前擦音
            's': 0.4,     // 舌尖前擦音
            'zh': 0.4,    // 舌尖后擦音
            'ch': 0.4,    // 舌尖后擦音
            'sh': 0.4,    // 舌尖后擦音
            'r': 0.3,     // 卷舌音
            'j': 0.4,     // 舌面前音
            'q': 0.4,     // 舌面前音
            'x': 0.4,     // 舌面前音
            'g': 0.5,     // 舌根音
            'k': 0.5,     // 舌根音
            'h': 0.4,     // 舌根擦音

            // 元音权重
            'a': 1.0,     // 最大开口度
            'o': 0.8,     // 圆唇中等开口
            'e': 0.7,     // 中等开口
            'i': 0.5,     // 扁平小开口
            'u': 0.4,     // 圆唇小开口
            'v': 0.4,     // 撮口小开口

            // 默认权重
            'default': 0.5
        };

        this.lastUpdateTime = Date.now();
        this.transitionSpeed = 0.25;
        this.lastPhoneme = null;

        this.audioQueue = [];
    }


    // 将原 processQueue 中的音频处理逻辑提取到单独的方法
    async processAudio(audioUrl) {
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 1.0;

            source.connect(this.analyser);
            this.analyser.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            source.start(0);
            this.isPlaying = true;

            this.startLipSync();

            // 等待当前音频播放完成
            await new Promise(resolve => {
                source.onended = () => {
                    this.isPlaying = false;
                    this.resetMouth();
                    cancelAnimationFrame(this.animationFrame);
                    resolve();
                };
            });

        } catch (error) {
            console.error('音频播放错误:', error);
            throw error;
        }
    }

    startLipSync() {
        const update = () => {
            if (!this.isPlaying) return;

            this.analyser.getByteFrequencyData(this.frequencyData);
            const phoneme = this.analyzePhoneme(this.frequencyData);
            this.updateMouth(phoneme);

            this.animationFrame = requestAnimationFrame(update);
        };

        update();
    }

    analyzePhoneme(frequencyData) {
        const volume = this.getAverageVolume(frequencyData);
        
        // 提高静音阈值稍微提高以减少抖动
        if (volume < 12) return 'm';
        
        // 更细致的频率范围划分
        const bassFreq = this.getFrequencyRange(frequencyData, 60, 400);    
        const lowMidFreq = this.getFrequencyRange(frequencyData, 400, 1000); 
        const midFreq = this.getFrequencyRange(frequencyData, 1000, 2000);   // 新增中频段
        const highMidFreq = this.getFrequencyRange(frequencyData, 2000, 3000);
        const highFreq = this.getFrequencyRange(frequencyData, 3000, 4000);
        
        // 改进的音素判断逻辑
        const freqRatios = {
            i: (highFreq * 1.2) / (midFreq + lowMidFreq),
            e: (highMidFreq + midFreq) / (lowMidFreq * 1.1),
            o: (lowMidFreq * 1.2) / (highFreq + highMidFreq),
            u: (bassFreq * 1.3) / (highFreq + midFreq),
            a: (midFreq + lowMidFreq) / (bassFreq + highFreq)
        };
        
        // 添加音量影响因子
        const volumeFactor = Math.min(volume / 100, 1);
        
        // 设置更动态的判断阈值
        const maxRatio = Math.max(...Object.values(freqRatios));
        for (const [phoneme, ratio] of Object.entries(freqRatios)) {
            if (ratio === maxRatio) {
                // 根据音量调整口型开合程度
                if (ratio > 1.3) {
                    const weight = this.morphWeights[phoneme] * (0.7 + volumeFactor * 0.3);
                    return { phoneme, weight };
                }
            }
        }
        
        // 默认音素带有音量影响
        return { 
            phoneme: 'a',
            weight: 0.5 + volumeFactor * 0.5
        };
    }

    getAverageVolume(frequencyData) {
        const sum = frequencyData.reduce((a, b) => a + b, 0);
        return sum / frequencyData.length;
    }

    getFrequencyRange(frequencyData, start, end) {
        const startIndex = Math.floor(start * frequencyData.length / 22050);
        const endIndex = Math.floor(end * frequencyData.length / 22050);
        let sum = 0;
        for (let i = startIndex; i < endIndex && i < frequencyData.length; i++) {
            sum += frequencyData[i];
        }
        return sum / (endIndex - startIndex);
    }

    updateMouth(phonemeData) {
        if (!phonemeData) {
            this.smoothTransitionToClose();
            return;
        }

        const { phoneme, weight } = phonemeData;
        const currentMorphName = this.morphNames[phoneme];
        const targetWeight = weight * this.getTargetWeight(phoneme);

        // 处理所有口型的平滑过渡
        Object.entries(this.morphNames).forEach(([, morphName]) => {
            const morphIndex = this.morphTargets[morphName];
            if (morphIndex === undefined) return;

            const currentWeight = this.mesh.morphTargetInfluences[morphIndex] || 0;
            let newWeight = 0;

            if (morphName === currentMorphName) {
                // 当前音素的目标口型，使用自定义缓动函数
                newWeight = this.smoothStep(
                    currentWeight,
                    targetWeight,
                    this.transitionSpeed
                );
            } else {
                // 其他口型平滑过渡到0
                newWeight = this.smoothStep(
                    currentWeight,
                    0,
                    this.transitionSpeed * 1.2
                );
            }

            // 应用最小阈值，避免微小值的计算
            this.mesh.morphTargetInfluences[morphIndex] =
                Math.abs(newWeight) < 0.01 ? 0 : newWeight;
        });

        this.lastPhoneme = phoneme;
        this.lastUpdateTime = Date.now();
    }

    // 获取目标权重，处理复合音素
    getTargetWeight(phoneme) {
        if (this.isCompoundPhoneme(phoneme)) {
            return this.handleCompoundTransition(phoneme);
        }
        return this.morphWeights[phoneme] || 1.0;
    }

    // 判断是否是复合音素
    isCompoundPhoneme(phoneme) {
        return phoneme && phoneme.length > 1 && this.compoundPhonemes.hasOwnProperty(phoneme);
    }

    // 处理复合音素的过渡
    handleCompoundTransition(phoneme) {
        const phonemePair = this.compoundPhonemes[phoneme];
        if (!phonemePair) return this.morphWeights[phoneme] || 1.0;

        const [first, second] = phonemePair;
        const progress = this.getTransitionProgress();

        // 使用更平滑的三次贝塞尔曲线
        const bezierProgress = progress * progress * (3 - 2 * progress);
        
        // 获取两个音素的权重并添加额外的过渡补偿
        const firstWeight = this.morphWeights[first] * (1 + 0.2 * (1 - bezierProgress));
        const secondWeight = this.morphWeights[second] * (1 + 0.2 * bezierProgress);

        return firstWeight * (1 - bezierProgress) + secondWeight * bezierProgress;
    }

    // 获取过渡进度
    getTransitionProgress() {
        if (!this.lastUpdateTime) return 0;

        const elapsed = Date.now() - this.lastUpdateTime;
        const duration = 250; // 过渡持续时间（毫秒）
        return Math.min(1, elapsed / duration);
    }

    smoothTransitionToClose() {
        Object.values(this.morphTargets).forEach(morphIndex => {
            if (this.mesh.morphTargetInfluences[morphIndex] > 0) {
                this.mesh.morphTargetInfluences[morphIndex] *= 0.8;
            }
        });
    }

    smoothStep(current, target, speed) {
        // 使用弹性缓动函数
        const springFactor = 0.15;
        const diff = target - current;
        
        // 添加弹性和阻尼效果
        return current + diff * (speed + Math.sin(speed * Math.PI) * springFactor);
    }

    resetMouth() {
        if (!this.mesh || !this.morphTargets) return;

        Object.values(this.morphTargets).forEach(morphIndex => {
            if (this.mesh.morphTargetInfluences[morphIndex] !== undefined) {
                this.mesh.morphTargetInfluences[morphIndex] = 0;
            }
        });
    }

    async processAudioStream(audioUrl) {
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const response = await fetch(audioUrl);
            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }

            const blob = new Blob(chunks, { type: 'audio/mp3' });
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 1.0;

            source.connect(this.analyser);
            this.analyser.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            source.start(0);
            this.isPlaying = true;

            this.startLipSync();

            await new Promise(resolve => {
                source.onended = () => {
                    this.isPlaying = false;
                    this.resetMouth();
                    cancelAnimationFrame(this.animationFrame);
                    resolve();
                };
            });

        } catch (error) {
            console.error('流式音频处理错误:', error);
            throw error;
        }
    }
}

// 添加音频预加载器
class AudioPreloader {
    constructor() {
        this.preloadCache = new Map();
        this.loading = new Map();
    }

    async preload(text, ttsSetting) {
        if (this.preloadCache.has(text)) {
            return this.preloadCache.get(text);
        }

        if (this.loading.has(text)) {
            return this.loading.get(text);
        }

        // 如果ttsSetting不为空
        if (ttsSetting) {
            const loadPromise = getSettingTTSAudio(text, ttsSetting)
                .then(audio => {
                    this.preloadCache.set(text, audio);
                    this.loading.delete(text);
                    return audio;
                });
            this.loading.set(text, loadPromise);
            return loadPromise;
        } else {
            const loadPromise = getEdgeTTSAudio(text)
                .then(audio => {
                    this.preloadCache.set(text, audio);
                    this.loading.delete(text);
                    return audio;
                });

            this.loading.set(text, loadPromise);
            return loadPromise;
        }
    }

    clearCache() {
        this.preloadCache.clear();
        this.loading.clear();
    }
}

// 改进任务队列
class AudioTaskQueue {
    constructor(maxParallel = 2) {
        this.queue = [];
        this.maxParallel = maxParallel;
        this.running = 0;
        this.processing = false;
    }

    async add(task) {
        this.queue.push(task);
        if (!this.processing) {
            this.processing = true;
            await this.processQueue();
        }
        return task; // 返回任务以便链式调用
    }

    async processQueue() {
        while (this.queue.length > 0 && this.running < this.maxParallel) {
            this.running++;
            const task = this.queue.shift();
            
            try {
                // 直接在这里处理播放
                await speakContent(task);
            } finally {
                this.running--;
            }
        }

        if (this.queue.length === 0) {
            this.processing = false;
        } else {
            await this.processQueue();
        }
    }
}

// 添加模型状态检查函数
function isModelReady() {
    return !!window.currentModel;
}

// 添加等待模型加载的函数
let modelLoadChecked = false;
async function waitForModel(timeout = 10000) {
    if (modelLoadChecked && window.currentModel) {
        return true;
    }

    return new Promise((resolve, reject) => {
        if (window.currentModel) {
            modelLoadChecked = true;
            resolve(true);
            return;
        }

        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (window.currentModel) {
                clearInterval(checkInterval);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                reject(new Error('模型加载超时'));
            }
        }, 100);
    });
}

// 创建全局实例
const audioPreloader = new AudioPreloader();
const audioTaskQueue = new AudioTaskQueue();

// 初始化函数，用于设置全局对象
function initializeGlobalAudio() {
    // 将方法添加到 window 对象，使其可以全局访问
    window.playBase64AudioWithLipSync = playBase64AudioWithLipSync;
    window.speakContent = speakContent;
    window.speakContentWithTtsSetting = speakContentWithTtsSetting;
    window.stopLipSync = stopLipSync;
    window.audioPreloader = audioPreloader;
    window.audioTaskQueue = audioTaskQueue;

    // 启动音频任务队列处理
    return audioTaskQueue.processQueue();
}

// 添加一个新的预加载队列类
class SentencePreloadQueue {
    constructor(maxPreload = 3, ttsSetting) {
        this.maxPreload = maxPreload;
        this.preloadingQueue = new Set();
        this.readyQueue = new Map();
        this.orderQueue = [];
        this.ttsSetting = ttsSetting;
        this.autoPlay = false;
        this.isPlaying = false;
        this.onReadyCallbacks = new Set();
    }
    
    // 开始预加载一组句子
    startPreloading(sentences) {
        let preloadCount = 0;

        for (const sentence of sentences) {
            if (preloadCount >= this.maxPreload) break;
            if (!this.readyQueue.has(sentence) && !this.preloadingQueue.has(sentence)) {
                this.preloadingQueue.add(sentence);
                this.preloadSentence(sentence, this.ttsSetting);
                preloadCount++;
            }
        }
    }

    // 预加载单个句子
    async preloadSentence(sentence, ttsSetting) {
        try {
            const audio = await audioPreloader.preload(sentence, ttsSetting);
            this.preloadingQueue.delete(sentence);
            this.readyQueue.set(sentence, audio);
        } catch (error) {
            console.error('句子预加载失败:', error);
            this.preloadingQueue.delete(sentence);
        }
    }

    // 获取已准备好的音频
    getReady(sentence) {
        return this.readyQueue.get(sentence);
    }

    // 移除已使用的句子并触发新的预加载
    markUsed(sentence, remainingSentences) {
        this.readyQueue.delete(sentence);
        this.startPreloading(remainingSentences);
    }

    // 修改为异步等待方法
    async waitForReady(sentence, timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const audio = this.readyQueue.get(sentence);
            if (audio) {
                return audio;
            }
            
            // 等待一小段时间再检查
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error('等待音频准备超时');
    }

    // 设置自动播放
    setAutoPlay(auto) {
        this.autoPlay = auto;
        if (auto && this.readyQueue.size > 0 && !this.isPlaying) {
            this.playNext();
        }
    }

    // 添加句子到预加载队列
    async addSentence(sentence, ttsSetting) {
        // 参数赋值
        this.ttsSetting = ttsSetting;
        if (!this.readyQueue.has(sentence) && !this.preloadingQueue.has(sentence)) {
            this.orderQueue.push(sentence);
            this.preloadingQueue.add(sentence);
            await this.preloadSentence(sentence, ttsSetting);
            
            this.onReadyCallbacks.forEach(callback => callback(sentence));
            
            if (this.autoPlay && !this.isPlaying) {
                this.playNext();
            }
        }
    }

    // 播放下一个句子
    async playNext() {
        if (this.isPlaying || this.readyQueue.size === 0) return;
        
        const nextSentence = this.orderQueue.find(sentence => this.readyQueue.has(sentence));
        if (!nextSentence) return;
        
        this.isPlaying = true;
        const currentAudio = this.readyQueue.get(nextSentence);
        
        try {
            // 根据ttsSetting选择播放方法
            if (this.ttsSetting) {
                await playHexAudioWithLipSync(currentAudio);
            } else {
                await playBase64AudioWithLipSync(currentAudio);
            }
            
            this.readyQueue.delete(nextSentence);
            this.orderQueue = this.orderQueue.filter(s => s !== nextSentence);
            
        } catch (error) {
            console.error('播放音频失败:', error);
        } finally {
            this.isPlaying = false;
            
            if (this.autoPlay) {
                setTimeout(() => this.playNext(), 0);
            }
        }
    }

    // 预加载单个句子
    async preloadSentence(sentence, ttsSetting) {
        try {
            const audio = await audioPreloader.preload(sentence, ttsSetting);
            this.preloadingQueue.delete(sentence);
            this.readyQueue.set(sentence, audio);
        } catch (error) {
            console.error('句子预加载失败:', error);
            this.preloadingQueue.delete(sentence);
        }
    }
} 

// 修改 speakContent 函数
async function speakContent(content) {
    const sentences = splitIntoSentences(content);
    if (sentences.length === 0) return;

    const preloadQueue = new SentencePreloadQueue(3, null);
    preloadQueue.startPreloading(sentences);

    for (let i = 0; i < sentences.length; i++) {
        const currentSentence = sentences[i];
        
        try {
            const audio = await preloadQueue.waitForReady(currentSentence);
            await playBase64AudioWithLipSync(audio);
            preloadQueue.markUsed(currentSentence, sentences.slice(i + 1));
        } catch (error) {
            console.error('播放句子失败:', error);
            // 继续播放下一句
            continue;
        }
    }
}

async function speakContentWithTtsSetting(content, ttsSetting) {
    // console.log('speakContentWithTtsSetting:', ttsSetting);
    const sentences = splitIntoSentences500(content, 497);
    if (sentences.length === 0) return;

    const preloadQueue = new SentencePreloadQueue(3, ttsSetting); // 预加载3个句子
    preloadQueue.startPreloading(sentences); // 开始初始预加载

    for (let i = 0; i < sentences.length; i++) {
        const currentSentence = sentences[i];

        try {
            const audio = await preloadQueue.waitForReady(currentSentence);
            await playHexAudioWithLipSync(audio);
            preloadQueue.markUsed(currentSentence, sentences.slice(i + 1));
        } catch (error) {
            console.error('播放句子失败:', error);
            // 继续播放下一句
            continue;
        }
    }
}

function splitIntoSentences(text, maxLength = 100) {
    const sentences = [];
    let currentSentence = '';
    const MIN_LENGTH = 3;  // 设置最小句子长度

    for (let i = 0; i < text.length; i++) {
        currentSentence += text[i];

        // 在句号或句子达到最大长度时进行分割
        if (text[i] === '。' || currentSentence.length >= maxLength) {
            if (currentSentence.length >= MIN_LENGTH) {
                sentences.push(currentSentence);
                currentSentence = '';
            }
        }
        // 在逗号处分割，但要确保分割后的句子达到最小长度
        else if (text[i] === '，' && currentSentence.length > 10) {
            if (currentSentence.length >= MIN_LENGTH) {
                sentences.push(currentSentence);
                currentSentence = '';
            }
        }
    }

    // 处理最后剩余的文本
    if (currentSentence.length >= MIN_LENGTH) {
        sentences.push(currentSentence);
    } else if (currentSentence.length > 0 && sentences.length > 0) {
        // 如果最后剩余文本过短，将其附加到最后一个句子
        sentences[sentences.length - 1] += currentSentence;
    }

    return sentences;
}

function splitIntoSentences500(text, maxLength = 497) {
    const sentences = [];
    const MIN_LENGTH = 3;  // 设置最小句子长度

    for (let i = 0; i < text.length; i += maxLength) {
        const sentence = text.slice(i, i + maxLength);
        if (sentence.length >= MIN_LENGTH) {
            sentences.push(sentence);
        } else if (sentence.length > 0 && sentences.length > 0) {
            // 如果最后剩余文本过短，将其附加到最后一个句子
            sentences[sentences.length - 1] += sentence;
        }
    }

    return sentences;
}


// 全局方法，播放base64编码的MP3音频并同步口型
async function playBase64AudioWithLipSync(base64String) {
    if (!window.currentModel) {
        console.error('模型未加载，请等待模型加载完成');
        return;
    }

    // 如果已存在实例，先清理
    if (window.currentLipSync) {
        window.currentLipSync.resetMouth();
        if (window.currentLipSync.animationFrame) {
            cancelAnimationFrame(window.currentLipSync.animationFrame);
        }
        if (window.currentLipSync.audioContext) {
            await window.currentLipSync.audioContext.close();
        }
    }

    try {
        // 创建新实例
        window.currentLipSync = new LipSync(window.currentModel);

        // 将base64转换为AudioBuffer
        // 移除base64字符串开头的data:audio/mp3;base64,（如果存在）
        const base64Data = base64String.replace(/^data:audio\/mp3;base64,/, '');

        // 将base64解码为二进制数据
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // 创建Blob对象
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(blob);

        // 播放音频
        await window.currentLipSync.processAudio(audioUrl);

        // 播放完成后释放URL
        URL.revokeObjectURL(audioUrl);

    } catch (error) {
        console.error('播放base64音频时出错:', error);
        await stopLipSync();
    } finally {
        return crypto.randomUUID();
    }
}

// 全局方法，停止音频和口型同步
async function stopLipSync() {
    if (window.currentLipSync) {
        // 重置口型
        window.currentLipSync.resetMouth();

        // 停止动画帧
        if (window.currentLipSync.animationFrame) {
            cancelAnimationFrame(window.currentLipSync.animationFrame);
        }

        // 停止音频播放
        if (window.currentLipSync.audioContext) {
            window.currentLipSync.isPlaying = false;
            await window.currentLipSync.audioContext.close();
        }

        // 清除实例
        window.currentLipSync = null;
    }
}

// 从Edge TTS获取音频base64数据
async function getEdgeTTSAudio(text) {
    try {
        const response = await fetch('/tts/audio/edge-tts-base64', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'accept': 'application/json'
            },
            body: JSON.stringify({
                text: text
            })
        });

        if (!response.ok) {
            throw new Error('语音合成请求失败');
        }
        const result = await response.json();

        return result;
    } catch (error) {
        console.error('获取Edge TTS音频失败:', error);
        throw error;
    }
}

async function getSettingTTSAudio(text, ttsSetting) {
    // 从ttsSetting中取值
    const ttsDomain = ttsSetting.ttsDomain;
    const ttsPath = ttsSetting.ttsPath;
    const ttsKey = ttsSetting.ttsKey;
    const ttsModel = ttsSetting.ttsModel;
    const ttsVoiceId = ttsSetting.ttsVoiceId;

    try {
        const options = {
            method: 'POST',
            url: '/proxy/ttss' + ttsPath,
            headers: {
                'Authorization': 'Bearer ' + ttsKey,
                'Content-Type': 'application/json',
                'X-Target-URL': ttsDomain
            },
            data: {
                "model": ttsModel,
                "text": text,
                "stream": false,
                "voice_setting": {
                    "voice_id": ttsVoiceId,
                    "speed": 1,
                    "vol": 1,
                    "pitch": 0
                },
                "audio_setting": {
                    "sample_rate": 32000,
                    "bitrate": 128000,
                    "format": "mp3"
                }
            },
            timeout: 30000,
            validateStatus: status => status >= 200 && status < 500
        };
        const response = await axios(options);
        // data不为空
        if (!response.data.data) {
            throw new Error('语音合成请求失败');
        } else {
            const content = response.data.data.audio;
            return content;
        }
    } catch (error) {

        console.error('获取Setting TTS音频失败:', error);
        throw error;
    }
}

// 全局方法，播放hex编码的MP3音频并同步口型
async function playHexAudioWithLipSync(hexString) {
    if (!window.currentModel) {
        console.error('模型未加载，请等待模型加载完成');
        return;
    }

    // 如果已存在实例，先清理
    if (window.currentLipSync) {
        window.currentLipSync.resetMouth();
        if (window.currentLipSync.animationFrame) {
            cancelAnimationFrame(window.currentLipSync.animationFrame);
        }
        if (window.currentLipSync.audioContext) {
            await window.currentLipSync.audioContext.close();
        }
    }

    try {
        // 创建新实例
        window.currentLipSync = new LipSync(window.currentModel);

        // 将 hex 字符串转换为 Uint8Array
        const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        
        // 创建 Blob 对象
        const blob = new Blob([bytes], { 
            type: 'audio/mpeg' // 默认使用 MP3 格式
        });
        const audioUrl = URL.createObjectURL(blob);

        // 播放音频
        await window.currentLipSync.processAudio(audioUrl);

        // 播放完成后释放URL
        URL.revokeObjectURL(audioUrl);

    } catch (error) {
        console.error('播放hex音频时出错:', error);
        await stopLipSync();
    } finally {
        return crypto.randomUUID();
    }
}

// LRC歌词解析器类
class LyricParser {
    constructor() {
        this.lyrics = [];
        this.currentIndex = 0;
        this.startTime = 0;
        this.firstLyricTime = 0;  // 第一句歌词的时间
    }

    parseLRC(lrcContent) {
        this.lyrics = [];
        const lines = lrcContent.split('\n');
        
        for (const line of lines) {
            const matches = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (matches) {
                const minutes = parseInt(matches[1]);
                const seconds = parseInt(matches[2]);
                const milliseconds = parseInt(matches[3].padEnd(3, '0'));
                const text = matches[4].trim();
                
                if (text) {
                    const time = minutes * 60000 + seconds * 1000 + milliseconds;
                    this.lyrics.push({
                        time: time,
                        text: text,
                        phonemes: this.textToPhonemes(text)
                    });
                }
            }
        }
        
        this.lyrics.sort((a, b) => a.time - b.time);
        this.currentIndex = 0;
        
        // 记录第一句歌词的时间
        if (this.lyrics.length > 0) {
            this.firstLyricTime = this.lyrics[0].time;
        }
    }

    textToPhonemes(text) {
        // 简单的拼音分割，后续可以接入更复杂的拼音系统
        return text.split('').map(char => {
            // 这里应该使用拼音转换库，暂时返回原字符
            return char;
        });
    }

    getCurrentPhoneme(currentTime) {
        // 更新当前歌词索引
        while (this.currentIndex < this.lyrics.length - 1 &&
               currentTime > this.lyrics[this.currentIndex + 1].time) {
            this.currentIndex++;
        }
        
        if (this.currentIndex < this.lyrics.length) {
            const lyric = this.lyrics[this.currentIndex];
            const nextLyric = this.lyrics[this.currentIndex + 1];
            
            if (lyric.phonemes.length > 0) {
                const duration = (nextLyric ? nextLyric.time : lyric.time + 1000) - lyric.time;
                const phonemeTime = duration / lyric.phonemes.length;
                const progress = (currentTime - lyric.time) / phonemeTime;
                const phonemeIndex = Math.floor(progress) % lyric.phonemes.length;
                
                return {
                    phoneme: lyric.phonemes[phonemeIndex],
                    weight: 1.0,
                    isFromLyric: true
                };
            }
        }
        
        return null;
    }
}

// 读取LRC文件
async function readLRCFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                resolve(e.target.result);
            } catch (error) {
                reject(new Error('LRC文件解析失败: ' + error.message));
            }
        };
        reader.onerror = () => reject(new Error('LRC文件读取失败'));
        reader.readAsText(file, 'UTF-8');
    });
}

// 主播放函数
async function playAudioFileWithLipSync(audioFile, lrcFile, callbacks = {}) {
    if (!window.currentModel) {
        throw new Error('模型未加载');
    }

    // 清理现有实例
    if (window.currentLipSync) {
        window.currentLipSync.resetMouth();
        if (window.currentLipSync.animationFrame) {
            cancelAnimationFrame(window.currentLipSync.animationFrame);
        }
        if (window.currentLipSync.audioContext) {
            await window.currentLipSync.audioContext.close();
        }
    }

    try {
        window.currentLipSync = new LipSync(window.currentModel);
        const lipSync = window.currentLipSync;

        let lyricParser = null;
        if (lrcFile) {
            try {
                const lrcContent = await readLRCFile(lrcFile);
                lyricParser = new LyricParser();
                lyricParser.parseLRC(lrcContent);
            } catch (error) {
                console.warn('歌词文件处理失败:', error);
            }
        }

        const arrayBuffer = await audioFile.arrayBuffer();
        const audioContext = lipSync.audioContext;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // 创建音频源和分析器
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // 连接到分析器
        source.connect(lipSync.analyser);
        lipSync.analyser.connect(audioContext.destination);

        const startTime = audioContext.currentTime;
        source.start(0);
        lipSync.isPlaying = true;

        const update = () => {
            if (!lipSync.isPlaying) return;

            const currentTime = (audioContext.currentTime - startTime) * 1000;
            
            // 从音频分析获取音素数据
            lipSync.analyser.getByteFrequencyData(lipSync.frequencyData);
            const phonemeData = lipSync.analyzePhoneme(lipSync.frequencyData);
            
            // 更新口型
            if (phonemeData) {
                lipSync.updateMouth(phonemeData);
            } else {
                lipSync.resetMouth();
            }

            // 获取当前歌词（如果有歌词解析器）
            let currentLyric = null;
            if (lyricParser) {
                while (lyricParser.currentIndex < lyricParser.lyrics.length - 1 &&
                       currentTime > lyricParser.lyrics[lyricParser.currentIndex + 1].time) {
                    lyricParser.currentIndex++;
                }
                currentLyric = lyricParser.lyrics[lyricParser.currentIndex];
            }

            // 回调处理
            if (callbacks.onTimeUpdate) {
                callbacks.onTimeUpdate(currentTime, audioBuffer.duration * 1000);
            }

            if (callbacks.onLyricUpdate) {
                callbacks.onLyricUpdate(
                    currentLyric,
                    lyricParser ? lyricParser.lyrics : [],
                    currentTime,
                    phonemeData ? phonemeData.phoneme : null
                );
            }

            lipSync.animationFrame = requestAnimationFrame(update);
        };

        update();

        await new Promise(resolve => {
            source.onended = () => {
                lipSync.isPlaying = false;
                lipSync.resetMouth();
                cancelAnimationFrame(lipSync.animationFrame);
                resolve();
            };
        });

    } catch (error) {
        console.error('音频播放失败:', error);
        await stopLipSync();
        throw error;
    }
}

// 导出所有方法
export {
    LipSync,
    AudioPreloader,
    AudioTaskQueue,
    playBase64AudioWithLipSync,
    playHexAudioWithLipSync,
    playAudioFileWithLipSync,
    stopLipSync,
    isModelReady,
    waitForModel,
    audioPreloader,
    audioTaskQueue,
    initializeGlobalAudio,
    speakContent,
    speakContentWithTtsSetting,
    SentencePreloadQueue
}; 
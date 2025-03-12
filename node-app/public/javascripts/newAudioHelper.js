class LipSync {
    constructor(mesh) {
        this.mesh = mesh;
        this.morphTargets = mesh.morphTargetDictionary;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // 优化分析器参数
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;  // 保持与原来相同
        this.analyser.smoothingTimeConstant = 0.5;  // 稍微增加平滑度
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        // 保持原有映射配置
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

        // 保持原有口型映射
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

        // 保持原有权重配置
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
        
        // 新增：历史数据
        this.phonemeHistory = [];
        this.volumeHistory = [];
        this.noiseFloor = 8; // 动态噪声基准
        
        // 新增：口型状态追踪
        this.mouthState = {
            openness: 0,
            width: 0,
            roundness: 0,
            lastTransition: 0
        };
    }

    // 保持原有处理队列方法
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

    // 改进的音素分析方法
    analyzePhoneme(frequencyData) {
        // 计算音量并更新历史
        const volume = this.getAverageVolume(frequencyData);
        this.updateVolumeHistory(volume);
        
        // 动态噪声基准计算
        const currentNoiseFloor = this.calculateNoiseFloor();
        
        // 静音检测 - 使用动态阈值
        if (volume < currentNoiseFloor + 4) {
            return { phoneme: 'm', weight: 0 };
        }
        
        // 提取更详细的频率特征
        const bassFreq = this.getFrequencyRange(frequencyData, 60, 400);    
        const lowMidFreq = this.getFrequencyRange(frequencyData, 400, 1000); 
        const midFreq = this.getFrequencyRange(frequencyData, 1000, 2000);   
        const highMidFreq = this.getFrequencyRange(frequencyData, 2000, 3000);
        const highFreq = this.getFrequencyRange(frequencyData, 3000, 4000);
        
        // 增加了对共振峰的分析 - 更符合语音学特征
        const formant1 = bassFreq + lowMidFreq * 0.5;
        const formant2 = lowMidFreq * 0.5 + midFreq;
        const formant3 = highMidFreq + highFreq * 0.5;
        
        // 使用新的特征比例
        const f1f2Ratio = formant1 / formant2;
        const f2f3Ratio = formant2 / formant3;
        
        // 计算频谱质心 - 辅助区分某些音素
        const centroid = this.calculateSpectralCentroid(frequencyData);
        
        // 优化的音素判断逻辑
        let phoneme = 'a'; // 默认音素
        let confidence = 0.5; // 置信度
        
        // 改进的中文元音识别 - 基于声学特征
        if (f1f2Ratio < 0.6 && centroid > 1800) {
            phoneme = 'i'; // 类似"衣"的高前元音
            confidence = 0.8;
        } 
        else if (f1f2Ratio > 1.3 && centroid < 1200) {
            phoneme = 'u'; // 类似"乌"的高后圆唇元音
            confidence = 0.8;
        }
        else if (f1f2Ratio > 0.9 && f1f2Ratio < 1.2 && f2f3Ratio > 1.2) {
            phoneme = 'o'; // 类似"喔"的中后圆唇元音
            confidence = 0.7;
        }
        else if (f1f2Ratio > 0.7 && f1f2Ratio < 0.9 && centroid > 1500) {
            phoneme = 'e'; // 类似"诶"的中前元音
            confidence = 0.7;
        }
        else if (f1f2Ratio > 1.1 && centroid > 1300 && centroid < 1800) {
            phoneme = 'a'; // 类似"啊"的低元音
            confidence = 0.9;
        }
        
        // 辅音识别 - 通过频谱特征
        if (highFreq > (lowMidFreq + midFreq) * 1.5 && centroid > 2500) {
            // 擦音特征 (s, sh等)
            phoneme = 's';
            confidence = 0.6;
        }
        
        // 更新音素历史
        this.updatePhonemeHistory(phoneme);
        
        // 基于历史进行稳定化处理
        const stablePhoneme = this.stabilizePhoneme(phoneme);
        
        // 音量影响系数 - 更大的音量对应更大的权重
        const volumeFactor = Math.min(volume / 100, 1);
        const finalWeight = 0.3 + volumeFactor * 0.7 * confidence;
        
        return { 
            phoneme: stablePhoneme,
            weight: finalWeight
        };
    }
    
    // 新增：计算频谱质心
    calculateSpectralCentroid(frequencyData) {
        let sum = 0;
        let weightedSum = 0;
        
        for (let i = 0; i < frequencyData.length; i++) {
            const value = frequencyData[i];
            const frequency = i * (22050 / frequencyData.length); // 假设采样率44.1kHz
            
            weightedSum += value * frequency;
            sum += value;
        }
        
        return sum === 0 ? 0 : weightedSum / sum;
    }
    
    // 新增：更新音素历史
    updatePhonemeHistory(phoneme) {
        this.phonemeHistory.push(phoneme);
        if (this.phonemeHistory.length > 5) {
            this.phonemeHistory.shift();
        }
    }
    
    // 新增：更新音量历史
    updateVolumeHistory(volume) {
        this.volumeHistory.push(volume);
        if (this.volumeHistory.length > 20) {
            this.volumeHistory.shift();
        }
    }
    
    // 新增：计算动态噪声基准
    calculateNoiseFloor() {
        if (this.volumeHistory.length < 5) return this.noiseFloor;
        
        // 取最小的几个值的平均作为噪声基准
        const sortedVolumes = [...this.volumeHistory].sort((a, b) => a - b);
        const lowestValues = sortedVolumes.slice(0, Math.max(2, Math.floor(sortedVolumes.length * 0.2)));
        const avgNoise = lowestValues.reduce((sum, v) => sum + v, 0) / lowestValues.length;
        
        // 平滑更新
        this.noiseFloor = this.noiseFloor * 0.9 + avgNoise * 0.1;
        return this.noiseFloor;
    }
    
    // 新增：基于历史稳定化音素
    stabilizePhoneme(currentPhoneme) {
        if (this.phonemeHistory.length < 3) return currentPhoneme;
        
        // 计算各音素出现次数
        const counts = {};
        for (const p of this.phonemeHistory) {
            counts[p] = (counts[p] || 0) + 1;
        }
        
        // 如果当前音素在历史中占主导或重复出现，则保持
        if (counts[currentPhoneme] >= 2) {
            return currentPhoneme;
        }
        
        // 否则查找历史中最常见的音素
        let maxCount = 0;
        let dominantPhoneme = currentPhoneme;
        
        for (const [phoneme, count] of Object.entries(counts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantPhoneme = phoneme;
            }
        }
        
        // 只有当主导音素明显优势时才使用它
        return maxCount >= 3 ? dominantPhoneme : currentPhoneme;
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

    // 改进的口型更新方法
    updateMouth(phonemeData) {
        if (!phonemeData) {
            this.smoothTransitionToClose();
            return;
        }

        const { phoneme, weight } = phonemeData;
        const currentMorphName = this.morphNames[phoneme];
        
        // 优化：基于上下文的目标权重计算
        const targetWeight = this.calculateContextualWeight(phoneme, weight);
        
        // 优化：自适应过渡速度
        const transitionSpeed = this.calculateTransitionSpeed(phoneme);
        
        // 处理所有口型的平滑过渡
        Object.entries(this.morphNames).forEach(([, morphName]) => {
            const morphIndex = this.morphTargets[morphName];
            if (morphIndex === undefined) return;

            const currentWeight = this.mesh.morphTargetInfluences[morphIndex] || 0;
            let newWeight = 0;

            if (morphName === currentMorphName) {
                // 当前音素的目标口型，使用高级平滑过渡
                newWeight = this.improvedSmoothStep(
                    currentWeight,
                    targetWeight,
                    transitionSpeed
                );
            } else {
                // 其他口型平滑过渡到0，但使用不同的速度
                const fadeOutSpeed = morphName === 'ん' ? transitionSpeed * 1.5 : transitionSpeed;
                newWeight = this.improvedSmoothStep(
                    currentWeight,
                    0,
                    fadeOutSpeed
                );
            }

            // 应用最小阈值，避免微小值的计算
            this.mesh.morphTargetInfluences[morphIndex] =
                Math.abs(newWeight) < 0.01 ? 0 : newWeight;
        });
        
        // 更新协同口型 - 比如当主要口型是"あ"时，可能需要稍微激活"お"
        this.updateCoordinatedMorphs(phoneme, targetWeight);

        this.lastPhoneme = phoneme;
        this.lastUpdateTime = Date.now();
    }
    
    // 新增：上下文相关的权重计算
    calculateContextualWeight(phoneme, baseWeight) {
        // 基于音素类型调整权重
        let adjustedWeight = baseWeight;
        
        // 元音通常需要更大的权重
        if (['a', 'o', 'e'].includes(phoneme)) {
            adjustedWeight *= 1.2;
        }
        
        // 高元音的权重略小
        if (['i', 'u'].includes(phoneme)) {
            adjustedWeight *= 0.9;
        }
        
        // 辅音的权重更小
        if (['s', 'z', 'sh'].includes(phoneme)) {
            adjustedWeight *= 0.7;
        }
        
        // 确保权重在合理范围内
        return Math.min(Math.max(adjustedWeight, 0), 1) * this.morphWeights[phoneme];
    }
    
    // 新增：计算上下文相关的过渡速度
    calculateTransitionSpeed(newPhoneme) {
        if (!this.lastPhoneme) return this.transitionSpeed;
        
        // 默认过渡速度
        let speed = this.transitionSpeed;
        
        // 从闭合到开放的过渡应该更快
        if (this.lastPhoneme === 'm' && ['a', 'o'].includes(newPhoneme)) {
            speed *= 1.5;
        }
        
        // 元音之间的过渡应该更平滑
        if (['a', 'e', 'i', 'o', 'u'].includes(this.lastPhoneme) && 
            ['a', 'e', 'i', 'o', 'u'].includes(newPhoneme)) {
            speed *= 0.8;
        }
        
        // 相同音素间的过渡非常快
        if (this.lastPhoneme === newPhoneme) {
            speed *= 2.0;
        }
        
        return speed;
    }
    
    // 新增：更新协同口型
    updateCoordinatedMorphs(primaryPhoneme, primaryWeight) {
        // 定义协同关系
        const coordination = {
            'a': { 'お': 0.1 },  // "あ"口型时轻微激活"お"
            'o': { 'う': 0.2 },  // "お"口型时部分激活"う"
            'i': { 'え': 0.15 }, // "い"口型时轻微激活"え"
        };
        
        // 应用协同关系
        const coordinations = coordination[primaryPhoneme];
        if (coordinations) {
            for (const [morphName, factor] of Object.entries(coordinations)) {
                const morphIndex = this.morphTargets[morphName];
                if (morphIndex !== undefined) {
                    // 只有当主要权重足够大时才应用协同
                    if (primaryWeight > 0.3) {
                        const coordWeight = primaryWeight * factor;
                        // 与当前值平滑混合
                        const currentWeight = this.mesh.morphTargetInfluences[morphIndex] || 0;
                        this.mesh.morphTargetInfluences[morphIndex] = 
                            currentWeight * 0.7 + coordWeight * 0.3;
                    }
                }
            }
        }
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

    // 改进的平滑插值方法
    improvedSmoothStep(current, target, speed) {
        // 增强版平滑过渡，结合弹性和阻尼效果
        const diff = target - current;
        
        // 添加微小随机性，增强自然感
        const jitter = Math.random() * 0.01 - 0.005;
        
        // 非线性渐变，使动画更自然
        const factor = speed + Math.sin(speed * Math.PI) * 0.1;
        
        // 大变化时的弹性
        const elasticFactor = Math.abs(diff) > 0.3 ? Math.sin(factor * Math.PI * 0.5) * 0.08 : 0;
        
        return current + diff * factor + elasticFactor + jitter;
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

// 修改 speakContent 函数 - 优化句子分割和播放逻辑
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

// 优化的句子分割函数 - 更智能地处理中文句子
function splitIntoSentences(text, maxLength = 100) {
    if (!text) return [];
    
    const sentences = [];
    let currentSentence = '';
    const MIN_LENGTH = 3;  // 最小句子长度
    
    // 句子结束标记，包括标点符号和空格
    const endMarkers = ['。', '！', '？', '…', '.', '!', '?'];
    // 中间分隔标记，如果句子过长，可以在这些地方分割
    const midMarkers = ['，', '、', '；', ',', ';', '：', ':'];

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        currentSentence += char;

        // 在句子结束标记或达到最大长度时进行分割
        if (endMarkers.includes(char) || currentSentence.length >= maxLength) {
            if (currentSentence.length >= MIN_LENGTH) {
                sentences.push(currentSentence);
                currentSentence = '';
            }
        }
        // 在中间分隔标记处分割，但要确保分割后的句子达到一定长度
        else if (midMarkers.includes(char) && currentSentence.length > 15) {
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

// 长文本切分函数 - 用于超长文本的TTS处理
function splitIntoSentences500(text, maxLength = 497) {
    if (!text) return [];
    
    const sentences = [];
    const MIN_LENGTH = 3;  // 设置最小句子长度

    // 优先尝试按自然句子分割
    const naturalSentences = splitIntoSentences(text);
    
    // 如果自然分割的句子都在长度限制内，直接返回
    if (naturalSentences.every(s => s.length <= maxLength)) {
        return naturalSentences;
    }
    
    // 否则，对超长句子进行进一步分割
    for (const sentence of naturalSentences) {
        if (sentence.length <= maxLength) {
            sentences.push(sentence);
        } else {
            // 强制按长度分割
            for (let i = 0; i < sentence.length; i += maxLength) {
                const chunk = sentence.slice(i, i + maxLength);
                if (chunk.length >= MIN_LENGTH) {
                    sentences.push(chunk);
                } else if (chunk.length > 0 && sentences.length > 0) {
                    // 如果片段过短，附加到上一个句子
                    sentences[sentences.length - 1] += chunk;
                }
            }
        }
    }

    return sentences;
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

// 获取自定义TTS服务的音频数据
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

// 改进的base64音频播放函数
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
        if (window.currentLipSync.audioContext && window.currentLipSync.audioContext.state !== 'closed') {
            await window.currentLipSync.audioContext.close();
        }
    }

    try {
        // 创建新实例
        window.currentLipSync = new LipSync(window.currentModel);

        // 移除base64字符串开头的data:audio/mp3;base64,（如果存在）
        const base64Data = base64String.replace(/^data:audio\/mp3;base64,/, '');

        // 更高效的base64解码
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        
        // 优化循环性能
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
        if (window.currentLipSync.audioContext && window.currentLipSync.audioContext.state !== 'closed') {
            await window.currentLipSync.audioContext.close();
        }
    }

    try {
        // 创建新实例
        window.currentLipSync = new LipSync(window.currentModel);

        // 将 hex 字符串转换为 Uint8Array - 使用更高效的方法
        let bytes;
        if (typeof hexString === 'string') {
            const matches = hexString.match(/.{1,2}/g) || [];
            bytes = new Uint8Array(matches.map(byte => parseInt(byte, 16)));
        } else {
            // 如果已经是二进制数据，直接使用
            bytes = new Uint8Array(hexString);
        }
        
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
        if (window.currentLipSync.audioContext && window.currentLipSync.audioContext.state !== 'closed') {
            window.currentLipSync.isPlaying = false;
            await window.currentLipSync.audioContext.close();
        }

        // 清除实例
        window.currentLipSync = null;
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
        // 首先检查是否需要向后调整索引（当前时间小于当前歌词时间）
        if (this.currentIndex > 0 && currentTime < this.lyrics[this.currentIndex].time) {
            // 向后查找合适的索引
            while (this.currentIndex > 0 && currentTime < this.lyrics[this.currentIndex].time) {
                this.currentIndex--;
            }
        } 
        // 然后检查是否需要向前调整索引（当前时间大于下一句歌词时间）
        else while (this.currentIndex < this.lyrics.length - 1 &&
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
                
                return lyric;
            }
            
            return lyric;
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

// 主播放函数 - 支持音频文件与LRC歌词同步
async function playAudioFileWithLipSync(audioFile, lrcFile, callbacks = {}) {
    try {
        // 如果有全局音频播放器，先停止
        if (window.globalAudioPlayer) {
            window.globalAudioPlayer.pause();
            window.globalAudioPlayer.src = '';
        }

        // 检查模型是否已加载
        if (!window.currentModel) {
            console.warn('模型未加载，无法进行口型同步');
        } else if (!window.currentLipSync) {
            // 初始化LipSync对象
            window.currentLipSync = new LipSync(window.currentModel);
        }

        // 初始化音频播放
        const audioURL = URL.createObjectURL(audioFile);
        const audio = new Audio(audioURL);
        
        // 保存全局引用，便于外部控制
        window.globalAudioPlayer = audio;

        // 初始化LRC解析器
        let lrcParser;
        let lyrics = [];

        // 如果提供了LRC文件，加载并解析
        if (lrcFile) {
            const lrcContent = await readLRCFile(lrcFile);
            lrcParser = new LyricParser();
            lyrics = lrcParser.parseLRC(lrcContent);
            
            // 保存到全局，方便进度条拖动时使用
            window.lrcParser = lrcParser;
        }

        // 播放事件回调
        audio.addEventListener('play', () => {
            if (callbacks.onPlay) {
                callbacks.onPlay();
            }
        });

        // 暂停事件回调
        audio.addEventListener('pause', () => {
            if (callbacks.onPause) {
                callbacks.onPause();
            }
        });

        // 结束事件回调
        audio.addEventListener('ended', () => {
            if (callbacks.onEnded) {
                callbacks.onEnded();
            }
        });
        
        // 添加进度条拖动后的同步处理
        audio.addEventListener('seeked', () => {
            if (lrcParser) {
                const currentTime = audio.currentTime * 1000;
                const currentLyric = lrcParser.getCurrentPhoneme(currentTime);
                
                // 确保歌词同步
                if (callbacks.onLyricUpdate && currentLyric) {
                    callbacks.onLyricUpdate(
                        currentLyric,
                        lrcParser.lyrics,
                        currentTime,
                        null // 拖动后可能没有音素数据
                    );
                }
            }
        });

        // 创建音频上下文和处理节点
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        const audioData = new Uint8Array(analyser.frequencyBinCount);

        // 连接音频节点
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        // 准备好时播放
        audio.play().catch(e => console.error('播放失败:', e));

        let currentTime = 0;
        let duration = 0;
        let currentLyric = null;
        
        // 更新函数
        const update = () => {
            if (!audio.paused && !audio.ended) {
                currentTime = audio.currentTime * 1000;
                duration = audio.duration * 1000;
                // 从LRC解析器直接获取当前歌词对象，而不是音素信息
                currentLyric = lrcParser ? lrcParser.getCurrentPhoneme(currentTime) : null;
            }

            // 更新时间显示
            if (callbacks.onTimeUpdate) {
                callbacks.onTimeUpdate(currentTime, duration);
            }

            // 变量用于存储音素信息
            let phonemeInfo = null;

            // 如果有LipSync对象，处理口型同步
            if (window.currentLipSync) {
                // 从音频分析获取音素数据
                analyser.getByteFrequencyData(audioData);
                try {
                    const phonemeData = window.currentLipSync.analyzePhoneme(audioData);
                    
                    // 更新口型
                    if (phonemeData) {
                        window.currentLipSync.updateMouth(phonemeData);
                        phonemeInfo = phonemeData.phoneme;
                    } else {
                        window.currentLipSync.resetMouth();
                    }
                } catch (error) {
                    console.error('处理口型同步时出错:', error);
                }
            }

            // 更新歌词显示 - 只调用一次
            if (callbacks.onLyricUpdate && lrcParser) {
                callbacks.onLyricUpdate(
                    currentLyric,
                    lrcParser.lyrics,
                    currentTime,
                    phonemeInfo
                );
            }

            requestAnimationFrame(update);
        };

        update();

        await new Promise(resolve => {
            audio.onended = () => {
                if (window.currentLipSync) {
                    window.currentLipSync.resetMouth();
                }
                resolve();
            };
        });

    } catch (error) {
        console.error('音频播放失败:', error);
        await stopLipSync();
        throw error;
    }
}

// 导出所有方法 - 保持与原始文件相同的接口
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

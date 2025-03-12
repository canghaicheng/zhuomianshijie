import { LipSync } from '../javascripts/audioHelper.js';

let currentAudioController = null;

class AudioController {
    constructor() {
        this.isPlaying = false;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioBuffer = null;
        this.source = null;
        this.startTime = 0;
        this.pausedAt = 0;
        this.base64String = null;

    }

    async initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    async loadAudio(base64String) {
        this.base64String = base64String;
        await this.initAudioContext();

        // 将base64转换为AudioBuffer
        const base64Data = atob(base64String);
        const arrayBuffer = new ArrayBuffer(base64Data.length);
        const uint8Array = new Uint8Array(arrayBuffer);

        for (let i = 0; i < base64Data.length; i++) {
            uint8Array[i] = base64Data.charCodeAt(i);
        }

        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    }

    async play(base64String) {
        if (base64String) {
            await this.loadAudio(base64String);
        }

        if (this.audioBuffer) {
            this.source = this.audioContext.createBufferSource();
            this.source.buffer = this.audioBuffer;
            this.source.connect(this.audioContext.destination);

            const offset = this.pausedAt;
            this.startTime = this.audioContext.currentTime - offset;
            this.source.start(0, offset);
            this.isPlaying = true;
        }
    }

    pause() {
        if (this.isPlaying) {
            this.source.stop();
            this.pausedAt = this.audioContext.currentTime - this.startTime;
            this.isPlaying = false;
        }
    }

    async resume() {
        if (!this.isPlaying && this.audioBuffer) {
            await this.play(); // 重新播放，使用已保存的offset
        }
    }

    stop() {
        if (this.source) {
            this.source.stop();
        }
        this.isPlaying = false;
        this.pausedAt = 0;
    }

    getCurrentTime() {
        if (this.isPlaying) {
            return this.audioContext.currentTime - this.startTime;
        }
        return this.pausedAt;
    }

    getDuration() {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }
}

/**
 * 播放本地音频文件（带控制功能）
 * @param {File} file - 音频文件对象
 * @returns {Promise<void>}
 */
async function playAudioFileWithControl(file) {
    try {
        console.log('开始读取音频文件:', file.name);

        // 创建新的控制器实例
        if (currentAudioController) {
            currentAudioController.stop();
        }
        currentAudioController = new AudioController();

        // 使用 FileReader 读取文件
        const base64String = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });

        // 开始播放
        await currentAudioController.play(base64String);

    } catch (error) {
        console.error('播放音频文件失败:', error);
        throw new Error(`播放音频文件失败: ${error.message}`);
    }
}

function pauseAudio() {
    if (currentAudioController) {
        currentAudioController.pause();
    }
}

function resumeAudio() {
    if (currentAudioController) {
        currentAudioController.resume();
    }
}

function stopAudio() {
    if (currentAudioController) {
        currentAudioController.stop();
    }
}

export {
    playAudioFileWithControl,
    pauseAudio,
    resumeAudio,
    stopAudio
};
interface Window {
  electronAPI: {
    storeDelete: (key: string) => Promise<void>;
    storeSet: (key: string, value: any) => Promise<void>;
    storeGet: (key: string) => Promise<any>;
    closeAPIWindow: () => void;
    sendApiSettingsChange: (settings: ApiSettings) => void;
    onApiSettingsChange: (callback: (settings: ApiSettings) => void) => void;
    getApiSettings: () => Promise<ApiSettings[]>;
    saveApiSettings: (settings: ApiSettings) => Promise<void>;
    closeTTSWindow: () => void;
    getTTSSettings: () => Promise<TTSSettings[]>;
    saveTTSSettings: (settings: TTSSettings) => Promise<void>;
    sendTTSSettingsChange: (settings: TTSSettings) => void;
    onTTSSettingsChange: (callback: (settings: TTSSettings) => void) => void; 
    getSTTSettings: () => Promise<STTSettings[]>;
    saveSTTSettings: (settings: STTSettings) => Promise<void>;
  }
} 
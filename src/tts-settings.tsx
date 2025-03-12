import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Form, Input, Button, Select, Dropdown, Space, message, InputNumber } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import 'antd/dist/reset.css';
import './styles/settings.css';

interface TTSSettings {
    ttsName: string;
    ttsApiDomain: string;
    ttsApiPath: string;
    ttsApiKey: string;
    ttsModel: string;
    ttsVoiceId: string;
    timestamp?: number;
}

const TTSSettingsForm: React.FC = () => {
    const [form] = Form.useForm<TTSSettings>();
    const [selectedName, setSelectedName] = useState<string>('');
    const [open, setOpen] = useState(false);
    const [providers, setProviders] = useState<Array<{ label: string, value: string }>>([]);

    // 合并初始化逻辑
    useEffect(() => {
        const initializeForm = async () => {
            try {
                const settings = await window.electronAPI.getTTSSettings();
                console.log('settings:', settings);
                if (settings && settings.length > 0) {
                    settings.sort((a: TTSSettings, b: TTSSettings) =>
                        (b.timestamp || 0) - (a.timestamp || 0)
                    );
                    const latestSetting = settings[0];
                    console.log('latest setting:', latestSetting);

                    // 重置表单
                    form.setFieldsValue({
                        ttsName: '',
                    });
                }
            } catch (error) {
                console.error('初始化失败:', error);
            }
        };

        initializeForm();
    }, [form]);

    useEffect(() => {
        loadProviders();
    }, []);

    // 处理选择变化
    const handleNameChange = async (value: string) => {
        setSelectedName(value);

        try {
            const settings = await window.electronAPI.getTTSSettings();
            const selectedSetting = settings.find((setting: TTSSettings) => setting.ttsName === value);

            if (selectedSetting) {
                form.setFieldsValue(selectedSetting);
            } else {
                console.warn('未找到对应的设置:', value);
            }
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    };

    const handleCopy = () => {
        const currentValues = form.getFieldsValue();
        console.log('复制配置:', currentValues);
        setSelectedName('');

        const newValues = {
            ...currentValues,
            ttsName: `${currentValues.ttsName}_复制`,
            timestamp: Date.now()
        };
        form.resetFields();
        form.setFieldsValue(newValues);
    };

    const handleDelete = async () => {
        if (selectedName) {
            try {
                await window.electronAPI.storeDelete(`tts_settings_${selectedName}`);
                setSelectedName('');

                form.setFieldsValue({
                    ttsName: '',
                    ttsApiDomain: '',
                    ttsApiPath: '',
                    ttsApiKey: '',
                    ttsModel: '',
                    ttsVoiceId: ''
                });

                const settings = await window.electronAPI.getTTSSettings();
                const sortedSettings = settings.sort((a: TTSSettings, b: TTSSettings) =>
                    (b.timestamp || 0) - (a.timestamp || 0)
                );

                setProviders(sortedSettings.map((setting: TTSSettings) => ({
                    label: setting.ttsName,
                    value: setting.ttsName
                })));

                window.electronAPI.sendTTSSettingsChange(sortedSettings);

                message.success(`已删除设置: ${selectedName}`);
            } catch (error) {
                console.error('删除设置时出错:', error);
                message.error('删除设置失败');
            }
        }
    };

    const onFinish = async (values: TTSSettings) => {
        try {
            const settings = await window.electronAPI.getTTSSettings();
            const existingSetting = settings.find(setting => setting.ttsName === values.ttsName);

            if (existingSetting && existingSetting.ttsName !== selectedName) {
                message.error('名称已存在，请使用其他名称');
                return;
            }

            const valuesWithTimestamp = {
                ...values,
                timestamp: Date.now()
            };

            if (selectedName) {
                await window.electronAPI.storeDelete(`tts_settings_${selectedName}`);
                await window.electronAPI.storeSet(`tts_settings_${values.ttsName}`, valuesWithTimestamp);
                message.success('设置已更新');
            } else {
                await window.electronAPI.storeSet(`tts_settings_${values.ttsName}`, valuesWithTimestamp);
                message.success('设置已保存');
            }

            const updatedSettings = await window.electronAPI.getTTSSettings();
            window.electronAPI.sendTTSSettingsChange(updatedSettings);
            
            setSelectedName(values.ttsName);
            await loadProviders();

        } catch (errorInfo: any) {
            console.log('验证失败信息:', errorInfo);
            if (errorInfo?.errorFields?.length > 0) {
                const errorFields = errorInfo.errorFields;
                const errorFieldNames = errorFields.map((field: any) => field.name[0]).join(', ');
                message.error(`请填写必填项: ${errorFieldNames}`);
            } else {
                message.error('表单验证失败，请检查输入');
            }
        }
    };

    const handleAddCustomProvider = () => {
        form.setFieldsValue({
            ttsName: '',
            ttsApiDomain: '',
            ttsApiPath: '',
            ttsApiKey: '',
            ttsModel: '',
            ttsVoiceId: ''
        });

        setSelectedName('');
        setOpen(false);
    };

    const loadProviders = async () => {
        try {
            const settings = await window.electronAPI.getTTSSettings();
            if (!settings) {
                setProviders([]);
                return;
            }

            const newProviders = settings
                .sort((a: TTSSettings, b: TTSSettings) =>
                    (b.timestamp || 0) - (a.timestamp || 0)
                )
                .map((setting: TTSSettings) => ({
                    label: setting.ttsName,
                    value: setting.ttsName
                }));

            setProviders(newProviders);
        } catch (error) {
            console.error('加载设置失败:', error);
            setProviders([]);
        }
    };

    return (
        <div className="settings-form">
            <div className="provider-selection">
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
                    <span style={{ marginRight: '8px' }}>TTS设置名称:</span>
                    <Select
                        value={selectedName}
                        onChange={handleNameChange}
                        style={{ width: 200 }}
                        open={open}
                        onDropdownVisibleChange={setOpen}
                        dropdownRender={(menu) => (
                            <>
                                {menu}
                                <div style={{ padding: '8px' }}>
                                    <Button
                                        type="text"
                                        block
                                        icon={<span>+</span>}
                                        onClick={handleAddCustomProvider}
                                    >
                                        添加自定义TTS配置
                                    </Button>
                                </div>
                            </>
                        )}
                    >
                        {providers.map(provider => (
                            <Select.Option key={provider.value} value={provider.value}>
                                {provider.label}
                            </Select.Option>
                        ))}
                    </Select>
                    <div style={{ marginLeft: 'auto' }}>
                        <Button
                            type="text"
                            icon={<CopyOutlined />}
                            onClick={handleCopy}
                            style={{ color: '#1890ff' }}
                            data-icon="复制"
                        >
                            复制
                        </Button>
                        <Button
                            type="text"
                            icon={<DeleteOutlined />}
                            onClick={handleDelete}
                            style={{ color: '#ff4d4f' }}
                            data-icon="删除"
                        >
                            删除
                        </Button>
                    </div>
                </div>
            </div>

            <Form<TTSSettings>
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{
                    speed: 1,
                    pitch: 1,
                    volume: 1
                }}
            >
                <Form.Item
                    label="TTS名称"
                    name="ttsName"
                    rules={[{ required: true, message: '请输入TTS名称' }]}
                >
                    <Input placeholder="请输入TTS名称" />
                </Form.Item>

                <Form.Item
                    label="TTS API域名"
                    name="ttsApiDomain"
                    rules={[{ required: true, message: '请输入TTS API域名' }]}
                >
                    <Input placeholder="请输入TTS API域名" />
                </Form.Item>

                <Form.Item
                    label="TTS API路径"
                    name="ttsApiPath"
                    rules={[{ required: true, message: '请输入TTS API路径' }]}
                >
                    <Input placeholder="请输入TTS API路径" />
                </Form.Item>

                <Form.Item
                    label="TTS API密钥"
                    name="ttsApiKey"
                    rules={[{ required: true, message: '请输入TTS API密钥' }]}
                >
                    <Input.Password placeholder="请输入TTS API密钥" />
                </Form.Item>

                <Form.Item
                    label="TTS模型"
                    name="ttsModel"
                    rules={[{ required: true, message: '请输入TTS模型名称' }]}
                >
                    <Input placeholder="请输入TTS模型名称" />
                </Form.Item>

                <Form.Item
                    label="音色编号"
                    name="ttsVoiceId"
                    rules={[{ required: true, message: '请输入音色编号' }]}
                >
                    <Input placeholder="请输入音色编号" />
                </Form.Item>

                <Form.Item>
                    <Button type="primary" htmlType="submit">
                        保存
                    </Button>
                    <Button
                        style={{ marginLeft: 8 }}
                        onClick={() => window.electronAPI.closeTTSWindow()}
                    >
                        取消
                    </Button>
                </Form.Item>
            </Form>
        </div>
    );
};

const container = document.getElementById('tts-settings-root');
if (container) {
    const root = createRoot(container);
    root.render(<TTSSettingsForm />);
} 
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Form, Input, Button, Select, Dropdown, Space, message, InputNumber } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import 'antd/dist/reset.css';
import './styles/settings.css';

interface ApiSettings {
    provider: string;
    apiMode: 'openai' | 'custom';
    name: string;
    apiDomain: string;
    apiPath: string;
    apiKey: string;
    model: string;
    maxSize: number;
    timestamp?: number;
}

const SettingsForm: React.FC = () => {
    const [form] = Form.useForm<ApiSettings>();
    const [selectedName, setSelectedName] = useState<string>('');
    const [open, setOpen] = useState(false);
    const [providers, setProviders] = useState<Array<{ label: string, value: string }>>([]);

    // 合并初始化逻辑
    useEffect(() => {
        const initializeForm = async () => {
            try {
                const settings = await window.electronAPI.getApiSettings();
                console.log('settings:', settings);
                if (settings && settings.length > 0) {
                    settings.sort((a: ApiSettings, b: ApiSettings) =>
                        (b.timestamp || 0) - (a.timestamp || 0)
                    );
                    const latestSetting = settings[0];
                    console.log('latest setting:', latestSetting);

                    // 清空表单所有字段
                    const currentApiMode = form.getFieldValue('apiMode');
                    // 重置表单，但保留 API 模式
                    form.setFieldsValue({
                        apiMode: currentApiMode,
                        provider: '',
                        name: '',
                        apiDomain: '',
                        apiPath: '',
                        apiKey: '',
                        model: '',
                        maxSize: undefined
                    });

                }
            } catch (error) {
                console.error('初始化失败:', error);
            }
        };

        initializeForm();
    }, [form]); // 添加 form 作为依赖

    // 使用useEffect来处理异步加载
    useEffect(() => {
        loadProviders();
    }, []); // 移除 providerUpdateTrigger 依赖

    // 当选择的名称改变时，加载对应的设置
    useEffect(() => {
        if (selectedName) {
            const settingsKey = `model_settings_${selectedName}`;
            const savedSettings = localStorage.getItem(settingsKey);
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                form.setFieldsValue(parsedSettings);
            }
        }
    }, [selectedName, form]);

    // 处理选择变化
    const handleNameChange = async (value: string) => {
        setSelectedName(value);

        try {
            const settings = await window.electronAPI.getApiSettings();
            const selectedSetting = settings.find((setting: ApiSettings) => setting.name === value);

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
        // 复制当前配置
        const currentValues = form.getFieldsValue();
        console.log('复制配置:', currentValues);
        // 去除下拉选中
        setSelectedName('');

        // 创建新的配置，使用新的名称
        const newValues = {
            ...currentValues,
            name: `${currentValues.name}_复制`,
            timestamp: Date.now()  // 添加时间戳
        };
        // 确保表单状态被清空
        form.resetFields();
        // 更新表单值
        form.setFieldsValue(newValues);
    };

    const handleDelete = async () => {
        if (selectedName) {
            try {
                // 1. 先删除存储的设置
                await window.electronAPI.storeDelete(`api_settings_${selectedName}`);
                // 删除下拉选项
                setSelectedName('');

                // 2. 清空表单状态
                const currentApiMode = form.getFieldValue('apiMode');
                // 重置表单，但保留 API 模式
                form.setFieldsValue({
                    apiMode: currentApiMode,
                    provider: '',
                    name: '',
                    apiDomain: '',
                    apiPath: '',
                    apiKey: '',
                    model: '',
                    maxSize: undefined
                });

                // 3. 获取最新的设置列表并确保按时间戳排序
                const settings = await window.electronAPI.getApiSettings();
                const sortedSettings = settings.sort((a: ApiSettings, b: ApiSettings) =>
                    (b.timestamp || 0) - (a.timestamp || 0)
                );

                // 更新设置列表
                setProviders(sortedSettings.map((setting: ApiSettings) => ({
                    label: setting.name,
                    value: setting.name
                })));

                window.electronAPI.sendApiSettingsChange(sortedSettings);

                message.success(`已删除设置: ${selectedName}`);
            } catch (error) {
                console.error('删除设置时出错:', error);
                message.error('删除设置失败');
            }
        }
    };

    const onFinish = async (values: ApiSettings) => {
        try {
            const settings = await window.electronAPI.getApiSettings();
            const existingSetting = settings.find(setting => setting.name === values.name);

            // 如果找到的设置不是当前选中的设置，则提示名称已存在
            if (existingSetting && existingSetting.name !== selectedName) {
                message.error('名称已存在，请使用其他名称');
                return;
            }

            const valuesWithTimestamp = {
                ...values,
                timestamp: Date.now()
            };

            if (selectedName) {
                await window.electronAPI.storeDelete(`api_settings_${selectedName}`);
                await window.electronAPI.storeSet(`api_settings_${values.name}`, valuesWithTimestamp);
                message.success('设置已更新');
            } else {
                await window.electronAPI.storeSet(`api_settings_${values.name}`, valuesWithTimestamp);
                message.success('设置已保存');
            }

            window.electronAPI.sendApiSettingsChange(values);

            console.log('设置变化values:', values);
            setSelectedName(values.name);

            // 重新加载providers列表
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
        // 保持 API 模式不变
        const currentApiMode = form.getFieldValue('apiMode');

        // 重置表单，但保留 API 模式
        form.setFieldsValue({
            apiMode: currentApiMode,
            provider: '',
            name: '',
            apiDomain: '',
            apiPath: '',
            apiKey: '',
            model: '',
            maxSize: undefined
        });

        // 更新选中的提供方
        setSelectedName('');
        // 收起下拉框
        setOpen(false);
    };

    const loadProviders = async () => {
        try {
            const settings = await window.electronAPI.getApiSettings();
            if (!settings) {
                setProviders([]);
                return;
            }

            const newProviders = settings
                .sort((a: ApiSettings, b: ApiSettings) =>
                    (b.timestamp || 0) - (a.timestamp || 0)
                )
                .map((setting: ApiSettings) => ({
                    label: setting.name,
                    value: setting.name
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
                    <span style={{ marginRight: '8px' }}>设置名称:</span>
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
                                        添加自定义API设置
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

            <Form<ApiSettings>
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{
                    apiMode: 'openai'

                }}
            >
                <Form.Item
                    label="API 模式"
                    name="apiMode"
                    rules={[{ required: true, message: '请选择 API 模式' }]}
                    tooltip="选择 API 接口类型"
                >
                    <Select>
                        <Select.Option value="openai">OpenAI API 兼容</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    label="名称"
                    name="name"
                    rules={[{ required: true, message: '请输入名称' }]}
                >
                    <Input placeholder="请输入名称" />
                </Form.Item>

                <Form.Item
                    label="API 域名"
                    name="apiDomain"
                    rules={[{ required: true, message: '请输入 API 域名' }]}
                >
                    <Input placeholder="https://api.siliconflow.cn" />
                </Form.Item>

                <Form.Item
                    label="API 路径"
                    name="apiPath"
                    rules={[{ required: true, message: '请输入 API 路径' }]}
                >
                    <Input placeholder="/v1/chat/completions" />

                </Form.Item>

                <Form.Item
                    label="API 密钥"
                    name="apiKey"
                    rules={[{ required: true, message: '请输入 API 密钥' }]}
                >
                    <Input.Password placeholder="请输入 API 密钥" />
                </Form.Item>

                <Form.Item
                    label="模型"
                    name="model"
                    rules={[{ required: true, message: '请输入模型名称' }]}
                >
                    <Input placeholder="请输入模型名称" />
                </Form.Item>

                <Form.Item
                    label="上下文限制(K)"
                    name="maxSize"
                    rules={[
                        { required: true, message: '请输入上下文限制大小(K)' },
                        {
                            transform: (value) => Number(value),
                            type: 'number',
                            message: '请输入数字'
                        }
                    ]}
                >
                    <InputNumber
                        min={1}  // 添加最小值限制
                        placeholder="请输入上下文限制大小"
                        style={{ width: '100%' }}  // 设置宽度
                    />
                </Form.Item>

                <Form.Item>
                    <Button type="primary" htmlType="submit">
                        保存
                    </Button>
                    <Button
                        style={{ marginLeft: 8 }}
                        onClick={() => window.electronAPI.closeAPIWindow()}
                    >
                        取消
                    </Button>
                </Form.Item>
            </Form>
        </div>
    );
};

const container = document.getElementById('settings-root');
if (container) {
    const root = createRoot(container);
    root.render(<SettingsForm />);
} 
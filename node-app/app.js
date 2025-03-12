var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const util = require('util');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// 在文件顶部声明全局变量
let mmdPath;

// 创建日志文件写入流
const log_file = fs.createWriteStream(path.join(__dirname, 'debug.log'), {flags : 'w'});

// 定义日志写入函数
const logToFile = (data) => {
    log_file.write(util.format(data) + '\n');
};

// 1. 基础设置
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// 2. 最基本的中间件
app.use(cors());
app.use(logger('dev'));

// 记录所有请求的中间件
app.use((req, res, next) => {
    console.log('Global middleware:', req.method, req.path);
    // logToFile('\n=== New Request ===');
    // logToFile(`Time: ${new Date().toISOString()}`);
    // logToFile(`Method: ${req.method}`);
    // logToFile(`URL: ${req.url}`);
    // logToFile(`Path: ${req.path}`);
    next();
});

// 专门记录 API 请求的中间件
app.use('/proxy/api', (req, res, next) => {
    //logToFile('\n=== API Request Detected ===');
    //logToFile(`Time: ${new Date().toISOString()}`);
    //logToFile(`Method: ${req.method}`);
    //logToFile(`URL: ${req.url}`);
    //logToFile(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    next();
}, createProxyMiddleware({
    router: (req) => {
        // 从请求头中获取目标URL
        return req.headers['x-target-url'];
    },
    changeOrigin: true,
    pathRewrite: {
        '^/proxy/api': ''
    },
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        // logToFile('\n=== Proxy Request Starting ===');
        try {
            if (req.method === 'POST' && req.body) {
                const bodyData = JSON.stringify(req.body);
                //logToFile(`Request Body: ${bodyData}`);
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
            
            //logToFile(`Proxy URL: https://api.siliconflow.cn${proxyReq.path}`);
            //logToFile(`Method: ${proxyReq.method}`);
            //logToFile(`Headers: ${JSON.stringify(proxyReq.getHeaders(), null, 2)}`);
        } catch (error) {
            //logToFile(`Error in onProxyReq: ${error.message}`);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        //logToFile('\n=== Proxy Response Received ===');
        //logToFile(`Status: ${proxyRes.statusCode}`);
        //logToFile(`Headers: ${JSON.stringify(proxyRes.headers, null, 2)}`);
        
        // 收集响应数据
        let responseBody = '';
        proxyRes.on('data', function(chunk) {
            responseBody += chunk;
        });
        proxyRes.on('end', function() {
            //logToFile(`Response Body: ${responseBody}`);
        });
    },
    onError: (err, req, res) => {
        //logToFile('\n=== Proxy Error Occurred ===');
        //logToFile(`Error Message: ${err.message}`);
        //logToFile(`Error Stack: ${err.stack}`);
        res.status(500).json({
            error: err.message,
            code: err.code,
            stack: err.stack
        });
    }
}));

// 专门记录/tts请求的中间件
app.use('/tts', (req, res, next) => {
    //logToFile('\n=== API Request Detected ===');
    //logToFile(`Time: ${new Date().toISOString()}`);
    //logToFile(`Method: ${req.method}`);
    //logToFile(`URL: ${req.url}`);
    //logToFile(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    next();
}, createProxyMiddleware({
    target: 'http://127.0.0.1:20001',
    changeOrigin: true,
    pathRewrite: {
        '^/tts': ''
    },
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        //logToFile('\n=== Proxy Request Starting ===');
        try {
            if (req.method === 'POST' && req.body) {
                const bodyData = JSON.stringify(req.body);
                //logToFile(`Request Body: ${bodyData}`);
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
            
            //logToFile(`Proxy URL: https://api.siliconflow.cn${proxyReq.path}`);
            //logToFile(`Method: ${proxyReq.method}`);
            //logToFile(`Headers: ${JSON.stringify(proxyReq.getHeaders(), null, 2)}`);
        } catch (error) {
            //logToFile(`Error in onProxyReq: ${error.message}`);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        //logToFile('\n=== Proxy Response Received ===');
        //logToFile(`Status: ${proxyRes.statusCode}`);
        //logToFile(`Headers: ${JSON.stringify(proxyRes.headers, null, 2)}`);
        
        // 收集响应数据
        let responseBody = '';
        proxyRes.on('data', function(chunk) {
            responseBody += chunk;
        });
        proxyRes.on('end', function() {
            //logToFile(`Response Body: ${responseBody}`);
        });
    },
    onError: (err, req, res) => {
        //logToFile('\n=== Proxy Error Occurred ===');
        //logToFile(`Error Message: ${err.message}`);
        //logToFile(`Error Stack: ${err.stack}`);
        res.status(500).json({
            error: err.message,
            code: err.code,
            stack: err.stack
        });
    }
}));

// 
app.use('/proxy/ttss', (req, res, next) => {
    next();
}, createProxyMiddleware({
    router: (req) => {
        // 从请求头中获取目标URL
        return req.headers['x-target-url'];
    },
    changeOrigin: true,
    pathRewrite: {
        '^/proxy/ttss': ''
    },
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        // logToFile('\n=== Proxy Request Starting ===');
        try {
            if (req.method === 'POST' && req.body) {
                const bodyData = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
            
        } catch (error) {
            //logToFile(`Error in onProxyReq: ${error.message}`);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        // 收集响应数据
        let responseBody = '';
        proxyRes.on('data', function(chunk) {
            responseBody += chunk;
        });
        proxyRes.on('end', function() {
        });
    },
    onError: (err, req, res) => {
        res.status(500).json({
            error: err.message,
            code: err.code,
            stack: err.stack
        });
    }
}));

// 4. 其他中间件
app.use(express.json({ encoding: 'utf8' }));
app.use(express.urlencoded({ extended: true, encoding: 'utf8' }));
app.use(cookieParser());

// MMD文件请求的专门中间件
app.use('/customize/mmd', (req, res, next) => {
    try {
        // logToFile('\n=== MMD Request ===');
        // logToFile(`Time: ${new Date().toISOString()}`);
        // logToFile(`Original Path: ${req.path}`);
        
        // 解码URL，移除开头的斜杠
        const decodedPath = decodeURIComponent(req.path);
        // logToFile(`Decoded Path: ${decodedPath}`);
        
        // 构建完整路径，不要重复添加 customize
        const fullPath = path.join(mmdPath, decodedPath);
        // logToFile(`Full path: ${fullPath}`);
        
        // 检查mmdPath是否已定义
        if (!mmdPath) {
            // logToFile('Error: mmdPath is not defined');
            return res.status(500).send('Server configuration error');
        }
        
        // 检查文件是否存在
        if (!fs.existsSync(fullPath)) {
            // logToFile(`File not found: ${fullPath}`);
            // 列出目录内容以帮助调试
            try {
                const dir = path.dirname(fullPath);
                // logToFile(`Checking directory: ${dir}`);
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    // logToFile(`Directory contents of ${dir}:`);
                    files.forEach(file => logToFile(`- ${file}`));
                } else {
                    // logToFile(`Directory does not exist: ${dir}`);
                }
            } catch (e) {
                // logToFile(`Error reading directory: ${e.message}`);
            }
            return res.status(404).send('File not found');
        }
        
        // 检查是否为文件
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) {
            // logToFile(`Not a file: ${fullPath}`);
            return res.status(400).send('Not a file');
        }
        
        // 检查文件权限
        try {
            fs.accessSync(fullPath, fs.constants.R_OK);
            // logToFile('File is readable');
        } catch (err) {
            // logToFile(`File permission error: ${err.message}`);
            return res.status(403).send('Permission denied');
        }

        // 直接读取并发送文件
        res.sendFile(fullPath, (err) => {
            if (err) {
                // logToFile(`Error sending file: ${err.message}`);
                return res.status(500).send('Error sending file');
            }
            // logToFile('File sent successfully');
        });
    } catch (error) {
        // logToFile(`Error in MMD middleware: ${error.message}`);
        // logToFile(`Stack: ${error.stack}`);
        res.status(500).send('Internal server error');
    }
});

// 优先返回public目录下的文件
app.use(express.static(path.join(__dirname, 'public')));

// 5. 路由
app.use('/', indexRouter);
app.use('/users', usersRouter);

// 6. 错误处理中间件
app.use(function(req, res, next) {
    next(createError(404));
});

app.use(function(err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

// 服务器启动日志
//logToFile(`\n=== Server Started ===`);
//logToFile(`Time: ${new Date().toISOString()}`);

module.exports = function(config) {
    console.log('Express app initialization with config:', config);
    
    if (config && config.userDataPath) {
        // 设置全局mmdPath
        mmdPath = path.join(config.userDataPath, '/customize/mmd');
        console.log('Setting mmdPath to:', mmdPath);
        
        // 检查目录是否存在
        try {
            if (!fs.existsSync(mmdPath)) {
                console.log('Creating MMD directory:', mmdPath);
                fs.mkdirSync(mmdPath, { recursive: true });
            } else {
                console.log('MMD directory exists:', mmdPath);
            }
        } catch (error) {
            console.error('Error handling MMD directory:', error);
        }
    } else {
        console.log('Config or userDataPath not provided!');
    }

    return app;
};
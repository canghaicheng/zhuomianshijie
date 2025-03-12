const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

// 先转换代码，再编译
async function compileFile(filePath) {
  try {
    // 读取源文件
    const source = fs.readFileSync(filePath, 'utf8');
    
    // 使用babel转换ES模块语法
    const result = await babel.transformAsync(source, {
      filename: filePath,
      presets: [
        ['@babel/preset-env', {
          modules: 'commonjs'
        }]
      ]
    });

    // 创建临时文件
    const tempFile = filePath + '.temp.js';
    fs.writeFileSync(tempFile, result.code);

    // 用bytenode编译转换后的文件
    bytenode.compileFile({
      filename: tempFile,
      output: filePath.replace('.js', '.jsc')
    });

    // 删除临时文件
    fs.unlinkSync(tempFile);
    
    console.log(`Compiled ${filePath} successfully`);
  } catch (error) {
    console.error(`Error compiling ${filePath}:`, error);
  }
}

const filesToCompile = [
  'main.js',
  'preload.js',
  'node-app/app.js'
];

// 编译所有文件
filesToCompile.forEach(file => {
  const inputPath = path.join(__dirname, file);
  if(fs.existsSync(inputPath)) {
    compileFile(inputPath);
  }
});
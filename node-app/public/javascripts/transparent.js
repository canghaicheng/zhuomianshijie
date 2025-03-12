import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import {
	GUI
} from 'three/addons/libs/lil-gui.module.min.js';
import {
	OrbitControls
} from 'three/addons/controls/OrbitControls.js';

import {
	MMDLoader
} from 'three/addons/loaders/MMDLoader.js';

import {
	MMDAnimationHelper
} from 'three/addons/animation/MMDAnimationHelper.js';

import { initializeGlobalAudio } from '../javascripts/audioHelper.js';

import { setupGUI } from '../javascripts/chatHelper.js';

let container, stats;
let camera, scene, raycaster, renderer;
let orbitControls, group, mouse, click;
let currentModel;
let animationHelper, ikHelper, physicsHelper;
let modelFile;
let animationControls = {};
const defaultModel = '/mmd/wanhua/wanhua.pmx'

// Instantiate a helper
animationHelper = new MMDAnimationHelper({
	resetPhysicsOnLoop: false  // 禁用循环时重置物理
});
const loadingManager = new THREE.LoadingManager();

let vpds = [];
let vmds = [];
const vmdFiles = [
	'vmd/idle.vmd',
	'vmd/twist.vmd',
	'vmd/wavefile_v2.vmd',
	'vmd/catwalk.vmd',
	'vmd/byebyebye.vmd',
	'vmd/ankha.vmd'
];
const loader = new MMDLoader();
let animation = false;

const clock = new THREE.Clock();

Ammo().then(function (AmmoLib) {

	Ammo = AmmoLib;

	init();

});

async function init() {
	click = 0;

	container = document.getElementById('container');

	//
	raycaster = new THREE.Raycaster();

	// 设置透明背景的渲染器
	renderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: true  // 启用透明背景
	});
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	renderer.setClearColor(0x000000, 0); // 设置透明背景
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.5;
	container.appendChild(renderer.domElement);

	//

	scene = new THREE.Scene();

	camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
	camera.position.set(0, 29, 59);

	const cameraState = await window.electronAPI.storeGet('transparent_camera_state');
    if (cameraState) {
		// 还原相机状态
        camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
        camera.rotation.set(cameraState.rotation.x, cameraState.rotation.y, cameraState.rotation.z);
        camera.zoom = cameraState.zoom;
        camera.fov = cameraState.fov;
        camera.updateProjectionMatrix();
	}


	// 相机控制器
	orbitControls = new OrbitControls(camera, renderer.domElement);
	orbitControls.target.set(0, 10, 0);
	orbitControls.minDistance = 20.0;
	orbitControls.maxDistance = 200.0;
	orbitControls.update();

	// 监听控制器变化
    orbitControls.addEventListener('change', () => {
        // 保存相机状态
        const cameraState = {
            position: {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z
            },
            rotation: {
                x: camera.rotation.x,
                y: camera.rotation.y,
                z: camera.rotation.z
            },
            zoom: camera.zoom,
            fov: camera.fov,
            target: {
                x: orbitControls.target.x,
                y: orbitControls.target.y, 
                z: orbitControls.target.z
            }
        };
        
        // 使用 electron store 保存
        window.electronAPI.storeSet('transparent_camera_state', cameraState);
    });

	// 还原 OrbitControls target
	if (cameraState && cameraState.target) {
		orbitControls.target.set(
			cameraState.target.x,
			cameraState.target.y,
			cameraState.target.z
		);
		orbitControls.update();
	}


	// GUI
	const gui = new GUI({
		title: '控制面板',
		container: document.body,
		autoPlace: false,
		dragAndDrop: false,
		closed: false
	});

	gui.domElement.style.position = 'fixed';
	gui.domElement.style.top = '0';
	gui.domElement.style.right = '0';
	gui.domElement.style.maxHeight = 'fit-content';
	gui.domElement.style.display = 'none';

	setupControlPanel(gui);

	window.electronAPI.onToggleControlPanel((isVisible) => {
		console.log('toggle-control-panel', isVisible);
		if (isVisible) {
			gui.domElement.style.display = 'block';
		} else {
			gui.domElement.style.display = 'none';
		}
	});


	// 添加移动设备的响应式处理
	if (window.innerWidth <= 500) { // 移动设备宽度阈值
		gui.domElement.style.position = 'fixed';
		gui.domElement.style.width = '100%';  // 设置宽度为100%
		gui.domElement.style.maxWidth = '100%'; // 覆盖lil-gui的默认最大宽度
		// 确保子元素也是100%宽度
		const root = gui.domElement.querySelector('.root');
		if (root) {
			root.style.width = '100%';
			root.style.maxWidth = '100%';
		}
		// 在移动设备上默认收起
		gui.close();
	}


	loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
		console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.');
	};

	loadingManager.onError = function (url) {
		console.log('There was an error loading ' + url);
	};

	// ------------模型-----------------------------------------


	const folderModel = gui.addFolder('模型');

	const modelSettings = await window.electronAPI.storeGet('model_settings');
	console.log('modelSettings:', modelSettings);
	let modelConfig;

	// 如果modelSettings为undefined，则设置默认模型
	if (modelSettings == undefined) {
		modelFile = defaultModel;
		modelConfig = {
			currentModel: 'wanhua'
		};
	} else {
		modelFile = modelSettings.path;
		console.log('modelSettings path:', modelSettings.path);
		modelConfig = {
			currentModel: modelSettings.name
		};
	}

	// 从用户配置目录/customize/mmd/目录下获取模型目录和模型文件名称
	const modelFolders = await window.electronAPI.readdir('/customize/mmd/');
	// 定义模型文件映射
	const modelFileMap = {};
	// 遍历模型目录，获取模型文件名称
	for (let i = 0; i < modelFolders.length; i++) {
		const modelFolder = modelFolders[i];
		console.log('modelFolder:', modelFolder);
		// 直接读取文件夹下的文件
		const files = await window.electronAPI.readdirfiles(`/customize/mmd/${modelFolder}`);
		// 过滤pmx文件
		const pmxFiles = files.filter(file => file.endsWith('.pmx'));
		const modelFile = pmxFiles[0]; // 取第一个pmx文件

		if (modelFile) {
			// 将modelName和modelFile添加到modelFiles
			modelFileMap[modelFolder] = `/customize/mmd/${modelFolder}/${modelFile}`;
		}
	}
	console.log('modelFileMap:', modelFileMap);
	console.log('modelConfig:', modelConfig);

	// 添加模型选择控制器
	folderModel.add(modelConfig, 'currentModel', modelFileMap)
		.name('模型')
		.onChange(function (value) {
			// value 将是选中的文件路径
			modelFile = value;
			// 调用模型切换函数
			onChangeModel(value);
		});


	// 添加模型大小控制
	const modelScaleOptions = {
		scale: 1.5,
		updateScale: function () {
			if (currentModel) {
				currentModel.scale.setScalar(modelScaleOptions.scale);
			}
		}
	};
	folderModel.add(modelScaleOptions, 'scale', 0.1, 5, 0.1).name('模型大小').onChange(modelScaleOptions.updateScale);


	// ------------模型-----------------------------------------




	// ------------姿势-----------------------------------------
	const folderVpd = gui.addFolder('姿势');

	const vpdFiles = [
		'vpd/01.vpd',
		'vpd/02.vpd',
		'vpd/03.vpd',
		'vpd/04.vpd',
		'vpd/05.vpd',
		'vpd/06.vpd',
		'vpd/07.vpd',
		'vpd/08.vpd',
		'vpd/09.vpd',
		'vpd/10.vpd',
		'vpd/11.vpd'
	];
	const controls = {};

	function initControls() {
		controls.姿势 = - 1;
		for (let i = 0; i < vpdFiles.length; i++) {
			controls[getBaseName(vpdFiles[i])] = false;
		}
	}

	function initPoses() {
		const files = { default: - 1 };
		for (let i = 0; i < vpdFiles.length; i++) {
			files[getBaseName(vpdFiles[i])] = i;
		}
		folderVpd.add(controls, '姿势', files).onChange(onChangePose);

	}





	// ------------姿势-----------------------------------------

	// ------------动作-----------------------------------------






	const folderAnimation = gui.addFolder('动作');

	function initAnimations() {
		const files = { default: - 1 };
		for (let i = 0; i < vmdFiles.length; i++) {
			files[getBaseName(vmdFiles[i])] = i;
		}
		folderAnimation.add(animationControls, '动作', files).onChange(onChangeAnimation);
	}







	const api = {
		'animation': false,
		// 'ik': true,
		// 'outline': true,
		'physics': true
		// 'show IK bones': false,
		// 'show rigid bodies': false
	};

	const settings = {
		'pause/continue': pauseContinue
	};

	initAnimationControls();
	initAnimations();
	folderAnimation.add(api, 'physics').name("物理").onChange(function () {

		animationHelper.enable('physics', api['physics']);

	});
	folderAnimation.add(settings, 'pause/continue').name('播放/暂停');



	// ------------动作-----------------------------------------

	const urlParams = new URLSearchParams(window.location.search);

	// 使用 modelFile 变量
	console.log('加载模型：', modelFile);
	const vmdFile = urlParams.get('motion') || 'vmd/idle.vmd';
	console.log('加载动作：', vmdFile);

	// // 环境光
	// const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
	// scene.add(ambientLight);

	// // 主要平行光
	// const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
	// mainLight.position.set(10, 20, 10);
	// scene.add(mainLight);


	// 在模型四周添加光源

	// 前方光源
	const frontLight = new THREE.DirectionalLight(0xffffff, 0.9);
	frontLight.position.set(0, 10, 10);
	scene.add(frontLight);

	// 后方光源
	const backLight = new THREE.DirectionalLight(0xffffff, 0.9);
	backLight.position.set(0, 10, -10);
	scene.add(backLight);

	// 左侧光源
	const leftLight = new THREE.DirectionalLight(0xffffff, 0.9);
	leftLight.position.set(-10, 10, 0);
	scene.add(leftLight);

	// 右侧光源
	const rightLight = new THREE.DirectionalLight(0xffffff, 0.9);
	rightLight.position.set(10, 10, 0);
	scene.add(rightLight);

	// 上方光源
	const topLight = new THREE.DirectionalLight(0xffffff, 0.9);
	topLight.position.set(0, 20, 0);
	scene.add(topLight);

	// 下方光源
	const bottomLight = new THREE.DirectionalLight(0xffffff, 0.9);
	bottomLight.position.set(0, -10, 0);
	scene.add(bottomLight);

	loadModel(modelFile, vmdFile);

	let vpdIndex = 0;

	function loadVpd() {
		const vpdFile = vpdFiles[vpdIndex];
		loader.loadVPD(vpdFile, false, function (vpd) {
			vpds.push(vpd);
			vpdIndex++;
			if (vpdIndex < vpdFiles.length) {
				loadVpd();
			} else {
				// console.log("vpd加载完成");
			}
		}, function (xhr) {
		}, function (error) {
		});
	}
	loadVpd();

	let vmdIndex = 0;
	function loadVmd() {
		const vmdFile = vmdFiles[vmdIndex];

		loader.loadAnimation(vmdFile, currentModel, function (animation) {
			vmds.push(animation);
			vmdIndex++;
			if (vmdIndex < vmdFiles.length) {
				loadVmd();
			} else {
				// console.log("vmd加载完成");
			}
		}, function (xhr) {
		}, function (error) {
		});
	}
	loadVmd();

	function onChangePose() {
		animationHelper.enable('animation', false);
		const index = parseInt(controls.姿势);
		if (currentModel === undefined) {
			return;
		}
		if (index === - 1) {
			currentModel.pose();
		} else {
			animationHelper.pose(currentModel, vpds[index]);
		}
	}


	mouse = new THREE.Vector2();
	renderer.domElement.addEventListener('click', onDocumentMouseDown, false);

	window.addEventListener('resize', onWindowResize);

	initControls();
	initPoses();
	// onChangePose();
	pauseContinue();


	const chatGui = new GUI({
		title: '聊天面板',
		container: document.body, // 确保GUI添加到body
		autoPlace: true,         // 允许自动定位
		dragAndDrop: false,      // 禁用拖放
		closed: false            // 初始展开状态
	});
	// 设置位置和样式
	chatGui.domElement.style.position = 'absolute';
	chatGui.domElement.style.left = '0';
	chatGui.domElement.style.bottom = '0';
	// chatGui.domElement.style.display = 'none';
	// 创建左下角的聊天面板
	setupGUI(chatGui);
	window.electronAPI.onToggleChatPanel((isVisible) => {
		console.log('toggle-chat-panel', isVisible);
		if (isVisible) {
			chatGui.domElement.style.display = 'block';
		} else {
			chatGui.domElement.style.display = 'none';
		}
	});
}

function loadModel(modelFile, vmdFile) {
	loader.loadWithAnimation(modelFile, vmdFile, function (mmd) {
		currentModel = mmd.mesh;
		window.currentModel = currentModel;
		// 设置模型的初始位置和大小 
		currentModel.scale.set(1.5, 1.5, 1.5);
		currentModel.up.set(0, 1, 0);

		// 修改这部分，添加动画混合设置
		const mixer = new THREE.AnimationMixer(currentModel);
		const action = mixer.clipAction(mmd.animation);

		// 设置动画循环
		action.setLoop(THREE.LoopRepeat);
		const fadeTime = 0.5;
		const duration = action.getClip().duration;

		// 设置动画参数
		action.play();

		// 在动画更新时检查并处理过渡
		mixer.addEventListener('update', function (e) {
			// 获取当前动画时间
			const currentTime = action.time;

			// 在动画即将结束时开始过渡（比如最后0.5秒）
			if (currentTime >= duration - fadeTime && !action.userData.transitioning) {
				action.userData.transitioning = true;

				// 创建新的动作实例用于下一个循环
				const nextAction = mixer.clipAction(action.getClip());
				nextAction.setLoop(THREE.LoopRepeat);
				nextAction.time = 0; // 确保从头开始播放

				// 设置交叉淡入淡出
				nextAction.crossFadeFrom(action, fadeTime, true);
				nextAction.play();

				// 在过渡完成后重置标记
				setTimeout(() => {
					action.userData.transitioning = false;
				}, fadeTime * 1000);
			}
		});

		// 添加到 animationHelper
		animationHelper.add(currentModel, {
			animation: mmd.animation,
			physics: true,
			mixer: mixer,
			physicsElapsedTime: 1 / 60
		});
		scene.add(currentModel);

		// 初始化预加载所有动画
		initializeAnimations();
	},
		function (xhr) {
			// console.log((xhr.loaded / xhr.total * 100) + '% loaded');
		},
		function (error) {
			console.log('An error happened' + error);
		}
	);
}

function setupControlPanel(gui) {
	function setupFolderToggle(element) {
		const title = element.querySelector('.title');
		if (!title) return;

		title.addEventListener('click', () => {
			const isClosed = element.classList.contains('closed');

			if (!isClosed) {
				// 关闭时隐藏背景
				element.style.background = 'none';
				element.style.height = '24px';
				element.style.minHeight = '24px';
			} else {
				// 打开时恢复背景
				element.style.background = '';
				element.style.height = '';
				element.style.minHeight = '';
			}
		});
	}

	// 只为主面板设置处理
	setupFolderToggle(gui.domElement);

	// 监听主面板状态变化
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			const element = mutation.target;
			if (element.classList.contains('closed')) {
				element.style.background = 'none';
				element.style.height = '24px';
				element.style.minHeight = '24px';
			} else {
				element.style.background = '';
				element.style.height = '';
				element.style.minHeight = '';
			}
		});
	});

	observer.observe(gui.domElement, {
		attributes: true,
		attributeFilter: ['class']
	});
}

function onChangeModel(modelFile) {
	console.log('onChangeModel:', modelFile);
	const urlParams = new URLSearchParams(window.location.search);
	// 使用 modelFile 变量
	console.log('加载模型：', modelFile);
	const vmdFile = urlParams.get('motion') || 'vmd/idle.vmd';
	console.log('加载动作：', vmdFile);

	// 清除旧模型
	removeCurrentModel();

	const modelName = modelFile.split('/')[3];
	// console.log('modelName:', modelName);
	const file =  modelFile.split('/')[4];
	// console.log('file:', file);
	const modelSettings = {
		name: modelName,
		file: file,
		path: `${modelFile}`,
		lastModified: new Date().toISOString()
	};

	window.electronAPI.storeSet('model_settings', modelSettings);

	loadModel(modelFile, vmdFile);
}

function initializeAnimations() {
	let vmdIndex = 0;

	function loadVmd() {
		const vmdFile = vmdFiles[vmdIndex];

		loader.loadAnimation(vmdFile, currentModel, function (animation) {
			vmds.push(animation);
			vmdIndex++;
			if (vmdIndex < vmdFiles.length) {
				loadVmd();
			} else {
				console.log("所有动画预加载完成");
			}
		});
	}

	loadVmd();
}

function removeCurrentModel() {
	if (currentModel) {
		// 1. 停止动画
		const helper = animationHelper.objects.get(currentModel);
		if (helper && helper.mixer) {
			helper.mixer.stopAllAction();
		}

		// 2. 从管理器中移除
		animationHelper.remove(currentModel);
		scene.remove(currentModel);

		// 3. 释放GPU资源 (重要!)
		currentModel.traverse(function (object) {
			if (object.geometry) object.geometry.dispose();
			if (object.material) {
				if (Array.isArray(object.material)) {
					object.material.forEach(material => material.dispose());
				} else {
					object.material.dispose();
				}
			}
		});

		vmds = [];

		// 4. 清空引用
		currentModel = null;
		window.currentModel = null;
	}
}

function initAnimationControls() {
	animationControls.动作 = - 1;
	for (let i = 0; i < vmdFiles.length; i++) {
		animationControls[getBaseName(vmdFiles[i])] = false;
	}
}

function onChangeAnimation() {
	const index = parseInt(animationControls.动作);
	// 停止当前动画
	const mixer = animationHelper.objects.get(currentModel).mixer;
	mixer.stopAllAction();

	// 重置物理模拟
	// if (animationHelper.objects.get(currentModel).physics) {
	// 	animationHelper.objects.get(currentModel).physics.reset();
	// }

	if (currentModel === undefined) {
		return;
	}
	if (index === - 1) {
		console.log('停止所有动画');
		return;

	} else {
		console.log('切换到新动画:', index);

		// 创建新的动画动作
		const newAction = mixer.clipAction(vmds[index]);
		// 设置动画的淡入时间（可选）
		newAction.fadeIn(0.5);

		newAction.play();

		// 如果需要循环播放，可以设置
		newAction.loop = THREE.LoopRepeat;
	}
}

// 播放/暂停
function pauseContinue() {
	if (animation) {
		animation = false;
	} else {
		animation = true;
	}
	animationHelper.enable('animation', animation);
}


// 全局方法，切换新动画
window.loadNewVmd = function (vmdPath) {
    const helper = animationHelper.objects.get(currentModel);
    if (!helper) return;
    
    const mixer = helper.mixer;
    
    // 停止所有当前动画
    mixer.stopAllAction();
    
    // 从预加载的动画中查找
    const vmdIndex = vmdFiles.indexOf(vmdPath);
    if (vmdIndex === -1) {
        console.error('未找到预加载的动画:', vmdPath);
        return;
    }
    
    try {
        // 使用预加载的动画创建action
        const newAction = mixer.clipAction(vmds[vmdIndex]);
        
        // 设置动画参数
        newAction.setLoop(THREE.LoopRepeat);
        newAction.enabled = true;
        newAction.setEffectiveWeight(1);
        newAction.setEffectiveTimeScale(1);
        
        // 使用fadeIn过渡
        newAction.fadeIn(0.5);
        newAction.play();
        
        console.log('切换到预加载的动画:', vmdPath);
        
    } catch (e) {
        console.error('播放动画时出错:', e);
    }
}

// 更新GUI控制器
function updateAnimationGUI() {
	// 重新初始化动作控制
	initAnimationControls();

	// 重新创建动作选项
	const files = { default: -1 };
	for (let i = 0; i < vmdFiles.length; i++) {
		files[getBaseName(vmdFiles[i])] = i;
	}

	// 更新GUI
	folderAnimation.controllers.forEach(controller => {
		if (controller.property === '动作') {
			controller.options(files);
		}
	});
}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize(window.innerWidth, window.innerHeight);

}

function animate() {
	render();
	//stats.update();
}



function render() {

	const time = performance.now() * 0.001;

	//mesh.position.y = Math.sin( time ) * 20 + 5;


	// 播放动画
	animationHelper.update(clock.getDelta());

	renderer.render(scene, camera);
}


function onDocumentMouseDown(event) {
	event.preventDefault();
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

	raycaster.setFromCamera(mouse, camera);
	const intersects = raycaster.intersectObjects(scene.children);

	if (intersects.length > 0) {
		const object = intersects[0].object;

		if (object.name == 'geometry' && click == 0) {
			// 旋转
			click = 1;
		} else {
			click = 0;
		}
	}
}


function getBaseName(s) {
	return s.slice(s.lastIndexOf('/') + 1);
}

// 初始化音频相关功能
await initializeGlobalAudio();

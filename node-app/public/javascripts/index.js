import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import {
	GUI
} from 'three/addons/libs/lil-gui.module.min.js';
import {
	OrbitControls
} from 'three/addons/controls/OrbitControls.js';
import {
	Water
} from 'three/addons/objects/Water.js';
import {
	Sky
} from 'three/addons/objects/Sky.js';

import {
	MMDLoader
} from 'three/addons/loaders/MMDLoader.js';

import {
	MMDAnimationHelper
} from 'three/addons/animation/MMDAnimationHelper.js';

import { initializeGlobalAudio, playAudioFileWithLipSync } from '../javascripts/newAudioHelper.js';

import { setupGUI } from '../javascripts/chatHelper.js';

let container, stats;
let camera, scene, raycaster, renderer;
let orbitControls, water, sun, group, mesh, mouse, click;
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

	renderer = new THREE.WebGLRenderer({
		antialias: true
	});
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.5;
	container.appendChild(renderer.domElement);

	//

	scene = new THREE.Scene();

	camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
	camera.position.set(0, 29, 59);

	const cameraState = await window.electronAPI.storeGet('camera_state');
	if (cameraState) {
		// 还原相机状态
		camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
		camera.rotation.set(cameraState.rotation.x, cameraState.rotation.y, cameraState.rotation.z);
		camera.zoom = cameraState.zoom;
		camera.fov = cameraState.fov;
		camera.updateProjectionMatrix();
	}

	sun = new THREE.Vector3();


	// Water

	const waterGeometry = new THREE.PlaneGeometry(10000, 10000);

	water = new Water(
		waterGeometry, {
		textureWidth: 512,
		textureHeight: 512,
		waterNormals: new THREE.TextureLoader().load('textures/waternormals.jpg', function (texture) {

			texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

		}),
		sunDirection: new THREE.Vector3(),
		sunColor: 0xffffff,
		waterColor: 0x001e0f,
		distortionScale: 3.7,
		fog: scene.fog !== undefined
	}
	);

	water.rotation.x = -Math.PI / 2;

	scene.add(water);

	// Skybox

	const sky = new Sky();
	sky.scale.setScalar(10000);
	scene.add(sky);

	const skyUniforms = sky.material.uniforms;

	skyUniforms['turbidity'].value = 10;
	skyUniforms['rayleigh'].value = 2;
	skyUniforms['mieCoefficient'].value = 0.005;
	skyUniforms['mieDirectionalG'].value = 0.8;

	const parameters = {
		elevation: 2,
		azimuth: 180
	};

	// 圆台
	const geometry = new THREE.CylinderGeometry(18, 18, 6, 64, 1);

	// 加载法线纹理
	const normalTexture = new THREE.TextureLoader().load('textures/stillwater.jpg', function (texture) {
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	});
	const waterMaterial = new THREE.MeshStandardMaterial({
		map: normalTexture,
		transparent: true,
		opacity: 0.5, // 透明度
		blending: THREE.NormalBlending,
		side: THREE.FrontSide
	});

	mesh = new THREE.Mesh(geometry, waterMaterial);
	mesh.name = "geometry";
	group = new THREE.Group();
	group.add(mesh);
	scene.add(group);


	const pmremGenerator = new THREE.PMREMGenerator(renderer);
	const sceneEnv = new THREE.Scene();

	let renderTarget;

	function updateSun() {

		const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
		const theta = THREE.MathUtils.degToRad(parameters.azimuth);

		sun.setFromSphericalCoords(1, phi, theta);

		sky.material.uniforms['sunPosition'].value.copy(sun);
		water.material.uniforms['sunDirection'].value.copy(sun).normalize();

		if (renderTarget !== undefined) renderTarget.dispose();

		sceneEnv.add(sky);
		renderTarget = pmremGenerator.fromScene(sceneEnv);
		scene.add(sky);

		scene.environment = renderTarget.texture;

	}

	updateSun();


	//

	orbitControls = new OrbitControls(camera, renderer.domElement);
	orbitControls.target.set(0, 10, 0);
	orbitControls.minDistance = 40.0;
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
		window.electronAPI.storeSet('camera_state', cameraState);
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

	// stats = new Stats();
	// container.appendChild( stats.dom );

	//GUI		

	const gui = new GUI({
		title: '控制面板',
		container: document.body, // 确保GUI添加到body
		autoPlace: true,         // 允许自动定位
		dragAndDrop: false,      // 禁用拖放
		closed: false            // 初始展开状态
	});
	gui.domElement.style.position = 'absolute';
	gui.domElement.style.right = '0';
	gui.domElement.style.top = '0';

	setupControlPanel(gui);


	const music_ui = new GUI({
		title: '音乐',
		container: document.body, // 确保GUI添加到body
		autoPlace: true,         // 允许自动定位
		dragAndDrop: false,      // 禁用拖放
		closed: true            // 初始展开状态
	});
	music_ui.domElement.style.position = 'absolute';
	music_ui.domElement.style.left = '0';
	music_ui.domElement.style.top = '0';

	setupMusicPanel(music_ui);



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


	const folderSky = gui.addFolder('天空');
	folderSky
		.add(parameters, 'elevation', 0, 90, 0.1)
		.name('太阳高度角')
		.onChange(updateSun);


	folderSky
		.add(parameters, 'azimuth', -180, 180, 0.1)
		.name('太阳方位角')
		.onChange(updateSun);
	folderSky.open();

	const waterUniforms = water.material.uniforms;

	const folderWater = gui.addFolder('水面');
	folderWater.add(waterUniforms.distortionScale, 'value', 0, 8, 0.1).name('水面扭曲程度');
	folderWater.add(waterUniforms.size, 'value', 0.1, 10, 0.1).name('水面波纹大小');
	folderWater.open();
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

	// 添加环境光
	const ambientLight = new THREE.AmbientLight(0xffffff, 3);
	scene.add(ambientLight);


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
	// 创建左下角的聊天面板
	setupGUI(chatGui);
}

function loadModel(modelFile, vmdFile) {
	loader.loadWithAnimation(modelFile, vmdFile, function (mmd) {
		currentModel = mmd.mesh;
		window.currentModel = currentModel;
		// 设置模型的初始位置和大小 
		currentModel.scale.set(1.5, 1.5, 1.5);
		currentModel.position.set(0, 3, 0);
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
		group.add(currentModel);
		scene.add(group);

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

function setupMusicPanel(music_ui) {
	const audioConfig = {
		currentAudio: 'default',
		audioOptions: {
			'选择文件...': 'select'
		}
	};

	// 创建歌词面板
	const lyricsFolder = music_ui.addFolder('歌词');
	// 设置歌词面板的样式
	const lyricsFolderElement = lyricsFolder.domElement.parentElement;
	lyricsFolderElement.style.cssText += `
		height: auto !important;
	`;


	// 添加监听器处理折叠/展开状态
	const title = lyricsFolderElement.querySelector('.title');
	const children = lyricsFolderElement.querySelector('.children');
	
	if (title && children) {
		// 创建 MutationObserver 来监听 children 的 style 变化
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.attributeName === 'style') {
					// 检查 children 是否被隐藏
					const isHidden = children.style.display === 'none';
					
					if (isHidden) {
						// 收起时隐藏背景和调整高度
						lyricsFolderElement.style.height = '24px';
						lyricsFolderElement.style.minHeight = '24px';
					} else {
						// 展开时恢复背景和高度
						lyricsFolderElement.style.height = 'auto';
					}
				}
			});
		});

		// 开始观察 children 元素的 style 属性变化
		observer.observe(children, {
			attributes: true,
			attributeFilter: ['style']
		});
	}


	// 创建歌词容器
	const lyricsContainer = document.createElement('div');
	lyricsContainer.style.cssText = `
		width: 100%;
		height: 150px;
		overflow: hidden;
		margin: 10px 0;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 5px;
		display: flex;
		flex-direction: column;
		align-items: center;
	`;

	// 创建时间显示
	const timeDisplay = document.createElement('div');
	timeDisplay.style.cssText = `
		width: 100%;
		text-align: center;
		padding: 5px;
		color: #666;
		font-size: 12px;
	`;
	lyricsContainer.appendChild(timeDisplay);

	// 创建歌词滚动容器
	const lyricsScroll = document.createElement('div');
	lyricsScroll.style.cssText = `
		flex: 1;
		width: 100%;
		overflow: hidden;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	`;
	lyricsContainer.appendChild(lyricsScroll);

	// 将歌词容器添加到歌词面板的内容区域
	const lyricsFolderContent = lyricsFolderElement.querySelector('.children');
	if (lyricsFolderContent) {
		lyricsFolderContent.appendChild(lyricsContainer);
	}

	// 创建音乐控制面板
	const audioControlPanel = document.createElement('div');
	audioControlPanel.style.cssText = `
		width: 100%;
		padding: 12px 10px;
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-radius: 8px;
		/* 移除背景色 */
	`;
	
	// 创建播放控制行
	const playControlRow = document.createElement('div');
	playControlRow.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 15px;
	`;
	
	// 创建播放/暂停按钮
	const playButton = document.createElement('button');
	playButton.innerHTML = '▶️';
	playButton.style.cssText = `
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 50%;
		background: #4CAF50; /* 简化背景为纯色 */
		color: white;
		font-size: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	`;
	playButton.addEventListener('mouseover', () => {
		playButton.style.transform = 'scale(1.05)';
		playButton.style.background = '#3d8b40'; /* 悬停时颜色变深 */
	});
	playButton.addEventListener('mouseout', () => {
		playButton.style.transform = 'scale(1)';
		playButton.style.background = '#4CAF50'; /* 恢复原来的颜色 */
	});
	
	// 添加播放/暂停功能
	playButton.addEventListener('click', () => {
		if (window.globalAudioPlayer) {
			if (window.globalAudioPlayer.paused) {
				window.globalAudioPlayer.play();
				playButton.innerHTML = '⏸️';
			} else {
				window.globalAudioPlayer.pause();
				playButton.innerHTML = '▶️';
			}
		}
	});
	
	// 创建进度条容器
	const progressContainer = document.createElement('div');
	progressContainer.style.cssText = `
		flex: 1;
		height: 40px;
		display: flex;
		align-items: center;
		position: relative;
	`;
	
	// 创建进度条
	const progressBar = document.createElement('input');
	progressBar.type = 'range';
	progressBar.min = 0;
	progressBar.max = 100;
	progressBar.value = 0;
	progressBar.style.cssText = `
		width: 100%;
		height: 6px;
		-webkit-appearance: none;
		background: #ddd; /* 使用纯色背景 */
		border-radius: 3px;
		outline: none;
		cursor: pointer;
		transition: background 0.3s;
		border: none; /* 确保没有边框 */
	`;
	
	// 动态更新进度条背景 - 修复中间空白问题
	const updateProgressBackground = () => {
		// 确保即使是拖动状态，背景色也会正确显示
		if (progressBar.value > 0) {
			progressBar.style.background = `linear-gradient(to right, #4CAF50 0%, #4CAF50 ${progressBar.value}%, #ddd ${progressBar.value}%, #ddd 100%)`;
		} else {
			progressBar.style.background = '#ddd';
		}
	};
	
	// 定期更新进度条背景色，确保不会出现空白
	setInterval(updateProgressBackground, 50);
	
	progressBar.addEventListener('input', () => {
		if (window.globalAudioPlayer) {
			const seekTime = (progressBar.value / 100) * window.globalAudioPlayer.duration;
			window.globalAudioPlayer.currentTime = seekTime;
			updateProgressBackground();
			
			// 进度条拖动时也更新歌词显示
			const currentTimeMs = seekTime * 1000;
			const duration = window.globalAudioPlayer.duration * 1000;
			
			// 从全局变量获取lrcParser和lyricsScroll
			if (window.lrcParser && window.lyricsScroll) {
				// 确保重置lrcParser的索引正确，防止回滚失败
				const currentLyric = window.lrcParser.getCurrentPhoneme(currentTimeMs);
				if (currentLyric) {
					updateLyricDisplay(window.lyricsScroll, currentLyric, window.lrcParser.lyrics);
				}
			}
		}
	});
	
	// 添加拖动标记
	progressBar.addEventListener('mousedown', () => {
		progressBar.dragging = true;
	});
	
	progressBar.addEventListener('mouseup', () => {
		progressBar.dragging = false;
		updateProgressBackground();
	});
	
	progressBar.addEventListener('mouseleave', () => {
		progressBar.dragging = false;
	});
	
	// 添加自定义进度条样式
	const styleElement = document.createElement('style');
	styleElement.textContent = `
		input[type=range]::-webkit-slider-thumb {
			-webkit-appearance: none;
			width: 14px;
			height: 14px;
			background: #4CAF50;
			border-radius: 50%;
			box-shadow: 0 1px 2px rgba(0,0,0,0.2);
			cursor: pointer;
			transition: all .2s ease;
			margin-top: -4px; /* 调整滑块位置 */
		}
		input[type=range]::-webkit-slider-thumb:hover {
			transform: scale(1.1);
			background: #3d8b40;
		}
		input[type=range]::-webkit-slider-runnable-track {
			height: 6px;
			border-radius: 3px;
			background: transparent; /* 确保轨道背景透明，让我们的渐变背景显示 */
		}
	`;
	document.head.appendChild(styleElement);
	
	// 添加进度条到容器
	progressContainer.appendChild(progressBar);
	
	// 添加播放控制组件到控制行
	playControlRow.appendChild(playButton);
	playControlRow.appendChild(progressContainer);
	
	// 创建音量控制行
	const volumeRow = document.createElement('div');
	volumeRow.style.cssText = `
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 5px;
	`;
	
	// 创建音量图标
	const volumeIcon = document.createElement('div');
	volumeIcon.innerHTML = '🔊';
	volumeIcon.style.cssText = `
		font-size: 18px;
		width: 24px;
		text-align: center;
		cursor: pointer;
	`;
	volumeIcon.addEventListener('click', () => {
		if (window.globalAudioPlayer) {
			if (window.globalAudioPlayer.volume > 0) {
				// 保存当前音量
				volumeIcon.dataset.prevVolume = window.globalAudioPlayer.volume;
				window.globalAudioPlayer.volume = 0;
				volumeSlider.value = 0;
				volumeIcon.innerHTML = '🔇';
			} else {
				// 恢复之前的音量
				const prevVolume = parseFloat(volumeIcon.dataset.prevVolume || '1');
				window.globalAudioPlayer.volume = prevVolume;
				volumeSlider.value = prevVolume * 100;
				volumeIcon.innerHTML = prevVolume < 0.5 ? '🔉' : '🔊';
			}
			updateVolumeBackground();
		}
	});
	
	// 创建音量滑块
	const volumeSlider = document.createElement('input');
	volumeSlider.type = 'range';
	volumeSlider.min = 0;
	volumeSlider.max = 100;
	volumeSlider.value = 100;
	volumeSlider.style.cssText = `
		flex: 1;
		height: 4px;
		-webkit-appearance: none;
		background: #ddd;
		border-radius: 2px;
		outline: none;
		cursor: pointer;
		border: none;
	`;
	
	// 动态更新音量滑块背景
	const updateVolumeBackground = () => {
		if (volumeSlider.value > 0) {
			volumeSlider.style.background = `linear-gradient(to right, #4CAF50 0%, #4CAF50 ${volumeSlider.value}%, #ddd ${volumeSlider.value}%, #ddd 100%)`;
		} else {
			volumeSlider.style.background = '#ddd';
		}
	};
	
	volumeSlider.addEventListener('input', () => {
		if (window.globalAudioPlayer) {
			window.globalAudioPlayer.volume = volumeSlider.value / 100;
			// 更新音量图标
			if (volumeSlider.value == 0) {
				volumeIcon.innerHTML = '🔇';
			} else if (volumeSlider.value < 50) {
				volumeIcon.innerHTML = '🔉';
			} else {
				volumeIcon.innerHTML = '🔊';
			}
			updateVolumeBackground();
		}
	});
	
	// 初始更新音量背景
	updateVolumeBackground();
	
	// 添加音量控制组件到音量行
	volumeRow.appendChild(volumeIcon);
	volumeRow.appendChild(volumeSlider);
	
	// 添加所有控制组件到控制面板
	audioControlPanel.appendChild(playControlRow);
	audioControlPanel.appendChild(volumeRow);
	
	// 将控制面板添加到歌词面板内容区域
	lyricsFolderContent.appendChild(audioControlPanel);

	// 添加下拉选择控件
	const audioController = music_ui.add(audioConfig, 'currentAudio', audioConfig.audioOptions)
		.name('音乐')
		.onChange(async (value) => {
			if (value === 'select') {
				const input = document.createElement('input');
				input.type = 'file';
				input.multiple = true;
				input.accept = 'audio/*,.lrc';

				input.onchange = (e) => {
					const files = Array.from(e.target.files);
					if (files.length > 0) {
						const audioFile = files.find(file => file.type.startsWith('audio/'));
						const lrcFile = files.find(file => file.name.toLowerCase().endsWith('.lrc'));

						if (audioFile) {
							audioConfig.audioOptions[audioFile.name] = audioFile;
							audioConfig.currentAudio = audioFile.name;
							console.log('选择的音频文件:', audioFile);
							console.log('选择的歌词文件:', lrcFile);

							// 清空歌词显示
							lyricsScroll.innerHTML = '';
							timeDisplay.textContent = '00:00 / 00:00';

							// 播放音频并同步口型（如果有歌词文件）
							playAudioFileWithLipSync(audioFile, lrcFile, {
								onTimeUpdate: (currentTime, duration) => {
									// 更新时间显示
									const currentMinutes = Math.floor(currentTime / 60000);
									const currentSeconds = Math.floor((currentTime % 60000) / 1000);
									const totalMinutes = Math.floor(duration / 60000);
									const totalSeconds = Math.floor((duration % 60000) / 1000);
									timeDisplay.textContent = `${currentMinutes.toString().padStart(2, '0')}:${currentSeconds.toString().padStart(2, '0')} / ${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;
									
									// 更新进度条
									if (!progressBar.dragging) {
										progressBar.value = (currentTime / duration) * 100;
										updateProgressBackground(); // 确保进度条背景更新
									}
								},
								onLyricUpdate: (currentLyric, lyrics, currentTime, phonemeInfo) => {
									// 更新歌词显示
									updateLyricDisplay(lyricsScroll, currentLyric, lyrics);
									
									// 保存全局变量，供进度条拖动时使用
									window.lrcParser = lrcParser;
									window.lyricsScroll = lyricsScroll;
								},
								onPlay: () => {
									// 更新播放按钮状态
									playButton.innerHTML = '⏸️';
								},
								onPause: () => {
									// 更新播放按钮状态
									playButton.innerHTML = '▶️';
								},
								onEnded: () => {
									// 更新播放按钮状态
									playButton.innerHTML = '▶️';
									// 重置进度条
									progressBar.value = 0;
								}
							});

							// 更新音量滑块为当前音量
							if (window.globalAudioPlayer) {
								volumeSlider.value = window.globalAudioPlayer.volume * 100;
							}

							audioController.setValue(audioFile.name);
							audioController.updateDisplay();
						} else {
							console.warn('未选择音频文件');
						}
					}
				};

				input.click();
				audioConfig.currentAudio = 'default';
			}
		});
}

// 更新歌词显示
function updateLyricDisplay(container, currentLyric, lyrics) {
	// 清空容器
	container.innerHTML = '';
	
	// 创建歌词元素
	lyrics.forEach((lyric, index) => {
		const lyricElement = document.createElement('div');
		lyricElement.textContent = lyric.text;
		lyricElement.style.cssText = `
			position: absolute;
			width: 100%;
			text-align: center;
			transition: all 0.3s ease;
			padding: 5px;
			${lyric === currentLyric ? 'color: #4CAF50; font-size: 16px;' : 'color: #666; font-size: 14px;'}
		`;

		// 计算位置
		const offset = (index - lyrics.indexOf(currentLyric)) * 30;
		lyricElement.style.transform = `translateY(${offset}px)`;
		lyricElement.style.opacity = Math.max(0, 1 - Math.abs(offset) / 60);

		container.appendChild(lyricElement);
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
	const file = modelFile.split('/')[4];
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
		group.remove(currentModel);

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
	const vmdFile = vmdFiles[index];
	loadNewVmd(vmdFile);
}

// 播放/暂停
function pauseContinue() {
	if (animation) {
		console.log('暂停动画');
		animation = false;
	} else {
		console.log('播放动画');
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

	// 添加安全检查
	if (group && group.rotation) {
		if (click == 1) {
			group.rotation.y += -0.005;
		}
		// 移除多余的else分支，因为 group.rotation.y = group.rotation.y 没有实际作用
	}


	if (water && water.material && water.material.uniforms) {
		water.material.uniforms['time'].value += 1.0 / 60.0;
	}

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
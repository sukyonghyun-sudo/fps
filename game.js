import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

// MSW stub (GitHub Pages용 — MSW 없이 동작)
const MSW = {
  init: async () => {},
  Ranking: {
    submitScore: async () => {},
    getLeaderboard: async () => [],
    getMyBestScore: async () => null,
  }
};
await MSW.init();

// ============================================================
// 렌더러 초기화 (최고 품질)
// ============================================================
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // ★★★ FINAL: 뷰어 베스트값
renderer.toneMappingExposure = 1.0; // ★★★ FINAL

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x222222, 0.0005); // ★★★ FINAL
scene.background = new THREE.Color(0x222222); // ★★★ FINAL

// ============================================================
// 카메라
// ============================================================
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
const EYE_HEIGHT = 1.7;
camera.position.set(0, EYE_HEIGHT, 5);

// ============================================================
// 포스트 프로세싱 파이프라인
// ============================================================
const composer = new EffectComposer(renderer);

// RenderPass
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// SSAOPass — ★★★ v5: 완전 비활성화 (벽이 검게 나오는 주범)
const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssaoPass.enabled = false; // ★★★ OFF
composer.addPass(ssaoPass);

// UnrealBloomPass — 형광등 글로우 효과
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.1,    // ★★★ v5: strength 0.15 → 0.1
    0.15,   // ★★★ v5: radius 0.2 → 0.15
    0.95    // ★★★ v5: threshold 0.85 → 0.95 (형광등 튜브만)
);
composer.addPass(bloomPass);

// ★★ 수정: ColorGrade 셰이더 전체 파라미터 조정
const ColorGradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        brightness: { value: 0.0 },     // ★★★ FINAL: 중립 (흰색 필터 제거)
        contrast: { value: 1.0 },        // ★★★ FINAL: 중립
        saturation: { value: 0.9 },
        vignette: { value: 0.0 },        // ★★★ FINAL: 없음
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float brightness;
        uniform float contrast;
        uniform float saturation;
        uniform float vignette;
        uniform vec2 resolution;
        varying vec2 vUv;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            // Brightness
            color.rgb += brightness;
            // Contrast
            color.rgb = (color.rgb - 0.5) * contrast + 0.5;
            // Saturation
            float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            color.rgb = mix(vec3(luma), color.rgb, saturation);
            // Vignette
            vec2 uv = vUv * 2.0 - 1.0;
            float vig = 1.0 - dot(uv * 0.5, uv * 0.5);
            vig = clamp(pow(vig, 0.6), 0.0, 1.0);
            color.rgb *= mix(1.0, vig, vignette);

            gl_FragColor = color;
        }
    `,
};
const colorGradePass = new ShaderPass(ColorGradeShader);
composer.addPass(colorGradePass);

// Resize handler
function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bloomPass.resolution.set(w, h);
    ssaoPass.setSize(w, h);
    colorGradePass.uniforms.resolution.value.set(w, h);
}
window.addEventListener('resize', resize);
resize();

// ============================================================
// 조명 (지하 주차장 — 형광등 기반)
// ============================================================
const keyLight = new THREE.DirectionalLight(0xdde0ee, 0.6); // ★★★ FINAL
keyLight.position.set(0, 20, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 100;
keyLight.shadow.camera.left = -60;
keyLight.shadow.camera.right = 60;
keyLight.shadow.camera.top = 60;
keyLight.shadow.camera.bottom = -60;
keyLight.shadow.bias = -0.0003;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);
scene.add(keyLight.target);

const hemiLight = new THREE.HemisphereLight(0x9099a8, 0x504840, 0.5); // ★★★ FINAL
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xd0ccc8, 0.4); // ★★★ FINAL
scene.add(ambientLight);

// 형광등 포인트라이트 배열 (맵 로드 후 위치 설정)
const parkingLights = [];

// ============================================================
// 환경맵 (IBL)
// ============================================================
let envMap = null;
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new RGBELoader().load(
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    (hdrTexture) => {
        envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
        scene.environment = envMap;
        hdrTexture.dispose();
        pmremGenerator.dispose();
        console.log('[ENV] HDR 환경맵 로드 완료');
        applyEnvMapToScene();
    },
    undefined,
    (err) => {
        console.warn('[ENV] HDR 로드 실패, 환경맵 없이 진행:', err);
    }
);

function applyEnvMapToScene() {
    if (!envMap) return;
    scene.traverse((obj) => {
        if (obj.isMesh && obj.material && obj.material.isMeshStandardMaterial) {
            obj.material.envMap = envMap;
            const n = (obj.name || '').toLowerCase();
            if (/floor|ground|asphalt|road/.test(n)) {
                obj.material.envMapIntensity = 0.3; // ★★★ FINAL
            } else if (/door|metal|steel/.test(n)) {
                obj.material.envMapIntensity = 0.8; // ★★★ FINAL
            } else {
                obj.material.envMapIntensity = 0.4; // ★★★ FINAL
            }
            obj.material.needsUpdate = true;
        }
    });
}

// ============================================================
// parking.glb 지하주차장 맵 로드
// ============================================================
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const stageMeshes = [];
const stageWallMeshes = [];
const stageFloorMeshes = [];
let stageCenter = new THREE.Vector3(0, 0, 0);
let stageBounds = null;

const PLAYER_RADIUS = 0.4;
const ZOMBIE_RADIUS = 0.5;

const STAGE_GLB_URL = `https://raw.githubusercontent.com/sukyonghyun-sudo/fps/main/parking.glb?t=${Date.now()}`;

const stageLoadPromise = new Promise((resolve) => {
    const stageLoader = new GLTFLoader();
    stageLoader.load(STAGE_GLB_URL, (gltf) => {
        const stageModel = gltf.scene;

        const bbox = new THREE.Box3().setFromObject(stageModel);
        const size = bbox.getSize(new THREE.Vector3());
        const modelHeight = size.y;
        const targetHeight = 3.2;
        const stageScale = targetHeight / modelHeight;
        stageModel.scale.setScalar(stageScale);
        console.log(`[STAGE] 원본 높이: ${modelHeight.toFixed(2)}, 스케일: ${stageScale.toFixed(4)}`);

        const scaledBbox1 = new THREE.Box3().setFromObject(stageModel);
        const center1 = scaledBbox1.getCenter(new THREE.Vector3());
        stageModel.position.set(-center1.x, -scaledBbox1.min.y, -center1.z);
        console.log(`[STAGE] 오프셋 적용: (${stageModel.position.x.toFixed(1)}, ${stageModel.position.y.toFixed(1)}, ${stageModel.position.z.toFixed(1)})`);

        const scaledBbox = new THREE.Box3().setFromObject(stageModel);
        const center = scaledBbox.getCenter(new THREE.Vector3());
        stageCenter.set(center.x, 0, center.z);
        stageBounds = scaledBbox;

        // ★★ 추가: 메시별 emissive 전수 로깅 (디버그용)
        console.log('[STAGE] === emissive 메시 전수 검사 ===');
        stageModel.traverse((child) => {
            if (child.isMesh) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    if (mat && mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
                        console.log(`[STAGE] EMISSIVE 발견! mesh="${child.name}" mat="${mat.name}" emissive=(${mat.emissive.r.toFixed(3)}, ${mat.emissive.g.toFixed(3)}, ${mat.emissive.b.toFixed(3)}) intensity=${mat.emissiveIntensity}`);
                    }
                }
            }
        });
        console.log('[STAGE] === emissive 검사 끝 ===');

        // 메시 분류: 바닥 vs 벽 + 머티리얼 수정
        stageModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                const n = (child.name || '').toLowerCase();

                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    if (!mat) continue;
                    mat.side = THREE.DoubleSide;
                    if (mat.map) {
                        mat.map.anisotropy = maxAniso;
                        mat.map.colorSpace = THREE.SRGBColorSpace;
                        mat.map.needsUpdate = true;
                    }
                    if (mat.normalMap) mat.normalMap.anisotropy = maxAniso;
                    if (mat.roughnessMap) mat.roughnessMap.anisotropy = maxAniso;
                    if (mat.metalnessMap) mat.metalnessMap.anisotropy = maxAniso;

                    if (mat.isMeshStandardMaterial) {
                        // ★★★ v4: 조건 체크 없이 모든 MeshStandardMaterial에서 emissive 강제 제거
                        mat.emissive = new THREE.Color(0x000000);
                        mat.emissiveIntensity = 0;
                        mat.emissiveMap = null;

                        if (/floor|ground|asphalt|road/.test(n)) {
                            mat.roughness = 0.92;
                            mat.metalness = 0.0;
                        }
                        else if (/wall|pillar|column|concrete|ceiling/.test(n)) {
                            mat.roughness = Math.max(mat.roughness, 0.85);
                            mat.metalness = 0.0;
                        }
                        else if (mat.metalness > 0.3) {
                            mat.metalness = 0.3;
                        }
                    }
                    mat.needsUpdate = true;
                }

                stageMeshes.push(child);

                child.geometry.computeBoundingBox();
                const meshBbox = child.geometry.boundingBox.clone();
                const worldScale = new THREE.Vector3();
                child.getWorldScale(worldScale);
                const meshSize = meshBbox.getSize(new THREE.Vector3());
                meshSize.multiply(worldScale);

                const height = meshSize.y;
                const horizontal = Math.max(meshSize.x, meshSize.z);

                if (height < 0.5 && horizontal > 1) {
                    stageFloorMeshes.push(child);
                } else {
                    stageWallMeshes.push(child);
                }
            }
        });

        scene.add(stageModel);

        // ★★★ v4: 2차 강제 emissive 전수 제거 (scene에 추가된 후)
        stageModel.traverse((child) => {
            if (child.isMesh) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of mats) {
                    if (mat && mat.isMeshStandardMaterial) {
                        mat.emissive = new THREE.Color(0x000000);
                        mat.emissiveIntensity = 0;
                        mat.emissiveMap = null;
                        mat.needsUpdate = true;
                    }
                }
            }
        });
        console.log('[STAGE] 2차 emissive 강제 제거 완료');

        const scaledSize = scaledBbox.getSize(new THREE.Vector3());
        console.log(`[STAGE] 로드 완료 — 메시: ${stageMeshes.length}, 벽: ${stageWallMeshes.length}, 바닥: ${stageFloorMeshes.length}`);
        console.log(`[STAGE] 맵 바운딩박스 — min: (${scaledBbox.min.x.toFixed(1)}, ${scaledBbox.min.y.toFixed(1)}, ${scaledBbox.min.z.toFixed(1)}), max: (${scaledBbox.max.x.toFixed(1)}, ${scaledBbox.max.y.toFixed(1)}, ${scaledBbox.max.z.toFixed(1)})`);
        console.log(`[STAGE] 맵 크기: ${scaledSize.x.toFixed(1)} x ${scaledSize.y.toFixed(1)} x ${scaledSize.z.toFixed(1)}`);
        console.log(`[STAGE] 맵 중심: (${stageCenter.x.toFixed(1)}, ${stageCenter.z.toFixed(1)})`);

        keyLight.position.set(stageCenter.x, scaledBbox.max.y + 10, stageCenter.z);
        keyLight.target.position.set(stageCenter.x, 0, stageCenter.z);

        // ★★★ v6: 형광등 4x2 = 8개 (성능 최적화 — 원본과 동일 개수)
        // 밝기는 intensity/distance로 보상
        const ceilY = scaledBbox.max.y - 0.15;
        const lightGridX = 4;
        const lightGridZ = 2; // 총 8개 (원본과 동일)
        const lMinX = scaledBbox.min.x + 2;
        const lMaxX = scaledBbox.max.x - 2;
        const lMinZ = scaledBbox.min.z + 2;
        const lMaxZ = scaledBbox.max.z - 2;
        for (let ix = 0; ix < lightGridX; ix++) {
            for (let iz = 0; iz < lightGridZ; iz++) {
                const lx = lMinX + (lMaxX - lMinX) * (ix + 0.5) / lightGridX;
                const lz = lMinZ + (lMaxZ - lMinZ) * (iz + 0.5) / lightGridZ;
                const pLight = new THREE.PointLight(0xf0ecdd, 8, 30, 1.2); // ★★★ FINAL
                pLight.position.set(lx, ceilY, lz);
                pLight.castShadow = false;
                scene.add(pLight);
                parkingLights.push(pLight);

                const tubeMat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    toneMapped: false,
                });
                const tubeGeo = new THREE.BoxGeometry(0.8, 0.04, 0.15);
                const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
                tubeMesh.position.set(lx, ceilY, lz);
                scene.add(tubeMesh);
            }
        }
        console.log(`[STAGE] 형광등 ${lightGridX * lightGridZ}개 배치 (천장Y: ${ceilY.toFixed(2)}, 그림자: OFF)`);

        // ★★★ v6: 벽면 조명 삭제 (성능) — ambient 2.5 + hemi 2.2로 벽 밝기 보상

        const spawnFloorY = scaledBbox.min.y;
        camera.position.set(stageCenter.x, spawnFloorY + EYE_HEIGHT, stageCenter.z);
        console.log(`[STAGE] 플레이어 스폰: (${stageCenter.x.toFixed(1)}, ${(spawnFloorY + EYE_HEIGHT).toFixed(1)}, ${stageCenter.z.toFixed(1)}), 바닥Y: ${spawnFloorY.toFixed(2)}, 천장Y: ${scaledBbox.max.y.toFixed(2)}`);

        // 맵 경계 투명 벽
        const BOUNDARY_WALL_HEIGHT = 5;
        const margin = 0.1;
        const bMin = scaledBbox.min;
        const bMax = scaledBbox.max;
        const bSizeX = bMax.x - bMin.x;
        const bSizeZ = bMax.z - bMin.z;
        const wallMat = new THREE.MeshBasicMaterial({ visible: false });

        const wallPX = new THREE.Mesh(new THREE.BoxGeometry(0.5, BOUNDARY_WALL_HEIGHT, bSizeZ), wallMat);
        wallPX.position.set(bMax.x - margin, BOUNDARY_WALL_HEIGHT / 2, (bMin.z + bMax.z) / 2);
        scene.add(wallPX); stageWallMeshes.push(wallPX); stageMeshes.push(wallPX);

        const wallNX = new THREE.Mesh(new THREE.BoxGeometry(0.5, BOUNDARY_WALL_HEIGHT, bSizeZ), wallMat);
        wallNX.position.set(bMin.x + margin, BOUNDARY_WALL_HEIGHT / 2, (bMin.z + bMax.z) / 2);
        scene.add(wallNX); stageWallMeshes.push(wallNX); stageMeshes.push(wallNX);

        const wallPZ = new THREE.Mesh(new THREE.BoxGeometry(bSizeX, BOUNDARY_WALL_HEIGHT, 0.5), wallMat);
        wallPZ.position.set((bMin.x + bMax.x) / 2, BOUNDARY_WALL_HEIGHT / 2, bMax.z - margin);
        scene.add(wallPZ); stageWallMeshes.push(wallPZ); stageMeshes.push(wallPZ);

        const wallNZ = new THREE.Mesh(new THREE.BoxGeometry(bSizeX, BOUNDARY_WALL_HEIGHT, 0.5), wallMat);
        wallNZ.position.set((bMin.x + bMax.x) / 2, BOUNDARY_WALL_HEIGHT / 2, bMin.z + margin);
        scene.add(wallNZ); stageWallMeshes.push(wallNZ); stageMeshes.push(wallNZ);

        console.log(`[STAGE] 경계 투명 벽 4면 생성 완료 (높이: ${BOUNDARY_WALL_HEIGHT}m)`);

        applyEnvMapToScene();

        renderer.compile(scene, camera);
        console.log('[STAGE] renderer.compile 완료');

        resolve();
    }, (xhr) => {
        if (xhr.total > 0) {
            const pct = (xhr.loaded / xhr.total * 100).toFixed(0);
            console.log(`[STAGE] 로딩 ${pct}%`);
        }
    }, (err) => {
        console.error(`[STAGE] GLB 로드 실패 — URL: ${STAGE_GLB_URL}`, err);
        console.warn('[STAGE] 폴백 바닥 생성');
        const fallbackFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100),
            new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9, side: THREE.DoubleSide })
        );
        fallbackFloor.rotation.x = -Math.PI / 2;
        fallbackFloor.receiveShadow = true;
        scene.add(fallbackFloor);
        stageMeshes.push(fallbackFloor);
        stageFloorMeshes.push(fallbackFloor);
        resolve();
    });
});

// 바닥 높이 판정 (레이캐스트)
const _floorRay = new THREE.Raycaster();
const _floorDown = new THREE.Vector3(0, -1, 0);
function getFloorHeight(x, z, fromY) {
    const originY = (fromY !== undefined) ? fromY + 0.5 : 0.5;
    _floorRay.set(new THREE.Vector3(x, originY, z), _floorDown);
    _floorRay.far = 50;
    const hits = _floorRay.intersectObjects(stageFloorMeshes, false);
    if (hits.length > 0) return hits[0].point.y;
    _floorRay.set(new THREE.Vector3(x, originY, z), _floorDown);
    _floorRay.far = 50;
    const hits2 = _floorRay.intersectObjects(stageMeshes, false);
    if (hits2.length > 0) return hits2[0].point.y;
    return 0;
}

// 플레이어 벽 충돌
const _wallRay = new THREE.Raycaster();
function checkPlayerWallCollision(position) {
    const dirs = [
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0.707, 0, 0.707), new THREE.Vector3(-0.707, 0, 0.707),
        new THREE.Vector3(0.707, 0, -0.707), new THREE.Vector3(-0.707, 0, -0.707),
    ];
    const origin = new THREE.Vector3(position.x, position.y - 0.5, position.z);
    for (const dir of dirs) {
        _wallRay.set(origin, dir);
        _wallRay.far = PLAYER_RADIUS;
        const hits = _wallRay.intersectObjects(stageWallMeshes, false);
        if (hits.length > 0) {
            const pushBack = dir.clone().multiplyScalar(-(PLAYER_RADIUS - hits[0].distance));
            position.add(pushBack);
        }
    }
}

// 좀비 벽 충돌
function checkZombieWallCollision(zombiePos, moveDir) {
    const origin = new THREE.Vector3(zombiePos.x, zombiePos.y + 0.9, zombiePos.z);
    const dir = moveDir.clone().normalize();
    _wallRay.set(origin, dir);
    _wallRay.far = ZOMBIE_RADIUS;
    const hits = _wallRay.intersectObjects(stageWallMeshes, false);
    return hits.length > 0;
}

// ============================================================
// 동적 크로스헤어
// ============================================================
let isAiming = false;
const crosshairEl = document.getElementById('crosshair');
let crosshairSpread = 4;
let crosshairTarget = 4;
let crosshairUpdateCounter = 0;

function updateCrosshairDOM() {
    if (!crosshairEl) return;
    const s = Math.round(crosshairSpread);
    if (isAiming) {
        crosshairEl.innerHTML = `<div style="position:absolute;top:-1px;left:-1px;width:2px;height:2px;background:rgba(255,255,255,0.8);border-radius:50%;"></div>`;
    } else {
        crosshairEl.innerHTML = `
            <div style="position:absolute;top:${-s - 8}px;left:-1px;width:2px;height:8px;background:#fff;"></div>
            <div style="position:absolute;top:${s}px;left:-1px;width:2px;height:8px;background:#fff;"></div>
            <div style="position:absolute;left:${-s - 8}px;top:-1px;width:8px;height:2px;background:#fff;"></div>
            <div style="position:absolute;left:${s}px;top:-1px;width:8px;height:2px;background:#fff;"></div>
        `;
    }
}
updateCrosshairDOM();

// 히트마커 DOM
const hitMarkerEl = document.createElement('div');
hitMarkerEl.id = 'hit-marker';
hitMarkerEl.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(1);pointer-events:none;z-index:11;opacity:0;transition:opacity 0.05s, transform 0.08s, color 0.08s;font-size:18px;color:#fff;font-family:monospace;text-shadow:0 0 4px #f00;`;
hitMarkerEl.textContent = '✕';
document.getElementById('game-container').appendChild(hitMarkerEl);

let hitMarkerTimer = null;
let hitMarkerVisible = false;
function showHitMarker() {
    if (!hitMarkerEl) return;
    hitMarkerEl.style.opacity = '1';
    hitMarkerEl.style.transform = 'translate(-50%,-50%) scale(1.5)';
    hitMarkerEl.style.color = '#ff4444';
    hitMarkerVisible = true;

    if (hitMarkerTimer) clearTimeout(hitMarkerTimer);
    hitMarkerTimer = setTimeout(() => {
        hitMarkerEl.style.opacity = '0';
        hitMarkerEl.style.transform = 'translate(-50%,-50%) scale(1)';
        hitMarkerEl.style.color = '#fff';
        hitMarkerVisible = false;
    }, 120);
}

// ============================================================
// 히트스톱 & 카메라 셰이크
// ============================================================
let hitStopTimer = 0;
let shakeIntensity = 0;
const shakeDecay = 0.9;

// ============================================================
// PointerLock + 마우스 입력
// ============================================================
let yaw = 0, pitch = 0;
const MOUSE_SENSITIVITY = 0.002;
let mouseDeltaX = 0, mouseDeltaY = 0;

// ============================================================
// ADS (Aim Down Sights) 정조준
// ============================================================
const ADS_FOV = 45;
const DEFAULT_FOV = 75;
const ADS_GUN_POS = new THREE.Vector3(0, -0.28, -0.32);
const ADS_LERP_SPEED = 10;
const ADS_SPREAD_MULT = 0.5;
const ADS_MOVE_SPEED_MULT = 0.7;
const ADS_SENSITIVITY_MULT = 0.6;
const ADS_BOB_SWAY_MULT = 0.3;
const adsGunPos = new THREE.Vector3(0.18, -0.32, -0.32);

const instructionsEl = document.getElementById('instructions');

canvas.addEventListener('click', () => { if (!isGameOver) canvas.requestPointerLock(); });

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
        instructionsEl.classList.add('hidden');
    } else {
        instructionsEl.classList.remove('hidden');
        stopFiring();
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    const sens = isAiming ? MOUSE_SENSITIVITY * ADS_SENSITIVITY_MULT : MOUSE_SENSITIVITY;
    yaw -= e.movementX * sens;
    pitch -= e.movementY * sens;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
    mouseDeltaX += e.movementX;
    mouseDeltaY += e.movementY;
});

document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) startFiring();
    if (e.button === 2) isAiming = true;
});
document.addEventListener('mouseup', (e) => {
    if (e.button === 0) stopFiring();
    if (e.button === 2) isAiming = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
// 키 입력
// ============================================================
const keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && document.pointerLockElement === canvas) startReload();
    if (e.code === 'Space' && document.pointerLockElement === canvas) tryJump();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ============================================================
// 이동 + 점프 + 달리기
// ============================================================
const WALK_SPEED = 3.8;
const SPRINT_SPEED = 6.5;
const GRAVITY = -20;
const JUMP_VELOCITY = 7;

let isMoving = false;
let isSprinting = false;
let velocityY = 0;
let isGrounded = true;

function tryJump() {
    if (!isGrounded) return;
    velocityY = JUMP_VELOCITY;
    isGrounded = false;
}

function updateMovement(dt) {
    if (document.pointerLockElement !== canvas || isGameOver) { isMoving = false; return; }

    isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    if (isSprinting) isAiming = false;
    const adsSpeedMult = isAiming ? ADS_MOVE_SPEED_MULT : 1;
    const speed = (isSprinting ? SPRINT_SPEED : WALK_SPEED) * adsSpeedMult;

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    const vel = new THREE.Vector3();
    if (keys['KeyW']) vel.add(forward);
    if (keys['KeyS']) vel.sub(forward);
    if (keys['KeyD']) vel.add(right);
    if (keys['KeyA']) vel.sub(right);

    if (vel.length() > 0) {
        vel.normalize().multiplyScalar(speed * dt);
        camera.position.add(vel);
        checkPlayerWallCollision(camera.position);
        isMoving = true;
    } else {
        isMoving = false;
    }

    const floorY = getFloorHeight(camera.position.x, camera.position.z, camera.position.y);
    velocityY += GRAVITY * dt;
    camera.position.y += velocityY * dt;
    if (camera.position.y <= floorY + EYE_HEIGHT) {
        camera.position.y = floorY + EYE_HEIGHT;
        velocityY = 0;
        isGrounded = true;
    }

    if (camera.position.y < -10) {
        const respawnFloorY = stageBounds ? stageBounds.min.y : 0;
        camera.position.set(stageCenter.x, respawnFloorY + EYE_HEIGHT, stageCenter.z);
        velocityY = 0;
        isGrounded = true;
    }
}

// ============================================================
// View Bob
// ============================================================
let bobTime = 0;
let bobAmount = 0;

const BOB_FREQ = 7;
const BOB_X = 0.004;
const BOB_Y = 0.005;
const BREATH_FREQ = 1.5;
const BREATH_X = 0.0005;
const BREATH_Y = 0.0008;

function updateBobbing(dt) {
    const target = isMoving ? 1 : 0;
    bobAmount += (target - bobAmount) * Math.min(1, 6 * dt);
    if (isMoving) {
        const freq = isSprinting ? BOB_FREQ * 1.4 : BOB_FREQ;
        bobTime += dt * freq;
    } else {
        if (bobAmount > 0.01) bobTime += dt * BOB_FREQ * bobAmount * 0.3;
    }
}

function getCameraBob() {
    const mult = isSprinting ? 1.8 : 1;
    const x = Math.sin(bobTime) * BOB_X * bobAmount * mult;
    const y = Math.abs(Math.cos(bobTime)) * BOB_Y * bobAmount * mult;
    return { x, y };
}

function getGunBob() {
    const t = bobTime - 0.8;
    let mult = isSprinting ? 2.2 : 1.5;
    if (isAiming) mult *= ADS_BOB_SWAY_MULT;
    const x = Math.sin(t) * BOB_X * bobAmount * mult;
    const y = Math.abs(Math.cos(t)) * BOB_Y * bobAmount * mult;
    const roll = Math.sin(t) * 0.01 * bobAmount * mult;
    return { x, y, roll };
}

function getBreathOffset() {
    const t = bobTime;
    const x = Math.sin(t * BREATH_FREQ / BOB_FREQ) * BREATH_X;
    const y = Math.cos(t * BREATH_FREQ / BOB_FREQ * 0.7) * BREATH_Y;
    return { x, y };
}

// ============================================================
// Weapon Sway
// ============================================================
const SWAY_AMOUNT = 0.002;
const SWAY_SMOOTH = 0.05;
const SWAY_MAX = 0.03;

let swayX = 0, swayY = 0;
let swayTargetX = 0, swayTargetY = 0;

function updateSway(dt) {
    const swayMult = isAiming ? ADS_BOB_SWAY_MULT : 1;
    swayTargetX = -mouseDeltaX * SWAY_AMOUNT * swayMult;
    swayTargetY = -mouseDeltaY * SWAY_AMOUNT * swayMult;
    swayTargetX = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, swayTargetX));
    swayTargetY = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, swayTargetY));

    swayX += (swayTargetX - swayX) * SWAY_SMOOTH;
    swayY += (swayTargetY - swayY) * SWAY_SMOOTH;

    mouseDeltaX = 0;
    mouseDeltaY = 0;

    swayTargetX *= 0.9;
    swayTargetY *= 0.9;
}

// ============================================================
// 탄약 시스템
// ============================================================
const MAX_AMMO = 30;
let currentAmmo = MAX_AMMO;
const ammoDisplayEl = document.getElementById('ammo-display');
const reloadIndicatorEl = document.getElementById('reload-indicator');

function updateAmmoDisplay() {
    if (!ammoDisplayEl) return;
    ammoDisplayEl.textContent = `${currentAmmo} / ∞`;
    if (currentAmmo <= 5) {
        ammoDisplayEl.classList.add('low');
    } else {
        ammoDisplayEl.classList.remove('low');
    }
}

// ============================================================
// 탄퍼짐 (Spread)
// ============================================================
let shotsFired = 0;
const BASE_SPREAD = 0.005;
const SPREAD_PER_SHOT = 0.003;
const MAX_SPREAD = 0.06;
let spreadResetTimer = null;

function getSpread() {
    let spread = BASE_SPREAD + shotsFired * SPREAD_PER_SHOT;
    if (isSprinting) spread *= 3;
    if (isAiming) spread *= ADS_SPREAD_MULT;
    if (!isGrounded) spread *= 2;
    return Math.min(spread, MAX_SPREAD);
}

// ============================================================
// 사격
// ============================================================
const raycaster = new THREE.Raycaster();
const _rayDir = new THREE.Vector3();
let raycastTargets = [];
function updateRaycastTargets() {
    raycastTargets = [...stageMeshes, ...zombieMeshesForRaycast];
}

const sharedSparkGeo = new THREE.SphereGeometry(0.015, 3, 3);
const sharedBloodGeo = new THREE.SphereGeometry(0.02, 3, 3);
const activeParticles = [];

function addParticle(mesh, velocity, duration) {
    activeParticles.push({
        mesh, velocity,
        startTime: performance.now(),
        duration
    });
    scene.add(mesh);
}

function updateParticles() {
    const now = performance.now();
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        const elapsed = now - p.startTime;
        if (elapsed > p.duration) {
            scene.remove(p.mesh);
            p.mesh.material.dispose();
            activeParticles[i] = activeParticles[activeParticles.length - 1];
            activeParticles.pop();
            continue;
        }
        const t = elapsed / p.duration;
        p.mesh.position.add(p.velocity);
        p.velocity.y -= 0.001;
        p.mesh.material.opacity = 1 - t;
        p.mesh.scale.setScalar(1 - t * 0.5);
    }
}

function createSparkParticles(position, normal) {
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffcc44, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending
    });
    const spark = new THREE.Mesh(sharedSparkGeo, mat);
    spark.position.copy(position);
    const vel = new THREE.Vector3(
        (Math.random()-0.5)*2, Math.random()*1.5, (Math.random()-0.5)*2
    ).normalize().multiplyScalar(0.02 + Math.random()*0.03);
    addParticle(spark, vel, 200);
}

const MAX_DECALS = 30;
const decalList = [];
const sharedDecalGeo = new THREE.CircleGeometry(0.03, 6);

function createBulletDecal(position, normal) {
    if (decalList.length >= MAX_DECALS) {
        const old = decalList.shift();
        scene.remove(old);
        old.material.dispose();
    }
    const decalMat = new THREE.MeshBasicMaterial({
        color: 0x111111, transparent: true,
        opacity: 0.8, depthWrite: false
    });
    const decal = new THREE.Mesh(sharedDecalGeo, decalMat);
    decal.position.copy(position).add(normal.clone().multiplyScalar(0.005));
    decal.lookAt(position.clone().add(normal));
    scene.add(decal);
    decalList.push(decal);
}

function createBloodParticles(position) {
    const mat = new THREE.MeshBasicMaterial({
        color: 0x880000, transparent: true, opacity: 1
    });
    const blood = new THREE.Mesh(sharedBloodGeo, mat);
    blood.position.copy(position);
    const vel = new THREE.Vector3(
        (Math.random()-0.5)*2, Math.random()*1.5, (Math.random()-0.5)*2
    ).normalize().multiplyScalar(0.015 + Math.random()*0.025);
    addParticle(blood, vel, 300);
}

function fireRaycast() {
    const spread = getSpread();
    _rayDir.set(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        -1
    ).normalize();

    _rayDir.applyQuaternion(camera.quaternion);
    raycaster.set(camera.position, _rayDir);

    const hits = raycaster.intersectObjects(raycastTargets, false);
    if (hits.length > 0) {
        const hit = hits[0];
        showHitMarker();

        const zombieRef = hit.object.userData.zombieRef;
        if (zombieRef) {
            if (zombieRef.alive) {
                hitZombie(zombieRef);
                createBloodParticles(hit.point);
            }
        } else {
            createSparkParticles(hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0));
            if (hit.face) createBulletDecal(hit.point, hit.face.normal);
        }
    }
}

// ============================================================
// 총기 모델
// ============================================================
let gunModel = null;
let gunMixer = null;
const GUN_SCALE = 0.014;
const gunOrigPos = new THREE.Vector3(0.18, -0.32, -0.32);
const gunOrigRot = new THREE.Euler(0, Math.PI, 0);

const gunKick = { z: 0, rotX: 0, rotZ: 0 };
const GUN_KICK_RETURN_SPEED = 0.12;

let recoilPitch = 0;
let recoilYaw = 0;
const RECOIL_RECOVERY = 3.5;

// ============================================================
// 머즐 플래시
// ============================================================
let muzzleFlashSprite = null;
let muzzleFlashTimer = 0;
const MUZZLE_FLASH_DURATION = 0.04;
let gunLight = null;

const MUZZLE_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/sukyonghyun-sudo/fps@main/muzzle_flash_transparent.png';

function createMuzzleFlash() {
    const texLoader = new THREE.TextureLoader();
    texLoader.load(MUZZLE_TEXTURE_URL, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;

        const mat = new THREE.SpriteMaterial({
            map: texture,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            transparent: true,
            toneMapped: false,
            color: 0xffffff,
        });

        muzzleFlashSprite = new THREE.Sprite(mat);
        muzzleFlashSprite.renderOrder = 998;
        muzzleFlashSprite.frustumCulled = false;
        muzzleFlashSprite.position.set(0.18, -0.20, -1.38);
        muzzleFlashSprite.scale.setScalar(0.39);
        muzzleFlashSprite.visible = false;
        camera.add(muzzleFlashSprite);

    }, undefined, (err) => {
        console.warn('[MUZZLE] 텍스처 로드 실패, 색상 폴백:', err);
        const mat = new THREE.SpriteMaterial({
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            transparent: true,
            toneMapped: false,
            color: 0xffaa00,
        });

        muzzleFlashSprite = new THREE.Sprite(mat);
        muzzleFlashSprite.renderOrder = 998;
        muzzleFlashSprite.frustumCulled = false;
        muzzleFlashSprite.position.set(0.18, -0.20, -1.38);
        muzzleFlashSprite.scale.setScalar(0.39);
        muzzleFlashSprite.visible = false;
        camera.add(muzzleFlashSprite);
    });
}

function showMuzzleFlash() {
    if (!muzzleFlashSprite) return;
    muzzleFlashSprite.visible = true;
    muzzleFlashSprite.material.rotation = Math.random() * Math.PI * 2;
    const s = mfDebugState.s + Math.random() * (mfDebugState.s * 0.5);
    muzzleFlashSprite.scale.setScalar(s);
    if (gunLight) {
        gunLight.intensity = 5;
        gunLight.color.setHex(0xffaa44);
    }
    muzzleFlashTimer = MUZZLE_FLASH_DURATION;
}

function updateMuzzleFlash(dt) {
    if (muzzleFlashTimer > 0) {
        muzzleFlashTimer -= dt;
        if (muzzleFlashTimer <= 0) {
            if (muzzleFlashSprite) muzzleFlashSprite.visible = false;
            if (gunLight) gunLight.intensity = 0;
        }
    }
}

const mfDebugState = { x: 0.18, y: -0.20, z: -1.38, s: 0.39 };


// ============================================================
// 좀비 시스템
// ============================================================
const ZOMBIE_FBX_BASE = 'https://raw.githubusercontent.com/sukyonghyun-sudo/fps/main/police_zombie/';
const ZOMBIE_FBX_URLS = {
    standard: ZOMBIE_FBX_BASE + 'standard.fbx',
    run: ZOMBIE_FBX_BASE + 'run.fbx',
    attack: ZOMBIE_FBX_BASE + 'attack.fbx',
    reaction: ZOMBIE_FBX_BASE + 'reaction.fbx',
    death: ZOMBIE_FBX_BASE + 'Death.fbx',
};

const GIRL_ZOMBIE_FBX_BASE = 'https://raw.githubusercontent.com/sukyonghyun-sudo/fps/main/girl_zombie/';
const GIRL_ZOMBIE_FBX_URLS = {
    run: GIRL_ZOMBIE_FBX_BASE + 'run.fbx',
    attack: GIRL_ZOMBIE_FBX_BASE + 'attack.fbx',
    reaction: GIRL_ZOMBIE_FBX_BASE + 'reaction.fbx',
    death: GIRL_ZOMBIE_FBX_BASE + 'death.fbx',
};

const ZOMBIE_COUNT = 6;
const ZOMBIE_SPEED = 3.5;
const ZOMBIE_ATTACK_RANGE = 1.8;
const ZOMBIE_HP = 5;
const ZOMBIE_ATTACK_DAMAGE = 20;
const ZOMBIE_ATTACK_COOLDOWN = 1.2;
const ZOMBIE_ATTACK_HIT_TIME = 0.5;
const ZOMBIE_SPAWN_MIN_DIST = 15;
const ZOMBIE_SPAWN_MAX_DIST = 40;
const ZOMBIE_HIT_STUN_TIME = 0.5;

let zombieBaseModel = null;
let zombieAnimClips = {};
let girlZombieBaseModel = null;
let girlZombieAnimClips = {};
let zombies = [];
let zombieMeshesForRaycast = [];

let playerHP = 100;
let playerMaxHP = 100;
let isGameOver = false;
let killCount = 0;

const hpFillEl = document.getElementById('hp-fill');
const hpTextEl = document.getElementById('hp-text');
const damageFlashEl = document.getElementById('damage-flash');
const gameOverEl = document.getElementById('game-over');
const killCountEl = document.getElementById('kill-count');

function updateHPDisplay() {
    const pct = Math.max(0, playerHP / playerMaxHP * 100);
    if (hpFillEl) hpFillEl.style.width = pct + '%';
    if (hpTextEl) hpTextEl.textContent = Math.max(0, playerHP);
    if (hpFillEl) {
        if (pct > 50) hpFillEl.style.background = 'linear-gradient(90deg, #33cc33, #66ff66)';
        else if (pct > 25) hpFillEl.style.background = 'linear-gradient(90deg, #cccc33, #ffff66)';
        else hpFillEl.style.background = 'linear-gradient(90deg, #ff3333, #ff6666)';
    }
}

function damagePlayer(amount) {
    if (isGameOver) return;
    playerHP -= amount;
    updateHPDisplay();

    if (damageFlashEl) {
        damageFlashEl.classList.add('active');
        setTimeout(() => damageFlashEl.classList.remove('active'), 400);
    }

    if (playerHP <= 0) {
        playerHP = 0;
        isGameOver = true;
        isAiming = false;
        if (gameOverEl) gameOverEl.classList.remove('hidden');
        stopFiring();
        document.exitPointerLock();
        submitAndShowRanking(killCount);
    }
}

function updateKillCount() {
    killCount++;
    if (killCountEl) killCountEl.textContent = 'KILLS: ' + killCount;
}

// ============================================================
// 랭킹 시스템
// ============================================================
const gameOverKillsEl = document.getElementById('game-over-kills');
const myBestEl = document.getElementById('my-best');
const leaderboardListEl = document.getElementById('leaderboard-list');

async function submitAndShowRanking(score) {
    if (gameOverKillsEl) gameOverKillsEl.textContent = 'KILLS: ' + score;

    try {
        await MSW.Ranking.submitScore(score);

        const leaderboard = await MSW.Ranking.getLeaderboard(10);
        if (leaderboardListEl && leaderboard) {
            leaderboardListEl.innerHTML = '';
            for (const entry of leaderboard) {
                const li = document.createElement('li');
                li.innerHTML = `<span class="rank-num">#${entry.rank}</span><span class="rank-name">${entry.playerName || '---'}</span><span class="rank-score">${entry.score}</span>`;
                leaderboardListEl.appendChild(li);
            }
        }

        const myBest = await MSW.Ranking.getMyBestScore();
        if (myBestEl && myBest) {
            myBestEl.textContent = `MY BEST: ${myBest.score} (Rank #${myBest.rank})`;
        }
    } catch (err) {
        console.warn('[RANKING] Error:', err.message || err);
    }
}

// ============================================================
// 게임 리스타트
// ============================================================
function restartGame() {
    for (const z of zombies) {
        scene.remove(z.model);
        scene.remove(z.hitbox);
        z.hitbox.geometry.dispose();
        z.hitbox.material.dispose();
        z.model.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            }
        });
    }
    zombies.length = 0;
    zombieMeshesForRaycast.length = 0;

    playerHP = playerMaxHP;
    isGameOver = false;
    killCount = 0;

    currentAmmo = MAX_AMMO;
    isFiring = false;
    isReloading = false;
    shotsFired = 0;
    reloadPhase = 0;
    reloadTimer = 0;
    reloadOffset.y = 0;
    reloadOffset.rotX = 0;
    isPlayingGLBAnimation = false;
    currentAnimAction = null;

    const restartFloorY = stageBounds ? stageBounds.min.y : 0;
    camera.position.set(stageCenter.x, restartFloorY + EYE_HEIGHT, stageCenter.z);
    camera.fov = DEFAULT_FOV;
    camera.updateProjectionMatrix();
    yaw = 0;
    pitch = 0;
    recoilPitch = 0;
    recoilYaw = 0;
    isAiming = false;
    adsGunPos.copy(gunOrigPos);
    hitStopTimer = 0;
    shakeIntensity = 0;
    gunKick.z = 0;
    gunKick.rotX = 0;
    gunKick.rotZ = 0;

    isDrawing = true;
    drawTimer = 0;
    drawOffset.y = -0.3;
    drawOffset.rotX = 0.2;

    updateHPDisplay();
    updateAmmoDisplay();
    if (killCountEl) killCountEl.textContent = 'KILLS: 0';
    if (gameOverEl) gameOverEl.classList.add('hidden');
    if (leaderboardListEl) leaderboardListEl.innerHTML = '';
    if (myBestEl) myBestEl.textContent = '';
    if (gameOverKillsEl) gameOverKillsEl.textContent = '';
    if (reloadIndicatorEl) reloadIndicatorEl.classList.add('hidden');

    updateRaycastTargets();
    spawnZombies();
}

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
    restartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restartGame();
    });
}

const fbxLoader = new FBXLoader();

function loadFBX(url) {
    return new Promise((resolve, reject) => {
        fbxLoader.load(url, resolve, undefined, reject);
    });
}

function retargetClipTrackNames(clip, targetModel) {
    const boneNames = new Set();
    targetModel.traverse((child) => {
        boneNames.add(child.name);
    });

    for (const track of clip.tracks) {
        const dotIdx = track.name.indexOf('.');
        if (dotIdx < 0) continue;
        const objName = track.name.substring(0, dotIdx);
        const propName = track.name.substring(dotIdx);

        if (boneNames.has(objName)) continue;

        for (const boneName of boneNames) {
            if (objName.endsWith(boneName)) {
                track.name = boneName + propName;
                break;
            }
        }
    }
}

async function loadZombieAssets() {
    try {
        console.log('[ZOMBIE] 모델 로딩 시작...');

        const standardFbx = await loadFBX(ZOMBIE_FBX_URLS.standard);
        zombieBaseModel = standardFbx;

        const bbox = new THREE.Box3().setFromObject(standardFbx);
        const modelHeight = bbox.max.y - bbox.min.y;
        console.log(`[ZOMBIE] police 원본 높이: ${modelHeight.toFixed(2)}, 스케일: ${standardFbx.scale.x.toFixed(4)}`);
        const zombieScale = 0.01;
        standardFbx.scale.setScalar(zombieScale);

        if (standardFbx.animations && standardFbx.animations.length > 0) {
            zombieAnimClips.idle = standardFbx.animations[0];
            console.log('[ZOMBIE] police idle 애니메이션 로드 완료');
        }

        const animNames = ['run', 'attack', 'reaction', 'death'];
        for (const name of animNames) {
            try {
                const fbx = await loadFBX(ZOMBIE_FBX_URLS[name]);
                if (fbx.animations && fbx.animations.length > 0) {
                    const clip = fbx.animations[0];
                    retargetClipTrackNames(clip, standardFbx);
                    zombieAnimClips[name] = clip;
                    console.log(`[ZOMBIE] police ${name} 애니메이션 로드 완료 (${clip.duration.toFixed(2)}s)`);
                }
            } catch (err) {
                console.warn(`[ZOMBIE] police ${name} 애니메이션 로드 실패:`, err.message);
            }
        }
        console.log('[ZOMBIE] police 에셋 로드 완료. 애니메이션:', Object.keys(zombieAnimClips));

        const girlRunFbx = await loadFBX(GIRL_ZOMBIE_FBX_URLS.run);
        girlZombieBaseModel = girlRunFbx;

        const girlBbox = new THREE.Box3().setFromObject(girlRunFbx);
        const girlHeight = girlBbox.max.y - girlBbox.min.y;
        console.log(`[ZOMBIE] girl 원본 높이: ${girlHeight.toFixed(2)}, 스케일: ${girlRunFbx.scale.x.toFixed(4)}`);
        girlRunFbx.scale.setScalar(zombieScale);

        if (girlRunFbx.animations && girlRunFbx.animations.length > 0) {
            girlZombieAnimClips.idle = girlRunFbx.animations[0];
            girlZombieAnimClips.run = girlRunFbx.animations[0];
            console.log('[ZOMBIE] girl idle/run 애니메이션 로드 완료');
        }

        const girlAnimNames = ['attack', 'reaction', 'death'];
        for (const name of girlAnimNames) {
            try {
                const fbx = await loadFBX(GIRL_ZOMBIE_FBX_URLS[name]);
                if (fbx.animations && fbx.animations.length > 0) {
                    const clip = fbx.animations[0];
                    retargetClipTrackNames(clip, girlRunFbx);
                    girlZombieAnimClips[name] = clip;
                    console.log(`[ZOMBIE] girl ${name} 애니메이션 로드 완료 (${clip.duration.toFixed(2)}s)`);
                }
            } catch (err) {
                console.warn(`[ZOMBIE] girl ${name} 애니메이션 로드 실패:`, err.message);
            }
        }
        console.log('[ZOMBIE] girl 에셋 로드 완료. 애니메이션:', Object.keys(girlZombieAnimClips));

        spawnZombies();

    } catch (err) {
        console.error('[ZOMBIE] 모델 로드 실패:', err);
    }
}

function createZombie(position, type) {
    if (!type) {
        type = (Math.random() < 0.5 && girlZombieBaseModel) ? 'girl' : 'police';
    }

    const baseModel = (type === 'girl') ? girlZombieBaseModel : zombieBaseModel;
    const animClips = (type === 'girl') ? girlZombieAnimClips : zombieAnimClips;
    const model = SkeletonUtils.clone(baseModel);

    model.scale.setScalar(0.01);

    const zombieFloorY = stageBounds ? stageBounds.min.y : 0;
    model.position.set(position.x, zombieFloorY, position.z);

    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
                const mat = child.material;
                mat.alphaMap = null;
                mat.transparent = false;
                mat.opacity = 1.0;
                mat.alphaTest = 0;
                mat.depthWrite = true;
                mat.side = THREE.FrontSide;

                if (mat.map) {
                    mat.map.premultiplyAlpha = false;
                    mat.map.needsUpdate = true;
                }

                mat.needsUpdate = true;
            }
        }
    });

    scene.add(model);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};

    for (const [name, clip] of Object.entries(animClips)) {
        const action = mixer.clipAction(clip);
        actions[name] = action;
        if (name === 'death') {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
        }
        if (name === 'reaction') {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
        }
    }

    const meshes = [];
    model.traverse((child) => {
        if (child.isMesh) meshes.push(child);
    });

    const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.8, 0.6),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.set(position.x, zombieFloorY + 0.9, position.z);
    scene.add(hitbox);

    const zombie = {
        model,
        mixer,
        actions,
        meshes,
        hitbox,
        hp: ZOMBIE_HP,
        state: 'run',
        attackTimer: 0,
        attackHit: false,
        hitTimer: 0,
        deathTimer: 0,
        alive: true,
        zombieType: type,
    };

    hitbox.userData.zombieRef = zombie;

    if (actions.run) {
        actions.run.reset().play();
    } else if (actions.idle) {
        actions.idle.reset().play();
    }

    zombies.push(zombie);
    zombieMeshesForRaycast.push(hitbox);

    return zombie;
}

function getSpawnPosition() {
    const angle = Math.random() * Math.PI * 2;
    const dist = ZOMBIE_SPAWN_MIN_DIST + Math.random() * (ZOMBIE_SPAWN_MAX_DIST - ZOMBIE_SPAWN_MIN_DIST);
    let x = camera.position.x + Math.cos(angle) * dist;
    let z = camera.position.z + Math.sin(angle) * dist;
    if (stageBounds) {
        x = Math.max(stageBounds.min.x + 2, Math.min(stageBounds.max.x - 2, x));
        z = Math.max(stageBounds.min.z + 2, Math.min(stageBounds.max.z - 2, z));
    }
    return new THREE.Vector3(x, 0, z);
}

function spawnZombies() {
    for (let i = 0; i < ZOMBIE_COUNT; i++) {
        const pos = getSpawnPosition();
        createZombie(pos);
    }
    updateRaycastTargets();
}

function hitZombie(zombie) {
    if (!zombie.alive) return;

    hitStopTimer = 0.03;
    shakeIntensity = 0.008;

    const knockDir = zombie.model.position.clone()
        .sub(camera.position).normalize();
    knockDir.y = 0;
    if (!checkZombieWallCollision(zombie.model.position, knockDir)) {
        zombie.model.position.addScaledVector(knockDir, 0.3);
    }

    zombie.hp--;

    if (zombie.hp <= 0) {
        killZombie(zombie);
    } else {
        if (zombie.state === 'hit') {
            if (zombie.actions.reaction) {
                zombie.actions.reaction.reset().play();
            }
        } else {
            Object.values(zombie.actions).forEach(a => {
                if (a !== zombie.actions.reaction && a.isRunning()) {
                    a.fadeOut(0.05);
                }
            });
            if (zombie.actions.reaction) {
                zombie.actions.reaction.reset().setEffectiveWeight(1).fadeIn(0.05).play();
            }
        }
        zombie.state = 'hit';
        zombie.hitTimer = zombieAnimClips.reaction ? zombieAnimClips.reaction.duration : 0.5;
    }
}

function killZombie(zombie) {
    zombie.alive = false;
    zombie.state = 'dying';
    Object.values(zombie.actions).forEach(a => {
        if (a.isRunning()) a.fadeOut(0.1);
    });
    if (zombie.actions.death) {
        zombie.actions.death.reset().setEffectiveWeight(1).fadeIn(0.1).play();
    }
    updateKillCount();
    const deathDuration = zombieAnimClips.death?.duration || 2;
    zombie.deathTimer = deathDuration + 3;
}

function playZombieAction(zombie, actionName) {
    const newAction = zombie.actions[actionName];
    if (!newAction) return;
    const current = Object.values(zombie.actions).find(
        a => a.isRunning() && a !== newAction
    );
    if (current) {
        current.fadeOut(0.15);
    }
    newAction.reset().fadeIn(0.15).play();
}

function updateZombies(dt) {
    if (isGameOver) return;

    const playerPos = camera.position.clone();
    playerPos.y = camera.position.y - EYE_HEIGHT;

    for (let i = zombies.length - 1; i >= 0; i--) {
        const z = zombies[i];

        const distToPlayer = z.model.position.distanceTo(camera.position);
        if (distToPlayer < 15) {
            z.mixer.update(dt);
        } else if (distToPlayer < 30) {
            z.mixer.update(dt * 2);
        } else {
            z.mixer.update(dt * 4);
        }

        if (z.state === 'dying') {
            z.deathTimer -= dt;
            if (z.deathTimer <= 0) {
                scene.remove(z.model);
                scene.remove(z.hitbox);
                z.hitbox.geometry.dispose();
                z.hitbox.material.dispose();
                z.model.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry?.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                            else child.material.dispose();
                        }
                    }
                });
                const hitIdx = zombieMeshesForRaycast.indexOf(z.hitbox);
                if (hitIdx !== -1) zombieMeshesForRaycast.splice(hitIdx, 1);
                zombies.splice(i, 1);
                z.state = 'dead';
                updateRaycastTargets();

                const respawnPos = getSpawnPosition();
                createZombie(respawnPos);
                updateRaycastTargets();
            }
            continue;
        }

        if (!z.alive) continue;

        if (z.state === 'hit') {
            z.hitTimer -= dt;
            if (z.hitTimer <= 0) {
                z.state = 'run';
                if (z.actions.reaction) {
                    z.actions.reaction.fadeOut(0.15);
                }
                if (z.actions.run) {
                    z.actions.run.reset().setEffectiveWeight(1).fadeIn(0.15).play();
                }
            }
            z.hitbox.position.set(z.model.position.x, z.model.position.y + 0.9, z.model.position.z);
            continue;
        }

        const zombiePos = z.model.position.clone();
        zombiePos.y = 0;
        const toPlayer = playerPos.clone().sub(zombiePos);
        const dist = toPlayer.length();

        const lookTarget = new THREE.Vector3(playerPos.x, z.model.position.y, playerPos.z);
        z.model.lookAt(lookTarget);

        if (dist < ZOMBIE_ATTACK_RANGE) {
            if (z.state !== 'attack') {
                z.state = 'attack';
                z.attackTimer = 0;
                z.attackHit = false;
                playZombieAction(z, 'attack');
            }

            z.attackTimer += dt;

            if (!z.attackHit && z.attackTimer >= ZOMBIE_ATTACK_HIT_TIME) {
                if (dist < ZOMBIE_ATTACK_RANGE) {
                    damagePlayer(ZOMBIE_ATTACK_DAMAGE);
                }
                z.attackHit = true;
            }

            if (z.attackTimer >= ZOMBIE_ATTACK_COOLDOWN) {
                z.attackTimer = 0;
                z.attackHit = false;
                playZombieAction(z, 'attack');
            }
        } else {
            if (z.state !== 'run') {
                z.state = 'run';
                playZombieAction(z, 'run');
            }

            const moveDir = toPlayer.normalize().multiplyScalar(ZOMBIE_SPEED * dt);
            if (!checkZombieWallCollision(z.model.position, moveDir)) {
                z.model.position.add(moveDir);
            }
            if (stageBounds) {
                z.model.position.x = Math.max(stageBounds.min.x + 1, Math.min(stageBounds.max.x - 1, z.model.position.x));
                z.model.position.z = Math.max(stageBounds.min.z + 1, Math.min(stageBounds.max.z - 1, z.model.position.z));
            }
            const zFloorY = getFloorHeight(z.model.position.x, z.model.position.z, z.model.position.y);
            z.model.position.y = zFloorY;
        }

        z.hitbox.position.set(z.model.position.x, z.model.position.y + 0.9, z.model.position.z);
    }
}

// ============================================================
// 연사 시스템
// ============================================================
let isFiring = false;
let isReloading = false;
let lastFireTime = 0;
const FIRE_RATE_MS = 100;

function fireSingleShot() {
    if (currentAmmo <= 0) { stopFiring(); startReload(); return; }
    if (isReloading) { stopFiring(); return; }

    currentAmmo--;
    shotsFired++;
    updateAmmoDisplay();
    fireRaycast();

    recoilPitch += 0.012 + Math.random() * 0.006;
    recoilYaw += (Math.random() - 0.5) * 0.008;

    gunKick.z += 0.06;
    gunKick.rotX -= 0.07;
    gunKick.rotZ += (Math.random() - 0.5) * 0.03;

    crosshairTarget = 12 + shotsFired * 1.5;

    showMuzzleFlash();
}

function startFiring() {
    if (isFiring || isReloading || isSprinting || isGameOver) return;
    if (currentAmmo <= 0) { startReload(); return; }
    isFiring = true;
    shotsFired = 0;
    if (spreadResetTimer) { clearTimeout(spreadResetTimer); spreadResetTimer = null; }
    lastFireTime = FIRE_RATE_MS;
}

function stopFiring() {
    if (!isFiring) return;
    isFiring = false;
    if (spreadResetTimer) clearTimeout(spreadResetTimer);
    spreadResetTimer = setTimeout(() => { shotsFired = 0; }, 300);
}

function updateFiring(dt) {
    if (!isFiring || isReloading || isGameOver) return;
    lastFireTime += dt * 1000;
    if (lastFireTime >= FIRE_RATE_MS) {
        lastFireTime -= FIRE_RATE_MS;
        fireSingleShot();
    }
}

// ============================================================
// 재장전
// ============================================================
let reloadPhase = 0;
let reloadTimer = 0;
const RELOAD_DOWN_TIME = 0.3;
const RELOAD_UP_TIME = 0.4;

const reloadOffset = { y: 0, rotX: 0 };

function startReload() {
    if (isReloading || currentAmmo >= MAX_AMMO) return;
    isReloading = true;
    stopFiring();
    reloadPhase = 1;
    reloadTimer = 0;
    if (reloadIndicatorEl) reloadIndicatorEl.classList.remove('hidden');
}

function updateReload(dt) {
    if (!isReloading) return;
    reloadTimer += dt;

    if (reloadPhase === 1) {
        const t = Math.min(reloadTimer / RELOAD_DOWN_TIME, 1);
        const ease = t * t;
        reloadOffset.y = -0.25 * ease;
        reloadOffset.rotX = 0.4 * ease;
        if (t >= 1) {
            reloadPhase = 2;
            reloadTimer = 0;
            startReloadIdleAnim();
        }
    } else if (reloadPhase === 2) {
        reloadOffset.y = -0.25;
        reloadOffset.rotX = 0.4;
    } else if (reloadPhase === 3) {
        const t = Math.min(reloadTimer / RELOAD_UP_TIME, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        reloadOffset.y = -0.25 * (1 - ease);
        reloadOffset.rotX = 0.4 * (1 - ease);
        if (t >= 1) { finishReload(); }
    }
}

function startReloadIdleAnim() {
    if (!gunMixer || !glbAnimClips['idle']) {
        setTimeout(() => {
            onReloadIdleFinished();
        }, 1000);
        return;
    }

    if (currentAnimAction) {
        currentAnimAction.fadeOut(0.1);
    }

    const clip = glbAnimClips['idle'];
    const action = gunMixer.clipAction(clip);
    action.reset();
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce);
    action.fadeIn(0.15);
    action.play();

    currentAnimAction = action;
    isPlayingGLBAnimation = true;

    const onFinished = (e) => {
        if (e.action === action) {
            gunMixer.removeEventListener('finished', onFinished);
            onReloadIdleFinished();
        }
    };
    gunMixer.addEventListener('finished', onFinished);
}

function onReloadIdleFinished() {
    if (currentAnimAction) {
        currentAnimAction.fadeOut(0.2);
        currentAnimAction = null;
    }
    isPlayingGLBAnimation = false;
    reloadPhase = 3;
    reloadTimer = 0;
}

function finishReload() {
    currentAmmo = MAX_AMMO;
    isReloading = false;
    reloadPhase = 0;
    reloadOffset.y = 0;
    reloadOffset.rotX = 0;
    isPlayingGLBAnimation = false;
    currentAnimAction = null;
    updateAmmoDisplay();
    if (reloadIndicatorEl) reloadIndicatorEl.classList.add('hidden');
}

// ============================================================
// Draw 애니메이션
// ============================================================
let isDrawing = true;
let drawTimer = 0;
const DRAW_DURATION = 0.8;
const drawOffset = { y: -0.3, rotX: 0.2 };

function updateDraw(dt) {
    if (!isDrawing) return;
    drawTimer += dt;
    const t = Math.min(drawTimer / DRAW_DURATION, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    drawOffset.y = -0.3 * (1 - ease);
    drawOffset.rotX = 0.2 * (1 - ease);
    if (t >= 1) { isDrawing = false; drawOffset.y = 0; drawOffset.rotX = 0; }
}

// ============================================================
// 반동 업데이트
// ============================================================
function updateRecoil(dt) {
    if (recoilPitch > 0) {
        const recovery = RECOIL_RECOVERY * dt;
        recoilPitch = Math.max(0, recoilPitch - recovery * recoilPitch);
    }
    recoilYaw *= Math.max(0, 1 - 8 * dt);

    gunKick.z += (0 - gunKick.z) * GUN_KICK_RETURN_SPEED;
    gunKick.rotX += (0 - gunKick.rotX) * GUN_KICK_RETURN_SPEED;
    gunKick.rotZ += (0 - gunKick.rotZ) * GUN_KICK_RETURN_SPEED;
}

// ============================================================
// 크로스헤어 업데이트
// ============================================================
function updateCrosshair(dt) {
    if (isAiming) {
        crosshairTarget = 0;
    } else if (!isFiring) {
        if (isMoving) {
            crosshairTarget = isSprinting ? 12 : 7;
        } else {
            crosshairTarget = 4;
        }
    }
    crosshairSpread += (crosshairTarget - crosshairSpread) * Math.min(1, 12 * dt);
    crosshairUpdateCounter++;
    if (crosshairUpdateCounter % 3 === 0) {
        updateCrosshairDOM();
    }
}

// ============================================================
// ADS 업데이트
// ============================================================
function updateADS(dt) {
    const targetFOV = isAiming ? ADS_FOV : DEFAULT_FOV;
    camera.fov += (targetFOV - camera.fov) * Math.min(1, ADS_LERP_SPEED * dt);
    camera.updateProjectionMatrix();

    const targetPos = isAiming ? ADS_GUN_POS : gunOrigPos;
    adsGunPos.x += (targetPos.x - adsGunPos.x) * Math.min(1, ADS_LERP_SPEED * dt);
    adsGunPos.y += (targetPos.y - adsGunPos.y) * Math.min(1, ADS_LERP_SPEED * dt);
    adsGunPos.z += (targetPos.z - adsGunPos.z) * Math.min(1, ADS_LERP_SPEED * dt);
}

// ============================================================
// 총기 위치 업데이트
// ============================================================
function updateGunPosition(dt) {
    if (!gunModel) return;

    if (isPlayingGLBAnimation) return;

    const gunBob = getGunBob();
    const breath = getBreathOffset();

    let px = adsGunPos.x;
    let py = adsGunPos.y;
    let pz = adsGunPos.z;

    px += gunBob.x;
    py += gunBob.y;

    if (!isMoving) {
        const breathMult = isAiming ? ADS_BOB_SWAY_MULT : 1;
        px += breath.x * breathMult;
        py += breath.y * breathMult;
    }

    px += swayX;
    py += swayY;
    pz += gunKick.z;
    py += reloadOffset.y;
    py += drawOffset.y;

    gunModel.position.set(px, py, pz);

    let rx = gunOrigRot.x + gunKick.rotX + reloadOffset.rotX + drawOffset.rotX;
    let ry = gunOrigRot.y;
    let rz = gunOrigRot.z + gunKick.rotZ + gunBob.roll + swayX * 0.5;

    gunModel.rotation.set(rx, ry, rz);

    if (muzzleFlashSprite) {
        const adsDx = adsGunPos.x - gunOrigPos.x;
        const adsDy = adsGunPos.y - gunOrigPos.y;
        const adsDz = adsGunPos.z - gunOrigPos.z;
        let mfx = mfDebugState.x + adsDx + gunBob.x + swayX;
        let mfy = mfDebugState.y + adsDy + gunBob.y + swayY + reloadOffset.y + drawOffset.y;
        let mfz = mfDebugState.z + adsDz + gunKick.z;
        if (!isMoving) {
            const breathMult = isAiming ? ADS_BOB_SWAY_MULT : 1;
            mfx += breath.x * breathMult;
            mfy += breath.y * breathMult;
        }
        muzzleFlashSprite.position.set(mfx, mfy, mfz);
    }
}

// ============================================================
// 텍스처 URL 리다이렉트 LoadingManager
// ============================================================
const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/sukyonghyun-sudo/fps@main/textures/';
const textureMap = {
    'ak74color.png': 'ak74Color.png',
    'ak74smoothness.png': 'aksmoothness.png',
    'ak74normal.png': 'ak74Normal.png',
    'armcolor.png': 'armColor.png',
    'armnormal_2.png': 'armNormal.png',
    'armnormal.png': 'armNormal.png',
    'armglovedspecular.png': 'armmetallic.png',
};

const loadingManager = new THREE.LoadingManager();
loadingManager.setURLModifier((url) => {
    const fileName = url.replace(/\\/g, '/').split('/').pop().toLowerCase();
    if (textureMap[fileName]) return TEXTURE_BASE + textureMap[fileName];
    if (/\.(png|jpg|jpeg|tga|bmp)$/i.test(fileName) && (url.includes('..') || url.includes('bakes') || url.includes('tex'))) {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQkSuQmCC';
    }
    return url;
});

const gltfLoader = new GLTFLoader(loadingManager);

const GLB_URLS = {
    full: [
        'https://cdn.jsdelivr.net/gh/sukyonghyun-sudo/fps@main/source/arms@ak_full.glb',
        'https://raw.githubusercontent.com/sukyonghyun-sudo/fps/main/source/arms%40ak_full.glb',
    ],
};

const ANIM_GLB_URLS = {
    idle: 'https://cdn.jsdelivr.net/gh/sukyonghyun-sudo/fps@main/source/arms@ak_idle.glb',
    fire: 'https://cdn.jsdelivr.net/gh/sukyonghyun-sudo/fps@main/source/arms@ak_fire.glb',
    draw: 'https://cdn.jsdelivr.net/gh/sukyonghyun-sudo/fps@main/source/arms@ak_draw.glb',
    reload: 'https://cdn.jsdelivr.net/gh/sukyonghyun-sudo/fps@main/source/arms@ak_reload.glb',
};

async function loadGLBWithFallback(urls) {
    for (const url of urls) {
        try {
            return await new Promise((resolve, reject) => {
                gltfLoader.load(url, resolve, undefined, reject);
            });
        } catch (err) {
            console.warn(`[GLB] 실패: ${url}`, err.message || err);
        }
    }
    return null;
}

// ============================================================
// 로딩 상태 UI
// ============================================================
const loadingStatusEl = document.getElementById('loading-status');
function showStatus(msg, type) {
    if (!loadingStatusEl) return;
    loadingStatusEl.textContent = msg;
    loadingStatusEl.className = type || '';
}

// ============================================================
// 메인 로드 시퀀스
// ============================================================
try {
    showStatus('모델 로딩 중...');

    const fullGltf = await loadGLBWithFallback(GLB_URLS.full);
    if (!fullGltf) throw new Error('full.glb 로드 실패');

    gunModel = fullGltf.scene;
    gunModel.scale.setScalar(GUN_SCALE);
    gunModel.position.copy(gunOrigPos);
    gunModel.rotation.copy(gunOrigRot);

    gunModel.traverse((child) => {
        if (child.isMesh) {
            let shouldHide = false;
            const vertCount = child.geometry.attributes.position.count;
            const mat = child.material;
            const hasMap = !!(mat && mat.map);
            const meshName = (child.name || '').toLowerCase();

            if (vertCount <= 100) shouldHide = true;

            if (mat && mat.color && !hasMap) {
                const c = mat.color;
                if (c.r + c.g + c.b < 0.5) shouldHide = true;
            }

            if (/effect|particle|plane|quad|billboard|sprite|shadow|decal|glow/i.test(meshName))
                shouldHide = true;

            if (mat && (mat.transparent === true || mat.opacity < 1.0))
                shouldHide = true;

            if (mat && mat.blending && mat.blending !== THREE.NormalBlending)
                shouldHide = true;

            if (shouldHide) {
                child.visible = false;
                return;
            }

            child.renderOrder = 999;
            child.castShadow = true;
            child.receiveShadow = true;
            if (mat) {
                mat.alphaMap = null;
                mat.transparent = false;
                mat.opacity = 1.0;
                mat.alphaTest = 0;
                mat.depthWrite = true;
                mat.depthTest = true;
                mat.side = THREE.FrontSide;
                if (mat.map) {
                    mat.map.premultiplyAlpha = false;
                    mat.map.needsUpdate = true;
                }

                if (mat.isMeshStandardMaterial) {
                    if (envMap) {
                        mat.envMap = envMap;
                        mat.envMapIntensity = mat.metalness > 0.3 ? 1.8 : 1.0;
                    }
                    if (mat.map) mat.map.anisotropy = maxAniso;
                    if (mat.normalMap) mat.normalMap.anisotropy = maxAniso;
                    if (mat.roughnessMap) mat.roughnessMap.anisotropy = maxAniso;
                    if (mat.metalnessMap) mat.metalnessMap.anisotropy = maxAniso;
                }
                mat.needsUpdate = true;
            }
        }
    });

    gunMixer = new THREE.AnimationMixer(gunModel);

    gunLight = new THREE.PointLight(0xffaa44, 0, 3, 2);
    gunLight.position.set(0.1, 0.0, -0.5);
    camera.add(gunLight);

    scene.add(camera);
    camera.add(gunModel);

    createMuzzleFlash();

    stageLoadPromise.then(() => {
        loadZombieAssets();
    });

    if (ammoDisplayEl) { ammoDisplayEl.classList.remove('hidden'); updateAmmoDisplay(); }
    updateHPDisplay();

    showStatus('✓ 로드 완료', 'success');
    setTimeout(() => { if (loadingStatusEl) loadingStatusEl.classList.add('hidden'); }, 3000);

} catch (err) {
    console.error('[GLB] 로드 실패:', err);
    showStatus(`✗ 모델 로드 실패: ${err.message}`, 'error');
    scene.add(camera);
}

// ============================================================
// 애니메이션 GLB 로드 시스템
// ============================================================
let glbAnimClips = {};
let currentAnimAction = null;
let isPlayingGLBAnimation = false;
let animBoneNames = [];

function collectBoneNames() {
    if (!gunModel) return;
    animBoneNames = [];
    gunModel.traverse((child) => {
        if (child.isBone || child.isSkinnedMesh || child.name) {
            animBoneNames.push(child.name);
        }
    });
    console.log('[ANIM] full.glb 본/노드 이름 목록:', animBoneNames);
}

function remapClipTracks(clip) {
    const remappedTracks = [];
    let matchCount = 0;
    let failCount = 0;

    for (const track of clip.tracks) {
        const dotIdx = track.name.lastIndexOf('.');
        if (dotIdx === -1) {
            remappedTracks.push(track);
            continue;
        }

        const nodePart = track.name.substring(0, dotIdx);
        const propPart = track.name.substring(dotIdx);

        if (animBoneNames.includes(nodePart)) {
            remappedTracks.push(track);
            matchCount++;
            continue;
        }

        const lowerNodePart = nodePart.toLowerCase();
        let matched = animBoneNames.find(name => name.toLowerCase() === lowerNodePart);

        if (!matched && nodePart.includes('|')) {
            const stripped = nodePart.split('|').pop();
            matched = animBoneNames.find(name => name === stripped);
            if (!matched) {
                matched = animBoneNames.find(name => name.toLowerCase() === stripped.toLowerCase());
            }
        }

        if (!matched && nodePart.includes(':')) {
            const stripped = nodePart.split(':').pop();
            matched = animBoneNames.find(name => name === stripped);
            if (!matched) {
                matched = animBoneNames.find(name => name.toLowerCase() === stripped.toLowerCase());
            }
        }

        if (!matched) {
            matched = animBoneNames.find(name =>
                name.toLowerCase().includes(lowerNodePart) ||
                lowerNodePart.includes(name.toLowerCase())
            );
        }

        if (matched) {
            const newTrack = track.clone();
            newTrack.name = matched + propPart;
            remappedTracks.push(newTrack);
            matchCount++;
        } else {
            remappedTracks.push(track);
            failCount++;
        }
    }

    console.log(`[ANIM] 클립 "${clip.name}" 리매핑: ${matchCount} 성공, ${failCount} 실패 / 총 ${clip.tracks.length} 트랙`);

    return new THREE.AnimationClip(clip.name, clip.duration, remappedTracks, clip.blendMode);
}

async function loadAnimationGLBs() {
    if (!gunModel || !gunMixer) return;
    collectBoneNames();

    for (const [name, url] of Object.entries(ANIM_GLB_URLS)) {
        try {
            const gltf = await new Promise((resolve, reject) => {
                gltfLoader.load(url, resolve, undefined, reject);
            });

            if (gltf.animations && gltf.animations.length > 0) {
                const originalClip = gltf.animations[0];
                console.log(`[ANIM] "${name}" 로드 성공 — 클립: "${originalClip.name}", 길이: ${originalClip.duration.toFixed(2)}s, 트랙 수: ${originalClip.tracks.length}`);

                const sampleTracks = originalClip.tracks.slice(0, 5).map(t => t.name);
                console.log(`[ANIM] "${name}" 트랙 샘플:`, sampleTracks);

                const remappedClip = remapClipTracks(originalClip);
                glbAnimClips[name] = remappedClip;
            } else {
                console.warn(`[ANIM] "${name}" — 애니메이션 클립 없음`);
            }
        } catch (err) {
            console.warn(`[ANIM] "${name}" 로드 실패:`, err.message || err);
        }
    }

    console.log('[ANIM] 로드 완료. 사용 가능한 애니메이션:', Object.keys(glbAnimClips));
}

loadAnimationGLBs();

// ============================================================
// 게임 루프
// ============================================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    let dt = clock.getDelta();
    dt = Math.min(dt, 0.1);

    if (hitStopTimer > 0) {
        hitStopTimer -= dt;
        dt = 0;
        composer.render();
        return;
    }

    updateMovement(dt);
    updateFiring(dt);
    updateMuzzleFlash(dt);
    updateBobbing(dt);
    updateSway(dt);
    updateRecoil(dt);
    updateReload(dt);
    updateDraw(dt);
    updateADS(dt);
    updateGunPosition(dt);
    updateCrosshair(dt);
    updateZombies(dt);
    updateParticles();

    const camBob = getCameraBob();
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw + recoilYaw + (Math.random() - 0.5) * shakeIntensity;
    camera.rotation.x = pitch + recoilPitch + camBob.y * 0.5 + (Math.random() - 0.5) * shakeIntensity;

    shakeIntensity *= shakeDecay;
    if (shakeIntensity < 0.0001) shakeIntensity = 0;

    if (gunMixer) gunMixer.update(dt);

    composer.render();
}

animate();

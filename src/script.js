import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import textureViridis from './textures/cm_viridis.png'
import { GenerateSDFMaterial } from './GenerateSDFMaterial'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()
const renderer = new THREE.WebGLRenderer({ canvas })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const loading = new OBJLoader().loadAsync('20230506133355-layer-0.obj')
loading.then((object) => {
  const sdfGeometry = object.children[0].geometry
  const [ sdfTex, bvh ] = sdfTexGenerate(sdfGeometry)

  const cmTexture = new THREE.TextureLoader().load(textureViridis)
  const tifTexture = new THREE.TextureLoader().load('00000.png', tick)

  tifTexture.minFilter = THREE.LinearFilter
  tifTexture.magFilter = THREE.LinearFilter

  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: 1 },
      sdfTex: { value: sdfTex },
      volumeAspect : { value: 810 / 789 },
      screenAspect : { value: sizes.width / sizes.height },
      utifTexture : { value: tifTexture },
      cmdata : { value: cmTexture },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        gl_Position = vec4(position, 1.0);
        vUv = uv;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float volumeAspect;
      uniform float screenAspect;
      uniform sampler2D sdfTex;
      uniform sampler2D utifTexture;
      uniform sampler2D cmdata;

      vec4 apply_colormap(float val) {
        val = (val - 0.5) / (0.9 - 0.5);
        return texture2D(cmdata, vec2(val, 0.5));
      }

      void main() {
        float r = screenAspect / volumeAspect;
        float aspect = r;

        vec2 vUv_;
        vUv_ = vUv;
        // vUv_.x = 0.2 * vUv.x + 0.4;
        // vUv_.y = 0.2 * vUv.y + 0.4;

        vec2 uv = vec2((vUv_.x - 0.5) * aspect, (vUv_.y - 0.5)) + vec2(0.5);
        if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return;

        float intensity = texture2D(utifTexture, uv).r;
        gl_FragColor = apply_colormap(intensity);

        float intensity_ = texture2D(sdfTex, uv).r;
        gl_FragColor = vec4(intensity_, 0.0, 0.0, 1.0);

        #include <colorspace_fragment>
      }
    `,
  })
  scene.add(new THREE.Mesh(geometry, material))

  tick()
})

window.addEventListener('resize', () => {
  // Update sizes
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  // Update camera
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.z = 3
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

function tick() {
  renderer.render(scene, camera)

  // const imgData = renderer.domElement.toDataURL('image/png')
  // const link = document.createElement('a')
  // link.href = imgData
  // link.download = 'example'
  // link.click()
}

function sdfTexGenerate(geometry) {
  const nrrd = { w: 810, h: 789, d: 1}
  const s = 1 / Math.max(nrrd.w, nrrd.h, nrrd.d)

  const matrix = new THREE.Matrix4()
  const center = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scaling = new THREE.Vector3()

  scaling.set(nrrd.w * s, nrrd.h * s, nrrd.d * s)
  matrix.compose(center, quat, scaling)

  const bvh = new MeshBVH(geometry, { maxLeafTris: 1 })
  const generateSdfPass = new FullScreenQuad(new GenerateSDFMaterial())
  generateSdfPass.material.uniforms.bvh.value.updateFrom(bvh)
  generateSdfPass.material.uniforms.matrix.value.copy(matrix)
  generateSdfPass.material.uniforms.zValue.value = 0.5

  const sdfTex = new THREE.WebGLRenderTarget(nrrd.w, nrrd.h)
  sdfTex.texture.format = THREE.RedFormat
  sdfTex.texture.type = THREE.FloatType
  sdfTex.texture.minFilter = THREE.LinearFilter
  sdfTex.texture.magFilter = THREE.LinearFilter
  renderer.setRenderTarget(sdfTex)
  generateSdfPass.render(renderer)
  renderer.setRenderTarget(null)

  return [ sdfTex, bvh ]
}


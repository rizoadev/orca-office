// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AgentData, FeedEvent } from '../../core/models/types';
import type { Mezzanine } from '../mushola-mezzanine';
import { PLACEHOLDER_MENU } from './engine-menu-data';

/**
 * Dunia Three.js + jam simulasi. Hanya memuat state yang benar-benar lintas-subsystem:
 * objek fundamental, clock, roster agent, tata letak kursi/waypoint, dan dua registry
 * geometri (monitor menyala + uap kopi) yang ditulis coffee-shop maupun seat-items lalu
 * digerakkan loop animasi. State lain tinggal di service pemiliknya.
 */
@Injectable()
export class EngineContext {
  canvas!: HTMLCanvasElement;

  overlay!: HTMLElement;

  scene!: THREE.Scene;

  camera!: THREE.PerspectiveCamera;

  renderer!: THREE.WebGLRenderer;

  controls!: OrbitControls;

  // Real data only
  agents: AgentData[] = [];

  seats: Record<string, { seat: THREE.Vector3; stand: THREE.Vector3; rot: number; y: number; topY?: number }> = {};

  waypoints: Record<string, THREE.Vector3> = {};

  playSpots: THREE.Vector3[] = [];

  steams: { m: THREE.Mesh; t: number; base: number }[] = [];

  screens: { m: THREE.MeshBasicMaterial; base: number; ph: number }[] = [];

  // Mezanine mushola di belakang kiri. Waypoint tangganya ikut didaftarkan supaya
  // agent bisa naik tanpa perubahan pada kode pergerakan.
  mezzanine: Mezzanine | null = null;

  clock = new THREE.Clock();

  simMs = 0;

  speed = 1;

  paused = false;

  labelsOn = true;

  tv = new THREE.Vector3();

  onStateChange?: () => void;

  onLiveMessage?: (msg: string) => void;

  onToast?: (msg: string) => void;

  /** Persis isi konstruktor OfficeEngine lama (scene→camera→renderer→controls). */
  attach(canvas: HTMLCanvasElement, overlay: HTMLElement) {
this.canvas = canvas;
    this.overlay = overlay;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030817);
    this.scene.fog = new THREE.FogExp2(0x08111f, 0.011);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 150);
    this.camera.position.set(0, 15, 20);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.12;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 52;
    this.controls.target.set(0, 1, 2);
  }

  resize() {
    const w = this.canvas.parentElement?.clientWidth || this.canvas.clientWidth;
    const h = this.canvas.parentElement?.clientHeight || this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  handleResize = () => {
    this.resize();
  };
}

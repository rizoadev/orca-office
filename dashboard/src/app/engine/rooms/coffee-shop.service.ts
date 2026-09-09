// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { DoorService } from '../navigation/door.service';
import { GlassWallService } from '../environment/glass-walls.service';
import { MenuBoardService } from '../furniture/menu-board.service';
import { PersonService } from '../avatars/person.service';
import { SunShaftService } from '../environment/sun-shafts.service';
import { TextureFactoryService } from '../core/texture-factory.service';
import { paintSignBoard, paintSkyBackdrop } from '../core/engine-painters';
import { OFFICE_SEATS } from '../core/engine-seats';

@Injectable()
export class CoffeeShopService {
  private readonly ctx = inject(EngineContext);
  private readonly door = inject(DoorService);
  private readonly glass = inject(GlassWallService);
  private readonly menu = inject(MenuBoardService);
  private readonly person = inject(PersonService);
  private readonly sun = inject(SunShaftService);
  private readonly tex = inject(TextureFactoryService);

  initOfficeEnvironment() {
    const M = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      ms.position.set(x, y, z);
      if (ry) ms.rotation.y = ry;
      ms.castShadow = ms.receiveShadow = true;
      this.ctx.scene.add(ms);
      return ms;
    };
    const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 20) => {
      const ms = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      ms.position.set(x, y, z);
      ms.castShadow = ms.receiveShadow = true;
      this.ctx.scene.add(ms);
      return ms;
    };

    // Wood floor
    const woodTex = this.tex.createCanvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#7a5230';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 64; i++) {
        g.fillStyle = `rgba(${40 + (Math.random() * 40 | 0)},${22 + (Math.random() * 22 | 0)},10,.25)`;
        g.fillRect(0, i * 8, w, 3 + Math.random() * 4);
      }
      for (let p = 0; p < 8; p++) {
        g.fillStyle = 'rgba(20,10,4,.55)';
        g.fillRect(p * 64, 0, 2, h);
      }
    }, 6, 4);

    const gf = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 16),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, metalness: 0.08 })
    );
    gf.rotation.x = -Math.PI / 2;
    gf.position.set(0, 0, 0.3);
    gf.receiveShadow = true;
    this.ctx.scene.add(gf);

    // Rugs
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.4), M(0x7c2d12, 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1.4, 0.012, 2.6);
    rug.receiveShadow = true;
    this.ctx.scene.add(rug);

    const rug2 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), M(0x1e3a5f, 0.95));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(6.6, 0.015, 4.6);
    rug2.receiveShadow = true;
    this.ctx.scene.add(rug2);

    // Walls
    const wallM = M(0x241a12, 0.9);
    box(22, 5.4, 0.4, wallM, 0, 2.7, -6.9);

    // Latar sabana malam ditempel di dinding belakang coffeeshop, bukan di jendela kiri.
    // Posisi z sedikit di depan muka dinding (-6.7) tetapi tetap di belakang furniture
    // dan AC, supaya terbaca sebagai background ruangan dari kamera utama.
    const rearBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(21.2, 5.05),
      new THREE.MeshBasicMaterial({
        map: this.tex.createSignTex(1400, 540, paintSkyBackdrop),
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    rearBackdrop.position.set(0, 2.78, -6.665);
    rearBackdrop.renderOrder = -1;
    this.ctx.scene.add(rearBackdrop);

    // Dinding kiri: full window ber-frame supaya cahaya sore masuk ke ruangan.
    this.glass.buildWindowWall();
    // Dinding kanan: full window juga (mirror dari kiri), menghadap gap 3m ke Office Annex.
    this.glass.buildRightWindowWall();
    // box(22, 0.5, 0.4, wallM, 0, 5.1, 7.6); // removed top horizontal beam

    // Meja panjang + bar stool menempel dinding kaca, lalu berkas sinarnya.
    this.glass.buildWindowBar();
    this.sun.initSunShafts();

    // Rear room corner lights: thin vertical fixtures + soft wall/floor glow.
    const cornerLightMat = new THREE.MeshStandardMaterial({
      color: 0x2b1808,
      emissive: 0xffa33c,
      emissiveIntensity: 2.4,
      roughness: 0.45,
      metalness: 0.08,
    });
    const cornerGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffb45e,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Pojok belakang kiri: tetap jadi sudut dengan lampu. Pojok belakang kanan
    // sekarang ditempati lorong + ruang toilet, jadi lampunya dipindah ke dinding
    // lorong (lihat blok "Sconce lorong toilet" di bawah).
    [-1].forEach((side) => {
      const strip = box(0.11, 3.75, 0.08, cornerLightMat, side * 9.78, 2.65, -6.54);
      strip.castShadow = false;
      strip.receiveShadow = false;

      const backHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.05), cornerGlowMat.clone());
      backHalo.position.set(side * 9.18, 2.65, -6.64);
      this.ctx.scene.add(backHalo);

      const sideHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 4.05), cornerGlowMat.clone());
      sideHalo.position.set(side * 9.88, 2.65, -5.9);
      sideHalo.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.ctx.scene.add(sideHalo);

      const floorGlow = new THREE.Mesh(
        new THREE.CircleGeometry(0.95, 32),
        new THREE.MeshBasicMaterial({
          color: 0xff9a3c,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.set(side * 9.25, 0.018, -5.95);
      this.ctx.scene.add(floorGlow);
    });

    // Sconce lorong toilet — pengganti lampu sudut kanan, menempel di dinding kanan.
    const corridorStrip = box(0.08, 3.75, 0.11, cornerLightMat, 9.84, 2.65, -2.9);
    corridorStrip.castShadow = false;
    corridorStrip.receiveShadow = false;

    const corridorHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.05), cornerGlowMat.clone());
    corridorHalo.position.set(9.8, 2.65, -2.9);
    corridorHalo.rotation.y = -Math.PI / 2;
    this.ctx.scene.add(corridorHalo);

    const corridorFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff9a3c,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    corridorFloorGlow.rotation.x = -Math.PI / 2;
    corridorFloorGlow.position.set(9.1, 0.018, -2.9);
    this.ctx.scene.add(corridorFloorGlow);

    // Lampu sisi toilet (tembok kiri partisi lorong) sekarang terpasang tertutup
    // di balik wall panel — lihat blok "Wall panel penutup lampu" di bagian lorong
    // WC di bawah. Strip emissive mentah sebelumnya memang sengaja dihapus: karena
    // ini area toilet, fitting harus IP44 (diffuser opal), bukan bar terbuka.

    // Storefront glass. Bukaan pintu (x[4.75, 7.25]) dipotong dari panel: tanpa ini,
    // daun pintu yang mengayun ke luar menyapu bidang kaca di z=7.55.
    const DOOR_GAP: [number, number] = [4.75, 7.25];
    const clipPastDoor = (x0: number, x1: number): [number, number][] => {
      if (x1 <= DOOR_GAP[0] || x0 >= DOOR_GAP[1]) return [[x0, x1]];
      const out: [number, number][] = [];
      if (x0 < DOOR_GAP[0]) out.push([x0, DOOR_GAP[0]]);
      if (x1 > DOOR_GAP[1]) out.push([DOOR_GAP[1], x1]);
      return out;
    };
    for (let i = 0; i < 5; i++) {
      const cx = -7.2 + i * 3.6;
      clipPastDoor(cx - 1.45, cx + 1.45).forEach(([x0, x1]) => {
        const gl = new THREE.Mesh(
          new THREE.PlaneGeometry(x1 - x0, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x9fc7e8, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.4 })
        );
        gl.position.set((x0 + x1) / 2, 1.7, 7.55);
        this.ctx.scene.add(gl);
      });
    }

    // Coffee shop order counter: prominent service bar for the entry flow.
    const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

    const makeSign = (
      draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number
    ) => {
      // Ukuran canvas ditentukan dari ASPEK papan, bukan dari satuan dunia:
      // 768px tinggi sudah jauh di atas tinggi layar papan (max ~90px), jadi
      // mipmap + anisotropy cukup untuk menjaga teks tetap tajam tanpa memboroskan VRAM.
      const ch = 768;
      const cw = Math.max(256, Math.round(ch * (w / h)));
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: this.tex.createSignTex(cw, ch, draw), side: THREE.DoubleSide })
      );
      sign.position.set(x, y, z);
      this.ctx.scene.add(sign);
      return sign;
    };

    const boardBg = paintSignBoard;

    box(5.65, 0.95, 1.12, M(0x3a2517, 0.55), -5.2, 0.48, -4.9);
    box(5.85, 0.08, 1.34, M(0x1c130c, 0.35), -5.2, 1, -4.9);
    box(5.8, 0.18, 0.1, M(0xd09a58, 0.42), -5.2, 1.09, -4.22);
    box(5.7, 0.08, 0.08, new THREE.MeshStandardMaterial({ color: 0x7c2d12, emissive: 0xf59e0b, emissiveIntensity: 0.18 }), -5.2, 0.18, -4.21);
    [-7.55, -6.45, -5.35, -4.25, -3.15].forEach((x) => {
      box(0.045, 0.72, 0.08, M(0x6b3f22, 0.65), x, 0.52, -4.2);
    });

    // Back-bar equipment: menu, espresso machine, cashier, cups, and pastry case.
    // Menu board: isinya live dari tagihan. Kecil dan digantung di bawah mezanine,
    // persis di atas meja pesanan tempat antrean berhenti — papan besar di dinding
    // belakang sekarang tertutup pelantai mushola dan malah terbaca sebagai dinding.
    this.menu.menuSign = makeSign(
      (g, w, h) => this.menu.drawMenuBoard(g, w, h),
      3.0, 1.05, -5.2, 1.8, -4.45
    );



    const espressoMachine = (x: number, z: number) => {
      const group = new THREE.Group();
      group.position.set(x, 1.08, z);
      this.ctx.scene.add(group);

      const chrome = new THREE.MeshStandardMaterial({ color: 0xc4ccd6, roughness: 0.16, metalness: 0.96 });
      const darkChrome = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.2, metalness: 0.85 });
      const blackGloss = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.18, metalness: 0.45 });
      const warmBlack = new THREE.MeshStandardMaterial({ color: 0x15100b, roughness: 0.3, metalness: 0.35 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xb7792b, roughness: 0.22, metalness: 0.78 });
      const rubber = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72, metalness: 0.05 });
      const glow = new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x38bdf8, emissiveIntensity: 1.15, roughness: 0.25, metalness: 0.25 });

      const addBox = (w: number, h: number, d: number, mat: THREE.Material, lx: number, ly: number, lz: number, ry = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(lx, ly, lz);
        mesh.rotation.y = ry;
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      const addCyl = (
        rt: number,
        rb: number,
        h: number,
        mat: THREE.Material,
        lx: number,
        ly: number,
        lz: number,
        seg = 32,
        rot: [number, number, number] = [0, 0, 0]
      ) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
        mesh.position.set(lx, ly, lz);
        mesh.rotation.set(rot[0], rot[1], rot[2]);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };

      // Mesin kopi hyper-realistis: chrome body, glossy face, gauges, portafilter,
      // steam wand, milk pitcher, drip-tray grill, cups, and subtle animated steam.
      addBox(1.58, 0.58, 0.5, blackGloss, 0, 0.34, 0);
      addBox(1.72, 0.08, 0.58, chrome, 0, 0.68, 0);
      addBox(1.68, 0.07, 0.56, chrome, 0, 0.06, 0);
      addBox(1.44, 0.16, 0.035, warmBlack, 0, 0.5, 0.285);
      addBox(1.32, 0.055, 0.08, darkChrome, 0, 0.19, 0.32);
      addBox(1.52, 0.04, 0.28, darkChrome, 0, 0.1, 0.36);
      for (let i = -5; i <= 5; i++) {
        addBox(0.012, 0.012, 0.25, chrome, i * 0.12, 0.135, 0.38);
      }

      const gaugeTex = this.tex.createCanvasTex(256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#f8fafc';
        g.beginPath();
        g.arc(w / 2, h / 2, 104, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#111827';
        g.lineWidth = 10;
        g.stroke();
        g.strokeStyle = '#dc2626';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(w / 2, h / 2);
        g.lineTo(w * 0.76, h * 0.34);
        g.stroke();
        g.fillStyle = '#111827';
        g.font = '900 30px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('BAR', w / 2, h * 0.68);
      });
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.115, 40), new THREE.MeshBasicMaterial({ map: gaugeTex }));
      gauge.position.set(0, 0.53, 0.308);
      group.add(gauge);

      [-0.4, 0.4].forEach((bx) => {
        addCyl(0.1, 0.1, 0.09, chrome, bx, 0.38, 0.32, 32, [Math.PI / 2, 0, 0]);
        addCyl(0.075, 0.085, 0.08, brass, bx, 0.31, 0.35, 28, [Math.PI / 2, 0, 0]);
        addBox(0.34, 0.045, 0.06, rubber, bx + 0.22, 0.28, 0.43, -0.3);
        addCyl(0.035, 0.035, 0.08, rubber, bx + 0.38, 0.25, 0.48, 18, [Math.PI / 2, 0, 0]);
      });

      [-0.56, -0.28, 0.28, 0.56].forEach((bx, i) => {
        addCyl(0.04, 0.04, 0.035, i % 2 ? brass : chrome, bx, 0.61, 0.305, 20, [Math.PI / 2, 0, 0]);
      });
      addBox(0.38, 0.12, 0.028, glow, 0, 0.63, 0.31);

      addCyl(0.015, 0.015, 0.48, chrome, -0.76, 0.32, 0.28, 16, [-0.52, 0, 0.18]);
      addCyl(0.035, 0.035, 0.045, chrome, -0.83, 0.12, 0.41, 16, [Math.PI / 2, 0, 0]);
      addCyl(0.13, 0.1, 0.24, chrome, -0.98, 0.14, 0.23, 28);
      addBox(0.18, 0.035, 0.05, chrome, -0.83, 0.2, 0.23, 0.45);

      [-0.52, -0.22, 0.16, 0.5].forEach((cx, i) => {
        addCyl(0.075, 0.06, 0.11, M(i % 2 ? 0xfffbeb : 0xf8fafc, 0.46), cx, 0.79, -0.06, 18);
      });
      addBox(0.26, 0.025, 0.08, brass, 0.72, 0.46, 0.31);
      addCyl(0.045, 0.045, 0.09, rubber, 0.84, 0.46, 0.31, 18, [0, 0, Math.PI / 2]);

      const steam = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
      );
      steam.position.set(x - 0.8, 1.72, z + 0.38);
      this.ctx.scene.add(steam);
      this.ctx.steams.push({ m: steam, t: Math.random() * 9, base: 1.72 });

      return group;
    };

    // Grinder / back-bar block.
    box(1.2, 1.5, 0.8, M(0x111318, 0.4), -7, 1.7, -5.4);
    box(1.2, 0.1, 0.8, new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff9a3c, emissiveIntensity: 0.6 }), -7, 0.95, -5.4);
    cyl(0.34, 0.28, 0.38, new THREE.MeshStandardMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.42, roughness: 0.16, metalness: 0.25 }), -4.95, 1.54, -5.24, 32);
    cyl(0.22, 0.26, 0.22, M(0x3f2a1b, 0.45, 0.22), -4.95, 1.18, -5.24, 24);
    espressoMachine(-4.38, -4.72);
    box(0.45, 0.28, 0.32, M(0x0f172a, 0.45), -3.35, 1.2, -4.35, -0.25);
    box(0.36, 0.2, 0.04, new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x38bdf8, emissiveIntensity: 0.9 }), -3.3, 1.32, -4.18, -0.25);
    box(1.18, 0.4, 0.45, new THREE.MeshStandardMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.15 }), -6.35, 1.28, -4.22);
    [-6.7, -6.35, -6.02].forEach((x, i) => {
      cyl(0.11, 0.13, 0.09, M(i % 2 ? 0xf59e0b : 0x92400e, 0.75), x, 1.08, -4.08, 14);
    });

    // Queue guide on the floor so agents visibly walk to the counter before seating.
    box(0.08, 0.035, 2.0, M(0xd97706, 0.5), -6.75, 0.035, -2.55);
    box(0.08, 0.035, 2.0, M(0xd97706, 0.5), -3.65, 0.035, -2.55);
    box(3.18, 0.035, 0.08, M(0xd97706, 0.5), -5.2, 0.035, -1.55);

    // Standing lamp mundur ke tembok belakang, di sisi kanan ujung counter. Sengaja di
    // luar lajur jalan order→gN (z≈-2.9) supaya tidak pernah ditembus agent.
    const LAMP_X = -1.55;
    const LAMP_Z = -6.15;
    const lampBrass = new THREE.MeshStandardMaterial({ color: 0xb7792b, roughness: 0.26, metalness: 0.8 });
    const lampIron = new THREE.MeshStandardMaterial({ color: 0x1c130c, roughness: 0.5, metalness: 0.35 });
    const lampShade = new THREE.MeshStandardMaterial({
      color: 0xf7e3c0,
      emissive: 0xffb366,
      emissiveIntensity: 1.35,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    cyl(0.3, 0.36, 0.06, lampIron, LAMP_X, 0.03, LAMP_Z, 24);
    cyl(0.045, 0.05, 1.62, lampBrass, LAMP_X, 0.84, LAMP_Z, 14);
    const shade = cyl(0.26, 0.44, 0.5, lampShade, LAMP_X, 1.9, LAMP_Z, 28);
    shade.castShadow = false;
    cyl(0.055, 0.055, 0.06, lampBrass, LAMP_X, 2.18, LAMP_Z, 14);

    // Bibir bawah kap = sumber cahaya yang kelihatan, bukan cuma PointLight tak terlihat.
    const lampMouth = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lampMouth.rotation.x = Math.PI / 2;
    lampMouth.position.set(LAMP_X, 1.655, LAMP_Z);
    this.ctx.scene.add(lampMouth);

    const lampPool = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffb366,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lampPool.rotation.x = -Math.PI / 2;
    lampPool.position.set(LAMP_X, 0.02, LAMP_Z);
    this.ctx.scene.add(lampPool);

    const lampLight = new THREE.PointLight(0xffc27a, 1.5, 9, 1.7);
    lampLight.position.set(LAMP_X, 1.78, LAMP_Z);
    this.ctx.scene.add(lampLight);


    const barista = this.person.createPersonMesh(0xf59e0b, 'Barista');
    barista.g.position.set(-5.45, 0, -5.75);
    barista.g.rotation.y = 0;
    barista.aL.rotation.x = -0.55;
    barista.aR.rotation.x = -0.85;

    // Barista standby detail: apron, cap, name badge, towel, cup, and tamper.
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.68, metalness: 0.06 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.42, 0.035), apronMat);
    apron.position.set(0, 0.76, 0.205);
    apron.castShadow = true;
    barista.g.add(apron);

    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.012), new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.42, metalness: 0.2 }));
    badge.position.set(0.08, 0.88, 0.228);
    barista.g.add(badge);

    const capMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.52, metalness: 0.04 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 24), capMat);
    cap.position.set(0, 0.17, 0);
    cap.castShadow = true;
    barista.head.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.14), capMat);
    brim.position.set(0, 0.14, 0.13);
    brim.castShadow = true;
    barista.head.add(brim);

    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.035), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.86 }));
    towel.position.set(-0.23, 0.84, 0.18);
    towel.rotation.z = 0.12;
    towel.castShadow = true;
    barista.g.add(towel);

    const cupInHand = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.11, 16), new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.5, metalness: 0.08 }));
    cupInHand.position.set(-0.31, 0.72, 0.18);
    cupInHand.rotation.x = 0.2;
    cupInHand.castShadow = true;
    barista.g.add(cupInHand);

    const tamper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 18), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.28, metalness: 0.75 }));
    tamper.position.set(0.31, 0.72, 0.16);
    tamper.rotation.z = Math.PI / 2;
    tamper.castShadow = true;
    barista.g.add(tamper);

    // Columns
    [[-9.6, -1], [9.6, -1], [-9.6, 4], [9.6, 4]].forEach(([x, z]) => box(0.34, 3.4, 0.34, M(0x1d140d, 0.7), x, 1.7, z));

    // Tables helper
    // Setiap meja dicatat supaya nomornya bisa dihitung belakangan (lihat blok
    // "Nomor meja" di bawah) alih-alih di-hardcode per meja.
    const tableSpots: { x: number; z: number; ex: number; ez: number; round: boolean }[] = [];
    const oakTop = new THREE.MeshStandardMaterial({ map: this.tex.createOakTex(512, true), roughness: 0.46, metalness: 0.04 });
    const oakBase = new THREE.MeshStandardMaterial({ map: this.tex.createOakTex(512, true, 0.68), roughness: 0.62, metalness: 0.03 });
    const roundTable = (x: number, z: number, r: number) => {
      cyl(r, r, 0.08, oakTop, x, 0.72, z, 28);
      cyl(0.12, 0.3, 0.7, oakBase, x, 0.36, z, 12);
      tableSpots.push({ x, z, ex: r, ez: r, round: true });
    };
    const rectTable = (x: number, z: number, w: number, d: number) => {
      box(w, 0.07, d, oakTop, x, 0.72, z);
      [[-w / 2 + 0.15, -d / 2 + 0.15], [w / 2 - 0.15, -d / 2 + 0.15], [-w / 2 + 0.15, d / 2 - 0.15], [w / 2 - 0.15, d / 2 - 0.15]].forEach(([dx, dz]) =>
        box(0.09, 0.72, 0.09, oakBase, x + dx, 0.36, z + dz)
      );
      tableSpots.push({ x, z, ex: w / 2, ez: d / 2, round: false });
    };

    // Ground tables — area depan counter (lajur antrean x[-6.75,-3.65] z[-3.55,-1.55])
    // dibersihkan total, meja digeser ke pinggir kiri, area tengah, dan deret jendela depan.
    roundTable(-3.6, 2.2, 1.05);
    roundTable(3.4, 2, 1.05);
    rectTable(-1.4, 5, 2.6, 0.95);
    roundTable(0.6, -1.8, 0.95);
    // Meja 6 dulu duduk persis di sumbu tangga (x 1.4, z 0.95) — pelantai mushola
    // turun di x[0.6,2.0] z=-0.25, jadi meja menutup mulut tangga dan antrean naik.
    // digeser ke tengah, keluar dari sumbu itu. z sengaja tetap < 1.6: nomor kartu
    // dihitung dari urutan (z, x), naik ke 1.6+ akan mengubahnya jadi TABLE 8.
    roundTable(-0.6, 1.5, 0.9);
    roundTable(-6.95, 1.8, 0.8);
    roundTable(6.75, 1.6, 0.8);
    roundTable(4.9, -1.6, 0.8);
    rectTable(1.5, 5.9, 2.2, 0.95);

    // Back tables
    rectTable(0, -3.9, 2.6, 0.95);
    roundTable(3.6, -3.6, 1.05);
    roundTable(6.4, -3.4, 0.85);

    // Sisi kiri ditempati meja panjang jendela (buildWindowBar) — meja bulat lama
    // akan menabrak counter-nya.
    roundTable(-5.9, 6.75, 0.7);
    roundTable(-4.4, 6.75, 0.7);

    // Nomor meja — kartu tent ala kafe: kertas krem 15×11cm di atas dudukan kuningan,
    // bukan papan emissive. Jauh lebih kecil dari versi awal (0.66×0.40) yang di skala
    // dunia setara papan 66cm di atas meja kopi. Konsekuensinya disengaja: di kamera
    // default angkanya cuma ~5px dan baru kebaca setelah zoom — itu harga dari realistis.
    const CARD_W = 0.15;
    const CARD_H = 0.11;
    const STAND_H = 0.055;
    const hw = CARD_W / 2;
    const hd = CARD_H / 2;
    const cardTexW = 256;
    const cardTexH = Math.round(cardTexW / (CARD_W / CARD_H));
    const cardBrass = new THREE.MeshStandardMaterial({ color: 0xb7792b, roughness: 0.26, metalness: 0.8 });
    tableSpots
      .sort((a, b) => a.z - b.z || a.x - b.x)
      .forEach((t, i) => {
        // Jarak terjauh pusat kartu ke tepi depan (+z) dengan sudut terjauh MASIH
        // menapak di permukaan. Dulu offsetnya rasio buta (ex*0.45, ez*0.5) yang di
        // meja bundar kecil menjuntai sampai 14cm ke luar lingkaran.
        const reach = t.round ? Math.sqrt(Math.max(0, t.ex * t.ex - hw * hw)) : t.ez;
        const cz = t.z + reach - hd - 0.01;

        cyl(0.035, 0.045, 0.012, cardBrass, t.x, 0.766, cz, 12);
        cyl(0.006, 0.006, STAND_H, cardBrass, t.x, 0.76 + STAND_H / 2, cz, 6);

        const card = new THREE.Mesh(
          new THREE.PlaneGeometry(CARD_W, CARD_H),
          new THREE.MeshBasicMaterial({
            map: this.tex.createSignTex(cardTexW, cardTexH, (g, w, h) => {
              g.fillStyle = '#efe7d6';
              g.fillRect(0, 0, w, h);
              for (let s = 0; s < 260; s++) {
                g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`;
                g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
              }
              g.strokeStyle = '#3b2f22';
              g.lineWidth = Math.max(1, h * 0.014);
              g.strokeRect(w * 0.06, h * 0.09, w * 0.88, h * 0.82);
              g.lineWidth = Math.max(1, h * 0.006);
              g.strokeRect(w * 0.088, h * 0.128, w * 0.824, h * 0.744);
              g.fillStyle = '#3b2f22';
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.font = `700 ${Math.round(h * 0.115)}px ${FONT}`;
              g.fillText('TABLE', w / 2, h * 0.27);
              g.font = `900 ${Math.round(h * 0.44)}px ${FONT}`;
              g.fillText(String(i + 1), w / 2, h * 0.62);
            }),
            side: THREE.DoubleSide,
          })
        );
        card.position.set(t.x, 0.76 + STAND_H + hd, cz);
        card.rotation.x = -0.22;
        this.ctx.scene.add(card);
      });

    // Lounge & Playground
    box(2.6, 0.42, 0.9, M(0x274058, 0.85), -7.6, 0.21, 4.6, 0.2);
    box(1.5, 0.5, 0.7, M(0x0f766e, 0.85), 5.2, 0.25, -4.4);
    box(0.9, 0.35, 0.9, M(0xb45309, 0.9), 6.9, 0.18, 3.6);
    box(0.9, 0.35, 0.9, M(0x7c3aed, 0.9), 7.9, 0.18, 4.6);
    box(0.9, 0.35, 0.9, M(0x0ea5e9, 0.9), 6, 0.18, 5.4);
    box(2.2, 0.75, 1.1, M(0x14532d, 0.7), 3.4, 0.45, -4.9);
    box(2, 0.06, 0.9, new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.9 }), 3.4, 0.86, -4.9);

    // Arcade machine
    box(1, 0.9, 0.5, M(0x7c2d12, 0.6), 8.9, 0.45, 2.2);
    const arcS = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
    arcS.position.set(8.9, 0.75, 1.93);
    arcS.rotation.y = Math.PI;
    this.ctx.scene.add(arcS);

    // Tanaman hias: cannabis. Pojok belakang kanan tetap di sisi lorong toilet
    // (6.95, -0.95) supaya tidak kejebak di dalam ruang WC.
    // Daunnya digambar ke tekstur lalu ditempel ke bidang miring — siluet 7-leaflet
    // runcing itu satu-satunya bentuk yang langsung dikenali; blob Dodecahedron
    // tidak akan pernah kelihatan begitu, sekeras apa pun warnanya diganti.
    const weedLeafTex = this.tex.createSignTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const ox = w / 2;
      const oy = h * 0.94;
      const leaflet = (len: number, wid: number, teeth: number) => {
        // Sisi kanan naik ke ujung, lalu cermin turun — takik tiap langkah bikin
        // margin serrated yang jadi ciri daunnya.
        const edge: [number, number][] = [];
        for (let i = 1; i <= teeth; i++) {
          const t = i / teeth;
          const half = wid * Math.sin(Math.PI * (0.16 + 0.84 * t)) * (1 - t * 0.5);
          edge.push([half, -len * t]);
          edge.push([half * 0.48, -len * (t + 0.4 / teeth)]);
        }
        g.beginPath();
        g.moveTo(0, 0);
        edge.forEach(([px, py]) => g.lineTo(px, py));
        g.lineTo(0, -len);
        for (let i = edge.length - 1; i >= 0; i--) g.lineTo(-edge[i][0], edge[i][1]);
        g.closePath();
        g.fill();
        g.stroke();
      };
      // [derajat dari vertikal, panjang relatif] — leaflet tengah paling panjang.
      const blades: [number, number][] = [[0, 1], [-24, 0.93], [24, 0.93], [-49, 0.76], [49, 0.76], [-76, 0.52], [76, 0.52]];
      const grad = g.createLinearGradient(0, oy, 0, oy - h * 0.86);
      grad.addColorStop(0, '#2f7033');
      grad.addColorStop(1, '#15471a');
      g.fillStyle = grad;
      g.strokeStyle = 'rgba(8,36,10,.6)';
      g.lineWidth = 3;
      blades.forEach(([deg, rel]) => {
        g.save();
        g.translate(ox, oy);
        g.rotate((deg * Math.PI) / 180);
        leaflet(h * 0.86 * rel, w * 0.052 * rel, 7);
        g.restore();
      });
      g.strokeStyle = 'rgba(158,214,148,.32)';
      g.lineWidth = 2;
      blades.forEach(([deg, rel]) => {
        g.save();
        g.translate(ox, oy);
        g.rotate((deg * Math.PI) / 180);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -h * 0.84 * rel);
        g.stroke();
        g.restore();
      });
    });
    // alphaTest tanpa transparent: urutan render tetap benar dan shadow map ikut
    // memotong daun, jadi tanaman tidak melempar bayangan jadi satu blob kotak.
    const weedLeafMat = new THREE.MeshStandardMaterial({
      map: weedLeafTex,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0.02,
    });
    const weedAt = (x: number, z: number, s: number) => {
      cyl(0.3 * s, 0.22 * s, 0.34 * s, M(0x9a4a2f, 0.85), x, 0.17 * s, z, 16);
      cyl(0.315 * s, 0.315 * s, 0.045 * s, M(0x7d3a24, 0.85), x, 0.35 * s, z, 16);
      cyl(0.27 * s, 0.27 * s, 0.02, M(0x241a10, 0.95), x, 0.36 * s, z, 16);
      cyl(0.022, 0.038 * s, 1.0 * s, M(0x4d6b28, 0.8), x, 0.85 * s, z, 8);

      // Tiga tingkat daun, tiap tingkat lebih lebar dan lebih menunduk.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.35;
        const tier = i % 3;
        const size = (0.62 + tier * 0.1) * s;
        const base = (0.55 + tier * 0.3) * s;
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(size, size), weedLeafMat);
        leaf.position.set(x + Math.cos(a) * 0.06 * s, base + 0.44 * size, z + Math.sin(a) * 0.06 * s);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = -a;
        leaf.rotation.x = -0.5 - tier * 0.18;
        leaf.castShadow = true;
        this.ctx.scene.add(leaf);
      }

      // Bud di pucuk, biar puncak tanaman tidak berhenti jadi kipas rata.
      const budMat = M(0x86b061, 0.85);
      [[0, 1.34, 0.085], [0.1, 1.2, 0.06], [-0.09, 1.22, 0.06]].forEach(([dx, dy, dr]) => {
        const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(dr * s, 0), budMat);
        bud.position.set(x + dx * s, dy * s, z);
        bud.castShadow = true;
        this.ctx.scene.add(bud);
      });
    };
    [
      [-9.4, -5.9, 1.0],
      [6.95, -0.95, 0.85],
      [-9.4, 6.6, 0.95],
      [9.4, 6.6, 0.9],
      [3.2, 6.6, 0.8],
      [-3, 6.6, 0.8],
    ].forEach(([x, z, s]) => weedAt(x, z, s));

    // ---------------------------------------------------------------------
    // Lorong + ruang toilet di pojok belakang kanan.
    // Koridor : x[7.6, 9.9]  z[-4.45, -1.5]  (mulut lorong menghadap area duduk)
    // Ruang WC: x[7.6, 9.9]  z[-6.7, -4.45]
    // Dinding belakang (z=-6.9) dan dinding kanan (x=10.1) yang sudah ada
    // dipakai sebagai sisi luar ruang WC.
    // ---------------------------------------------------------------------
    const PART_T = 0.22;
    const PART_H = 3.2;
    const partM = M(0x2d2117, 0.92);
    const partTrimM = M(0x1c130c, 0.6);

    // Dinding kiri lorong.
    box(PART_T, PART_H, 5.2, partM, 7.6, PART_H / 2, -4.1);
    box(PART_T + 0.05, 0.09, 5.2, partTrimM, 7.6, 0.045, -4.1);

    // ── Wall panel penutup lampu: tembok kiri sisi toilet ──────────────────────
    // Muka luar partisi lorong dulu ada strip emissive mentah ('lampu gantung' kelihatan)
    // — tak cocok untuk toilet. Sekarang dinding pelosok dibungkus panel keramik
    // large-format sampai ke atap (flush dengan partisi), dan lampunya jadi fitting
    // tertutup IP44: alu frame + diffuser opal, cahaya keluar lembing. Karena ini
    // area toilet, panel justru berperan sekaligus sebagai 'tutup' lampu.
    const TOILET_PART_OUTER = 7.6 - PART_T / 2;              // 7.49 — muka luar partisi
    const PANEL_THK = 0.05;
    const PANEL_FACE = TOILET_PART_OUTER - PANEL_THK;        // 7.44 — muka depan panel
    const TOILET_LIGHT_Z = -6;
    const TOILET_LIGHT_Y = 1.78;

    // Panel keramik: veins halus + 3 slab horizontal dengan grout. Canvas aspect
    // (1024:607) sama persis dengan aspek muka panel (5.16:3.03) → 1:1, tak terdistorsi.
    const panelTex = this.tex.createCanvasTex(1024, 607, (g, w, h) => {
      g.fillStyle = '#d4d9e3';
      g.fillRect(0, 0, w, h);
      const veins = (n: number, a0: number, alpha: number, lo: number, hi: number, col: string) => {
        for (let i = 0; i < n; i++) {
          g.strokeStyle = `rgba(${col},${alpha})`;
          g.lineWidth = lo + Math.random() * (hi - lo);
          g.beginPath();
          const a = a0 + (i * Math.PI * 2) / n + (Math.random() - 0.5) * 0.2;
          const len = 0.55 + Math.random() * 0.4;
          g.moveTo(w / 2, h * 0.78);
          for (let s = 0; s <= 24; s++) {
            const t = s / 24;
            g.lineTo(w * (0.5 + Math.sin(a) * t * len * (0.5 + Math.sin(s * 0.7) * 0.2)), h * (0.78 - Math.cos(a) * t * len * 0.45));
            g.lineTo(w * (0.5 + Math.sin(a + 0.9) * t * len * (0.5 + Math.cos(s * 0.6) * 0.2)), h * (0.78 - Math.cos(a + 0.9) * t * len * 0.45));
          }
          g.stroke();
        }
      };
      veins(9, 0.6, 0.18, 1.2, 2.6, '120,128,140');
      veins(5, 2.0, 0.11, 1.0, 2.0, '90,98,108');
      // Grout 3 slab (large format) + bayangan tipis di setiap gesekan.
      g.strokeStyle = 'rgba(110,120,130,0.45)';
      g.lineWidth = 3;
      g.beginPath();
      for (const y of [h * 0.34, h * 0.66]) {
        g.moveTo(0, y);
        g.lineTo(w, y);
      }
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.04)';
      g.fillRect(0, h * 0.34 - 1, w, 2);
      g.fillRect(0, h * 0.66 - 1, w, 2);
    }, 1, 1);
    const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.88, metalness: 0.0 });

    // Helper: ubin keramik untuk muka dinding apa pun. Aspect canvas = WorldZ : WorldY
    // supaya grout & slab terskala 1:1 di dunia (large-format ~1,2 m).
    const drawPanelTex = (Wz: number, Hy: number) => {
      const pw = 1024;
      const ph = Math.max(256, Math.round((1024 * Hy) / Wz));
      return this.tex.createCanvasTex(pw, ph, (g, w, h) => {
        g.fillStyle = '#d4d9e3';
        g.fillRect(0, 0, w, h);
        const veins = (n: number, a0: number, alpha: number, lo: number, hi: number, col: string) => {
          for (let i = 0; i < n; i++) {
            g.strokeStyle = `rgba(${col},${alpha})`;
            g.lineWidth = lo + Math.random() * (hi - lo);
            g.beginPath();
            const a = a0 + (i * Math.PI * 2) / n + (Math.random() - 0.5) * 0.2;
            const len = 0.55 + Math.random() * 0.4;
            g.moveTo(w / 2, h * 0.78);
            for (let s = 0; s <= 24; s++) {
              const t = s / 24;
              g.lineTo(w * (0.5 + Math.sin(a) * t * len * (0.5 + Math.sin(s * 0.7) * 0.2)), h * (0.78 - Math.cos(a) * t * len * 0.45));
              g.lineTo(w * (0.5 + Math.sin(a + 0.9) * t * len * (0.5 + Math.cos(s * 0.6) * 0.2)), h * (0.78 - Math.cos(a + 0.9) * t * len * 0.45));
            }
            g.stroke();
          }
        };
        veins(9, 0.6, 0.18, 1.2, 2.6, '120,128,140');
        veins(5, 2.0, 0.11, 1.0, 2.0, '90,98,108');
        // Grout horizontal + bayangan tipis tiap gesekan (1,2 m slab → tinggi 3,2 → 3 bar).
        g.strokeStyle = 'rgba(110,120,130,0.45)';
        g.lineWidth = 3;
        g.beginPath();
        for (const f of [1, 2, 3]) {
          const y = (h * f) / 4;
          g.moveTo(0, y);
          g.lineTo(w, y);
        }
        g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.04)';
        for (const f of [1, 2, 3]) g.fillRect(0, (h * f) / 4 - 1, w, 2);
      }, 1, 1);
    };

    const panelClad = box(PANEL_THK, 3.03, 5.16, panelMat, PANEL_FACE + PANEL_THK / 2, 0.1 + 3.03 / 2, -4.1);

    // Fitting lampu tertutup (IP44) yang dipasang di mukanya: alu housing ring yang
    // sedikit lebih besar dari diffuser, lalu diffuser kaca frosted (transmission) yang
    // jadi 'tutup' lampu — cahaya LED di belakang menyebar lewat kaca buram, bukan bar.
    const aluM = M(0x525764, 0.24, 0.86);
    const frostedM = new THREE.MeshPhysicalMaterial({
      color: 0xeef4fe,
      roughness: 0.72,            // frosting: kabur, bukan kaca bening
      metalness: 0.0,
      transmission: 0.55,         // tembus cahaya → terbaca sebagai kaca
      thickness: 0.02,
      ior: 1.5,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      emissive: 0xffd7b0,
      emissiveIntensity: 0.7,     // cahaya menyebar keluar lewat frosted
      envMapIntensity: 0.3,
    });
    const pW = 0.36;
    const pH = 2.0;
    const pD = 0.028;
    const housing = box(pD, pH, pW, aluM, PANEL_FACE - 0.025, TOILET_LIGHT_Y, TOILET_LIGHT_Z);
    // Kaca frosted duduk ~1 cm lebih depan dari muka housing → klip-in frame alu.
    const gD = 0.02;
    const diffuser = box(gD, pH - 0.16, pW - 0.04, frostedM, PANEL_FACE - 0.025 - gD / 2 - 0.01, TOILET_LIGHT_Y, TOILET_LIGHT_Z);

    // Soft glow di depan kaca frosted → efek cove, bukan bar emissive mentah.
    const panelHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.98), cornerGlowMat.clone());
    panelHalo.material.opacity = 0.11;
    panelHalo.rotation.y = -Math.PI / 2;
    panelHalo.position.set(PANEL_FACE - 0.09, TOILET_LIGHT_Y, TOILET_LIGHT_Z);
    this.ctx.scene.add(panelHalo);

    // Sumber cahaya ruangan tetap: point light + soft floor glow di depan fitting.
    const panelLight = new THREE.PointLight(0xffd7b0, 1.6, 8, 1.8);
    panelLight.position.set(PANEL_FACE - 0.12, TOILET_LIGHT_Y + 0.16, TOILET_LIGHT_Z);
    this.ctx.scene.add(panelLight);
    const panelFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 32),
      new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false })
    );
    panelFloorGlow.rotation.x = -Math.PI / 2;
    panelFloorGlow.position.set(6.9, 0.018, TOILET_LIGHT_Z);
    this.ctx.scene.add(panelFloorGlow);

    // ── Sisi toilet lainnya dipanel seragam (keramik large-format) ────────────────
    // Agar ruang WC terasa satu set: dinding depan (pintu), dinding kanan, dan
    // dinding belakang diubah dari partM cokelat polos jadi panel keramik yang sama
    // dengan tembok kiri. Kusen pintu tetap partTrimM biar kontras sebagai bingkai.
    const panelFrontM = new THREE.MeshStandardMaterial({ map: drawPanelTex(2.3, 3.2), roughness: 0.88, metalness: 0.0 });
    const panelRightM = new THREE.MeshStandardMaterial({ map: drawPanelTex(2.25, 3.2), roughness: 0.88, metalness: 0.0 });
    const panelBackM = new THREE.MeshStandardMaterial({ map: drawPanelTex(2.3, 3.2), roughness: 0.88, metalness: 0.0 });

    // Dinding depan WC dengan lubang pintu di x[8.3, 9.35] — panel keramik.
    box(0.55, PART_H, PANEL_THK, panelFrontM, 7.95, PART_H / 2, -4.45);
    box(0.4, PART_H, PANEL_THK, panelFrontM, 9.625, PART_H / 2, -4.45);
    box(1.05, 0.55, PANEL_THK, panelFrontM, 8.825, 2.925, -4.45);
    // Kusen pintu.
    box(0.08, 2.72, PART_T + 0.05, partTrimM, 8.3, 1.36, -4.45);
    box(0.08, 2.72, PART_T + 0.05, partTrimM, 9.35, 1.36, -4.45);

    // Dinding kanan ruang WC (sisi luar = x=10.1, partisi terhadap unit sebelah).
    box(PANEL_THK, PART_H, 2.25, panelRightM, 9.9 + 0.005, PART_H / 2, -5.575);

    // Dinding belakang ruang WC (z=-6.9, sisi luar ruangan).
    box(2.3, PART_H, PANEL_THK, panelBackM, 8.75, PART_H / 2, -6.9 + 0.005);

    // Daun pintu dibuka ke dalam ruang WC.
    const wcDoor = new THREE.Group();
    wcDoor.position.set(8.34, 0, -4.45);
    wcDoor.rotation.y = 0.72;
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.62, 0.06), M(0x4a2f1c, 0.62));
    doorPanel.position.set(0.49, 1.31, 0);
    doorPanel.castShadow = true;
    doorPanel.receiveShadow = true;
    wcDoor.add(doorPanel);
    const doorHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.28, metalness: 0.85 })
    );
    doorHandle.rotation.x = Math.PI / 2;
    doorHandle.position.set(0.86, 1.12, 0.07);
    wcDoor.add(doorHandle);
    this.ctx.scene.add(wcDoor);

    // Lantai keramik lorong + ruang WC, kontras dengan lantai kayu.
    const tileTex = this.tex.createCanvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#525a66';
      g.fillRect(0, 0, w, h);
      const n = 4;
      const s = w / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? '#6d7683' : '#79828f';
          g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        }
      }
    }, 3, 7);
    const corridorFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.95),
      new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.4, metalness: 0.12 })
    );
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(8.75, 0.02, -2.975);
    corridorFloor.receiveShadow = true;
    this.ctx.scene.add(corridorFloor);

    const wcFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.25),
      new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.34, metalness: 0.14 })
    );
    wcFloor.rotation.x = -Math.PI / 2;
    wcFloor.position.set(8.75, 0.023, -5.575);
    wcFloor.receiveShadow = true;
    this.ctx.scene.add(wcFloor);

    // Papan nama di atas pintu.
    makeSign((g, w, h) => {
      boardBg(g, w, h, '#0f172a', 'rgba(226,232,240,.85)');
      g.fillStyle = '#e2e8f0';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${Math.round(h * 0.4)}px ${FONT}`;
      g.fillText('TOILET', w / 2, h * 0.5);
    }, 1.0, 0.46, 8.825, 2.93, -4.31);

    // Penunjuk arah di mulut lorong, menghadap ruang duduk (sisi -x).
    const dirSign = makeSign((g, w, h) => {
      boardBg(g, w, h, '#111827', 'rgba(148,163,184,.5)');
      g.fillStyle = '#e2e8f0';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${Math.round(h * 0.27)}px ${FONT}`;
      g.fillText('TOILET', w * 0.5, h * 0.33);
      // Panah ke kiri pada kanvas = ke arah belakang ruangan (lorong WC).
      g.beginPath();
      g.moveTo(w * 0.24, h * 0.68);
      g.lineTo(w * 0.42, h * 0.55);
      g.lineTo(w * 0.42, h * 0.81);
      g.closePath();
      g.fill();
      g.fillRect(w * 0.4, h * 0.64, w * 0.34, h * 0.08);
    }, 0.66, 0.36, PANEL_FACE - 0.015, 2.12, -1.95);
    dirSign.rotation.y = -Math.PI / 2;

    // Porcelain di dalam ruang WC: kloset, wastafel, cermin.
    const porcelain = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.22, metalness: 0.05 });
    box(0.52, 0.56, 0.2, porcelain, 8.05, 0.62, -6.55);
    cyl(0.21, 0.17, 0.44, porcelain, 8.05, 0.28, -6.16, 16);
    const wcSeat = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 20), porcelain);
    wcSeat.rotation.x = -Math.PI / 2;
    wcSeat.position.set(8.05, 0.51, -6.12);
    this.ctx.scene.add(wcSeat);

    box(0.66, 0.62, 0.44, M(0x334155, 0.7), 9.42, 0.36, -6.4);
    cyl(0.21, 0.17, 0.09, porcelain, 9.42, 0.7, -6.4, 18);
    box(0.05, 0.16, 0.05, M(0xc0c8d4, 0.25, 0.9), 9.42, 0.83, -6.56);
    const wcMirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.66),
      new THREE.MeshStandardMaterial({ color: 0xbfd7e8, roughness: 0.06, metalness: 0.95 })
    );
    wcMirror.position.set(9.42, 1.55, -6.66);
    this.ctx.scene.add(wcMirror);

    // Keset di depan pintu + lampu kecil di dalam ruang WC.
    const wcRug = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.55), M(0x1e3a5f, 0.95));
    wcRug.rotation.x = -Math.PI / 2;
    wcRug.position.set(8.82, 0.026, -4.02);
    this.ctx.scene.add(wcRug);

    cyl(0.16, 0.2, 0.09, new THREE.MeshStandardMaterial({ color: 0x1f2937, emissive: 0xdbeafe, emissiveIntensity: 1.1, roughness: 0.4 }), 8.75, 2.5, -5.55, 16);

    const wcLight = new THREE.PointLight(0xdceeff, 0.85, 4.5, 2);
    wcLight.position.set(8.75, 2.35, -5.5);
    this.ctx.scene.add(wcLight);

    // Door & exit
    box(0.3, 2.9, 0.3, M(0x1c130c, 0.6), 4.6, 1.45, 7.5);
    box(0.3, 2.9, 0.3, M(0x1c130c, 0.6), 7.4, 1.45, 7.5);
    box(3.1, 0.35, 0.32, M(0x1c130c, 0.6), 6, 3, 7.5);

    // Papan fascia "open 24 hours" di atas pintu masuk, menghadap kamera storefront.
    // Teksturnya dibuat seukuran rasio papan sendiri: kalau lewat makeSign, papan 5:1
    // dipaksa jadi canvas 3840px lebar cuma untuk menampung satu baris teks.
    const openSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.52),
      new THREE.MeshBasicMaterial({
        map: this.tex.createSignTex(1024, 205, (g, w, h) => {
          g.fillStyle = '#0b1220';
          g.fillRect(0, 0, w, h);
          const lw = Math.max(2, Math.round(h * 0.06));
          g.strokeStyle = 'rgba(251,191,36,.85)';
          g.lineWidth = lw;
          g.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
          g.lineWidth = Math.max(1, Math.round(h * 0.02));
          g.strokeRect(w * 0.035, h * 0.16, w * 0.93, h * 0.68);
          g.fillStyle = '#fde68a';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `900 ${Math.round(h * 0.42)}px ${FONT}`;
          g.fillText('OPEN 24 HOURS', w / 2, h * 0.53);
        }),
        side: THREE.DoubleSide,
      })
    );
    openSign.position.set(6, 3.5, 7.7);
    this.ctx.scene.add(openSign);

    // Halo tipis di belakang papan supaya terbaca seperti lightbox yang nyala sendiri.
    const openSignGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 0.9),
      new THREE.MeshBasicMaterial({
        color: 0xffb45e,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    openSignGlow.position.set(6, 3.5, 7.67);
    this.ctx.scene.add(openSignGlow);

    // Daun pintu ganda. Tiap daun digantung di grup kosong tepat di titik engselnya
    // lalu panelnya digeser sejauh DOOR_W ke arah dalam, jadi rotasi Y murni = ayunan.
    // 2 × 1,24m untuk bukaan 2,5m → sisa 2cm di tengah: daunnya bisa ketemu tanpa nagih.
    const DOOR_W = 1.24;
    const doorLeaf = (hingeX: number, dir: 1 | -1) => {
      const g = new THREE.Group();
      g.position.set(hingeX, 0, 7.5);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, 2.78, 0.06), M(0x4a2f1c, 0.62));
      panel.position.set(dir * (DOOR_W / 2), 1.39, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      g.add(panel);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_W * 0.7, 1.5, 0.02),
        new THREE.MeshStandardMaterial({
          color: 0x9fd8ff,
          transparent: true,
          opacity: 0.22,
          roughness: 0.12,
          metalness: 0.1,
        })
      );
      glass.position.set(dir * (DOOR_W / 2), 1.86, 0.036);
      g.add(glass);
      // Handle di sisi pertemuan (tengah bukaan), bukan di dekat engsel.
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10),
        M(0xd09a58, 0.35, 0.7)
      );
      handle.position.set(dir * (DOOR_W - 0.08), 1.16, 0.09);
      g.add(handle);
      this.ctx.scene.add(g);
      return g;
    };
    this.door.frontDoorL = doorLeaf(4.75, 1);
    this.door.frontDoorR = doorLeaf(7.25, -1);

    // Initialize the 14 chairs and tables
    const chairM = M(0x4a2f1c, 0.7);
    const chairAt = (x: number, z: number, ry: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const se = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), chairM);
      se.position.y = 0.46;
      se.castShadow = true;
      g.add(se);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.07), chairM);
      bk.position.set(0, 0.78, 0.22);
      bk.castShadow = true;
      g.add(bk);
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([dx, dz]) => {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 8), M(0x2b2118, 0.6));
        l.position.set(dx, 0.23, dz);
        g.add(l);
      });
      this.ctx.scene.add(g);
      return g;
    };

    const coffeeCup = (x: number, y: number, z: number) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.1, 12), M(0xf3e7d3, 0.5));
      c.position.set(x, y, z);
      c.castShadow = true;
      this.ctx.scene.add(c);
      const st = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
      );
      st.position.set(x, y + 0.2, z);
      this.ctx.scene.add(st);
      this.ctx.steams.push({ m: st, t: Math.random() * 9, base: y + 0.2 });
    };

    const laptopAt = (x: number, y: number, z: number, ry: number, color: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = ry;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.34), M(0x14181f, 0.45));
      b.castShadow = true;
      g.add(b);
      const sm = new THREE.MeshBasicMaterial({ color });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), sm);
      s.position.set(0, 0.17, -0.14);
      s.rotation.x = -0.32;
      g.add(s);
      this.ctx.scene.add(g);
      this.ctx.screens.push({ m: sm, base: color, ph: Math.random() * 9 });
      return g;
    };

    OFFICE_SEATS.forEach((s) => {
      const seatPos = new THREE.Vector3(s.seat[0], 0, s.seat[1]);
      const dir = new THREE.Vector3(Math.sin(s.rot), 0, Math.cos(s.rot));
      const stand = seatPos.clone().add(dir.clone().multiplyScalar(1.05));
      stand.y = 0;
      this.ctx.seats[s.id] = { seat: seatPos, stand, rot: s.rot, y: 0, topY: s.topY ?? 0.76 };

      // Kursi kosong hanya kursi + meja. Laptop/kopi ditambahkan dinamis
      // ketika ada real agent yang menempati seat tersebut.
      // Seat bar pakai stool yang sudah dibangun buildWindowBar(), jadi jangan
      // tumpuk dengan kursi kantor biasa.
      if (!s.bar) chairAt(seatPos.x, seatPos.z, s.rot + Math.PI);
    });
  }

  // AC split di tembok belakang, di atas area duduk kanan. Sengaja di x=4.6:
  // papan menu sudah menempati x[-8,-2.4] di dinding yang sama, dan partisi
  // lorong WC mulai di x=7.6 — celah di antaranya kosong dan menghadap kamera default.
}

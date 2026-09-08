// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';

@Injectable()
export class PersonService {
  private readonly ctx = inject(EngineContext);

  hashText(text: string) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  inferAgentGender(name: string, avatar?: string): 'female' | 'male' | 'neutral' {
    const clean = name
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-zA-Z\s]/g, ' ');
    const tokens = clean.split(/\s+/).filter(Boolean);
    const femaleNames = new Set([
      // pool persona (80% cewek)
      'saarah', 'clara', 'camille', 'amara', 'nadia', 'kirana', 'alya', 'sinta', 'maya', 'dewi',
      'putri', 'intan', 'rani', 'sekar', 'melati', 'wulan', 'tari', 'dinda', 'nabila', 'farah',
      'salma', 'zahra', 'laila', 'mira', 'ayu', 'novi', 'salsabila', 'yuni', 'prita', 'melly',
      'cahya', 'arumi', 'mega', 'rossa', 'tiara', 'rika', 'mila', 'astri', 'cempaka', 'larasati',
      'anisa', 'citra', 'kenanga', 'tasya', 'niken', 'fitri', 'monica', 'lina', 'bella', 'reni',
      'amira', 'noor', 'elise', 'freya', 'chloe', 'maeve', 'lucia', 'iris', 'hana', 'nina',
      'zoe', 'kira', 'alina', 'sena', 'esme', 'aruna', 'kavya', 'selene', 'maira', 'anindya',
      'saras', 'indira', 'kamila', 'alea', 'rhea', 'callista', 'anwita', 'vania', 'nayla', 'aisyah',
      // sub-agent personas
      'dara', 'riri', 'nana', 'tita',
      // nama umum / fallback
      'sarah', 'saa', 'amelia', 'anita', 'bella', 'clara', 'dewi', 'dina', 'elsa', 'emma',
      'grace', 'hannah', 'indah', 'jane', 'jessica', 'kartika', 'kate', 'lila', 'lisa', 'luna',
      'maria', 'melati', 'mia', 'nabila', 'olivia', 'putri', 'ratna', 'reva', 'sari', 'siti',
      'sophia', 'tiara', 'wulan', 'yuni', 'zahra', 'female', 'woman', 'girl', 'lady'
    ]);
    const maleNames = new Set([
      // pool persona
      'budi', 'santoso', 'rizky', 'pratama', 'ahmad', 'fauzi', 'bayu', 'saputra', 'dimas',
      'wicaksono', 'andi', 'wijaya', 'hendra', 'gunawan', 'teguh', 'setiawan', 'yoga', 'mahendra',
      'arif', 'rahman', 'naufal', 'hakim', 'reza', 'maulana', 'doni', 'kurniawan', 'joko',
      'priyanto', 'rafi', 'hidayat', 'galih', 'prakoso', 'yusuf', 'ramadhan', 'rangga', 'aditya',
      'bima', 'ardiansyah', 'satria', 'wibowo', 'hadi',
      // nama umum / fallback
      'rizoa', 'agus', 'ari', 'arya', 'bagas', 'ary', 'daniel', 'david', 'eko', 'fahri', 'farhan',
      'ilham', 'iqbal', 'joko', 'michael', 'nathan', 'rama', 'rian', 'ryan', 'tono', 'william',
      'male', 'man', 'boy', 'gentleman'
    ]);

    if (avatar && /👩|👱‍♀️|🙋‍♀️|🧕|👸/.test(avatar)) return 'female';
    if (avatar && /👨|👱‍♂️|🙋‍♂️|🤴/.test(avatar)) return 'male';
    if (tokens.some((token) => femaleNames.has(token))) return 'female';
    if (tokens.some((token) => maleNames.has(token))) return 'male';
    return 'neutral';
  }

  createPersonMesh(colorHex: number, agentName = '', avatar?: string) {
    const M = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const g = new THREE.Group();
    const skin = M(0xe8b88a, 0.75);
    const shirt = M(colorHex, 0.75);
    const pants = M(0x232a3a, 0.8);
    const hairM = M(0x241a12, 0.9);
    const hatM = M(colorHex, 0.58, 0.03);
    const accentM = M(0xf8fafc, 0.65);
    const gender = this.inferAgentGender(agentName, avatar);
    const variant = this.hashText(agentName || avatar || String(colorHex));

    const lL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.13), pants);
    lL.position.set(-0.1, 0.25, 0);
    const lR = lL.clone();
    lR.position.x = 0.1;
    g.add(lL, lR);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.55, 10), shirt);
    torso.position.y = 0.78;
    torso.castShadow = true;
    g.add(torso);

    const aL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.09), shirt);
    aL.geometry.translate(0, -0.18, 0);
    aL.position.set(-0.27, 1, 0);
    const aR = aL.clone();
    aR.position.x = 0.27;
    g.add(aL, aR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), skin);
    head.position.y = 1.22;
    head.castShadow = true;
    g.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.176, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairM
    );
    hair.position.set(0, 0.03, 0);
    head.add(hair);

    if (gender === 'female') {
      if (variant % 2 === 0) {
        const longHair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 14), hairM);
        longHair.scale.set(0.95, 1.65, 0.58);
        longHair.position.set(0, -0.1, -0.075);
        longHair.castShadow = true;
        head.add(longHair);

        const sideLock = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), hairM);
        sideLock.scale.set(0.7, 1.8, 0.5);
        sideLock.position.set(0.13, -0.06, 0.055);
        head.add(sideLock);
      } else {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), hairM);
        bun.position.set(0, -0.02, -0.19);
        bun.castShadow = true;
        head.add(bun);

        const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.28, 12), hairM);
        ponytail.position.set(0, -0.15, -0.2);
        ponytail.rotation.x = 0.2;
        ponytail.castShadow = true;
        head.add(ponytail);

        const hairTie = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 18), accentM);
        hairTie.position.set(0, -0.04, -0.175);
        hairTie.rotation.x = Math.PI / 2;
        head.add(hairTie);
      }
    } else if (gender === 'male') {
      const hatVariant = variant % 3;
      if (hatVariant === 0) {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 18), hatM);
        crown.position.set(0, 0.115, 0);
        crown.castShadow = true;
        head.add(crown);

        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.13), hatM);
        brim.position.set(0, 0.08, 0.14);
        brim.castShadow = true;
        head.add(brim);
      } else if (hatVariant === 1) {
        const beanie = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          hatM
        );
        beanie.position.set(0, 0.08, 0);
        beanie.scale.y = 0.8;
        beanie.castShadow = true;
        head.add(beanie);

        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 18), accentM);
        rim.position.set(0, 0.03, 0);
        rim.castShadow = true;
        head.add(rim);
      } else {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.03, 24), hatM);
        brim.position.set(0, 0.075, 0);
        brim.castShadow = true;
        head.add(brim);

        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 18), hatM);
        crown.position.set(0, 0.16, 0);
        crown.castShadow = true;
        head.add(crown);
      }
    }

    this.ctx.scene.add(g);
    return { g, lL, lR, aL, aR, head, torso };
  }
}

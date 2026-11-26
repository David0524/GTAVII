import * as THREE from 'three/webgpu';

/**
 * Distant skyline: every pre-1975 tower over 60 m outside the play region, plus the
 * World Trade Center twins, as one InstancedMesh of boxes (one draw call).
 * Record: cx i16 (2 m units) | cz i16 | sx u16 (dm) | sz u16 | rot i16 (mrad) | h u16 (dm)
 */
export async function loadSkyline(url: string): Promise<THREE.InstancedMesh> {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const n = dv.getUint32(0, true);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let o = 4;
  for (let k = 0; k < n; k++) {
    const cx = dv.getInt16(o, true) * 2, cz = dv.getInt16(o + 2, true) * 2;
    const sx = dv.getUint16(o + 4, true) / 10, sz = dv.getUint16(o + 6, true) / 10;
    const rot = dv.getInt16(o + 8, true) / 1000, h = dv.getUint16(o + 10, true) / 10;
    o += 12;
    p.set(cx, -0.5, cz); q.setFromAxisAngle(up, -rot); s.set(Math.max(sx, 4), h, Math.max(sz, 4));
    mesh.setMatrixAt(k, m.compose(p, q, s));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'skyline';
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The character rig: one skeleton shared by every body, the offline build (tools/characters)
 * and the animation retargeter. Joint names follow the Quaternius Universal Animation
 * Library (CC0) so clips map 1:1; jaw and eyes are ours (look-at, lip-sync).
 *
 * Rest frames are identity-oriented: every bone's rest local rotation is the identity and its
 * rest offset is a pure translation. Clips are stored as local rotations relative to that, so
 * they stay valid for every body shape (only the offsets change with the morphs).
 */
export interface JointDef {
  name: string;
  parent: number;
  /** MakeHuman joint(s) whose vertex-group centroid gives this joint's position. */
  mhHead: string[];
  /** MakeHuman deform bones whose skin weights are merged into this joint. */
  mhBones: string[];
}

const J: JointDef[] = [];
const add = (name: string, parent: string | null, mhHead: string[], mhBones: string[]) => {
  J.push({ name, parent: parent === null ? -1 : J.findIndex((j) => j.name === parent), mhHead, mhBones });
};

add('root', null, [], []);
add('pelvis', 'root', ['spine05____head'], ['root', 'spine05', 'pelvis.L', 'pelvis.R']);
add('spine_01', 'pelvis', ['spine04____head'], ['spine04']);
add('spine_02', 'spine_01', ['spine03____head'], ['spine03']);
add('spine_03', 'spine_02', ['spine02____head'], ['spine02', 'spine01', 'breast.L', 'breast.R']);
add('neck_01', 'spine_03', ['neck01____head'], ['neck01', 'neck02', 'neck03']);
add('Head', 'neck_01', ['head____head'], ['head']); // facial bones are merged in by the build (see FACE_TO_HEAD)
add('jaw', 'Head', ['jaw____head'], ['jaw']);
add('eye_l', 'Head', ['eye.L____head'], ['eye.L']);
add('eye_r', 'Head', ['eye.R____head'], ['eye.R']);
for (const [s, S] of [['l', 'L'], ['r', 'R']] as const) {
  add(`clavicle_${s}`, 'spine_03', [`clavicle.${S}____head`], [`clavicle.${S}`, `shoulder01.${S}`]);
  add(`upperarm_${s}`, `clavicle_${s}`, [`upperarm01.${S}____head`], [`upperarm01.${S}`, `upperarm02.${S}`]);
  add(`lowerarm_${s}`, `upperarm_${s}`, [`lowerarm01.${S}____head`], [`lowerarm01.${S}`, `lowerarm02.${S}`]);
  add(`hand_${s}`, `lowerarm_${s}`, [`wrist.${S}____head`], [`wrist.${S}`, `metacarpal1.${S}`, `metacarpal2.${S}`, `metacarpal3.${S}`, `metacarpal4.${S}`]);
  const fingers: [string, number][] = [['thumb', 1], ['index', 2], ['middle', 3], ['ring', 4], ['pinky', 5]];
  for (const [f, n] of fingers) {
    for (let k = 1; k <= 3; k++) {
      add(`${f}_0${k}_${s}`, k === 1 ? `hand_${s}` : `${f}_0${k - 1}_${s}`, [`finger${n}-${k}.${S}____head`], [`finger${n}-${k}.${S}`]);
    }
  }
}
for (const [s, S] of [['l', 'L'], ['r', 'R']] as const) {
  add(`thigh_${s}`, 'pelvis', [`upperleg01.${S}____head`], [`upperleg01.${S}`, `upperleg02.${S}`]);
  add(`calf_${s}`, `thigh_${s}`, [`lowerleg01.${S}____head`], [`lowerleg01.${S}`, `lowerleg02.${S}`]);
  add(`foot_${s}`, `calf_${s}`, [`foot.${S}____head`], [`foot.${S}`]);
  const toes: string[] = [];
  for (let t = 1; t <= 5; t++) for (let k = 1; k <= 3; k++) if (!(t === 1 && k === 3)) toes.push(`toe${t}-${k}.${S}`);
  add(`ball_${s}`, `foot_${s}`, [1, 2, 3, 4, 5].map((t) => `toe${t}-1.${S}____head`), toes);
}

export const JOINTS: readonly JointDef[] = J;
export const JOINT_INDEX: Readonly<Record<string, number>> = Object.fromEntries(J.map((j, i) => [j.name, i]));
export const NUM_JOINTS = J.length;

/** Extra landmark points regressed from the mesh (not joints): used for IK, hats, props. */
export const LANDMARKS: Record<string, string[]> = {
  head_top: ['head____tail'],
  toe_tip_l: ['toe3-3.L____tail'], toe_tip_r: ['toe3-3.R____tail'],
  heel_l: ['foot.L____head'], heel_r: ['foot.R____head'],
  hand_tip_l: ['finger3-3.L____tail'], hand_tip_r: ['finger3-3.R____tail'],
  palm_l: ['finger3-1.L____head'], palm_r: ['finger3-1.R____head'],
};

/** Primary child used to define each bone's direction (for retargeting and limb params). */
export function primaryChild(j: number): number {
  const name = J[j].name;
  const pref: Record<string, string> = {
    root: 'pelvis', pelvis: 'spine_01', spine_03: 'neck_01', Head: '', hand_l: 'middle_01_l', hand_r: 'middle_01_r',
  };
  if (name in pref) return pref[name] ? JOINT_INDEX[pref[name]] : -1;
  const kids = J.map((c, i) => (c.parent === j ? i : -1)).filter((i) => i >= 0);
  return kids.length ? kids[0] : -1;
}

/** Bones that the crowd LODs keep (fingers collapse onto the hand, face bones onto the head). */
export function crowdJoint(j: number): number {
  const n = J[j].name;
  if (/^(thumb|index|middle|ring|pinky)_/.test(n)) return JOINT_INDEX[`hand_${n.slice(-1)}`];
  if (n === 'jaw' || n.startsWith('eye_')) return JOINT_INDEX.Head;
  return j;
}

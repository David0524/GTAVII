/**
 * Adults only (CHARACTERS_BRIEF): every spawn path clamps to MIN_ADULT_AGE.
 *   npx tsx tools/characters/adult-test.ts
 * Generates 100,000 appearances with random and hostile options (minAge 0, age 5, NaN, overrides
 * with a child age) and checks the appearance age, the body's macro age and the morph weights.
 */
import { generateAppearance } from '../../src/characters/body/appearance';
import { ageWeights, MIN_ADULT_AGE } from '../../src/characters/body/macro';

let bad = 0, n = 0, minSeen = Infinity;
const hostile = [{}, { minAge: 0 }, { age: 5 }, { age: Number.NaN }, { minAge: 2, maxAge: 10 }, { overrides: { age: 7 } as any }, { overrides: { body: { macro: { age: 9 }, locals: {} } } as any }];
for (let i = 0; i < 100000; i++) {
  const opts = hostile[i % hostile.length] as any;
  const a = generateAppearance((i * 2654435761) >>> 0, opts);
  n++; minSeen = Math.min(minSeen, a.age, a.body.macro.age);
  const w = ageWeights(a.body.macro.age);
  if (a.age < MIN_ADULT_AGE || a.body.macro.age < MIN_ADULT_AGE || w[0] > ageWeights(MIN_ADULT_AGE)[0] + 1e-9) bad++;
}
const direct = [0, 5, 11, 17, Number.NaN].map((y) => ageWeights(y)[0]);
const floor = ageWeights(MIN_ADULT_AGE)[0];
const directOk = direct.every((c) => Math.abs(c - floor) < 1e-9);
console.log(`${n} appearances: youngest ${minSeen}, violations ${bad}; ageWeights below ${MIN_ADULT_AGE} clamp to the adult floor: ${directOk}`);
process.exit(bad || !directOk ? 1 : 0);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Rng } from '../core/rng';
import * as E from '../economy';
import { chopList, chopPay, ChopShop, CLASS_BASE, type Car } from '../economy/chop';
import { Fences } from '../economy/fences';
import { Registers } from '../economy/registers';
import * as G from '../economy/gambling';
import { Loans } from '../economy/loans';
import { bareLead, makeRig, measureRates, missionRate, runPlaythrough, type Rate } from '../economy/sim';
import { sideFromNarrative, storyFromNarrative, storyHours, storyTotal } from '../economy/story';
import { DELPHINE, NICK, TEDDY, usd, type Lot } from '../economy/types';
import type { CrimeKind } from '../police/crime';

const lot = (category: Lot['category'], cents: number): Lot => ({ category, cents, label: 'test lot' });

// ------------------------------------------------------------------------------------------ modules
test('chop: the weekly list is deterministic from the week, each entry fills once, pay is $250-$1,500 by condition (scaled with risk, user decision 2026-11-26)', () => {
  assert.deepEqual(chopList(12), chopList(12));
  assert.notDeepEqual(chopList(12), chopList(13));
  const shop = new ChopShop();
  const e = chopList(5)[0];
  const car: Car = { cls: e.cls, colour: e.colour, condition: 0.9 };
  const first = shop.deliver(5, car);
  assert.ok(first.ok);
  assert.equal(first.cents, chopPay(e.cls, 0.9));
  assert.ok(first.cents >= usd(250) && first.cents <= usd(1500));
  const again = shop.deliver(5, car);
  assert.ok(!again.ok && again.reason === 'filled', 'an entry fills once');
  assert.ok(again.cents < first.cents / 5, 'a second copy only fetches scrap');
  assert.ok(!shop.deliver(5, { ...car, condition: 0.2 }).ok);
  // pay scales with condition; the whole table spans $250-$1,500
  assert.ok(chopPay('luxury', 1) <= usd(1500) && chopPay('compact', 0.5) >= usd(200));
  assert.ok(chopPay('sedan', 0.9) > chopPay('sedan', 0.6));
  const off = shop.deliver(5, { cls: e.cls, colour: e.colour === 'white' ? 'black' : 'white', condition: 1 });
  assert.ok(!off.ok && off.cents <= CLASS_BASE[e.cls] * 0.2, 'a car that is not on the list is scrap');
});

test('fences: 30-50% of value, pawnshops lower, demand saturates and recovers over game days, want list pays a premium', () => {
  const f = new Fences();
  f.rollWeek(0);
  const wants = f.wantList(0);
  const wantCats = (fence: string) => wants.filter((w) => w.fence === fence).map((w) => w.category);
  for (const d of f.defs.values()) {
    if (d.kind !== 'fence') continue;
    for (const cat of d.accepts) {
      if (wantCats(d.id).includes(cat)) continue;
      const q = f.quote(d.id, lot(cat, usd(100)), 0)!;
      assert.ok(q.cut >= 0.30 - 1e-9 && q.cut <= 0.50 + 1e-9, `${d.id} ${cat} cut ${q.cut}`);
    }
  }
  const fenceBest = Math.max(...[...f.defs.values()].filter((d) => d.kind === 'fence').map((d) => f.quote(d.id, lot('jewelry', usd(100)), 0)?.cents ?? 0));
  for (const d of f.defs.values()) if (d.kind === 'pawn') assert.ok(f.quote(d.id, lot('jewelry', usd(100)), 0)!.cents < fenceBest);
  // saturation
  const g = new Fences(); g.rollWeek(0);
  const id = 'fence.mercer';
  const paid: number[] = [];
  for (let i = 0; i < 8; i++) paid.push(g.sell(id, lot('liquor', usd(2000)), 0)!.cents);
  for (let i = 1; i < paid.length; i++) assert.ok(paid[i] < paid[i - 1], 'each sale pays less');
  assert.ok(paid[7] < paid[0] * 0.5, `dumping 8 lots halves the price (${paid[0]} -> ${paid[7]})`);
  const rec = g.quote(id, lot('liquor', usd(2000)), 24 * 7)!.cents;
  assert.ok(rec > paid[7] * 1.5 && rec > paid[0] * 0.75, 'a week later the market has largely recovered');
  // a different category on the same fence is unaffected
  assert.equal(g.quote(id, lot('furs', usd(200)), 0)!.cents, f.quote(id, lot('furs', usd(200)), 0)!.cents);
  // want list
  const w = wants.find((x) => x.fence === 'fence.lund' || x.fence === 'fence.kessel' || x.fence === 'fence.drago')!;
  const base = new Fences(); // week not rolled: no wants
  const withWant = f.quote(w.fence, lot(w.category, usd(100)), 0)!, without = base.quote(w.fence, lot(w.category, usd(100)), 0)!;
  assert.ok(withWant.cents > without.cents && withWant.want, 'the want list pays a premium');
  assert.deepEqual(new Fences().wantList(7), new Fences().wantList(7), 'want list is deterministic per week');
});

test('registers: takings follow the time of day, repeat hits pay little, armed reports assault_weapon, safes shorten with lockwork', () => {
  const kinds: CrimeKind[] = [];
  const crime = (k: CrimeKind) => kinds.push(k);
  const rng = new Rng(3);
  const r = new Registers();
  const shop = 'shop.liquor_w34';
  assert.ok(r.expected(shop, 19) > r.expected(shop, 4) * 2.5, 'evening takings beat 4 a.m.');
  const a = r.rob(shop, { nowH: 19, armed: true, rng, crime, visible: true });
  assert.deepEqual(kinds, ['assault_weapon']);
  const b = r.rob(shop, { nowH: 19.5, armed: true, rng, crime, visible: true });
  assert.ok(b.cents < a.cents * 0.05, `half an hour later: ${b.cents} vs ${a.cents}`);
  r.rob('shop.drug_7th', { nowH: 19, armed: false, rng, crime, visible: false });
  assert.equal(kinds[2], 'theft');
  const later = r.expected(shop, 19 + 24 * 7);
  assert.ok(later > r.expected(shop, 19 + 24) && later > a.cents * 0.8, 'a till recovers over game hours');
  assert.ok(Registers.crackMinutes(90) < Registers.crackMinutes(30) && Registers.crackMinutes(90) <= 30);
  const s = r.crack('shop.theatre_box', { nowH: 20, lockwork: 80, rng, crime, visible: false });
  assert.ok(s.minutes === Registers.crackMinutes(80));
  assert.equal(kinds.at(-1), 'theft');
});

test('gambling maths: number 600:1 (edge 39.9%), OTB 17% take, cards slightly negative for average skill, pool, fight odds', () => {
  assert.ok(Math.abs(G.NUMBER_EDGE - 0.399) < 1e-12);
  // exact enumeration over all 1000 draws for a fixed pick
  let net = 0; for (let d = 0; d < G.NUMBER_SPACE; d++) net += G.numberNet(100, 7, d);
  assert.ok(Math.abs(net / G.NUMBER_SPACE / 100 - -0.399) < 1e-12);
  assert.equal(G.drawNumber(3), G.drawNumber(3));
  assert.ok(G.drawNumber(3) >= 0 && G.drawNumber(3) < 1000);
  // pari-mutuel: crowd money exactly matching true chances -> EV = 0.83 for a small stake
  const true_ = [0.4, 0.25, 0.2, 0.1, 0.05];
  const race: G.Race = { true: true_, pool: true_.map((p) => p * 1_000_000_00) };
  for (let i = 0; i < true_.length; i++) assert.ok(Math.abs(G.otbExpected(race, i, 200) - 0.83) < 1e-4, 'edge 17%');
  // with random crowds it never beats the take by much
  const rng = new Rng(5);
  let best = -1;
  for (let k = 0; k < 400; k++) { const rc = G.makeRace(rng); for (let i = 0; i < rc.true.length; i++) best = Math.max(best, G.otbExpected(rc, i, usd(5))); }
  assert.ok(best < 1.05, `no race is a gold mine: best EV ${best.toFixed(3)}`);
  let mean = 0; const N = 600;
  for (let k = 0; k < N; k++) { const rc = G.makeRace(rng); mean += G.otbExpected(rc, rng.int(0, 5), usd(5)); }
  assert.ok(mean / N < 0.9 && mean / N > 0.7, `average OTB return ${(mean / N).toFixed(3)}`);
  // cards
  assert.ok(G.cardEv(50) < 0 && G.cardEv(50) > -0.06, `average player EV ${G.cardEv(50)}`);
  assert.ok(G.cardEv(100) > G.cardEv(50) && G.cardEv(50) > G.cardEv(0));
  // pool: skill vs opponent shifts it; equal skill is -3%
  assert.ok(Math.abs(G.poolEv(50, 50) - (-0.03)) < 1e-9);
  assert.ok(G.poolEv(80, 50) > 0 && G.poolEv(30, 60) < G.poolEv(50, 50));
  // fights: blind EV is exactly 1/1.08 - 1 on either side, whatever the odds
  const bout = { a: 85, b: 62 };
  for (const side of ['a', 'b'] as const) assert.ok(Math.abs(G.fightEv(bout, side) - (1 / 1.08 - 1)) < 1e-9);
  assert.ok(G.fightOdds(bout, 'a') < G.fightOdds(bout, 'b'), 'the favourite pays less');
  // Monte Carlo agrees with the formulas
  const mc = new Rng(11); let c = 0; const M = 40000;
  for (let i = 0; i < M; i++) c += G.playPool(100, 50, 50, mc);
  assert.ok(Math.abs(c / M / 100 - G.poolEv(50, 50)) < 0.03);
});

test('property: income prorated by hours with traffic and upgrades, closures stop it, trouble is weekly and answerable', () => {
  const rig = makeRig(21); rig.inv.ensure(TEDDY).money = usd(100000);
  const { eco, time, inv } = rig;
  assert.ok(eco.buyBusiness(TEDDY, 'biz.laundromat') && !eco.buyBusiness(NICK, 'biz.laundromat'), 'one owner');
  const till = () => eco.property.owned.get('biz.laundromat')!.till;
  const net = eco.property.netWeekly('biz.laundromat');
  time.advance(84, 'wait');
  assert.ok(Math.abs(till() - net / 2) < 1, `half a week earns half the net (${till()} vs ${net / 2})`);
  const day = eco.property.defs.get('biz.laundromat')!;
  eco.property.setTraffic(day.block, 2);
  assert.ok(eco.property.netWeekly('biz.laundromat') > net * 1.5, 'foot traffic scales income');
  eco.property.setTraffic(day.block, 1);
  const before = eco.property.netWeekly('biz.laundromat');
  assert.ok(eco.buyUpgrade(TEDDY, 'biz.laundromat', 'machines'));
  assert.ok(eco.property.netWeekly('biz.laundromat') > before, 'upgrades raise income');
  assert.equal(eco.attempt(TEDDY, 'property.collect').ok, true);
  assert.equal(till(), 0);
  // a closed business earns nothing but still pays wages and the pad
  const o = eco.property.owned.get('biz.laundromat')!; o.closedUntilH = eco.nowH() + 48;
  time.advance(24, 'wait');
  assert.ok(o.till === 0, 'closed: no income, till cannot go negative');
  // weekly trouble: run 40 weeks, every kind shows up, and refusing a shakedown closes the shop
  const seen = new Set<string>(); let closed = 0;
  eco.on('troubled', (t) => { seen.add(t.kind); if (t.kind === 'shakedown' && t.decision === 'refuse' && t.closedDays > 0) closed++; });
  eco.choose = (t) => (t.kind === 'shakedown' ? 'refuse' : 'pay');
  for (let i = 0; i < 40 * 7; i++) time.advance(24, 'wait');
  for (const k of ['shakedown', 'protection', 'brownout', 'breakin']) assert.ok(seen.has(k), `trouble kind ${k} occurs`);
  assert.ok(closed > 0);
  void inv;
});

test('loans: Nick lends, interest compounds daily, repayment is drawn from the borrower cash, a relationship event is emitted', () => {
  const l = new Loans();
  assert.equal(l.lend(TEDDY, DELPHINE, usd(50), 0), null, 'only Nick lends');
  assert.equal(l.lend(NICK, NICK, usd(50), 0), null);
  const rig = makeRig(8); const { eco, inv, time } = rig;
  inv.ensure(TEDDY).money = usd(10); inv.ensure(NICK).money = usd(300);
  const rel: { delta: number }[] = [], due: E.LoanDue[] = [];
  eco.on('relationship', (e) => rel.push(e)); eco.on('loanDue', (e) => due.push(e));
  assert.ok(eco.lend(NICK, TEDDY, usd(100)));
  assert.equal(inv.ensure(NICK).money, usd(200)); assert.equal(inv.ensure(TEDDY).money, usd(110));
  assert.ok(!eco.lend(NICK, TEDDY, usd(450)), 'a cap on what one lead can owe');
  time.advance(24, 'wait'); time.advance(24, 'wait');
  assert.equal(eco.loans.outstanding(TEDDY), Math.round(Math.round(usd(100) * 1.012) * 1.012), 'daily compounding');
  inv.ensure(TEDDY).money = usd(40); // can only part-pay at the due date
  for (let i = 0; i < 5; i++) time.advance(24, 'wait');
  assert.equal(due.length, 1);
  assert.equal(due[0].paid, usd(40), 'repayment comes from the borrower cash');
  assert.equal(inv.ensure(TEDDY).money, 0);
  assert.ok(due[0].remaining > 0 && eco.loans.outstanding(TEDDY) > 0, 'the rest rolls over');
  inv.ensure(TEDDY).money = usd(500);
  const paid = eco.repay(TEDDY, usd(500));
  assert.ok(paid > 0 && eco.loans.outstanding(TEDDY) === 0);
  assert.equal(inv.ensure(TEDDY).money, usd(500) - paid, 'change is returned');
  for (let i = 0; i < 8; i++) time.advance(24, 'wait');
  assert.ok(rel.length >= 1, 'a relationship event was emitted');
});

// ---------------------------------------------------------------------------------- the Economy wiring
test('economy: attempt() reports crimes through the callback, pays through the inventory, and emits events', () => {
  const rig = makeRig(31); const { eco, inv, rng } = rig;
  const seen: string[] = [];
  for (const k of ['paid', 'robbed', 'jobDone', 'fenced', 'betSettled'] as const) eco.on(k, () => seen.push(k));
  // armed register -> assault_weapon, unarmed -> theft
  const armed = eco.attempt(TEDDY, 'crime.register', { armed: true });
  assert.ok(armed.crimes.includes('assault_weapon') && armed.ok === true && armed.cents > 0);
  const unarmed = eco.attempt(TEDDY, 'crime.register', { armed: false, target: 'shop.drug_7th' });
  assert.deepEqual(unarmed.crimes.filter((c) => c === 'theft'), ['theft']);
  assert.ok(rig.crimes.length >= 2, 'the host callback saw the crimes');
  // wrong lead / missing requirement are refused without side effects
  const before = inv.ensure(DELPHINE).money;
  assert.equal(eco.attempt(DELPHINE, 'job.locksmith').reason, 'wrong_lead');
  assert.equal(eco.attempt(TEDDY, 'job.cab').reason, 'needs_hack_licence');
  assert.equal(eco.attempt(DELPHINE, 'crime.hijack').reason, 'needs_car');
  assert.equal(inv.ensure(DELPHINE).money, before);
  // a job, a fenced burglary, and bets
  rig.flags.add('hack_licence');
  assert.ok(eco.attempt(TEDDY, 'job.cab').cents >= 0);
  let fenced = 0; for (let i = 0; i < 6; i++) fenced += eco.attempt(TEDDY, 'crime.burglary').cents; rig.time.advance(300, 'wait');
  assert.ok(fenced > 0);
  const bet = eco.attempt(TEDDY, 'gamble.pool', { stake: usd(5) });
  assert.ok(bet.ok && bet.cents !== 0);
  bareLead(rig, DELPHINE);
  assert.equal(eco.attempt(DELPHINE, 'gamble.otb').reason, 'broke', 'no credit at the window');
  for (const k of ['paid', 'robbed', 'fenced', 'betSettled']) assert.ok(seen.includes(k), `event ${k}`);
  void rng;
  // the daily number settles at the next draw, pays 600:1 on a hit
  const pick = E.gambling.drawNumber(rig.time.clock.day, 31); // today's draw is the one settled at midnight
  const cash = inv.ensure(TEDDY).money;
  assert.ok(eco.placeNumber(TEDDY, pick, usd(2)));
  assert.equal(inv.ensure(TEDDY).money, cash - usd(2));
  const settled: number[] = []; eco.on('betSettled', (e) => { if (e.game === 'number') settled.push(e.net); });
  rig.time.advance(10, 'wait'); rig.time.advance(10, 'wait');
  assert.deepEqual(settled, [usd(2) * 600]);
  assert.equal(inv.ensure(TEDDY).money, cash - usd(2) + usd(2) * 601);
});

test('economy: serialize / restore round-trips state', () => {
  const a = makeRig(40);
  for (let i = 0; i < 5; i++) { a.eco.attempt(TEDDY, 'crime.register'); a.time.advance(5, 'wait'); a.eco.attempt(TEDDY, 'crime.burglary'); }
  a.inv.ensure(TEDDY).money = usd(5000); a.eco.buyBusiness(TEDDY, 'biz.newsstand');
  const s = JSON.parse(JSON.stringify(a.eco.serialize()));
  const b = makeRig(41); b.eco.restore(s);
  assert.deepEqual(JSON.parse(JSON.stringify(b.eco.serialize())), s);
  assert.ok(Math.abs(b.eco.registers.tillLevel(a.eco.registers.best(a.eco.nowH()), 0) - 1) >= 0);
});

// -------------------------------------------------------------------------------------- the simulation
// Narrative's story pay (claude/sharp-maxwell-jnb6hr f0a96c9; snapshot of content/missions/*.json rewards).
// User decision (2026-11-26, verbatim): "Yes, but in GTA VI you can really rack up money. Like 10s of thousands".
const STORY = storyFromNarrative(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/narrative/missions.json'), 'utf8')).missions);
const SIDE = sideFromNarrative(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/narrative/side.json'), 'utf8')).side);
const rates = measureRates({ story: STORY });
const mixed = runPlaythrough({ story: STORY, side: SIDE });
const perRealHour = (r: Rate) => r.centsPerGameHour * 30;

test('balance: missions are by far the best earner; street work stays modest; risky crime scales; property pays back in hours of play', () => {
  const ref = missionRate({ story: STORY }) * 30;
  console.log(`\n== story: $${storyTotal(STORY) / 100} over ${storyHours(STORY).toFixed(1)} h of missions = $${(ref / 100).toFixed(0)} per real hour (1.00x) ==`);
  const line = (r: Rate) => `${r.id.padEnd(18)} $${(perRealHour(r) / 100).toFixed(0).padStart(6)} per real hour  ${r.ratio.toFixed(3)}x`;
  for (const r of [...rates.jobs, ...rates.crimes]) console.log(line(r));
  assert.ok(storyTotal(STORY) >= usd(80000), 'the story pays tens of thousands per lead');
  // missions are the best earner per hour of play, by a wide margin
  for (const r of [...rates.jobs, ...rates.crimes]) assert.ok(r.ratio < 0.25 && r.activeRatio < 0.35, `${r.id} ${r.ratio}x of missions`);
  // street-level work stays at 1974 wages: a few dollars a fare, $15 a garment run
  for (const id of ['job.cab', 'job.garment', 'job.locksmith', 'job.tow', 'crime.register', 'crime.pickpocket']) {
    const r = [...rates.jobs, ...rates.crimes].find((x) => x.id === id)!;
    assert.ok(perRealHour(r) <= usd(150), `${id} stays modest ($${perRealHour(r) / 100}/h)`);
  }
  // risky crime scales with the risk: a hijack beats a register; the best crime beats the best legal job many times over
  const get = (id: string) => rates.crimes.find((x) => x.id === id)!;
  assert.ok(perRealHour(get('crime.hijack')) > 5 * perRealHour(get('crime.register')));
  assert.ok(rates.crimeBest.ratio > 5 * rates.legalBest.ratio);
  // property: payback in real hours of play, by tier
  const BAND = { starter: [2, 8], mid: [8, 14], big: [15, 30] } as const;
  for (const p of rates.property) {
    const d = E.DEFAULT_BUSINESSES.find((b) => b.id === p.id)!; const payback = d.price / perRealHour(p);
    console.log(`${p.id.padEnd(20)} ${d.tier.padEnd(7)} $${(d.price / 100).toFixed(0).padStart(6)}  nets $${(perRealHour(p) / 100).toFixed(0)}/real h  pays back in ${payback.toFixed(1)} h`);
    assert.ok(payback >= BAND[d.tier][0] && payback <= BAND[d.tier][1], `${p.id} pays back in ${payback.toFixed(1)} h`);
  }
  const price = (t: string) => E.DEFAULT_BUSINESSES.filter((b) => b.tier === t).map((b) => b.price);
  assert.ok(price('starter').every((c) => c >= usd(1000) && c <= usd(5000)), 'starters in the low thousands');
  assert.ok(price('mid').every((c) => c >= usd(10000) && c <= usd(25000)), 'mid tier $10-25k');
  assert.ok(price('big').every((c) => c >= usd(50000) && c <= usd(150000)), 'big $50-150k');
  assert.ok(E.DEFAULT_BUSINESSES.filter((b) => b.lead === 'char.nick_varelas').every((b) => b.price === Math.max(...E.DEFAULT_BUSINESSES.map((x) => x.price))), "Nick's supper club is the last and dearest");
});

test('the curve: a starter early, mid tier mid-game, big property late through the big scores; tens of thousands per lead at story end', () => {
  const seeds = [1974, 7, 99, 3, 42];
  const typical = [mixed, ...seeds.slice(1).map((seed) => runPlaythrough({ seed, story: STORY, side: SIDE }))];
  const best = seeds.map((seed) => runPlaythrough({ seed, story: STORY, side: SIDE, branches: 'best' }));
  for (const r of [...typical, ...best]) {
    assert.ok(r.storyEndH !== null && r.storyEndH >= 20 && r.storyEndH <= 27, `story ends at ${r.storyEndH} h`);
    const first = r.bought[0];
    // timing is set by Act 1's pay: Teddy crosses ~$1k after mission 7
    assert.ok(first && first.tier === 'starter' && first.realHour <= 6.5, `first business ${JSON.stringify(first)}`);
  }
  const midAt = typical.map((r) => r.bought.find((b) => b.tier === 'mid')?.realHour ?? Infinity).sort((a, b) => a - b);
  const median = midAt[Math.floor(midAt.length / 2)];
  console.log(`mid-tier at ${midAt.map((h) => h.toFixed(1)).join(', ')} h (median ${median.toFixed(1)})`);
  assert.ok(median >= 8 && median <= 12 && midAt.every((h) => h <= 14), 'mid tier mid-game');
  const bigAt = best.map((r) => r.bought.find((b) => b.tier === 'big')?.realHour ?? Infinity);
  console.log(`taking the best-paying choices, the first big property comes at ${bigAt.map((h) => h.toFixed(1)).join(', ')} h`);
  assert.ok(bigAt.every((h) => h >= 18 && h <= 30), 'big property late, through the big scores');
  for (const r of typical) assert.ok(!r.bought.some((b) => b.tier === 'big' && b.realHour < 18), 'nothing big early');
  // story end: tens of thousands in every wallet
  // (cash plus the businesses each lead bought: a lead who just bought the arcade is rich, not broke)
  const priceOf = (id: string) => E.DEFAULT_BUSINESSES.find((b) => b.id === id)!.price;
  for (const r of [...typical, ...best]) for (const [lead, c] of Object.entries(r.final)) {
    const worth = c + r.bought.filter((b) => b.lead === lead).reduce((a, b) => a + priceOf(b.id), 0);
    assert.ok(worth >= usd(10000), `${lead} ends worth $${worth / 100}`);
  }
  const nw = typical.map((r) => r.netWorth / 100).sort((a, b) => a - b);
  console.log(`story-end net worth, typical: $${nw.map((x) => x.toFixed(0)).join(', $')}`);
  assert.ok(nw[0] >= 50000 && nw[nw.length - 1] <= 300000);
  // money worth chasing gets spent: a premium car, the tailor
  assert.ok(typical.some((r) => (r.spent['premium car'] ?? 0) > 0) && typical.some((r) => (r.spent['tailored suits'] ?? 0) > 0));
  // heat costs money somewhere across the seeds; rent and clothes always
  assert.ok(typical.some((r) => (r.spent.bribe ?? 0) > 0) && typical.every((r) => r.spent.rent > 0 && r.spent.clothes > 0));
  // Brownout's $6k debt comes out of Nick's next income (M18); side content pays
  for (const r of typical) assert.equal(r.spent.debt, usd(6000), 'the Brownout debt is repaid from the next income');
  assert.ok(typical.every((r) => r.earned.side > usd(10000)), 'side content pays thousands');
  // the curve rises and every lead is checkpointed every real hour
  assert.equal(mixed.curve.length, mixed.realHours + 1);
  assert.ok(mixed.curve.at(-1)!.total > mixed.curve[0].total && mixed.curve.every((c) => Object.keys(c.cash).length === 3));
});

test('no runaway wealth: a free-roam-only grinder earns a fraction of what the story pays', () => {
  const grind = [1974, 7, 99].map((seed) => runPlaythrough({ seed, story: STORY, greedy: true, missionShare: 0 }));
  // (side content is one-off and excluded here: the grinder farms only the repeatable activities)
  for (const g of grind) assert.ok(g.total - g.startTotal <= 0.25 * storyTotal(STORY), `grinder made $${(g.total - g.startTotal) / 100} in ${g.realHours} h`);
});

test('simulation is deterministic', () => {
  const again = runPlaythrough({ story: STORY, side: SIDE });
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(mixed)));
});

test('no soft-lock: a lead with $0 and no items can earn back with a legal job that needs no startup', () => {
  for (const lead of [TEDDY, DELPHINE, NICK]) {
    const rig = makeRig(50 + lead.length); bareLead(rig, lead);
    assert.equal(rig.inv.ensure(lead).money, 0); assert.equal(rig.inv.ensure(lead).items.size, 0);
    assert.equal(rig.eco.gate(lead, 'job.garment'), null, 'the garment rush needs no money, car, item or licence');
    let earned = 0;
    for (let i = 0; i < 4; i++) { const r = rig.eco.attempt(lead, 'job.garment'); assert.ok(r.ok && r.cents >= usd(13)); earned += r.cents; rig.time.advance(r.minutes / 60, 'wait'); }
    assert.ok(earned >= usd(55), `${lead} is back on their feet with $${earned / 100}`);
    assert.equal(rig.inv.ensure(lead).money, earned);
    // and it is enough to buy back in: a licence-free cab shift is still locked, but a boosted bail skip or the film for night photos is affordable
    assert.ok(rig.inv.ensure(lead).money >= usd(5.49) * 5);
  }
});

test('no unbounded exploit: the same register, the same fence category, the same chop entry all pay diminishing returns', () => {
  const rig = makeRig(60); const { eco, time } = rig;
  const shop = 'shop.theatre_box';
  const first = eco.attempt(TEDDY, 'crime.register', { target: shop }).cents;
  let rest = 0, last = 0;
  for (let i = 0; i < 10; i++) { time.advance(150 / 60, 'wait'); last = eco.attempt(TEDDY, 'crime.register', { target: shop }).cents; rest += last; }
  console.log(`\nsame register ten more times: first ${(first / 100).toFixed(0)}$, next ten total ${(rest / 100).toFixed(0)}$, last ${(last / 100).toFixed(0)}$`);
  assert.ok(rest < first, 'ten repeat hits in a day together pay less than the first');
  assert.ok(last < first * 0.25);
  // fencing: same category, same fence
  const f = new Fences(); f.rollWeek(2);
  const payAt = (n: number) => { const c: number[] = []; for (let i = 0; i < n; i++) c.push(f.sell('fence.drago', lot('furs', usd(3000)), 0)!.cents); return c; };
  const p = payAt(10);
  console.log(`fence.drago furs x10 at $3,000 street: first ${(p[0] / 100).toFixed(0)}$ ... tenth ${(p[9] / 100).toFixed(0)}$, total ${(p.reduce((a, b) => a + b, 0) / 100).toFixed(0)}$ vs ${(p[0] * 10 / 100).toFixed(0)}$ undiminished`);
  assert.ok(p[9] < p[0] * 0.35, 'the tenth lot pays a third of the first');
  assert.ok(p.reduce((a, b) => a + b, 0) < p[0] * 10 * 0.5, 'the batch pays under half of linear');
  // the weekly chop list cannot be farmed: only one delivery per entry, scrap otherwise
  const shop2 = new ChopShop(); const e = chopList(1)[0];
  const pay = shop2.deliver(1, { cls: e.cls, colour: e.colour, condition: 1 }).cents;
  const dupes = [1, 2, 3, 4].reduce((a) => a + shop2.deliver(1, { cls: e.cls, colour: e.colour, condition: 1 }).cents, 0);
  assert.ok(dupes < pay * 0.5);
  // hijack and burglary pools run dry: back-to-back attempts pay less and less
  const r2 = makeRig(61); r2.flags.add('car.' + TEDDY);
  const b: number[] = []; for (let i = 0; i < 12; i++) b.push(r2.eco.attempt(TEDDY, 'crime.burglary').cents);
  const early = b.slice(0, 4).reduce((a, x) => a + x, 0), late = b.slice(8).reduce((a, x) => a + x, 0);
  assert.ok(late < early, `burglary pool depletes (${early} then ${late})`);
});

test('economy curve: print the money curve and write shots/gameplay/economy_curve.json', () => {
  const names: Record<string, string> = { [TEDDY]: 'Teddy', [DELPHINE]: 'Delphine', [NICK]: 'Nick' };
  console.log(`\n== ${mixed.realHours}-hour playthrough with narrative's story pay: cash + savings per lead at each real-hour checkpoint ($) ==`);
  console.log('hour   Teddy  Delphine    Nick   total');
  for (const c of mixed.curve) console.log(`${String(c.realHour).padStart(4)} ${[TEDDY, DELPHINE, NICK].map((l) => (c.cash[l] / 100).toFixed(0).padStart(7)).join(' ')} ${(c.total / 100).toFixed(0).padStart(7)}`);
  const f = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v / 100)]));
  console.log('earned $', JSON.stringify(f(mixed.earned as unknown as Record<string, number>)), '| spent $', JSON.stringify(f(mixed.spent)), '| owned', mixed.owned.join(','), '| visible crimes', mixed.visibleCrimes);
  console.log('hours by category', JSON.stringify(Object.fromEntries(Object.entries(mixed.hoursBy).map(([k, v]) => [k, Math.round(v)]))), '| attempts', JSON.stringify(mixed.attempts));
  console.log(`final cash $${(mixed.total / 100).toFixed(0)} + assets $${(mixed.assets / 100).toFixed(0)}; start $${(mixed.startTotal / 100).toFixed(0)}; the story pays $${storyTotal(STORY) / 100}; story ended at ${mixed.storyEndH?.toFixed(1)} h`);
  const out = path.join(import.meta.dirname, '..', '..', '..', 'shots', 'gameplay', 'economy_curve.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const dollars = (c: number) => Math.round(c) / 100;
  fs.writeFileSync(out, JSON.stringify({
    description: mixed.realHours + "-hour playthrough on narrative's story pay (snapshot f0a96c9), deterministic (seed " + mixed.seed + '). 1 game minute = 2 real seconds. Money in dollars. User decision: "Yes, but in GTA VI you can really rack up money. Like 10s of thousands".',
    storyPay: dollars(storyTotal(STORY)), storyHours: +storyHours(STORY).toFixed(2), storyEndRealHour: mixed.storyEndH, netWorth: dollars(mixed.netWorth),
    realHours: mixed.realHours, gameHours: mixed.gameHours,
    curve: mixed.curve.map((c) => ({ realHour: c.realHour, gameHour: c.gameHour, total: dollars(c.total), leads: Object.fromEntries(Object.entries(c.cash).map(([k, v]) => [names[k], dollars(v)])) })),
    final: Object.fromEntries(Object.entries(mixed.final).map(([k, v]) => [names[k], dollars(v)])),
    totalCash: dollars(mixed.total), assetsAtPurchasePrice: dollars(mixed.assets), startCash: dollars(mixed.startTotal),
    earned: Object.fromEntries(Object.entries(mixed.earned).map(([k, v]) => [k, dollars(v)])), spent: Object.fromEntries(Object.entries(mixed.spent).map(([k, v]) => [k, dollars(v)])),
    hoursByCategory: mixed.hoursBy, attempts: mixed.attempts, owned: mixed.owned, bought: mixed.bought.map((b) => ({ ...b, realHour: +b.realHour.toFixed(2) })), businesses: E.DEFAULT_BUSINESSES.map((b) => ({ id: b.id, tier: b.tier, price: b.price / 100, lead: b.lead })),
    hourlyVsMissions: {
      missionsPerRealHour: dollars(missionRate({ story: STORY }) * 30),
      bestLegal: { id: rates.legalBest.id, ratio: +rates.legalBest.ratio.toFixed(3) }, bestCrime: { id: rates.crimeBest.id, ratio: +rates.crimeBest.ratio.toFixed(3) },
      all: Object.fromEntries([...rates.jobs, ...rates.crimes, ...rates.property].map((r) => [r.id, { vsMissions: +r.ratio.toFixed(3), dollarsPerRealHour: Math.round(r.centsPerGameHour * 30) / 100 }])),
    },
  }, null, 1) + '\n');
  assert.ok(fs.existsSync(out));
});

/**
 * Period dating: decides whether a building in today's data stood in summer 1974.
 *
 * Sources, per building:
 *   P = PLUTO yearbuilt (per tax lot; can lag when a new building replaces an old one on the same lot)
 *   F = NYC footprint construction_year (per building; sometimes stamped with a later renovation year)
 *   O = OSM start_date on the outline with the same BIN (hand-curated; usually the original build)
 *
 * Rule (first match wins):
 *   0. Not a finished building (under construction, skybridge, etc.)        -> remove
 *   1. Manual override by BIN (PERIOD_OVERRIDES, each with a reason)        -> as stated
 *   2. O present:  O <= 1974 -> keep (flag if P and F both say later)
 *      2c: ...unless P and F both say > 1974 and OSM is < 15 years earlier (start vs completion) -> remove
 *                  O > 1974 -> remove, unless P and F BOTH say <= 1974 (two independent sources agree;
 *                              OSM start_date on a renovated or bundled complex) -> keep, flagged
 *   3. Any of P, F > 1974                                                   -> remove (flag if the other says earlier)
 *      except: only F > 1974, P <= 1974, and the BIN is from the original 1980s series (< 1076000).
 *      A new building gets a new BIN, so an old BIN with a new footprint year is an alteration -> keep, flagged
 *      (only if the height is plausible for the PLUTO year).
 *   4. P or F <= 1974                                                       -> keep
 *   5. No year anywhere: < 40 m keep as c.1920 (flagged), >= 40 m remove (an undated tower is almost always new)
 * Removing is the safe failure: a stand-in of the right era replaces it. Keeping a modern tower is the bad failure.
 */
import { CUTOFF_YEAR, PERIOD_OVERRIDES } from './era1974.ts';

export interface DatingInput {
  bin?: string; featureCode?: string; status?: string; heightM: number;
  pluto?: number; footprint?: number; osm?: number; osmName?: string;
}
export interface Dating {
  keep: boolean; year: number; rule: string; reason: string; flagged: boolean;
  heightOverride?: number; name?: string;
}

const BUILDING_CODES = new Set(['2100', '5110']); // building, garage

export function osmYear(v: string | undefined): number {
  const m = v?.match(/\d{4}/); return m ? parseInt(m[0]) : 0;
}

export function dateBuilding(d: DatingInput): Dating {
  const P = d.pluto || 0, F = d.footprint || 0, O = d.osm || 0;
  const src = `PLUTO ${P || '-'} / footprint ${F || '-'} / OSM ${O || '-'}`;
  if (d.featureCode && !BUILDING_CODES.has(d.featureCode)) return { keep: false, year: 0, rule: '0', reason: `feature code ${d.featureCode} is not a finished building`, flagged: false };
  // last_status_type records the latest *edit* (Alteration, Merged, Split, Correction...), so only
  // statuses that mean "not standing" exclude a building.
  if (d.status && /marked for|demolition/i.test(d.status)) return { keep: false, year: 0, rule: '0', reason: `status "${d.status}"`, flagged: false };
  const ov = d.bin ? PERIOD_OVERRIDES[d.bin] : undefined;
  if (ov) return { keep: ov.action === 'keep', year: ov.year ?? (P || F || 1920), rule: '1', reason: `override: ${ov.reason} (${src})`, flagged: false, heightOverride: ov.height, name: ov.name };
  if (O) {
    if (O <= CUTOFF_YEAR) {
      // Both city sources agree on a later year: OSM only wins if it is decades earlier (an original
      // landmark later rebuilt, e.g. a 1918 theatre renovated 1999). A gap of a few years is a
      // construction-start vs completion ambiguity -> trust the city's completion year.
      if (P > CUTOFF_YEAR && F > CUTOFF_YEAR && Math.min(P, F) - O < 15)
        return { keep: false, year: Math.min(P, F), rule: '2c', reason: `PLUTO and footprint agree on ${P}/${F}; OSM ${O} read as construction start (${src})`, flagged: true };
      return { keep: true, year: O, rule: '2', reason: `OSM start_date ${O} (${src})`, flagged: P > CUTOFF_YEAR && F > CUTOFF_YEAR };
    }
    if (P && F && P <= CUTOFF_YEAR && F <= CUTOFF_YEAR) return { keep: true, year: P, rule: '2b', reason: `PLUTO and footprint agree on ${P}/${F}; OSM ${O} treated as renovation (${src})`, flagged: true };
    return { keep: false, year: O, rule: '2', reason: `OSM start_date ${O} (${src})`, flagged: (P && P <= CUTOFF_YEAR) || (F && F <= CUTOFF_YEAR) ? true : false };
  }
  const binNum = parseInt(d.bin ?? '0');
  // Height-for-era sanity: a pre-1890 building over ~30 m, or 1890-1915 over ~80 m, is a newer structure.
  const plausible = P >= 1916 || (P >= 1890 ? d.heightM <= 80 : d.heightM <= 30);
  if (F > CUTOFF_YEAR && P > 0 && P <= CUTOFF_YEAR && binNum > 1000000 && binNum < 1076000 && plausible)
    return { keep: true, year: P, rule: '3b', reason: `footprint year ${F} on original-series BIN read as an alteration; height may include a later addition (${src})`, flagged: true };
  if (P > CUTOFF_YEAR || F > CUTOFF_YEAR) {
    const conflict = (P > 0 && P <= CUTOFF_YEAR) || (F > 0 && F <= CUTOFF_YEAR);
    return { keep: false, year: Math.max(P, F), rule: '3', reason: `built after 1974 per ${P > CUTOFF_YEAR ? 'PLUTO' : 'footprint'} (${src})`, flagged: conflict };
  }
  if (P || F) return { keep: true, year: P || F, rule: '4', reason: src, flagged: false };
  if (d.heightM < 40) return { keep: true, year: 1920, rule: '5', reason: `undated, ${d.heightM.toFixed(0)} m: assumed c.1920`, flagged: true };
  return { keep: false, year: 0, rule: '5', reason: `undated tower ${d.heightM.toFixed(0)} m: assumed modern`, flagged: true };
}

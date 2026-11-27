/**
 * Map places: the schema of public/data/ui/places.json (built by tools/ui/places.ts) and the
 * discovery categories from docs/briefs/FEATURE_AUDIT.md "Map discovery".
 */
export type Category =
  | 'home' | 'safehouse' | 'property' | 'forsale'
  | 'food' | 'bar' | 'clothes' | 'shop' | 'garage' | 'payphone' | 'callbox' | 'subway'
  | 'service' | 'police' | 'hospital' | 'crime' | 'job' | 'stranger' | 'mission' | 'landmark' | 'collectible';

/** How a place can be revealed. 'sight' = walking/driving past it (only for things you can see from the street). */
export type RevealVia = 'sight' | 'enter' | 'tip' | 'overheard' | 'news' | 'call' | 'card' | 'mission' | 'start';

export interface Place {
  id: string;                // narrative id (loc.*) or ui-generated id (ui.*)
  name: string;
  cat: Category;
  x: number; z: number;
  address: string;           // "W 31 St & 8 Av"
  blurb?: string;            // info-card text
  reveal: RevealVia[];       // accepted reveal channels
  sightM?: number;           // reveal radius for 'sight'
  shady?: boolean;           // only revealed once introduced (tip/mission/card), never by sight
  hours?: string;            // "6 AM – 11 PM"
  lead?: string;             // home/safehouse owner (char.*)
  source: 'narrative' | 'chunks' | 'generated';
  /** true until interiors/narrative supply the real business at this spot (generated stand-in). */
  placeholder?: boolean;
  /** 'toast' = worth coming back to (a story contact, side-quest giver, seller): one "Added to map" note.
   *  Everything else appears on the map silently (narrative: places.json discovery.notify). */
  notify?: 'toast';
  /** Player-facing second line of the toast (narrative: discovery.notifyLine). */
  notifyLine?: string;
}

export interface PlacesFile { format: 't74-ui-places'; version: 1; generatedFrom: string[]; places: Place[] }

export interface CategoryDef { id: Category; label: string; group: FilterGroup; color: string }
export type FilterGroup = 'yours' | 'eat' | 'shop' | 'travel' | 'services' | 'trouble' | 'work' | 'story';

export const FILTER_GROUPS: { id: FilterGroup; label: string }[] = [
  { id: 'story', label: 'Story' }, { id: 'yours', label: 'Yours' }, { id: 'eat', label: 'Eat & drink' }, { id: 'shop', label: 'Shops' },
  { id: 'travel', label: 'Getting around' }, { id: 'services', label: 'Services' }, { id: 'work', label: 'Work' }, { id: 'trouble', label: 'Trouble' },
];

/** Ink colours sit inside the print palette of a 1974 two-colour street guide plus pencil. */
export const CATEGORIES: Record<Category, CategoryDef> = {
  home:       { id: 'home', label: 'Home', group: 'yours', color: '#b2302a' },
  safehouse:  { id: 'safehouse', label: 'Safehouse', group: 'yours', color: '#b2302a' },
  property:   { id: 'property', label: 'Your property', group: 'yours', color: '#b2302a' },
  forsale:    { id: 'forsale', label: 'For sale', group: 'yours', color: '#6b5a2a' },
  food:       { id: 'food', label: 'Diner · lunch counter', group: 'eat', color: '#2e4a6b' },
  bar:        { id: 'bar', label: 'Bar', group: 'eat', color: '#2e4a6b' },
  clothes:    { id: 'clothes', label: 'Clothing', group: 'shop', color: '#2e4a6b' },
  shop:       { id: 'shop', label: 'Shop', group: 'shop', color: '#2e4a6b' },
  garage:     { id: 'garage', label: 'Garage', group: 'travel', color: '#3a3a3a' },
  payphone:   { id: 'payphone', label: 'Payphone', group: 'travel', color: '#3a3a3a' },
  callbox:    { id: 'callbox', label: 'Police call box', group: 'trouble', color: '#b2302a' },
  subway:     { id: 'subway', label: 'Subway', group: 'travel', color: '#1f5a3a' },
  service:    { id: 'service', label: 'Services', group: 'services', color: '#2e4a6b' },
  police:     { id: 'police', label: 'Station house', group: 'services', color: '#1d3557' },
  hospital:   { id: 'hospital', label: 'Hospital', group: 'services', color: '#b2302a' },
  crime:      { id: 'crime', label: 'Contact', group: 'trouble', color: '#5a2330' },
  job:        { id: 'job', label: 'Work', group: 'work', color: '#6b5a2a' },
  stranger:   { id: 'stranger', label: 'Stranger', group: 'story', color: '#6b5a2a' },
  mission:    { id: 'mission', label: 'Story', group: 'story', color: '#b2302a' },
  landmark:   { id: 'landmark', label: 'Landmark', group: 'story', color: '#2e171d' },
  collectible:{ id: 'collectible', label: 'Found', group: 'story', color: '#6b5a2a' },
};

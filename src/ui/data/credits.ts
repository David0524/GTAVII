/**
 * Credits and attributions for every stream. Each stream appends its own section here (or sends the
 * UI stream a line); the full licence texts come from public/data/ui/licences.json (tools/ui/credits.ts).
 * Sources checked 2026-11-26: DATA_SOURCES.md, public/fonts/LICENSES.md, docs/AUDIO_SOURCES.md (audio
 * branch), tools/characters (characters branch), the narrative content notes.
 */
export interface CreditSection { title: string; lines: { role?: string; text: string; href?: string }[] }

export const CREDITS: CreditSection[] = [
  { title: 'Tenderloin \'74', lines: [
    { text: 'An open-world story set in Manhattan\'s Tenderloin, summer 1974.' },
    { text: 'Every business, brand, vehicle make, newspaper and person in the game is invented. Real places appear as they stood in 1974.' },
  ] },
  { title: 'The city', lines: [
    { role: 'Streets, landmarks, subway entrances', text: 'Map data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).', href: 'https://www.openstreetmap.org/copyright' },
    { role: 'Building footprints and heights', text: 'NYC Building Footprints, NYC Office of Technology & Innovation, NYC Open Data (terms of use).', href: 'https://opendata.cityofnewyork.us/overview/#termsofuse' },
    { role: 'Year built, land use', text: 'PLUTO, NYC Department of City Planning, NYC Open Data (terms of use).' },
    { role: 'Terrain', text: 'Derived from the footprint dataset\'s ground elevations (NAVD88).' },
    { role: '1974 corrections', text: 'Buildings dated against three sources; towers built after 1974 replaced by period stand-ins (docs/PERIOD_AUDIT.md).' },
  ] },
  { title: 'Period reference', lines: [
    { text: 'DOCUMERICA (US Environmental Protection Agency, 1971–1977), US National Archives. Public domain.', href: 'https://catalog.archives.gov/' },
  ] },
  { title: 'People', lines: [
    { role: 'Base body and rig source', text: 'MakeHuman base mesh and targets (CC0 assets), reshaped and re-rigged by the characters workstream.' },
  ] },
  { title: 'Sound', lines: [
    { text: 'Every sound is synthesised by code in this project (docs/AUDIO_SOURCES.md). No recordings, samples or impulse responses are used.' },
    { role: 'Music', text: 'Placeholder generative beds until the music source is decided.' },
  ] },
  { title: 'Type', lines: [
    { role: 'Fraunces', text: 'Copyright 2018 The Fraunces Project Authors. SIL Open Font License 1.1.' },
    { role: 'League Gothic', text: 'Copyright 2020 The League Gothic Project Authors. SIL Open Font License 1.1.' },
    { role: 'Archivo', text: 'Copyright 2017 The Archivo Project Authors. SIL Open Font License 1.1.' },
    { role: 'Courier Prime', text: 'Copyright 2015 The Courier Prime Project Authors. SIL Open Font License 1.1.' },
  ] },
  { title: 'Software', lines: [
    { role: 'three.js', text: 'Copyright © 2010–2026 three.js authors. MIT License.' },
    { role: 'Rapier physics', text: 'By Dimforge. Apache License 2.0.' },
  ] },
  { title: 'Made with', lines: [
    { text: 'Engine and city, narrative, simulation, vehicles, characters, interiors, gameplay, audio, and UI & cinematics workstreams.' },
  ] },
];

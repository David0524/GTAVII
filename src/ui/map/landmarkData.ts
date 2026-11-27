/** The registry instance, loaded from content/landmarks.json when it exists (Vite-only; landmarks.ts stays pure for tests). */
import { Landmarks, type LandmarkEntry } from './landmarks';

const FILE = Object.values(import.meta.glob<{ landmarks?: LandmarkEntry[] } | LandmarkEntry[]>('/content/landmarks.json', { eager: true, import: 'default' }))[0];
export const landmarks = new Landmarks(Array.isArray(FILE) ? FILE : FILE?.landmarks ?? []);

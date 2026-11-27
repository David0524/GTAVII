/**
 * Deploy build step (ENGINE_RESPONSES "Requests check, 2026-11-27 00:33", audio 11): serve the narrative
 * content tree. The audio runtime fetches barks and radio from <base>content/, and audio:voices reads
 * public/content to render speech. content/ stays the one source; public/content is generated (gitignored).
 */
import { cpSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const src = path.join(ROOT, 'content'), dst = path.join(ROOT, 'public/content');
if (!existsSync(src)) { console.warn('[copyContent] no content/ folder; skipping'); process.exit(0); }
rmSync(dst, { recursive: true, force: true });
// JSON only: the .md notes are for the writers, not the player
cpSync(src, dst, { recursive: true, filter: (p) => !/\.md$/i.test(p) });
console.log(`[copyContent] content/ -> public/content`);

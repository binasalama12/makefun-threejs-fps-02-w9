// Coral Marina — Pier Charge: handover program for the make.fun entry.
// The playable game lives in game/ as plain static files; this program simply
// mirrors game/ and screenshots/ into the output folder and then asks the
// vendored make.fun library to summarise that output into dossier.json,
// which is the document the grader compares and the judge reads.
// Run it locally with:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output folders are created on demand; the grader hands us a writable
// /output, while local runs point MAKEFUN_OUTPUT_DIR at a scratch directory.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the competition gate: the text budget shapes the dossier bytes,
// the remaining caps only reject entries the scorer would reject anyway
// (too many screenshots, an oversized screenshot, or an oversized game tree).
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

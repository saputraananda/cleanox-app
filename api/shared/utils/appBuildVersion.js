import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

/**
 * Returns the current app build id from dist/version.json (production build).
 * Falls back to APP_BUILD_ID env, then "dev" / "unknown".
 */
export function getAppBuildId() {
  if (process.env.APP_BUILD_ID) {
    return String(process.env.APP_BUILD_ID);
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'dev';
  }

  const versionPath = path.join(ROOT_DIR, 'dist', 'version.json');
  try {
    const raw = fs.readFileSync(versionPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.buildId) return String(parsed.buildId);
  } catch {
    // missing or invalid version file
  }

  return 'unknown';
}

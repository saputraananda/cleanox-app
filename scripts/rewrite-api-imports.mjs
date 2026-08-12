import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve('api');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.js$/.test(ent.name)) out.push(p);
  }
  return out;
}

function rewriteFile(file) {
  const rel = path.relative(apiRoot, file).replace(/\\/g, '/');
  let text = fs.readFileSync(file, 'utf8');
  const before = text;

  // Controllers / routes under auth|mobile|web
  if (/^(auth|mobile|web)\//.test(rel)) {
    text = text.replace(/from ['"]\.\.\/db\//g, "from '../../shared/db/");
    text = text.replace(/from ['"]\.\.\/utils\//g, "from '../../shared/utils/");
    text = text.replace(/from ['"]\.\.\/middleware\//g, "from '../../shared/middleware/");

    // STORAGE_BASE: was ../../src/assets from api/controllers → now ../../../src/assets
    text = text.replace(
      /path\.resolve\(__dirname,\s*['"]\.\.\/\.\.\/src\/assets['"]\)/g,
      "path.resolve(__dirname, '../../../src/assets')"
    );
  }

  if (text !== before) {
    fs.writeFileSync(file, text);
    console.log('updated', rel);
    return true;
  }
  return false;
}

let n = 0;
for (const file of walk(apiRoot)) {
  // skip leftover old flat dirs if any
  const rel = path.relative(apiRoot, file).replace(/\\/g, '/');
  if (/^(controllers|routes|utils|db|middleware)\//.test(rel)) continue;
  if (rewriteFile(file)) n += 1;
}
console.log('api files changed', n);

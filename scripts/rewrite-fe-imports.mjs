import fs from 'fs';
import path from 'path';

const root = path.resolve('src');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function rewrite(text, area) {
  let next = text;

  // assets from pages/components (one level down from area root)
  next = next.replace(/from ['"]\.\.\/assets\//g, "from '../../assets/");

  if (area === 'shared') {
    next = next.replace(/from ['"]\.\.\/utils\/([^'"]+)['"]/g, "from '@shared/utils/$1'");
    next = next.replace(/from ['"]\.\.\/components\/([^'"]+)['"]/g, "from '@shared/components/$1'");
  }

  if (area === 'mobile') {
    next = next.replace(/from ['"]\.\.\/utils\/api\.js['"]/g, "from '@shared/utils/api.js'");
    next = next.replace(/from ['"]\.\.\/utils\/auth\.js['"]/g, "from '@shared/utils/auth.js'");
    next = next.replace(
      /from ['"]\.\.\/utils\/satisfactionSurveyFields\.js['"]/g,
      "from '@mobile/utils/satisfactionSurveyFields.js'"
    );
    next = next.replace(/from ['"]\.\.\/components\/([^'"]+)['"]/g, "from '@mobile/components/$1'");
    next = next.replace(/from ['"]\.\.\/utils\/([^'"]+)['"]/g, "from '@mobile/utils/$1'");
  }

  if (area === 'web') {
    next = next.replace(/from ['"]\.\.\/utils\/api\.js['"]/g, "from '@shared/utils/api.js'");
    next = next.replace(/from ['"]\.\.\/utils\/auth\.js['"]/g, "from '@shared/utils/auth.js'");
    next = next.replace(/from ['"]\.\.\/components\/([^'"]+)['"]/g, "from '@web/components/$1'");
    next = next.replace(/from ['"]\.\.\/utils\/([^'"]+)['"]/g, "from '@web/utils/$1'");
    // Layout may import Sidebar/Header with relative paths that became @web already
  }

  return next;
}

let changed = 0;
for (const area of ['shared', 'mobile', 'web']) {
  for (const file of walk(path.join(root, area))) {
    const before = fs.readFileSync(file, 'utf8');
    const after = rewrite(before, area);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed += 1;
      console.log('updated', path.relative(root, file));
    }
  }
}
console.log('files changed', changed);

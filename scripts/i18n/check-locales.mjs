import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const localesRoot = path.join(
  projectRoot,
  'apps',
  'mobile',
  'src',
  'shared',
  'i18n',
  'locales',
);
const localeFiles = ['en.json', 'tr.json', 'ru.json'];

function flatten(input, prefix = '') {
  const output = {};

  for (const [key, value] of Object.entries(input)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(output, flatten(value, fullKey));
      continue;
    }

    output[fullKey] = value;
  }

  return output;
}

const localeMaps = {};
for (const localeFile of localeFiles) {
  const filePath = path.join(localesRoot, localeFile);
  if (!fs.existsSync(filePath)) {
    console.error(`[i18n:check] Missing locale file: ${filePath}`);
    process.exit(1);
  }

  localeMaps[localeFile] = flatten(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

const allKeys = new Set();
for (const localeFile of localeFiles) {
  for (const key of Object.keys(localeMaps[localeFile])) {
    allKeys.add(key);
  }
}

let hasError = false;

for (const localeFile of localeFiles) {
  const missing = [...allKeys].filter((key) => !(key in localeMaps[localeFile]));
  if (missing.length === 0) {
    continue;
  }

  hasError = true;
  console.error(`[i18n:check] Missing keys in ${localeFile}: ${missing.length}`);
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
}

if (hasError) {
  process.exit(1);
}

console.log(
  `[i18n:check] Locale parity OK (${allKeys.size} keys in ${localeFiles.join(', ')})`,
);

import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());
const srcRoot = path.join(projectRoot, 'src');
const localesRoot = path.join(srcRoot, 'shared', 'i18n', 'locales');
const localeFiles = ['en.json', 'tr.json', 'ru.json'];
const sourceExtensions = new Set(['.ts', '.tsx']);

function flattenObject(input, prefix = '') {
  const output = {};

  for (const [key, value] of Object.entries(input)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(output, flattenObject(value, nextKey));
      continue;
    }

    output[nextKey] = value;
  }

  return output;
}

function walkFiles(directory, collector = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.expo') {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, collector);
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      collector.push(fullPath);
    }
  }

  return collector;
}

function collectUsedTranslationKeys(files) {
  const keys = new Set();
  const regexes = [
    /\bt\(\s*['"`]([^'"`]+)['"`]/g,
    /\bi18n\.t\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const regex of regexes) {
      for (const match of source.matchAll(regex)) {
        const key = match[1];
        if (!key || key.includes('${') || !key.includes('.')) {
          continue;
        }

        keys.add(key);
      }
    }
  }

  const keyFilePath = path.join(srcRoot, 'shared', 'i18n', 'keys.ts');
  if (fs.existsSync(keyFilePath)) {
    const source = fs.readFileSync(keyFilePath, 'utf8');
    const literalRegex = /'([a-z][a-zA-Z0-9_.-]+)'/g;
    for (const match of source.matchAll(literalRegex)) {
      const key = match[1];
      if (key.includes('.')) {
        keys.add(key);
      }
    }
  }

  return keys;
}

const localeMaps = {};
for (const localeFile of localeFiles) {
  const fullPath = path.join(localesRoot, localeFile);
  if (!fs.existsSync(fullPath)) {
    console.error(`[i18n:check] Missing locale file: ${localeFile}`);
    process.exit(1);
  }

  const localeJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  localeMaps[localeFile] = flattenObject(localeJson);
}

const allLocaleKeys = new Set();
for (const localeFile of localeFiles) {
  for (const key of Object.keys(localeMaps[localeFile])) {
    allLocaleKeys.add(key);
  }
}

let failed = false;

for (const localeFile of localeFiles) {
  const missing = [...allLocaleKeys].filter((key) => !(key in localeMaps[localeFile]));
  if (missing.length === 0) {
    continue;
  }

  failed = true;
  console.error(`[i18n:check] Missing ${missing.length} locale keys in ${localeFile}`);
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
}

const sourceFiles = walkFiles(srcRoot);
const usedKeys = collectUsedTranslationKeys(sourceFiles);

const missingFromAnyLocale = [];
for (const key of usedKeys) {
  const missingIn = localeFiles.filter((localeFile) => !(key in localeMaps[localeFile]));
  if (missingIn.length > 0) {
    missingFromAnyLocale.push({ key, missingIn });
  }
}

if (missingFromAnyLocale.length > 0) {
  failed = true;
  console.error('[i18n:check] Missing translation keys used by source files:');
  for (const issue of missingFromAnyLocale) {
    console.error(`  - ${issue.key} -> ${issue.missingIn.join(', ')}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `[i18n:check] OK - ${usedKeys.size} used keys validated, ${allLocaleKeys.size} locale keys in sync.`,
);

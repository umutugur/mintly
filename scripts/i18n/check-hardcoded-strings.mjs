import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const srcRoot = path.join(projectRoot, 'apps', 'mobile', 'src');
const extensionSet = new Set(['.tsx', '.ts']);
const ignoredPathParts = new Set(['node_modules', '.expo', 'dist', '__tests__']);
const ignoredFilePathFragments = [
  `${path.sep}shared${path.sep}i18n${path.sep}`,
  `${path.sep}shared${path.sep}theme${path.sep}`,
  `${path.sep}core${path.sep}api${path.sep}`,
];
const letterRegex = /[A-Za-zÀ-ÖØ-öø-ÿА-Яа-яЁёÇĞİÖŞÜçğıöşü]/;

const trackedProps = new Set([
  'title',
  'headerTitle',
  'tabBarLabel',
  'placeholder',
  'accessibilityLabel',
  'label',
  'subtitle',
  'description',
  'message',
]);

function walk(directory, collector = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredPathParts.has(entry.name)) {
        continue;
      }

      walk(fullPath, collector);
      continue;
    }

    if (!extensionSet.has(path.extname(entry.name))) {
      continue;
    }

    if (entry.name.endsWith('.test.tsx') || entry.name.endsWith('.test.ts')) {
      continue;
    }

    if (ignoredFilePathFragments.some((fragment) => fullPath.includes(fragment))) {
      continue;
    }

    collector.push(fullPath);
  }

  return collector;
}

function hasLetters(value) {
  return letterRegex.test(value);
}

function isPunctuationOnly(value) {
  return !hasLetters(value);
}

function isI18nKeyLiteral(value) {
  return /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/.test(value);
}

function isTechnicalToken(value) {
  return /^[A-Z0-9_]+$/.test(value);
}

function isColorToken(value) {
  return /^#[0-9A-Fa-f]{3,8}$/.test(value);
}

function createViolation(sourceFile, node, reason, value) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    filePath: path.relative(projectRoot, sourceFile.fileName),
    line: position.line + 1,
    reason,
    value,
  };
}

function isStringLikeExpression(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  );
}

function getPropertyName(name) {
  if (ts.isIdentifier(name)) {
    return name.text;
  }

  if (ts.isStringLiteral(name)) {
    return name.text;
  }

  return '';
}

function collectViolations(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    extension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const violations = [];

  function visit(node) {
    if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile).trim();
      if (value && !isPunctuationOnly(value)) {
        violations.push(createViolation(sourceFile, node, 'JSX text literal', value));
      }
    }

    if (ts.isJsxAttribute(node)) {
      const propName = node.name.getText(sourceFile);
      if (trackedProps.has(propName) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          const value = node.initializer.text.trim();
          if (
            value &&
            !isPunctuationOnly(value) &&
            !isI18nKeyLiteral(value) &&
            !isTechnicalToken(value) &&
            !isColorToken(value)
          ) {
            violations.push(
              createViolation(
                sourceFile,
                node.initializer,
                `Hardcoded ${propName} prop`,
                value,
              ),
            );
          }
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          isStringLikeExpression(node.initializer.expression)
        ) {
          const value = node.initializer.expression.text.trim();
          if (
            value &&
            !isPunctuationOnly(value) &&
            !isI18nKeyLiteral(value) &&
            !isTechnicalToken(value) &&
            !isColorToken(value)
          ) {
            violations.push(
              createViolation(
                sourceFile,
                node.initializer.expression,
                `Hardcoded ${propName} prop`,
                value,
              ),
            );
          }
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression;
      const isAlert =
        ts.isIdentifier(target.expression) &&
        target.expression.text === 'Alert' &&
        target.name.text === 'alert';

      if (isAlert) {
        const [arg0, arg1] = node.arguments;
        for (const arg of [arg0, arg1]) {
          if (arg && isStringLikeExpression(arg)) {
            const value = arg.text.trim();
            if (
              value &&
              !isPunctuationOnly(value) &&
              !isI18nKeyLiteral(value) &&
              !isTechnicalToken(value) &&
              !isColorToken(value)
            ) {
              violations.push(
                createViolation(sourceFile, arg, 'Hardcoded Alert.alert text', value),
              );
            }
          }
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const propertyName = getPropertyName(node.name);
      if (!trackedProps.has(propertyName)) {
        ts.forEachChild(node, visit);
        return;
      }

      if (isStringLikeExpression(node.initializer)) {
        const value = node.initializer.text.trim();
        if (
          value &&
          !isPunctuationOnly(value) &&
          !isI18nKeyLiteral(value) &&
          !isTechnicalToken(value) &&
          !isColorToken(value)
        ) {
          violations.push(
            createViolation(
              sourceFile,
              node.initializer,
              `Hardcoded ${propertyName} property value`,
              value,
            ),
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

const files = walk(srcRoot);
const allViolations = files.flatMap((filePath) => collectViolations(filePath));

if (allViolations.length > 0) {
  console.error(
    `[i18n:check] Hardcoded user-visible strings detected (${allViolations.length}):`,
  );

  for (const violation of allViolations) {
    console.error(
      `  - ${violation.filePath}:${violation.line} [${violation.reason}] ${JSON.stringify(violation.value)}`,
    );
  }

  process.exit(1);
}

console.log(`[i18n:check] Hardcoded-string audit OK (${files.length} TS/TSX files checked)`);

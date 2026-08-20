import fs from 'fs';
import path from 'path';

const packageSwiftPath = path.resolve('ios/App/CapApp-SPM/Package.swift');

if (!fs.existsSync(packageSwiftPath)) {
  console.log(`[fix-ios-spm-paths] File not found: ${packageSwiftPath}`);
  process.exit(0);
}

const content = fs.readFileSync(packageSwiftPath, 'utf8');

// Converter barras invertidas Windows (\) em barras POSIX (/) dentro de declarações path: "..."
const updatedContent = content.replace(/path:\s*"([^"]+)"/g, (match, pathValue) => {
  const normalizedPath = pathValue.replace(/\\/g, '/');
  return `path: "${normalizedPath}"`;
});

if (content !== updatedContent) {
  fs.writeFileSync(packageSwiftPath, updatedContent, 'utf8');
  console.log('[fix-ios-spm-paths] Fixed Windows path separators in Package.swift:');
  console.log(updatedContent);
} else {
  console.log('[fix-ios-spm-paths] Package.swift paths are already POSIX compliant.');
}

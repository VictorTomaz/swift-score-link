import fs from 'fs';
import path from 'path';

const pbxprojPath = path.resolve('ios/App/App.xcodeproj/project.pbxproj');

if (!fs.existsSync(pbxprojPath)) {
  console.error(`Error: pbxproj file not found at ${pbxprojPath}`);
  process.exit(1);
}

let content = fs.readFileSync(pbxprojPath, 'utf8');

// 1. Add to PBXBuildFile section
const buildFileEntries = `\t\tA1B2C3D4E5F6A1B2C3D40002 /* StoreKitManager.swift in Sources */ = {isa = PBXBuildFile; fileRef = A1B2C3D4E5F6A1B2C3D40001 /* StoreKitManager.swift */; };
\t\tA1B2C3D4E5F6A1B2C3D40004 /* StoreKitPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = A1B2C3D4E5F6A1B2C3D40003 /* StoreKitPlugin.swift */; };
\t\tA1B2C3D4E5F6A1B2C3D40006 /* StoreKitPlugin.m in Sources */ = {isa = PBXBuildFile; fileRef = A1B2C3D4E5F6A1B2C3D40005 /* StoreKitPlugin.m */; };\n`;

if (!content.includes('A1B2C3D4E5F6A1B2C3D40002')) {
  content = content.replace('/* End PBXBuildFile section */', buildFileEntries + '/* End PBXBuildFile section */');
}

// 2. Add to PBXFileReference section
const fileRefEntries = `\t\tA1B2C3D4E5F6A1B2C3D40001 /* StoreKitManager.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = StoreKitManager.swift; sourceTree = "<group>"; };
\t\tA1B2C3D4E5F6A1B2C3D40003 /* StoreKitPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = StoreKitPlugin.swift; sourceTree = "<group>"; };
\t\tA1B2C3D4E5F6A1B2C3D40005 /* StoreKitPlugin.m */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = StoreKitPlugin.m; sourceTree = "<group>"; };\n`;

if (!content.includes('A1B2C3D4E5F6A1B2C3D40001')) {
  content = content.replace('/* End PBXFileReference section */', fileRefEntries + '/* End PBXFileReference section */');
}

// 3. Add to children of PBXGroup "App"
// Look for PBXGroup children section of group 504EC3061FED79650016851F /* App */
const appGroupRegex = /(504EC3061FED79650016851F \/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \([\s\S]*?\);)/;
const matchGroup = content.match(appGroupRegex);
if (matchGroup) {
  let groupContent = matchGroup[1];
  if (!groupContent.includes('A1B2C3D4E5F6A1B2C3D40001')) {
    const insertChildren = `\t\t\t\tA1B2C3D4E5F6A1B2C3D40001 /* StoreKitManager.swift */,
\t\t\t\tA1B2C3D4E5F6A1B2C3D40003 /* StoreKitPlugin.swift */,
\t\t\t\tA1B2C3D4E5F6A1B2C3D40005 /* StoreKitPlugin.m */,`;
    const updatedGroupContent = groupContent.replace('children = (', 'children = (\n' + insertChildren);
    content = content.replace(groupContent, updatedGroupContent);
  }
}

// 4. Add to PBXSourcesBuildPhase
const sourcesBuildPhaseRegex = /(504EC3001FED79650016851F \/\* Sources \*\/ = \{\s*isa = PBXSourcesBuildPhase;[\s\S]*?files = \([\s\S]*?\);)/;
const matchSources = content.match(sourcesBuildPhaseRegex);
if (matchSources) {
  let sourcesContent = matchSources[1];
  if (!sourcesContent.includes('A1B2C3D4E5F6A1B2C3D40002')) {
    const insertSources = `\t\t\t\tA1B2C3D4E5F6A1B2C3D40002 /* StoreKitManager.swift in Sources */,
\t\t\t\tA1B2C3D4E5F6A1B2C3D40004 /* StoreKitPlugin.swift in Sources */,
\t\t\t\tA1B2C3D4E5F6A1B2C3D40006 /* StoreKitPlugin.m in Sources */,`;
    const updatedSourcesContent = sourcesContent.replace('files = (', 'files = (\n' + insertSources);
    content = content.replace(sourcesContent, updatedSourcesContent);
  }
}

fs.writeFileSync(pbxprojPath, content, 'utf8');
console.log('Successfully registered StoreKit files in project.pbxproj!');

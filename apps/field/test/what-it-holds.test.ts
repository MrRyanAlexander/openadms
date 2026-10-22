// What the field app may hold (BACKLOG 3.1.2; ADR-565): no rule of its own (AC-11-06; invariant
// 11), no payload shape (Phase 3's exit, criterion 8), no outside SDK and no identifier of the
// phone or its owner (AC-11-69), no way to make HTML or code from a string (AC-11-61), and one
// server to talk to, by one module (AC-11-01); nothing written to the clipboard and no system
// notification (AC-11-63, 65; item 3.10.2). Read from its source and its dependencies, as the
// chain runs it; the native builds' own libraries are read again at 3.8.1 and 3.9.1.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as domain from '@open-adms/domain';
import * as receipts from '@open-adms/receipts';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const field = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(field, 'src');

// Every module of the app, parsed.
const modules = readdirSync(source, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.d.ts'))
  .sort()
  .map((path) => {
    const text = readFileSync(join(source, path), 'utf8');
    return { path, file: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true) };
  });

function eachNode(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => {
    eachNode(child, visit);
  });
}

// Each module's names: what it imports from where, what it declares, every identifier it uses.
function namesIn(file: ts.SourceFile) {
  const imported: string[] = [];
  const declared: string[] = [];
  const used: string[] = [];
  eachNode(file, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imported.push(node.moduleSpecifier.text);
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name)
    ) {
      declared.push(node.name.text);
    }
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) used.push(node.text);
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) used.push(node.name.text);
  });
  return { imported, declared, used };
}

// Where Node finds a package from a folder: the nearest node_modules holding it, going up.
function folderOf(name: string, from: string): string {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = join(folder, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(folder) === folder) throw new Error(`${name} isn't installed for ${from}.`);
  }
}

// What a package ships, and everything it brings, each found from where the one before it is.
function shipped(name: string, from: string, found = new Map<string, string>()) {
  if (found.has(name)) return found;
  const folder = folderOf(name, from);
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as {
    version: string;
    dependencies?: Record<string, string>;
  };
  found.set(name, manifest.version);
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    shipped(dependency, folder, found);
  }
  return found;
}

describe('the field app holds', () => {
  it('AC-11-69: no outside SDK: what it ships is React, React Aria, @noble/hashes (the login list’s slow hashes, ADR-575), the three workspaces of the rules, the payloads and the receipts (ADR-595), and what they bring', () => {
    const manifest = JSON.parse(readFileSync(join(field, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@noble/hashes',
      '@open-adms/contracts',
      '@open-adms/domain',
      '@open-adms/receipts',
      'react',
      'react-aria-components',
      'react-dom',
    ]);
    const all = new Map<string, string>();
    for (const name of Object.keys(manifest.dependencies)) shipped(name, field, all);
    expect([...all.keys()].sort()).toEqual([
      '@internationalized/date',
      '@internationalized/number',
      '@internationalized/string',
      '@noble/hashes',
      '@open-adms/contracts',
      '@open-adms/domain',
      '@open-adms/receipts',
      '@react-types/shared',
      '@swc/helpers',
      'aria-hidden',
      'client-only',
      'clsx',
      'geographiclib-geodesic',
      'react',
      'react-aria',
      'react-aria-components',
      'react-dom',
      'react-stately',
      'scheduler',
      'tslib',
      'use-sync-external-store',
      'zod',
    ]);
  });

  it('AC-11-06: no rule of its own: it imports only React, React Aria, @noble/hashes’ Argon2id, HMAC and SHA-256, the rules, the payloads, the receipts and its own files, and declares no name the rules or the receipts use', () => {
    const allowed = [
      '@noble/hashes/argon2.js',
      '@noble/hashes/hmac.js',
      '@noble/hashes/sha2.js',
      'react',
      'react-dom/client',
      'react-aria-components',
      '@open-adms/contracts',
      '@open-adms/domain',
      '@open-adms/receipts',
    ];
    // The receipts' names too: what a receipt says is its package's, never the app's (ADR-595).
    const rules = new Set([...Object.keys(domain), ...Object.keys(receipts)]);
    expect(rules.size).toBeGreaterThan(100);
    for (const { path, file } of modules) {
      const { imported, declared } = namesIn(file);
      expect(
        imported.filter((from) => !from.startsWith('.') && !allowed.includes(from)),
        path,
      ).toEqual([]);
      // Its own files are its source's: nothing of the prototype, or of anything else, is in it.
      expect(
        imported
          .filter((from) => from.startsWith('.'))
          .filter((from) =>
            relative(source, resolve(source, dirname(path), from)).startsWith('..'),
          ),
        path,
      ).toEqual([]);
      expect(
        declared.filter((name) => rules.has(name)),
        `${path} declares a name of packages/domain's`,
      ).toEqual([]);
    }
  });

  it('AC-11-06: no payload shape: nothing in it reaches for Zod, so every payload is packages/contracts’', () => {
    for (const { path, file } of modules) {
      const { imported } = namesIn(file);
      expect(
        imported.filter((from) => from === 'zod' || from.startsWith('zod/')),
        path,
      ).toEqual([]);
    }
  });

  it('AC-11-01, AC-11-69: one server to talk to, by one module, at the origin the build names', () => {
    const talking = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon'];
    const talkers = modules
      .filter(({ file }) => namesIn(file).used.some((name) => talking.includes(name)))
      .map(({ path }) => path);
    expect(talkers).toEqual(['server.ts']);
    // No address is written into the app: the API's is the build's (page.ts).
    for (const { path, file } of modules) {
      expect(file.text, path).not.toMatch(/["'`](https?|wss?|capacitor):\/\//);
    }
  });

  it('AC-11-69: no advertising or hardware identifier, and nothing that tells one phone or person from another but its enrolment', () => {
    const identifying = [
      'userAgent',
      'userAgentData',
      'getHighEntropyValues',
      'deviceMemory',
      'hardwareConcurrency',
      'getBattery',
      'connection',
      'plugins',
      'enumerateDevices',
      'getId',
      'advertisingId',
      'identifierForVendor',
    ];
    for (const { path, file } of modules) {
      expect(
        namesIn(file).used.filter((name) => identifying.includes(name)),
        path,
      ).toEqual([]);
    }
    // The camera's module alone reaches the phone's media devices, to open the camera (task 3.6.1,
    // ADR-586): never to list them, whose ids tell one phone from another.
    const media = modules.filter(({ file }) => namesIn(file).used.includes('mediaDevices'));
    expect(media.map(({ path }) => path)).toEqual(['phone/camera.ts']);
    const asked: string[] = [];
    for (const { file } of media) {
      eachNode(file, (node) => {
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'mediaDevices'
        ) {
          asked.push(node.name.text);
        }
      });
    }
    expect(asked).toEqual(['getUserMedia']);
  });

  it('AC-11-61: no way to make HTML or code from a string', () => {
    const making = [
      'dangerouslySetInnerHTML',
      'innerHTML',
      'outerHTML',
      'insertAdjacentHTML',
      'createContextualFragment',
      'write',
      'writeln',
      'eval',
      'Function',
      'importScripts',
    ];
    for (const { path, file } of modules) {
      expect(
        namesIn(file).used.filter((name) => making.includes(name)),
        path,
      ).toEqual([]);
    }
  });

  it('AC-11-07, AC-11-12: nothing kept in the web layer’s storage: no localStorage, sessionStorage, cookie or cache, and IndexedDB only by the store and the keyring', () => {
    const webStorage = ['localStorage', 'sessionStorage', 'cookie', 'cookieStore', 'caches'];
    for (const { path, file } of modules) {
      const { used } = namesIn(file);
      expect(
        used.filter((name) => webStorage.includes(name)),
        path,
      ).toEqual([]);
      if (path !== 'store/browser-store.ts' && path !== 'store/browser-keyring.ts') {
        expect(
          used.filter((name) => name === 'indexedDB' || name === 'IDBKeyRange'),
          path,
        ).toEqual([]);
      }
    }
  });

  it('AC-11-08, AC-11-11: no key made from anything typed or brought: the store’s keys and the device key are generated, never imported, derived or unwrapped, and only the device key’s public half is ever read out', () => {
    const made = ['importKey', 'deriveKey', 'deriveBits', 'unwrapKey', 'exportKey', 'wrapKey'];
    for (const { path, file } of modules) {
      expect(
        namesIn(file)
          .used.filter((name) => made.includes(name))
          // The device key's public half, which the server is sent at enrolment.
          .filter((name) => !(path === 'store/web-crypto-key.ts' && name === 'exportKey')),
        path,
      ).toEqual([]);
    }
    const sealing = modules.find(({ path }) => path === 'store/sealing.ts');
    expect(sealing?.file.text).toMatch(/generateKey\(\{ name: 'AES-GCM', length: 256 \}, false,/);
    const deviceKey = modules.find(({ path }) => path === 'store/web-crypto-key.ts')?.file.text;
    expect(deviceKey?.match(/exportKey\(/g)).toEqual(['exportKey(']);
    expect(deviceKey).toMatch(/crypto\.subtle\.exportKey\('spki', publicKey\)/);
    expect(deviceKey).toMatch(
      /generateKey\(\s*\{ name: phoneKeyKind\.algorithm, namedCurve: phoneKeyKind\.curve \},\s*false,/,
    );
  });

  it('AC-11-13: no attestation: nothing in it asks Apple’s or Google’s services to vouch for the phone', () => {
    const vouching = /attest|devicecheck|safetynet|playintegrity|integritymanager|integritytoken/i;
    for (const { path, file } of modules) {
      expect(
        namesIn(file).used.filter((name) => vouching.test(name)),
        path,
      ).toEqual([]);
      expect(file.text, path).not.toMatch(/\b(App ?Attest|DeviceCheck|SafetyNet|Play Integrity)\b/);
    }
  });

  it('AC-11-10: nothing written to the console, so nothing secret reaches the phone’s logs from it', () => {
    for (const { path, file } of modules) {
      expect(
        namesIn(file).used.filter((name) => name === 'console'),
        path,
      ).toEqual([]);
    }
  });

  it('AC-11-63, AC-11-65: nothing written to the clipboard and no system notification: no clipboard, notification or push API is reached', () => {
    const outward = new Set([
      'clipboard',
      'execCommand',
      'Notification',
      'showNotification',
      'PushManager',
      'pushManager',
    ]);
    for (const { path, file } of modules) {
      expect(
        namesIn(file).used.filter((name) => outward.has(name)),
        path,
      ).toEqual([]);
    }
  });

  it('is read from the app’s own source, every module of it at any depth', () => {
    expect(relative(field, source)).toBe('src');
    expect(modules.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'main.tsx',
        'server.ts',
        'shell.tsx',
        'home.tsx',
        'words.ts',
        'look/index.ts',
        'look/keypad.tsx',
        'store/phone-store.ts',
        'store/sealing.ts',
        'store/browser-store.ts',
        'store/keyring.ts',
        'store/web-crypto-key.ts',
        'store/browser-keyring.ts',
        'phone/identity.ts',
        'enrol.tsx',
        'phone.tsx',
        'create-monitor.tsx',
        'monitor-created.tsx',
      ]),
    );
  });
});

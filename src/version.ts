import { createRequire } from 'node:module';

// package.json is the Single Source of Truth for the version number.
// Use createRequire (runtime) instead of a static JSON import so that
// `rootDir: ./src` does not complain about a file outside the src tree.
// After compilation dist/version.js → ../package.json resolves to the
// package root both in development and in the published npm tarball
// (npm always includes package.json regardless of the `files` field).
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export const VERSION: string = pkg.version;

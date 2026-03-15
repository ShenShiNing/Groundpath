const fs = require('node:fs');
const path = require('node:path');

const modulesRoot = path.join(__dirname, 'packages', 'server', 'src', 'modules');
const moduleNames = fs
  .readdirSync(modulesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function modulePathPattern(moduleName) {
  return `(^|.*/)src/modules/${escapeRegex(moduleName)}/`;
}

function crossModulePathPattern(moduleName, segmentPattern) {
  return `(^|.*/)src/modules/(?!${escapeRegex(moduleName)}/)[^/]+/${segmentPattern}/.+\\.ts$`;
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Rule 1: No circular dependencies ──
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies lead to tight coupling and initialization issues.',
      from: {},
      to: { circular: true },
    },

    // ── Rule 2: Controllers must not directly import repositories ──
    {
      name: 'no-controller-to-repository',
      severity: 'error',
      comment:
        'Controllers must go through services; direct repository access bypasses business logic.',
      from: { path: 'src/modules/.+/controllers/.+\\.ts$' },
      to: { path: 'src/modules/.+/repositories/.+\\.ts$' },
    },

    // ── Rule 3: Routes must not cross-module import controllers ──
    ...moduleNames.map((moduleName) => ({
      name: `no-cross-module-controller-import:${moduleName}`,
      severity: 'error',
      comment:
        'Routes should only import controllers from their own module. Cross-module access should go through the module barrel or services.',
      from: { path: `${modulePathPattern(moduleName)}.+\\.routes\\.ts$` },
      to: {
        path: crossModulePathPattern(moduleName, 'controllers'),
      },
    })),

    // ── Rule 4: No orphan modules (files not reachable from entrypoints) ──
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan files indicate dead code or missing imports.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '\\.test\\.ts$',
          '\\.spec\\.ts$',
          'tests/',
          '__tests__/',
          '__mocks__/',
        ],
      },
      to: {},
    },

    // ── Rule 5: Shared utilities must not import from modules ──
    {
      name: 'no-shared-to-modules',
      severity: 'error',
      comment:
        'Shared code is foundational — it must not depend on feature modules to avoid layering violations.',
      from: { path: 'src/shared/' },
      to: { path: 'src/modules/' },
    },

    // ── Rule 6: No cross-module deep imports (bypass barrel) ──
    ...moduleNames.map((moduleName) => ({
      name: `no-cross-module-deep-import:${moduleName}`,
      severity: 'warn',
      comment:
        'Cross-module imports should go through the barrel (index.ts), not deep into services/repositories/controllers.',
      from: { path: modulePathPattern(moduleName) },
      to: {
        path: crossModulePathPattern(moduleName, '(services|repositories|controllers)'),
        pathNot: ['(^|.*/)src/modules/.+/index\\.ts$'],
      },
    })),
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', '\\.d\\.ts$'],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: './tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js', '.json'],
      mainFields: ['main', 'types'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};

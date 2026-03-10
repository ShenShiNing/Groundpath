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
    {
      name: 'no-cross-module-controller-import',
      severity: 'error',
      comment:
        'Routes should only import controllers from their own module. Cross-module access should go through the module barrel or services.',
      from: { path: 'src/modules/(?<module>[^/]+)/.+\\.routes\\.ts$' },
      to: {
        path: 'src/modules/(?!\\k<module>/).+/controllers/.+\\.ts$',
      },
    },

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
    {
      name: 'no-cross-module-deep-import',
      severity: 'warn',
      comment:
        'Cross-module imports should go through the barrel (index.ts), not deep into services/repositories.',
      from: { path: 'src/modules/(?<fromModule>[^/]+)/' },
      to: {
        path: 'src/modules/(?!\\k<fromModule>/)[^/]+/(services|repositories|controllers)/.+\\.ts$',
        pathNot: ['src/modules/[^/]+/index\\.ts$'],
      },
    },
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

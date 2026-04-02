/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Rule 1: No circular dependencies ──
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies in application code lead to tight coupling and initialization issues. ORM schema relation files are excluded because bidirectional Drizzle relations otherwise drown out the signal.',
      from: {
        pathNot: '^packages/server/src/core/db/schema/',
      },
      to: { circular: true },
    },

    // ── Rule 2: Controllers must not directly import repositories ──
    {
      name: 'no-controller-to-repository',
      severity: 'error',
      comment:
        'Controllers must go through services; direct repository access bypasses business logic.',
      from: { path: '^packages/server/src/modules/[^/]+/controllers/.+\\.ts$' },
      to: { path: '^packages/server/src/modules/[^/]+/repositories/.+\\.ts$' },
    },

    // ── Rule 3: Modules must not import controllers from other modules ──
    {
      name: 'no-cross-module-controller-import',
      severity: 'error',
      comment:
        'Controllers are module boundaries. Cross-module access should go through the target module barrel or a public service API.',
      from: { path: '^packages/server/src/modules/([^/]+)/' },
      to: {
        path: '^packages/server/src/modules/(?!$1/)[^/]+/controllers/.+\\.ts$',
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
      from: { path: '^packages/server/src/shared/' },
      to: { path: '^packages/server/src/modules/' },
    },

    // ── Rule 6: No cross-module deep imports (bypass barrel) ──
    {
      name: 'no-cross-module-deep-import',
      severity: 'error',
      comment:
        'Cross-module imports must go through the target module public/* API or root barrel (index.ts), not into internal files.',
      from: { path: '^packages/server/src/modules/([^/]+)/' },
      to: { path: '^packages/server/src/modules/(?!$1/)[^/]+/(?!public/|index\\.ts$).+\\.ts$' },
    },

    // ── Rule 7: Core/scripts must only consume module public APIs ──
    {
      name: 'no-core-to-module-deep-import',
      severity: 'error',
      comment:
        'Core entrypoints and shared runtime code must consume modules through public/* APIs to preserve feature boundaries.',
      from: { path: '^packages/server/src/(core/|scripts/|index\\.ts$)' },
      to: { path: '^packages/server/src/modules/[^/]+/(?!public/|index\\.ts$).+\\.ts$' },
    },

    // ── Rule 8: Cross-module imports must not use legacy root barrels ──
    {
      name: 'no-cross-module-root-barrel-import',
      severity: 'error',
      comment:
        'Cross-module imports must go through the target module public/* API, not the module root barrel.',
      from: { path: '^packages/server/src/' },
      to: {
        path: '^packages/server/src/modules/(agent|auth|chat|document|document-ai|document-index|embedding|knowledge-base|llm|logs|rag|storage|user|vector|vlm)/index\\.ts$',
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

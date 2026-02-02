# Build Optimization Guide

> MVP 项目构建优化与最佳实践指南

## 目录

- [当前构建架构](#当前构建架构)
- [Vite 构建优化](#vite-构建优化)
- [TypeScript 编译优化](#typescript-编译优化)
- [依赖管理优化](#依赖管理优化)
- [代码分割策略](#代码分割策略)
- [生产构建优化](#生产构建优化)
- [开发体验优化](#开发体验优化)
- [CI/CD 构建优化](#cicd-构建优化)

---

## 当前构建架构

### 项目结构

```
knowledge-agent/
├── packages/
│   ├── client/     # React 19 + Vite 7 + Tailwind 4
│   ├── server/     # Express 5 + TypeScript + Drizzle
│   └── shared/     # 共享类型、工具、常量
├── pnpm-workspace.yaml
└── package.json
```

### 构建流程

| 包     | 构建命令            | 输出               |
| ------ | ------------------- | ------------------ |
| client | `tsc && vite build` | `dist/` (静态资源) |
| server | `tsc`               | `dist/` (Node.js)  |
| shared | `tsc`               | `dist/` + `.d.ts`  |

---

## Vite 构建优化

### 推荐配置

```typescript
// packages/client/vite.config.ts
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // 构建优化
  build: {
    // 目标环境 - 支持现代浏览器
    target: 'es2022',

    // 代码分割策略
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心
          'react-vendor': ['react', 'react-dom'],
          // 路由和状态管理
          'state-vendor': ['@tanstack/react-router', '@tanstack/react-query', 'zustand'],
          // UI 组件库
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
          ],
        },
      },
    },

    // 启用 CSS 代码分割
    cssCodeSplit: true,

    // 压缩选项
    minify: 'esbuild',

    // 关闭 source map (生产环境)
    sourcemap: false,

    // 分块大小警告阈值
    chunkSizeWarningLimit: 500,
  },

  // 依赖预构建优化
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-router',
      '@tanstack/react-query',
      'zustand',
      'axios',
    ],
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

### 关键优化点

1. **代码分割 (Code Splitting)**
   - 将 vendor 依赖分离到独立 chunk
   - 利用浏览器缓存，业务代码更新不影响 vendor 缓存

2. **目标环境 (Target)**
   - 使用 `es2022` 减少 polyfill 体积
   - MVP 阶段可假设用户使用现代浏览器

3. **预构建依赖 (optimizeDeps)**
   - 显式包含常用依赖加速冷启动
   - 避免开发时的依赖扫描延迟

---

## TypeScript 编译优化

### 增量编译

```json
// packages/server/tsconfig.json
{
  "compilerOptions": {
    // 启用增量编译
    "incremental": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.tsbuildinfo",

    // 跳过库类型检查 (加速编译)
    "skipLibCheck": true

    // 其他配置...
  }
}
```

### 项目引用 (Project References)

客户端已使用项目引用模式：

```json
// packages/client/tsconfig.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

**优势：**

- 并行编译不同配置
- 更好的 IDE 性能
- 增量构建支持

### 路径别名优化

```json
// packages/server/tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@modules/*": ["src/modules/*"],
      "@config/*": ["src/shared/config/*"]
    }
  }
}
```

**好处：**

- 减少相对路径嵌套 (`../../../` → `@shared/`)
- 模块移动时减少路径修改
- 提高代码可读性

---

## 依赖管理优化

### pnpm Workspace 配置

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

### 依赖优化策略

#### 1. 共享依赖提升

```json
// package.json (root)
{
  "pnpm": {
    "overrides": {
      // 统一 React 版本
      "react": "^19.2.3",
      "react-dom": "^19.2.3"
    }
  }
}
```

#### 2. 依赖审计脚本

```bash
# 检查依赖大小
pnpm dlx vite-bundle-analyzer

# 检查重复依赖
pnpm dedupe

# 检查过时依赖
pnpm outdated
```

#### 3. 轻量级替代方案

| 场景        | 推荐                       | 避免                     |
| ----------- | -------------------------- | ------------------------ |
| 日期处理    | `date-fns` (tree-shakable) | `moment.js`              |
| HTTP 客户端 | 原生 `fetch` 或 `ky`       | `axios` (已使用，可保留) |
| 工具函数    | 手写或 `es-toolkit`        | `lodash` 全量导入        |
| 图标        | `lucide-react` (已使用)    | `react-icons` 全量       |

---

## 代码分割策略

### 路由级别分割

```typescript
// src/routes/ 使用 TanStack Router 的懒加载
import { createLazyFileRoute } from '@tanstack/react-router';

// 自动代码分割
export const Route = createLazyFileRoute('/dashboard')({
  component: () => import('@/pages/Dashboard'),
});
```

### 组件级别分割

```typescript
import { lazy, Suspense } from 'react';

// 大型组件懒加载
const HeavyChart = lazy(() => import('@/components/HeavyChart'));

function Dashboard() {
  return (
    <Suspense fallback={<Skeleton />}>
      <HeavyChart />
    </Suspense>
  );
}
```

### 条件加载

```typescript
// 仅在需要时加载
const loadPdfViewer = () => import('@/components/PdfViewer');

function DocumentPage({ type }: { type: string }) {
  const [PdfViewer, setPdfViewer] = useState(null);

  useEffect(() => {
    if (type === 'pdf') {
      loadPdfViewer().then((mod) => setPdfViewer(() => mod.default));
    }
  }, [type]);

  // ...
}
```

---

## 生产构建优化

### 构建分析

```bash
# 安装分析工具
pnpm add -D rollup-plugin-visualizer

# 查看 bundle 组成
pnpm build && pnpm dlx vite-bundle-analyzer
```

### 资源优化

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    // 资源内联阈值 (小于 4kb 内联为 base64)
    assetsInlineLimit: 4096,

    // 资源文件名哈希
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
  },
});
```

### 压缩配置

```typescript
// vite.config.ts
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    // Gzip 压缩
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Brotli 压缩 (更好的压缩率)
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
});
```

---

## 开发体验优化

### HMR 优化

Vite 默认提供 HMR，确保以下配置正确：

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    // HMR 配置
    hmr: {
      overlay: true, // 显示错误覆盖层
    },
    // 监听配置
    watch: {
      // 忽略不需要监听的目录
      ignored: ['**/node_modules/**', '**/dist/**'],
    },
  },
});
```

### 开发服务器优化

```typescript
// packages/server/package.json
{
  "scripts": {
    // tsx watch 已是最佳选择
    "dev": "tsx watch src/index.ts"
  }
}
```

**tsx 优势：**

- 基于 esbuild，启动极快
- 支持 TypeScript 无需编译
- 内置 watch 模式

### 并行开发

```json
// package.json (root)
{
  "scripts": {
    // 并行运行前后端
    "dev": "pnpm -r --parallel dev"
  }
}
```

---

## CI/CD 构建优化

### GitHub Actions 示例

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      # pnpm 缓存
      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      # 依赖缓存
      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      # TypeScript 增量编译缓存
      - uses: actions/cache@v4
        with:
          path: |
            packages/*/node_modules/.tmp
          key: ${{ runner.os }}-tsc-${{ hashFiles('**/tsconfig.json') }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm -r typecheck

      - name: Lint
        run: pnpm lint

      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test
```

### 构建缓存策略

| 缓存项       | 键值                  | 优先级 |
| ------------ | --------------------- | ------ |
| pnpm store   | `pnpm-lock.yaml` hash | 高     |
| tsBuildInfo  | `tsconfig.json` hash  | 中     |
| node_modules | `pnpm-lock.yaml` hash | 高     |
| Vite cache   | `vite.config.ts` hash | 低     |

---

## MVP 最佳实践清单

### 构建配置

- [ ] 配置合理的代码分割策略
- [ ] 设置现代浏览器目标 (es2022+)
- [ ] 启用 TypeScript 增量编译
- [ ] 配置依赖预构建

### 依赖管理

- [ ] 使用 pnpm workspace 管理 monorepo
- [ ] 定期运行 `pnpm dedupe` 去重
- [ ] 审计依赖大小，避免过大的库
- [ ] 使用 tree-shakable 的库

### 开发体验

- [ ] 配置路径别名减少相对导入
- [ ] 使用 tsx watch 加速后端开发
- [ ] 配置 lint-staged 提交前检查

### 生产优化

- [ ] 关闭生产环境 source map
- [ ] 启用 gzip/brotli 压缩
- [ ] 配置资源文件名哈希
- [ ] 定期分析 bundle 大小

---

## 常用命令

```bash
# 开发
pnpm dev                    # 启动前后端开发服务器
pnpm dev:client             # 仅启动前端
pnpm dev:server             # 仅启动后端

# 构建
pnpm build                  # 构建所有包
pnpm -F @knowledge-agent/client build  # 仅构建前端

# 分析
pnpm dlx vite-bundle-analyzer  # 分析 bundle 组成
pnpm outdated               # 检查过时依赖
pnpm dedupe                 # 依赖去重

# 类型检查
pnpm -r typecheck           # 所有包类型检查

# 测试
pnpm test                   # 运行测试
pnpm test:coverage          # 测试覆盖率
```

---

## 性能指标参考

### 构建时间目标

| 操作         | MVP 目标 | 当前状态 |
| ------------ | -------- | -------- |
| 冷启动 (dev) | < 3s     | -        |
| HMR 更新     | < 100ms  | -        |
| 完整构建     | < 30s    | -        |
| 增量构建     | < 5s     | -        |

### Bundle 大小目标

| 资源       | MVP 目标     | 说明     |
| ---------- | ------------ | -------- |
| 初始 JS    | < 200KB gzip | 首屏加载 |
| 初始 CSS   | < 50KB gzip  | 首屏样式 |
| 单个 chunk | < 500KB      | 避免过大 |

---

## 参考资源

- [Vite 官方优化指南](https://vitejs.dev/guide/performance.html)
- [TypeScript 项目引用](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [pnpm Workspace](https://pnpm.io/workspaces)
- [Rollup 代码分割](https://rollupjs.org/guide/en/#code-splitting)

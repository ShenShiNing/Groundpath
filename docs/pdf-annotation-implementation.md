# PDF 在线标注与版本审阅 — 实现方案

> 技术选型：PDF.js v4（渲染 + 交互）+ pdfAnnotate/annotpdf（写回标准 PDF）
> 状态：方案设计阶段

---

## 目录

1. [需求概述](#1-需求概述)
2. [技术选型与依据](#2-技术选型与依据)
3. [系统架构](#3-系统架构)
4. [数据库 Schema 变更](#4-数据库-schema-变更)
5. [后端实现](#5-后端实现)
6. [前端实现](#6-前端实现)
7. [PDF 写回（核心流程）](#7-pdf-写回核心流程)
8. [版本审阅工作流](#8-版本审阅工作流)
9. [API 设计](#9-api-设计)
10. [实施阶段](#10-实施阶段)
11. [风险与缓解](#11-风险与缓解)

---

## 1. 需求概述

| #   | 需求                                     | 优先级 |
| --- | ---------------------------------------- | ------ |
| 1   | 高亮选中文本                             | P0     |
| 2   | 批注/评论（FreeText + Popup）            | P0     |
| 3   | 自由手绘（Ink）                          | P0     |
| 4   | 写回标准 PDF（Acrobat / 浏览器一致显示） | P0     |
| 5   | 开源方案，不使用商业 SDK                 | P0     |
| 6   | 版本审阅（提交/批准/驳回 + 历史回溯）    | P1     |
| 7   | 版本对比（Side-by-side）                 | P2     |
| 8   | 暂不需要多人实时协作                     | —      |

---

## 2. 技术选型与依据

### 2.1 核心库

| 库                                                     | 版本   | 用途                                    | 协议       | npm 包名     |
| ------------------------------------------------------ | ------ | --------------------------------------- | ---------- | ------------ |
| [PDF.js](https://github.com/nicehash/pdf.js)           | v4.x   | PDF 渲染 + 内置标注编辑器 UI            | Apache 2.0 | `pdfjs-dist` |
| [pdfAnnotate](https://github.com/highkite/pdfAnnotate) | latest | 将标注写入 PDF 二进制（标准 `/Annots`） | MIT        | `annotpdf`   |

### 2.2 为什么不选其他方案

| 方案                        | 淘汰原因                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------- |
| react-pdf-highlighter-plus  | 标注为 HTML 覆盖层，导出为扁平化图像，非标准 PDF 标注，Acrobat 无法识别/编辑           |
| pdf-lib                     | 通用 PDF 操作库，标注需手动构建 `PDFDict`/Appearance Stream，复杂且易错；2021 年后停更 |
| PDF.js 内置保存 (`getData`) | 生成的标注在部分 PDF 阅读器中不显示，兼容性不可靠                                      |
| Nutrient / Syncfusion       | 商业 SDK，不符合开源要求                                                               |

### 2.3 pdfAnnotate 支持的 15 种标注类型

本项目使用其中 **5 种**（标 ★）：

| 类型      | PDF 规范名   | 本项目                  |
| --------- | ------------ | ----------------------- |
| 文本高亮  | `/Highlight` | ★                       |
| 自由文本  | `/FreeText`  | ★                       |
| 弹出注释  | `/Popup`     | ★（随 Highlight 附带）  |
| 墨迹/手绘 | `/Ink`       | ★                       |
| 矩形框    | `/Square`    | ★（可选，用于区域标注） |
| 下划线    | `/Underline` | 可扩展                  |
| 删除线    | `/StrikeOut` | 可扩展                  |
| 波浪线    | `/Squiggly`  | 可扩展                  |
| 直线      | `/Line`      | —                       |
| 圆形      | `/Circle`    | —                       |
| 多边形    | `/Polygon`   | —                       |
| 折线      | `/PolyLine`  | —                       |
| 图章      | `/Stamp`     | —                       |
| 插入符    | `/Caret`     | —                       |
| 文字注解  | `/Text`      | —                       |

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                       React 前端 (client)                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PDF 标注页面 /documents/:id/annotate        │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌────────────┐  ┌────────────────┐  │    │
│  │  │  PDF.js v4   │  │  标注工具栏  │  │  标注列表面板   │  │    │
│  │  │  Viewer +    │  │ 高亮/批注/  │  │  (侧边栏)      │  │    │
│  │  │  Editor      │  │ 手绘/选择   │  │                 │  │    │
│  │  └──────┬───────┘  └─────┬──────┘  └────────┬────────┘  │    │
│  │         │                │                   │           │    │
│  │         └────────────────┼───────────────────┘           │    │
│  │                          ▼                               │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │      annotationStore (Zustand)                    │   │    │
│  │  │  - annotations: Annotation[]                      │   │    │
│  │  │  - activeTool: 'select'|'highlight'|'ink'|'text'  │   │    │
│  │  │  - isDirty: boolean                               │   │    │
│  │  │  - selectedId: string | null                      │   │    │
│  │  └──────────────────────┬───────────────────────────┘   │    │
│  └─────────────────────────┼───────────────────────────────┘    │
│                            │                                     │
│            ┌───────────────┼───────────────┐                    │
│            ▼               ▼               ▼                    │
│       保存标注JSON     提交审阅版本     下载标注PDF               │
│       (自动保存)      (手动触发)      (按需生成)                 │
└────────────┬───────────────┬───────────────┬────────────────────┘
             │               │               │
             ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express 后端 (server)                         │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │  annotation 模块  │                                           │
│  │  ├─ controller    │  标注 CRUD + 版本审阅 + PDF 写回           │
│  │  ├─ service       │                                           │
│  │  │  ├─ annotation.service.ts        (标注 CRUD)              │
│  │  │  ├─ annotation-review.service.ts (审阅工作流)              │
│  │  │  └─ annotation-pdf.service.ts    (PDF 写回)               │
│  │  └─ repository    │                                           │
│  └──────────────────┘                                           │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────┐                       │
│  │  MySQL (Drizzle ORM)                 │                       │
│  │  - document_annotations              │                       │
│  │  - annotation_versions               │                       │
│  │  - annotation_reviews                │                       │
│  └──────────────────────────────────────┘                       │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────┐                       │
│  │  Storage (R2 / Local)                │                       │
│  │  - 原始 PDF 文件 (不可变)              │                       │
│  │  - 标注版本 PDF 快照                   │                       │
│  └──────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户交互                    前端                      后端                    存储
  │                          │                         │                       │
  │  选中文本/绘制           │                         │                       │
  ├─────────────────────────►│                         │                       │
  │                          │  更新 Zustand Store     │                       │
  │                          │  (本地状态)              │                       │
  │                          │                         │                       │
  │  点击"保存"              │                         │                       │
  ├─────────────────────────►│  PUT /annotations       │                       │
  │                          ├────────────────────────►│  存 JSON 到 DB        │
  │                          │                         ├──────────────────────►│
  │                          │         200 OK          │                       │
  │                          │◄────────────────────────┤                       │
  │                          │                         │                       │
  │  点击"提交审阅"          │                         │                       │
  ├─────────────────────────►│  POST /review/submit    │                       │
  │                          ├────────────────────────►│                       │
  │                          │                         │  1. 创建版本快照       │
  │                          │                         │  2. pdfAnnotate 写回   │
  │                          │                         │  3. 保存 PDF 快照      │
  │                          │                         ├──────────────────────►│
  │                          │         201 Created     │                       │
  │                          │◄────────────────────────┤                       │
  │                          │                         │                       │
  │  点击"下载标注PDF"       │                         │                       │
  ├─────────────────────────►│  GET /export-pdf        │                       │
  │                          ├────────────────────────►│  pdfAnnotate 实时生成  │
  │                          │     PDF binary stream   │  或返回已有快照        │
  │                          │◄────────────────────────┤                       │
  │       下载文件            │                         │                       │
  │◄─────────────────────────┤                         │                       │
```

---

## 4. 数据库 Schema 变更

### 4.1 新增表

```typescript
// packages/server/src/shared/db/schema/annotation/annotation.schema.ts

import { mysqlTable, varchar, text, json, int, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';
import { documents } from '../document/document.schema';
import { users } from '../user/user.schema';

// ─── 标注类型枚举 ───
export const ANNOTATION_TYPES = ['highlight', 'freetext', 'ink', 'square', 'popup'] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

// ─── 审阅状态枚举 ───
export const REVIEW_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'revision_requested',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ─── 文档标注表（存储当前标注数据） ───
export const documentAnnotations = mysqlTable('document_annotations', {
  id: varchar('id', { length: 128 })
    .$defaultFn(() => createId())
    .primaryKey(),
  documentId: varchar('document_id', { length: 128 })
    .notNull()
    .references(() => documents.id),
  documentVersionId: varchar('document_version_id', { length: 128 }).notNull(),

  // 标注数据（JSON 数组，存储所有标注）
  // 见 4.2 JSON 结构定义
  annotations: json('annotations').$type<AnnotationData[]>().notNull().default([]),

  // 元数据
  annotationCount: int('annotation_count').notNull().default(0),

  createdBy: varchar('created_by', { length: 128 })
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 128 }),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

// ─── 标注版本快照表（提交审阅时生成） ───
export const annotationVersions = mysqlTable('annotation_versions', {
  id: varchar('id', { length: 128 })
    .$defaultFn(() => createId())
    .primaryKey(),
  documentId: varchar('document_id', { length: 128 })
    .notNull()
    .references(() => documents.id),

  version: int('version').notNull(), // 标注版本号，递增
  annotations: json('annotations').$type<AnnotationData[]>().notNull(),
  annotationCount: int('annotation_count').notNull().default(0),

  // 写回后的 PDF 快照存储路径
  pdfSnapshotKey: varchar('pdf_snapshot_key', { length: 512 }),

  // 变更摘要（自动生成）
  changeSummary: text('change_summary'),
  // 用户备注
  changeNote: text('change_note'),

  createdBy: varchar('created_by', { length: 128 })
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── 审阅记录表 ───
export const annotationReviews = mysqlTable('annotation_reviews', {
  id: varchar('id', { length: 128 })
    .$defaultFn(() => createId())
    .primaryKey(),
  annotationVersionId: varchar('annotation_version_id', { length: 128 })
    .notNull()
    .references(() => annotationVersions.id),
  documentId: varchar('document_id', { length: 128 })
    .notNull()
    .references(() => documents.id),

  status: mysqlEnum('status', REVIEW_STATUSES).notNull().default('draft'),

  // 审阅人
  reviewerId: varchar('reviewer_id', { length: 128 }).references(() => users.id),
  reviewComment: text('review_comment'),
  reviewedAt: timestamp('reviewed_at'),

  createdBy: varchar('created_by', { length: 128 })
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});
```

### 4.2 标注数据 JSON 结构

```typescript
// packages/shared/src/types/annotation.ts

/** PDF 坐标矩形 [x1, y1, x2, y2]，原点左下角 */
export type PdfRect = [number, number, number, number];

/** QuadPoints：每组 8 个数值 [x1,y1,x2,y2,x3,y3,x4,y4] 表示一个四边形 */
export type QuadPoints = number[];

/** 墨迹路径点 */
export type InkPath = Array<{ x: number; y: number }>;

/** 基础标注数据 */
interface BaseAnnotation {
  /** 客户端生成的唯一 ID（cuid2） */
  id: string;
  /** 标注类型 */
  type: AnnotationType;
  /** PDF 页码（0-based） */
  page: number;
  /** 标注矩形区域（PDF 坐标系，原点左下角） */
  rect: PdfRect;
  /** 颜色，如 { r: 255, g: 255, b: 0 } */
  color: { r: number; g: number; b: number };
  /** 不透明度 0-1 */
  opacity: number;
  /** 创建时间 ISO string */
  createdAt: string;
  /** 修改时间 ISO string */
  updatedAt: string;
  /** 创建者 userId */
  createdBy: string;
  /** 附带的评论/备注文本 */
  comment?: string;
}

/** 文本高亮标注 */
export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  /** 高亮区域的精确坐标（多个四边形，跨行时需要多组） */
  quadPoints: QuadPoints;
  /** 被高亮的原始文本内容 */
  selectedText: string;
}

/** 自由文本标注 */
export interface FreetextAnnotation extends BaseAnnotation {
  type: 'freetext';
  /** 标注文字内容 */
  contents: string;
  /** 字体大小（pt） */
  fontSize: number;
  /** 字体颜色 */
  fontColor: { r: number; g: number; b: number };
}

/** 墨迹/手绘标注 */
export interface InkAnnotation extends BaseAnnotation {
  type: 'ink';
  /** 墨迹路径（可多条） */
  inkList: InkPath[];
  /** 线宽（pt） */
  strokeWidth: number;
}

/** 矩形标注 */
export interface SquareAnnotation extends BaseAnnotation {
  type: 'square';
  /** 边框宽度 */
  borderWidth: number;
  /** 填充颜色（可选） */
  fillColor?: { r: number; g: number; b: number };
}

/** 所有标注类型的联合类型 */
export type AnnotationData =
  | HighlightAnnotation
  | FreetextAnnotation
  | InkAnnotation
  | SquareAnnotation;
```

### 4.3 坐标系说明

```
PDF 坐标系（pdfAnnotate 使用）          PDF.js 渲染坐标系（屏幕）
┌───────────────────────┐               ┌───────────────────────┐
│                       │               │ (0,0)           (w,0) │
│  (0, height)          │               │  ┌─────────────────┐  │
│  ┌─────────────────┐  │               │  │                 │  │
│  │     PDF 内容     │  │               │  │   PDF 内容       │  │
│  └─────────────────┘  │               │  │                 │  │
│  (0, 0)               │               │  └─────────────────┘  │
└───────────────────────┘               │ (0,h)           (w,h) │
  Y轴↑ 原点左下角                        └───────────────────────┘
                                          Y轴↓ 原点左上角

转换公式:
  pdfY = pageHeight - screenY
  screenY = pageHeight - pdfY
```

---

## 5. 后端实现

### 5.1 模块结构

```
packages/server/src/modules/annotation/
├── index.ts                           # 模块 barrel export
├── annotation.routes.ts               # 路由定义
├── controllers/
│   └── annotation.controller.ts       # 请求处理
├── services/
│   ├── annotation.service.ts          # 标注 CRUD（JSON 存取）
│   ├── annotation-review.service.ts   # 审阅工作流
│   └── annotation-pdf.service.ts      # pdfAnnotate 写回 PDF
├── repositories/
│   ├── annotation.repository.ts       # document_annotations 表操作
│   ├── annotation-version.repository.ts  # annotation_versions 表操作
│   └── annotation-review.repository.ts   # annotation_reviews 表操作
└── types/
    └── annotation.types.ts            # 模块内部类型
```

### 5.2 核心服务 — annotation-pdf.service.ts

```typescript
// packages/server/src/modules/annotation/services/annotation-pdf.service.ts

import { AnnotationFactory } from 'annotpdf';
import type { AnnotationData } from '@knowledge-agent/shared/types';
import { storageService } from '@modules/storage';
import { logger } from '@shared/logger';

export class AnnotationPdfService {
  /**
   * 将标注数据写入 PDF 文件，生成带标准标注的 PDF 二进制
   *
   * 流程：
   * 1. 从存储读取原始 PDF
   * 2. 使用 pdfAnnotate 逐个写入标注
   * 3. 为每个标注生成 Appearance Stream
   * 4. 返回包含标注的 PDF 二进制
   */
  async writeAnnotationsToPdf(
    storageKey: string,
    annotations: AnnotationData[]
  ): Promise<Uint8Array> {
    const startTime = Date.now();
    const opName = 'writeAnnotationsToPdf';

    try {
      // 1. 读取原始 PDF 文件
      const pdfBuffer = await storageService.getFileBuffer(storageKey);
      const pdfBytes = new Uint8Array(pdfBuffer);

      // 2. 创建标注工厂
      const factory = new AnnotationFactory(pdfBytes);

      // 3. 逐个写入标注
      let written = 0;
      for (const ann of annotations) {
        try {
          this.writeAnnotation(factory, ann);
          written++;
        } catch (err) {
          logger.warn(
            { err, annotationId: ann.id, type: ann.type, op: opName },
            'Failed to write single annotation, skipping'
          );
        }
      }

      // 4. 生成最终 PDF
      const result = factory.write();

      logger.info(
        {
          op: opName,
          storageKey,
          totalAnnotations: annotations.length,
          writtenAnnotations: written,
          durationMs: Date.now() - startTime,
        },
        'PDF annotations written successfully'
      );

      return result;
    } catch (err) {
      logger.error({ err, storageKey, op: opName }, 'Failed to write annotations to PDF');
      throw err;
    }
  }

  private writeAnnotation(factory: AnnotationFactory, ann: AnnotationData): void {
    const color = ann.color;

    switch (ann.type) {
      case 'highlight': {
        const highlight = factory.createHighlightAnnotation({
          page: ann.page,
          rect: ann.rect,
          contents: ann.comment || ann.selectedText,
          color: color,
          opacity: ann.opacity,
          quadPoints: ann.quadPoints,
        });
        highlight.createDefaultAppearanceStream();
        break;
      }

      case 'freetext': {
        const freetext = factory.createFreeTextAnnotation({
          page: ann.page,
          rect: ann.rect,
          contents: ann.contents,
          color: color,
          opacity: ann.opacity,
          fontSize: ann.fontSize,
          fontColor: ann.fontColor,
        });
        freetext.createDefaultAppearanceStream();
        break;
      }

      case 'ink': {
        // pdfAnnotate 的 inkList 格式：number[][] (每条路径是 [x1,y1,x2,y2,...] 扁平数组)
        const inkList = ann.inkList.map((path) => path.flatMap((point) => [point.x, point.y]));

        const ink = factory.createInkAnnotation({
          page: ann.page,
          rect: ann.rect,
          contents: ann.comment || '',
          color: color,
          opacity: ann.opacity,
          inkList: inkList,
          border: { width: ann.strokeWidth },
        });
        ink.createDefaultAppearanceStream();
        break;
      }

      case 'square': {
        const square = factory.createSquareAnnotation({
          page: ann.page,
          rect: ann.rect,
          contents: ann.comment || '',
          color: color,
          opacity: ann.opacity,
          fill: ann.fillColor,
          border: { width: ann.borderWidth },
        });
        square.createDefaultAppearanceStream();
        break;
      }
    }
  }

  /**
   * 生成标注 PDF 并存储快照
   */
  async generateAndStoreSnapshot(
    documentId: string,
    storageKey: string,
    annotations: AnnotationData[],
    version: number
  ): Promise<string> {
    const pdfBytes = await this.writeAnnotationsToPdf(storageKey, annotations);

    const snapshotKey = `annotations/${documentId}/v${version}/annotated.pdf`;
    await storageService.uploadBuffer(snapshotKey, Buffer.from(pdfBytes), 'application/pdf');

    return snapshotKey;
  }
}

export const annotationPdfService = new AnnotationPdfService();
```

### 5.3 审阅服务 — annotation-review.service.ts

```typescript
// packages/server/src/modules/annotation/services/annotation-review.service.ts
// 核心方法签名

export class AnnotationReviewService {
  /**
   * 提交审阅
   * 1. 获取当前标注数据（JSON）
   * 2. 创建标注版本快照
   * 3. 调用 annotationPdfService 写回 PDF 并存储
   * 4. 创建审阅记录（status = submitted）
   */
  async submitForReview(params: {
    documentId: string;
    userId: string;
    changeNote?: string;
  }): Promise<AnnotationVersionWithReview>;

  /**
   * 审阅通过
   * 更新审阅记录状态为 approved
   */
  async approve(params: { reviewId: string; reviewerId: string; comment?: string }): Promise<void>;

  /**
   * 审阅驳回
   * 更新审阅记录状态为 rejected / revision_requested
   */
  async reject(params: {
    reviewId: string;
    reviewerId: string;
    comment: string;
    requestRevision: boolean;
  }): Promise<void>;

  /**
   * 获取版本历史（含审阅状态）
   */
  async getVersionHistory(documentId: string): Promise<AnnotationVersionListItem[]>;

  /**
   * 获取两个版本之间的标注差异
   * 对比 JSON 标注数组，生成 added/removed/modified 列表
   */
  async diffVersions(
    documentId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<AnnotationDiff>;

  /**
   * 回滚到指定版本
   * 将该版本的标注数据恢复为当前标注
   */
  async restoreVersion(params: {
    documentId: string;
    version: number;
    userId: string;
  }): Promise<void>;
}
```

---

## 6. 前端实现

### 6.1 新增文件结构

```
packages/client/src/
├── components/
│   └── pdf-annotator/
│       ├── PdfAnnotator.tsx            # 主容器组件
│       ├── PdfViewer.tsx               # PDF.js 渲染器封装
│       ├── AnnotationToolbar.tsx       # 工具栏（高亮/批注/手绘/选择）
│       ├── AnnotationLayer.tsx         # 标注渲染层（覆盖在 PDF 上）
│       ├── AnnotationSidebar.tsx       # 标注列表 + 评论面板
│       ├── AnnotationPopup.tsx         # 标注详情弹出框
│       ├── InkCanvas.tsx              # 手绘画布（SVG 或 Canvas）
│       ├── HighlightHandler.tsx        # 文本选中 → 高亮标注逻辑
│       ├── ReviewPanel.tsx             # 版本审阅面板
│       ├── VersionCompare.tsx          # Side-by-side 版本对比
│       ├── hooks/
│       │   ├── usePdfViewer.ts         # PDF.js 实例管理
│       │   ├── useAnnotationTools.ts   # 工具切换 + 交互逻辑
│       │   ├── useCoordinateTransform.ts # 坐标系转换
│       │   └── useAnnotationSync.ts    # 标注自动保存
│       └── utils/
│           ├── coordinate.ts           # 坐标转换函数
│           ├── annotation-diff.ts      # 标注差异计算
│           └── pdf-worker.ts           # PDF.js Worker 配置
├── stores/
│   └── annotationStore.ts             # 标注状态管理
├── hooks/
│   └── useAnnotations.ts              # TanStack Query hooks
├── api/
│   └── annotations.ts                 # API 客户端
└── routes/
    └── documents.$id.annotate.route.tsx  # 标注页面路由
```

### 6.2 状态管理 — annotationStore.ts

```typescript
// packages/client/src/stores/annotationStore.ts

import { create } from 'zustand';
import type { AnnotationData, AnnotationType } from '@knowledge-agent/shared/types';

type AnnotationTool = 'select' | 'highlight' | 'freetext' | 'ink' | 'square';

interface AnnotationState {
  // ─── 标注数据 ───
  annotations: AnnotationData[];
  selectedAnnotationId: string | null;

  // ─── 工具状态 ───
  activeTool: AnnotationTool;
  toolConfig: {
    highlightColor: { r: number; g: number; b: number };
    inkColor: { r: number; g: number; b: number };
    inkStrokeWidth: number;
    freetextFontSize: number;
  };

  // ─── 编辑状态 ───
  isDirty: boolean;
  isSaving: boolean;

  // ─── Actions ───
  setAnnotations: (annotations: AnnotationData[]) => void;
  addAnnotation: (annotation: AnnotationData) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationData>) => void;
  removeAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  setActiveTool: (tool: AnnotationTool) => void;
  setToolConfig: (config: Partial<AnnotationState['toolConfig']>) => void;
  markClean: () => void;
}

export const useAnnotationStore = create<AnnotationState>()((set) => ({
  annotations: [],
  selectedAnnotationId: null,
  activeTool: 'select',
  toolConfig: {
    highlightColor: { r: 255, g: 235, b: 59 }, // 黄色
    inkColor: { r: 244, g: 67, b: 54 }, // 红色
    inkStrokeWidth: 2,
    freetextFontSize: 14,
  },
  isDirty: false,
  isSaving: false,

  setAnnotations: (annotations) => set({ annotations, isDirty: false }),
  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, annotation],
      isDirty: true,
    })),
  updateAnnotation: (id, updates) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
      ),
      isDirty: true,
    })),
  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      isDirty: true,
      selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
    })),
  selectAnnotation: (id) => set({ selectedAnnotationId: id }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setToolConfig: (config) =>
    set((state) => ({
      toolConfig: { ...state.toolConfig, ...config },
    })),
  markClean: () => set({ isDirty: false }),
}));

// ─── Selectors（避免全量订阅） ───
export const useActiveTool = () => useAnnotationStore((s) => s.activeTool);
export const useAnnotations = () => useAnnotationStore((s) => s.annotations);
export const useSelectedAnnotation = () =>
  useAnnotationStore((s) => s.annotations.find((a) => a.id === s.selectedAnnotationId) ?? null);
export const useIsDirty = () => useAnnotationStore((s) => s.isDirty);
```

### 6.3 PDF.js 封装 — usePdfViewer.ts

```typescript
// packages/client/src/components/pdf-annotator/hooks/usePdfViewer.ts

import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Worker 配置（Vite 兼容）
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface UsePdfViewerOptions {
  containerRef: React.RefObject<HTMLDivElement>;
  url: string;
  initialScale?: number;
}

interface UsePdfViewerReturn {
  pdfDocument: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  pageHeights: number[]; // 每页高度（PDF 坐标系）
  setCurrentPage: (page: number) => void;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getPageViewport: (page: number) => pdfjsLib.PageViewport | null;
}

export function usePdfViewer(options: UsePdfViewerOptions): UsePdfViewerReturn {
  // PDF.js 文档加载、页面渲染、缩放控制
  // 每页渲染到独立 <canvas>，上层覆盖文本层 + 标注层
  // ...
}
```

### 6.4 坐标转换 — coordinate.ts

```typescript
// packages/client/src/components/pdf-annotator/utils/coordinate.ts

import type { PdfRect, InkPath } from '@knowledge-agent/shared/types';

/**
 * 屏幕坐标 → PDF 坐标
 * PDF 坐标原点在左下角，Y 轴向上
 */
export function screenToPdf(
  screenX: number,
  screenY: number,
  pageHeight: number,
  scale: number
): { x: number; y: number } {
  return {
    x: screenX / scale,
    y: pageHeight - screenY / scale,
  };
}

/**
 * PDF 坐标 → 屏幕坐标
 */
export function pdfToScreen(
  pdfX: number,
  pdfY: number,
  pageHeight: number,
  scale: number
): { x: number; y: number } {
  return {
    x: pdfX * scale,
    y: (pageHeight - pdfY) * scale,
  };
}

/**
 * 屏幕矩形 → PDF 矩形
 */
export function screenRectToPdfRect(
  rect: { x: number; y: number; width: number; height: number },
  pageHeight: number,
  scale: number
): PdfRect {
  const topLeft = screenToPdf(rect.x, rect.y, pageHeight, scale);
  const bottomRight = screenToPdf(rect.x + rect.width, rect.y + rect.height, pageHeight, scale);
  // PDF rect: [x1(left), y1(bottom), x2(right), y2(top)]
  return [
    Math.min(topLeft.x, bottomRight.x),
    Math.min(topLeft.y, bottomRight.y),
    Math.max(topLeft.x, bottomRight.x),
    Math.max(topLeft.y, bottomRight.y),
  ];
}

/**
 * 屏幕路径 → PDF 墨迹路径
 */
export function screenPathToPdfInk(
  screenPath: Array<{ x: number; y: number }>,
  pageHeight: number,
  scale: number
): InkPath {
  return screenPath.map(({ x, y }) => screenToPdf(x, y, pageHeight, scale));
}

/**
 * 从 Range / Selection 提取 QuadPoints（跨行高亮）
 * 需要结合 PDF.js 的 textLayer DOM 元素位置
 */
export function selectionToQuadPoints(
  selection: Selection,
  pageElement: HTMLElement,
  pageHeight: number,
  scale: number
): { quadPoints: number[]; rect: PdfRect; text: string } {
  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects());
  const pageRect = pageElement.getBoundingClientRect();

  const quadPoints: number[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const r of rects) {
    // 转为相对于页面元素的坐标
    const relX = r.left - pageRect.left;
    const relY = r.top - pageRect.top;
    const relRight = r.right - pageRect.left;
    const relBottom = r.bottom - pageRect.top;

    // 转为 PDF 坐标
    const tl = screenToPdf(relX, relY, pageHeight, scale);
    const tr = screenToPdf(relRight, relY, pageHeight, scale);
    const bl = screenToPdf(relX, relBottom, pageHeight, scale);
    const br = screenToPdf(relRight, relBottom, pageHeight, scale);

    // QuadPoints 顺序: 左上, 右上, 左下, 右下
    quadPoints.push(tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y);

    minX = Math.min(minX, tl.x, bl.x);
    minY = Math.min(minY, bl.y, br.y);
    maxX = Math.max(maxX, tr.x, br.x);
    maxY = Math.max(maxY, tl.y, tr.y);
  }

  return {
    quadPoints,
    rect: [minX, minY, maxX, maxY],
    text: range.toString(),
  };
}
```

### 6.5 主容器组件 — PdfAnnotator.tsx

```tsx
// packages/client/src/components/pdf-annotator/PdfAnnotator.tsx

interface PdfAnnotatorProps {
  documentId: string;
  pdfUrl: string; // /api/documents/:id/preview
  readOnly?: boolean; // 审阅模式只读
}

export function PdfAnnotator({ documentId, pdfUrl, readOnly = false }: PdfAnnotatorProps) {
  // 布局:
  // ┌──────────────────────────────────────────────────────┐
  // │  AnnotationToolbar (顶部)                            │
  // ├───────────────────────────────────────┬──────────────┤
  // │                                       │              │
  // │  PdfViewer + AnnotationLayer          │ Annotation   │
  // │  (主区域, 可滚动)                      │ Sidebar      │
  // │                                       │ (右侧)       │
  // │  ┌─────────────────────────────┐     │              │
  // │  │  <canvas> (PDF.js 渲染)     │     │ - 标注列表    │
  // │  │  <div> (文本层, textLayer)   │     │ - 评论       │
  // │  │  <svg/canvas> (标注层)       │     │ - 筛选       │
  // │  │  <canvas> (手绘层, 仅 ink)   │     │              │
  // │  └─────────────────────────────┘     │              │
  // │                                       │              │
  // └───────────────────────────────────────┴──────────────┘
  // │  ReviewPanel (底部, 审阅模式时显示)                    │
  // └──────────────────────────────────────────────────────┘
}
```

### 6.6 页面路由

```tsx
// packages/client/src/routes/documents.$id.annotate.route.tsx

import { createFileRoute } from '@tanstack/react-router';
import { AnnotatePage } from '@/pages/documents/AnnotatePage';

export const Route = createFileRoute('/documents/$id/annotate')({
  component: AnnotatePage,
});
```

---

## 7. PDF 写回（核心流程）

### 7.1 写回时机

| 场景         | 触发方式           | 处理位置               |
| ------------ | ------------------ | ---------------------- |
| 下载标注 PDF | 用户点击"下载"     | 后端实时生成，流式返回 |
| 提交审阅     | 用户点击"提交审阅" | 后端生成 + 存储快照    |
| 定时快照     | —                  | 暂不实现               |

### 7.2 写回流程

```
前端                           后端                           存储
  │                              │                              │
  │  POST /submit-review         │                              │
  ├─────────────────────────────►│                              │
  │  { changeNote }              │                              │
  │                              │  1. 读取当前标注 JSON          │
  │                              │     from document_annotations │
  │                              │                              │
  │                              │  2. 读取原始 PDF              │
  │                              │◄─────────────────────────────┤
  │                              │     pdf binary               │
  │                              │                              │
  │                              │  3. pdfAnnotate 写入          │
  │                              │     AnnotationFactory(pdf)    │
  │                              │     for each annotation:      │
  │                              │       create*Annotation()     │
  │                              │       .createDefaultAS()      │
  │                              │     factory.write()           │
  │                              │                              │
  │                              │  4. 存储 PDF 快照             │
  │                              ├─────────────────────────────►│
  │                              │     annotated.pdf            │
  │                              │                              │
  │                              │  5. 创建 annotation_version  │
  │                              │  6. 创建 annotation_review   │
  │                              │     (status = submitted)     │
  │                              │                              │
  │         201 Created          │                              │
  │◄─────────────────────────────┤                              │
  │  { versionId, reviewId }     │                              │
```

### 7.3 Appearance Stream 必要性

```
没有 Appearance Stream:
  ┌──────────────────────────────────────┐
  │ PDF 阅读器          显示结果          │
  │ ─────────────────  ──────────────── │
  │ Adobe Acrobat      ✅ 通常能显示      │
  │ Chrome 内置        ❌ 不显示          │
  │ Firefox 内置       ❌ 不显示          │
  │ macOS Preview      ⚠️ 部分显示       │
  └──────────────────────────────────────┘

有 Appearance Stream (createDefaultAppearanceStream):
  ┌──────────────────────────────────────┐
  │ PDF 阅读器          显示结果          │
  │ ─────────────────  ──────────────── │
  │ Adobe Acrobat      ✅ 一致显示        │
  │ Chrome 内置        ✅ 一致显示        │
  │ Firefox 内置       ✅ 一致显示        │
  │ macOS Preview      ✅ 一致显示        │
  └──────────────────────────────────────┘

⚠️ 每个标注必须调用 createDefaultAppearanceStream()
```

---

## 8. 版本审阅工作流

### 8.1 状态机

```
                    ┌──────────┐
                    │  draft   │  (编辑中，标注可随时保存)
                    └────┬─────┘
                         │ submitForReview()
                         ▼
                    ┌──────────┐
            ┌──────│submitted │──────┐
            │      └──────────┘      │
            │ approve()              │ reject()
            ▼                        ▼
     ┌──────────┐          ┌──────────────────┐
     │ approved │          │    rejected      │
     └──────────┘          └────────┬─────────┘
                                    │
                          ┌─────────┴──────────┐
                          │ requestRevision    │
                          │ = true             │
                          ▼                    ▼
                   ┌──────────────┐    ┌──────────┐
                   │revision_     │    │ 终态      │
                   │requested     │    │(不可继续)  │
                   └──────┬───────┘    └──────────┘
                          │ 修改后重新提交
                          │ submitForReview()
                          ▼
                    ┌──────────┐
                    │submitted │  (新版本)
                    └──────────┘
```

### 8.2 版本对比（Side-by-side）

```
┌────────────────────────────────────────────────────────┐
│  版本对比: v2 ← v3                                     │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐     │
│  │ v2 (已批准)          │  │ v3 (待审阅)          │     │
│  │                      │  │                      │     │
│  │  [PDF 页面]          │  │  [PDF 页面]          │     │
│  │  ■ 高亮A (保留)      │  │  ■ 高亮A (保留)      │     │
│  │  ■ 高亮B (已删除)    │  │  ■ 高亮C (新增, 绿色) │     │
│  │                      │  │  ✎ 批注D (新增, 绿色) │     │
│  │                      │  │                      │     │
│  └─────────────────────┘  └─────────────────────┘     │
│                                                         │
│  差异摘要: +2 新增  -1 删除  0 修改                      │
└────────────────────────────────────────────────────────┘
```

差异计算基于标注 `id` 匹配：

- **新增**：v3 中存在但 v2 中不存在的 `id`
- **删除**：v2 中存在但 v3 中不存在的 `id`
- **修改**：两个版本都存在的 `id`，但 JSON 内容有差异

---

## 9. API 设计

### 9.1 标注 CRUD

```
# 获取文档的标注数据
GET    /api/documents/:documentId/annotations
Response: { annotations: AnnotationData[], updatedAt: string }

# 保存标注（全量覆盖）
PUT    /api/documents/:documentId/annotations
Body:  { annotations: AnnotationData[] }
Response: { success: true, annotationCount: number }

# 导出带标注的 PDF（实时生成，流式返回）
GET    /api/documents/:documentId/annotations/export-pdf
Response: application/pdf (binary stream)
```

### 9.2 版本审阅

```
# 提交审阅（生成版本快照 + PDF 写回）
POST   /api/documents/:documentId/annotations/reviews
Body:  { changeNote?: string }
Response: { versionId: string, reviewId: string, version: number }

# 获取标注版本历史
GET    /api/documents/:documentId/annotations/versions
Response: { versions: AnnotationVersionListItem[] }

# 获取指定版本的标注数据
GET    /api/documents/:documentId/annotations/versions/:version
Response: { annotations: AnnotationData[], pdfSnapshotUrl?: string, review: ReviewInfo }

# 下载指定版本的 PDF 快照
GET    /api/documents/:documentId/annotations/versions/:version/pdf
Response: application/pdf (binary stream)

# 审阅操作（批准/驳回）
PATCH  /api/documents/:documentId/annotations/reviews/:reviewId
Body:  { action: 'approve' | 'reject', comment?: string, requestRevision?: boolean }
Response: { success: true }

# 版本对比
GET    /api/documents/:documentId/annotations/diff?from=2&to=3
Response: { added: AnnotationData[], removed: AnnotationData[], modified: ModifiedAnnotation[] }

# 回滚到指定版本
POST   /api/documents/:documentId/annotations/versions/:version/restore
Response: { success: true }
```

---

## 10. 实施阶段

### Phase 1：PDF 渲染 + 基础标注（~2 周）

- [ ] 安装 `pdfjs-dist` + `annotpdf` 依赖
- [ ] 实现 `usePdfViewer` hook（PDF.js 加载、渲染、缩放）
- [ ] 实现 `PdfViewer` 组件（Canvas 渲染 + 文本层）
- [ ] 实现坐标转换工具函数
- [ ] 实现 `annotationStore`（Zustand）
- [ ] 实现高亮标注（文本选中 → 高亮）
- [ ] 实现手绘标注（InkCanvas + SVG/Canvas 绘制）
- [ ] 实现批注标注（FreeText 输入框）
- [ ] 实现 `AnnotationToolbar`（工具切换）
- [ ] 标注渲染层（将 Zustand 中的标注绘制到 PDF 上方）

### Phase 2：后端持久化 + PDF 写回（~1.5 周）

- [ ] 数据库 Schema 迁移（3 张新表）
- [ ] annotation 模块脚手架（controller/service/repository）
- [ ] 标注 CRUD API（GET/PUT /annotations）
- [ ] `AnnotationPdfService`（pdfAnnotate 集成）
- [ ] 导出 PDF 端点（GET /export-pdf）
- [ ] 前端自动保存（防抖 PUT）
- [ ] 前端下载标注 PDF 按钮

### Phase 3：版本审阅（~1.5 周）

- [ ] 审阅相关 API 端点
- [ ] 提交审阅流程（生成快照 + PDF 写回 + 存储）
- [ ] 审阅操作（批准/驳回/要求修改）
- [ ] 版本历史列表 UI
- [ ] `ReviewPanel` 组件
- [ ] 回滚到指定版本

### Phase 4：版本对比 + 优化（~1 周）

- [ ] 标注差异计算算法
- [ ] `VersionCompare` Side-by-side 组件
- [ ] 大文件优化（按需渲染页面）
- [ ] 标注搜索/筛选
- [ ] 键盘快捷键（Ctrl+Z 撤销、Del 删除等）

---

## 11. 风险与缓解

| 风险                             | 影响 | 缓解措施                                                                             |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| pdfAnnotate 维护停滞             | 中   | 库代码量小（~3k 行），必要时 fork 自维护；核心能力是 PDF 规范写入，稳定性高          |
| 部分标注在特定阅读器显示不一致   | 低   | 始终调用 `createDefaultAppearanceStream()`；建立 Acrobat/Chrome/Firefox 三端测试矩阵 |
| 大 PDF（>100 页）性能            | 中   | 按需渲染可视页面（虚拟滚动）；PDF 写回在后端异步执行，不阻塞请求                     |
| PDF.js Worker 跨域问题           | 低   | Worker 文件使用 `import.meta.url` 或复制到 `public/` 目录                            |
| 坐标转换精度                     | 中   | 单元测试覆盖各种缩放比例下的坐标转换；使用 PDF 原生坐标存储，仅渲染时转换            |
| annotpdf 包与特定 PDF 格式兼容性 | 中   | 对加密/受保护 PDF 做前置检查，不支持的场景给出明确提示                               |

---

## 附录

### A. 依赖安装

```bash
# 前端
pnpm -F @knowledge-agent/client add pdfjs-dist

# 后端
pnpm -F @knowledge-agent/server add annotpdf

# 共享类型（无额外依赖）
```

### B. PDF.js Worker 配置（Vite）

```typescript
// vite.config.ts 添加
export default defineConfig({
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
        },
      },
    },
  },
});
```

### C. 参考资料

- [PDF Reference (ISO 32000-1) — Annotation Types](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)
- [pdfAnnotate GitHub](https://github.com/highkite/pdfAnnotate)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [PDF.js Annotation Editor Issues](https://github.com/mozilla/pdf.js/issues/15403)

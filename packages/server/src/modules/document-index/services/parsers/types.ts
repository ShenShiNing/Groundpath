export type ParsedNodeType =
  | 'document'
  | 'chapter'
  | 'section'
  | 'paragraph'
  | 'table'
  | 'figure'
  | 'appendix';

export type ParsedEdgeType = 'parent' | 'next' | 'refers_to' | 'cites';

export interface ParsedDocumentNode {
  id: string;
  parentId: string | null;
  nodeType: ParsedNodeType;
  title: string | null;
  depth: number;
  sectionPath: string[];
  pageStart?: number;
  pageEnd?: number;
  orderNo: number;
  stableLocator: string;
  content: string;
  contentPreview: string;
  tokenCount: number;
}

export interface ParsedDocumentEdge {
  fromNodeId: string;
  toNodeId: string;
  edgeType: ParsedEdgeType;
  anchorText?: string;
}

export interface ParsedDocumentStructure {
  nodes: ParsedDocumentNode[];
  edges: ParsedDocumentEdge[];
  parseMethod: string;
  parserRuntime: string;
  headingCount: number;
}

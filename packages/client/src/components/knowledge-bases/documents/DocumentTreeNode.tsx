import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileType,
  File as FileIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import type { FolderTreeNode, DocumentListItem, DocumentType } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'document';
  level: number;
  folder?: FolderTreeNode;
  document?: DocumentListItem;
  children?: TreeNode[];
}

export interface DocumentTreeNodeProps {
  node: TreeNode;
  level: number;
  isSelected: boolean;
  isExpanded?: boolean;
  onSelect: (id: string, type: 'folder' | 'document') => void;
  onToggle?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
  isMultiSelectMode?: boolean;
  onCheckboxChange?: (id: string, checked: boolean) => void;
  isChecked?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const documentTypeIcons: Record<DocumentType, typeof FileText> = {
  pdf: FileText,
  markdown: FileType,
  text: FileIcon,
  docx: FileText,
  other: FileIcon,
};

const documentTypeColors: Record<DocumentType, string> = {
  pdf: 'text-red-500',
  markdown: 'text-purple-500',
  text: 'text-gray-500',
  docx: 'text-blue-500',
  other: 'text-gray-400',
};

// ============================================================================
// Component
// ============================================================================

export function DocumentTreeNode({
  node,
  level,
  isSelected,
  isExpanded = false,
  onSelect,
  onToggle,
  onContextMenu,
  isMultiSelectMode = false,
  onCheckboxChange,
  isChecked = false,
}: DocumentTreeNodeProps) {
  const isFolder = node.type === 'folder';
  const hasChildren = isFolder && node.children && node.children.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    // Handle Ctrl/Cmd click for multi-select
    if (e.ctrlKey || e.metaKey) {
      if (onCheckboxChange) {
        onCheckboxChange(node.id, !isChecked);
      }
      return;
    }

    // Handle folder toggle
    if (isFolder && onToggle) {
      onToggle(node.id);
    }

    // Normal selection
    onSelect(node.id, node.type);
  };

  const handleArrowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder && onToggle) {
      onToggle(node.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, node);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheckboxChange?.(node.id, !isChecked);
  };

  // Get the appropriate icon
  const getIcon = () => {
    if (isFolder) {
      const FolderIcon = isExpanded ? FolderOpen : Folder;
      return <FolderIcon className="size-4 text-amber-500" />;
    }

    const docType = node.document?.documentType ?? 'other';
    const DocIcon = documentTypeIcons[docType];
    const colorClass = documentTypeColors[docType];
    return <DocIcon className={cn('size-4', colorClass)} />;
  };

  return (
    <div>
      <button
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md',
          'hover:bg-muted/70 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isSelected && 'bg-muted font-medium',
          isChecked && 'bg-primary/10'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Checkbox for multi-select mode */}
        {isMultiSelectMode && (
          <div
            className={cn(
              'size-4 shrink-0 rounded-sm border border-primary',
              'flex items-center justify-center mr-1',
              isChecked && 'bg-primary text-primary-foreground'
            )}
            onClick={handleCheckboxClick}
          >
            {isChecked && (
              <svg className="size-3" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6L5 8.5L9.5 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        )}

        {/* Expand/Collapse Arrow (only for folders) */}
        <ChevronRight
          className={cn(
            'size-4 text-muted-foreground transition-transform flex-none',
            isExpanded && 'rotate-90',
            !isFolder && 'opacity-0'
          )}
          onClick={handleArrowClick}
        />

        {/* Icon */}
        {getIcon()}

        {/* Name */}
        <span className="truncate flex-1 text-left">{node.name}</span>

        {/* Document processing status */}
        {node.document && (
          <ProcessingStatusBadge
            status={node.document.processingStatus}
            showLabel={false}
            className="ml-auto"
          />
        )}

        {/* Folder children count */}
        {isFolder && node.children && (
          <span className="text-xs text-muted-foreground tabular-nums">{node.children.length}</span>
        )}
      </button>

      {/* Render children if expanded */}
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <DocumentTreeNode
              key={`${child.type}-${child.id}`}
              node={child}
              level={level + 1}
              isSelected={false} // Selection state managed by parent
              isExpanded={false} // Expansion state managed by parent
              onSelect={onSelect}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              isMultiSelectMode={isMultiSelectMode}
              onCheckboxChange={onCheckboxChange}
              isChecked={false} // Checked state managed by parent
            />
          ))}
        </div>
      )}
    </div>
  );
}

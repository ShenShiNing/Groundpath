import { useState, useMemo, useCallback } from 'react';
import { Search, FolderPlus, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DocumentTreeNode, type TreeNode } from './DocumentTreeNode';
import type { FolderTreeNode, DocumentListItem } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface DocumentTreeProps {
  knowledgeBaseId: string;
  folderTree: FolderTreeNode[];
  documents: DocumentListItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onDocumentClick: (doc: DocumentListItem) => void;
  onFolderClick: (folder: FolderTreeNode | null) => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onDeleteDocument?: (doc: DocumentListItem) => void;
  onMoveDocument?: (doc: DocumentListItem) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function buildMixedTree(
  folderTree: FolderTreeNode[],
  documents: DocumentListItem[],
  parentFolderId: string | null = null,
  level = 0
): TreeNode[] {
  const result: TreeNode[] = [];

  // Add folders at this level
  const foldersAtLevel = parentFolderId === null ? folderTree : [];
  for (const folder of foldersAtLevel) {
    const folderDocuments = documents.filter((d) => d.folderId === folder.id);
    result.push({
      id: folder.id,
      name: folder.name,
      type: 'folder',
      level,
      folder,
      children: [
        // Recursively add subfolders
        ...buildMixedTree(folder.children, documents, folder.id, level + 1),
        // Add documents in this folder
        ...folderDocuments.map((doc) => ({
          id: doc.id,
          name: doc.title,
          type: 'document' as const,
          level: level + 1,
          document: doc,
        })),
      ],
    });
  }

  // Add root-level documents (documents without folder)
  if (parentFolderId === null) {
    const rootDocuments = documents.filter((d) => d.folderId === null);
    for (const doc of rootDocuments) {
      result.push({
        id: doc.id,
        name: doc.title,
        type: 'document',
        level,
        document: doc,
      });
    }
  }

  return result;
}

function filterTree(tree: TreeNode[], searchTerm: string): TreeNode[] {
  if (!searchTerm) return tree;

  const lowerSearch = searchTerm.toLowerCase();
  const result: TreeNode[] = [];

  for (const node of tree) {
    const nameMatches = node.name.toLowerCase().includes(lowerSearch);

    if (node.type === 'folder' && node.children) {
      const filteredChildren = filterTree(node.children, searchTerm);
      if (filteredChildren.length > 0 || nameMatches) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    } else if (nameMatches) {
      result.push(node);
    }
  }

  return result;
}

// Helper to find folder by id
function findFolder(tree: FolderTreeNode[], id: string): FolderTreeNode | null {
  for (const folder of tree) {
    if (folder.id === id) return folder;
    const found = findFolder(folder.children, id);
    if (found) return found;
  }
  return null;
}

// ============================================================================
// Component - renders content only, no wrapper
// ============================================================================

export function DocumentTree({
  folderTree,
  documents,
  selectedIds,
  onSelectionChange,
  onDocumentClick,
  onFolderClick,
  onUpload,
  onNewFolder,
  onDeleteDocument,
  onMoveDocument,
}: DocumentTreeProps) {
  const [search, setSearch] = useState('');
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<TreeNode | null>(null);

  // Build the mixed tree structure
  const tree = useMemo(() => buildMixedTree(folderTree, documents), [folderTree, documents]);

  // Filter tree by search term
  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search]);

  // Check if multi-select mode is active
  const isMultiSelectMode = selectedIds.size > 0;

  // Toggle folder expansion
  const handleToggle = useCallback((id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Handle node selection
  const handleSelect = useCallback(
    (id: string, type: 'folder' | 'document') => {
      setSelectedNodeId(id);

      if (type === 'folder') {
        const folder = findFolder(folderTree, id);
        onFolderClick(folder);
      } else {
        const doc = documents.find((d) => d.id === id);
        if (doc) {
          onDocumentClick(doc);
        }
      }
    },
    [folderTree, documents, onFolderClick, onDocumentClick]
  );

  // Handle checkbox change for multi-select
  const handleCheckboxChange = useCallback(
    (id: string, checked: boolean) => {
      const newSelection = new Set(selectedIds);
      if (checked) {
        newSelection.add(id);
      } else {
        newSelection.delete(id);
      }
      onSelectionChange(newSelection);
    },
    [selectedIds, onSelectionChange]
  );

  // Handle context menu
  const handleContextMenu = useCallback((_e: React.MouseEvent, node: TreeNode) => {
    setContextMenuNode(node);
  }, []);

  // Render tree nodes recursively
  const renderTree = (nodes: TreeNode[]) => {
    return nodes.map((node) => (
      <DocumentTreeNode
        key={`${node.type}-${node.id}`}
        node={node}
        level={node.level}
        isSelected={selectedNodeId === node.id}
        isExpanded={expandedFolderIds.has(node.id)}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onContextMenu={handleContextMenu}
        isMultiSelectMode={isMultiSelectMode}
        onCheckboxChange={handleCheckboxChange}
        isChecked={selectedIds.has(node.id)}
      />
    ));
  };

  return (
    <>
      {/* Action Buttons */}
      <div className="p-3 space-y-2 border-b">
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={onNewFolder}>
          <FolderPlus className="size-4 mr-2" />
          New Folder
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={onUpload}>
          <Upload className="size-4 mr-2" />
          Upload
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            className="pl-9 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tree View */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredTree.length > 0 ? (
            <div className="space-y-0.5">{renderTree(filteredTree)}</div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {search ? 'No results found' : 'No documents yet'}
              </p>
              {!search && (
                <p className="text-xs text-muted-foreground mt-1">Upload files to get started</p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Context Menu (rendered as dropdown) */}
      {contextMenuNode && (
        <DropdownMenu
          open={!!contextMenuNode}
          onOpenChange={(open) => !open && setContextMenuNode(null)}
        >
          <DropdownMenuTrigger className="sr-only" />
          <DropdownMenuContent>
            {contextMenuNode.type === 'document' && contextMenuNode.document && (
              <>
                <DropdownMenuItem onClick={() => onDocumentClick(contextMenuNode.document!)}>
                  Open
                </DropdownMenuItem>
                {onMoveDocument && (
                  <DropdownMenuItem onClick={() => onMoveDocument(contextMenuNode.document!)}>
                    Move to...
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onDeleteDocument && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteDocument(contextMenuNode.document!)}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </>
            )}
            {contextMenuNode.type === 'folder' && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    setExpandedFolderIds((prev) => new Set([...prev, contextMenuNode.id]));
                  }}
                >
                  Expand
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

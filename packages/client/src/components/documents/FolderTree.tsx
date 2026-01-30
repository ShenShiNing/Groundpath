import { useState } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { FolderTreeNode } from '@knowledge-agent/shared/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FolderTreeProps {
  folders: FolderTreeNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onEditFolder?: (folder: FolderTreeNode) => void;
  onDeleteFolder?: (folder: FolderTreeNode) => void;
  className?: string;
}

interface FolderNodeProps {
  folder: FolderTreeNode;
  level: number;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onEditFolder?: (folder: FolderTreeNode) => void;
  onDeleteFolder?: (folder: FolderTreeNode) => void;
  expandedIds: Set<string>;
  onToggleExpand: (folderId: string) => void;
}

function FolderNode({
  folder,
  level,
  selectedFolderId,
  onSelectFolder,
  onEditFolder,
  onDeleteFolder,
  expandedIds,
  onToggleExpand,
}: FolderNodeProps) {
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const hasChildren = folder.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer hover:bg-muted transition-colors',
          isSelected && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelectFolder(folder.id)}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(folder.id);
            }}
          >
            <ChevronRight
              className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-90')}
            />
          </Button>
        ) : (
          <span className="w-5" />
        )}
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 shrink-0" />
        )}
        <span className="text-sm truncate flex-1">{folder.name}</span>

        {(onEditFolder || onDeleteFolder) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEditFolder && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditFolder(folder);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
              )}
              {onEditFolder && onDeleteFolder && <DropdownMenuSeparator />}
              {onDeleteFolder && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFolder(folder);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onEditFolder,
  onDeleteFolder,
  className,
}: FolderTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer hover:bg-muted transition-colors',
          selectedFolderId === null && 'bg-primary/10 text-primary'
        )}
        onClick={() => onSelectFolder(null)}
      >
        <Home className="h-4 w-4" />
        <span className="text-sm font-medium">All Documents</span>
      </div>

      {folders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          level={0}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          onEditFolder={onEditFolder}
          onDeleteFolder={onDeleteFolder}
          expandedIds={expandedIds}
          onToggleExpand={toggleExpand}
        />
      ))}
    </div>
  );
}

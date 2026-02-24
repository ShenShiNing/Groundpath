import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ChatInput({
  onSend,
  onStop,
  isGenerating = false,
  disabled = false,
  placeholder = 'Ask a question about your documents...',
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInput = input.trim().length > 0;
  const canStop = isGenerating && Boolean(onStop);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!hasInput || disabled || isGenerating) return;
    onSend(input.trim());
    setInput('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePrimaryAction = () => {
    if (canStop) {
      onStop?.();
      return;
    }
    handleSend();
  };

  return (
    <div>
      <div className="flex items-end gap-2 rounded-3xl border bg-background px-3 py-2 shadow-sm">
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          className={cn(
            'flex-1 bg-transparent px-2 py-1.5 resize-none',
            'focus:outline-none text-sm',
            'min-h-9 max-h-37.5'
          )}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <Button
          type="button"
          size="icon"
          className="size-8 rounded-full shrink-0 cursor-pointer"
          onClick={handlePrimaryAction}
          disabled={canStop ? false : !hasInput || disabled}
          title={canStop ? '停止输出' : '发送消息'}
        >
          {canStop ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        AI can make mistakes. Verify important information.
      </p>
    </div>
  );
}

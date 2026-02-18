import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Ask a question about your documents...',
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
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

  return (
    <div className="p-3 border-t bg-background">
      <div className="flex items-end gap-2 bg-muted/50 rounded-xl p-2">
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
          size="icon"
          className="size-8 rounded-lg shrink-0"
          onClick={handleSend}
          disabled={!input.trim() || disabled}
        >
          {disabled ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2">
        AI can make mistakes. Verify important information.
      </p>
    </div>
  );
}

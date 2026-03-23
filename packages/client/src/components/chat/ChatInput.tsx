import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

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
  placeholder,
}: ChatInputProps) {
  const { t } = useTranslation('chat');
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
      <div className="flex items-end gap-2 rounded-[1.75rem] border border-black/8 bg-background px-3.5 py-2.5 shadow-[0_14px_36px_-24px_rgba(0,0,0,0.45)] ring-1 ring-transparent transition-shadow focus-within:ring-[#10a37f]/18 dark:border-white/10 dark:bg-[#303030]">
        <textarea
          ref={textareaRef}
          placeholder={placeholder ?? t('input.defaultPlaceholder')}
          className={cn(
            'flex-1 resize-none bg-transparent px-2 py-1.5',
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
          className={cn(
            'size-9 shrink-0 rounded-full cursor-pointer border-0 text-white shadow-none',
            canStop ? 'bg-foreground hover:bg-foreground/90' : 'bg-[#10a37f] hover:bg-[#0d8c6d]'
          )}
          onClick={handlePrimaryAction}
          disabled={canStop ? false : !hasInput || disabled}
          title={canStop ? t('input.stop') : t('input.send')}
        >
          {canStop ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">{t('input.disclaimer')}</p>
    </div>
  );
}

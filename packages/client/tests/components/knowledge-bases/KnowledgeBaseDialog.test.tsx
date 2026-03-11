import React, { createContext, useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireClick, fireInput, flushPromises } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useCreateKnowledgeBase: () => ({
    mutateAsync: mocks.createMutateAsync,
    isPending: false,
  }),
  useUpdateKnowledgeBase: () => ({
    mutateAsync: mocks.updateMutateAsync,
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement> & { children: React.ReactNode }) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

const SelectContext = createContext<{
  value: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
} | null>(null);

vi.mock('@/components/ui/select', () => {
  function Select({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) {
    return (
      <SelectContext.Provider value={{ value, onValueChange, disabled }}>
        <div data-select-root="" data-disabled={disabled ? 'true' : 'false'}>
          {children}
        </div>
      </SelectContext.Provider>
    );
  }

  function SelectTrigger({ children }: { children: React.ReactNode }) {
    const context = useContext(SelectContext);
    return (
      <button type="button" data-select-trigger="" disabled={context?.disabled}>
        {children}
      </button>
    );
  }

  function SelectValue() {
    const context = useContext(SelectContext);
    return <span>{context?.value}</span>;
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }

  function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
    const context = useContext(SelectContext);
    return (
      <button
        type="button"
        data-select-item={value}
        onClick={() => context?.onValueChange?.(value)}
        disabled={context?.disabled}
      >
        {children}
      </button>
    );
  }

  return {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
  };
});

import { KnowledgeBaseDialog } from '../../../src/components/knowledge-bases/KnowledgeBaseDialog';

describe('KnowledgeBaseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a knowledge base from form input', async () => {
    mocks.createMutateAsync.mockResolvedValue({ id: 'kb-1' });
    const onOpenChange = vi.fn();

    const view = await render(<KnowledgeBaseDialog open={true} onOpenChange={onOpenChange} />);

    const nameInput = view.container.querySelector('#name') as HTMLInputElement | null;
    const descriptionInput = view.container.querySelector(
      '#description'
    ) as HTMLTextAreaElement | null;
    const submitButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent === 'create'
    );

    await fireInput(nameInput, '  KB Title  ');
    await fireInput(descriptionInput, '  KB Description  ');
    await fireClick(submitButton ?? null);
    await flushPromises();

    expect(mocks.createMutateAsync).toHaveBeenCalledWith({
      name: 'KB Title',
      description: 'KB Description',
      embeddingProvider: 'zhipu',
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('dialog.toast.created');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await view.unmount();
  });

  it('should update an existing knowledge base and preserve provider', async () => {
    mocks.updateMutateAsync.mockResolvedValue({ id: 'kb-1' });
    const onOpenChange = vi.fn();

    const view = await render(
      <KnowledgeBaseDialog
        open={true}
        onOpenChange={onOpenChange}
        knowledgeBase={{
          id: 'kb-1',
          name: 'Original',
          description: 'Old description',
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-3-small',
          embeddingDimensions: 1536,
          documentCount: 0,
          totalChunks: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
        }}
      />
    );

    const nameInput = view.container.querySelector('#name') as HTMLInputElement | null;
    const descriptionInput = view.container.querySelector(
      '#description'
    ) as HTMLTextAreaElement | null;
    const submitButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent === 'update'
    );

    expect(nameInput?.value).toBe('Original');
    expect(descriptionInput?.value).toBe('Old description');

    await fireInput(nameInput, '  Renamed KB ');
    await fireInput(descriptionInput, ' Updated description ');
    await fireClick(submitButton ?? null);
    await flushPromises();

    expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
      id: 'kb-1',
      data: {
        name: 'Renamed KB',
        description: 'Updated description',
      },
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('dialog.toast.updated');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await view.unmount();
  });
});

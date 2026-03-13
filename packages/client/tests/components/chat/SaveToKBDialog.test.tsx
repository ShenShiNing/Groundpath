import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireClick, flushPromises, render } from '../../utils/render';
import type { SaveToKBDialogFormProps } from '../../../src/components/chat/SaveToKBDialog.types';

const mocks = vi.hoisted(() => ({
  useKnowledgeBases: vi.fn(),
  mutateAsync: vi.fn(),
  uploadDocument: vi.fn(),
  updateConversation: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/hooks', () => ({
  useKnowledgeBases: mocks.useKnowledgeBases,
  useCreateKnowledgeBase: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    knowledgeBasesApi: {
      ...actual.knowledgeBasesApi,
      uploadDocument: mocks.uploadDocument,
    },
    conversationApi: {
      ...actual.conversationApi,
      update: mocks.updateConversation,
    },
  };
});

vi.mock('@/components/chat/SaveToKBDialogForm', () => ({
  SaveToKBDialogForm: (props: SaveToKBDialogFormProps) => (
    <div>
      <div data-testid="kb-seed-mode">{props.kbSeedMode}</div>
      <div data-testid="target-kb">{props.targetKbId ?? ''}</div>
      <div data-testid="new-kb-name">{props.newKbName}</div>
      <div data-testid="seed-source">{props.seedSource}</div>
      <div data-testid="switch-kb">{props.switchToNewKb ? 'yes' : 'no'}</div>
      <button type="button" onClick={() => props.onKbSeedModeChange('new')}>
        mode-new
      </button>
      <button type="button" onClick={() => props.onKbSeedModeChange('existing')}>
        mode-existing
      </button>
      <button type="button" onClick={() => props.onTargetKbIdChange('kb-2')}>
        target-kb-2
      </button>
      <button type="button" onClick={() => props.onNewKbNameChange('')}>
        empty-name
      </button>
      <button type="button" onClick={() => props.onNewKbNameChange('Fresh KB')}>
        set-name
      </button>
      <button type="button" onClick={() => props.onSwitchToNewKbChange(false)}>
        disable-switch
      </button>
      <button type="button" onClick={() => props.onSeedSourceChange('conversation')}>
        seed-conversation
      </button>
      <button type="button" onClick={props.onSave}>
        save
      </button>
    </div>
  ),
}));

import { SaveToKBDialog } from '../../../src/components/chat/SaveToKBDialog';

const knowledgeBases = [
  { id: 'kb-1', name: 'Existing KB 1' },
  { id: 'kb-2', name: 'Existing KB 2' },
];

const messages = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Question',
    timestamp: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    status: 'sent',
    citations: [],
    mode: 'chat',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Answer',
    timestamp: new Date('2026-03-01T00:00:01.000Z'),
    createdAt: new Date('2026-03-01T00:00:01.000Z'),
    status: 'sent',
    citations: [],
    isLoading: false,
    mode: 'chat',
  },
];

describe('SaveToKBDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useKnowledgeBases.mockReturnValue({
      data: knowledgeBases,
    });
    mocks.mutateAsync.mockResolvedValue({
      id: 'kb-3',
      name: 'Fresh KB',
    });
    mocks.uploadDocument.mockResolvedValue({ message: 'ok' });
    mocks.updateConversation.mockResolvedValue(undefined);
  });

  it('should block creating a new knowledge base when the name is empty', async () => {
    const onOpenChange = vi.fn();
    const onKbSwitch = vi.fn();

    const view = await render(
      <SaveToKBDialog
        open
        onOpenChange={onOpenChange}
        messages={messages as never}
        conversationId="conv-1"
        selectedKnowledgeBaseId="kb-1"
        knowledgeBaseName="Alpha KB"
        onKbSwitch={onKbSwitch}
      />
    );

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('mode-new')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('empty-name')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('save')
      ) ?? null
    );

    expect(mocks.toastError).toHaveBeenCalledWith('kbName.required');
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.uploadDocument).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onKbSwitch).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('should upload into an existing knowledge base and switch the conversation on success', async () => {
    const onOpenChange = vi.fn();
    const onKbSwitch = vi.fn();

    const view = await render(
      <SaveToKBDialog
        open
        onOpenChange={onOpenChange}
        messages={messages as never}
        conversationId="conv-1"
        selectedKnowledgeBaseId="kb-1"
        knowledgeBaseName="Alpha KB"
        onKbSwitch={onKbSwitch}
      />
    );

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('mode-existing')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('target-kb-2')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('save')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.uploadDocument).toHaveBeenCalledWith('kb-2', expect.any(FormData));
    const formData = mocks.uploadDocument.mock.calls[0][1] as FormData;
    expect(formData.get('title')).toBe('seed.documentTitle.latestAssistant');
    expect(formData.get('description')).toBe('seed.documentDescription');
    const uploadedFile = formData.get('file');
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe('seed.documentTitle.latestAssistant.md');
    expect(mocks.updateConversation).toHaveBeenCalledWith('conv-1', { knowledgeBaseId: 'kb-2' });
    expect(onKbSwitch).toHaveBeenCalledWith('kb-2');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('createKb.appendSuccess');

    await view.unmount();
  });

  it('should create a new knowledge base without switching when disabled', async () => {
    const onOpenChange = vi.fn();
    const onKbSwitch = vi.fn();

    const view = await render(
      <SaveToKBDialog
        open
        onOpenChange={onOpenChange}
        messages={messages as never}
        conversationId="conv-1"
        selectedKnowledgeBaseId="kb-1"
        knowledgeBaseName="Alpha KB"
        onKbSwitch={onKbSwitch}
      />
    );

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('mode-new')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('set-name')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('seed-conversation')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('disable-switch')
      ) ?? null
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('save')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      name: 'Fresh KB',
      description: null,
      embeddingProvider: 'zhipu',
    });
    expect(mocks.uploadDocument).toHaveBeenCalledWith('kb-3', expect.any(FormData));
    expect(mocks.updateConversation).not.toHaveBeenCalled();
    expect(onKbSwitch).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('kbCreate.success');

    await view.unmount();
  });
});

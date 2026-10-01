import { create } from 'zustand';
import type { Conversation, Message, Persona, PersonaId, SendMessageRequest, ToolInfo } from '@doona/shared';
import { api, streamMessage } from '../lib/api';
import { storage } from '../lib/storage';

const PERSONA_KEY = 'doona.persona';

interface Streaming {
  conversationId: string;
  content: string;
  /** 답변 시작 전 대기 사유 (모델 교체 등) */
  status: string | null;
  controller: AbortController;
}

interface ChatState {
  conversations: Conversation[];
  listLoaded: boolean;
  search: string;
  currentId: string | null;
  messages: Message[];
  loadingMessages: boolean;
  streaming: Streaming | null;
  error: string | null;
  personas: Persona[];
  /** doona-tools 가 제공하는 도구 (비어 있으면 도구 버튼 숨김) */
  tools: ToolInfo[];
  defaultPersona: PersonaId | null;
  /** 새 대화의 대화 상대 (마지막 선택을 기억) */
  draftPersona: PersonaId | null;

  loadConversations: (q?: string) => Promise<void>;
  loadPersonas: () => Promise<void>;
  loadTools: () => Promise<void>;
  select: (id: string | null) => Promise<void>;
  newChat: () => void;
  send: (content: string, tool?: string) => Promise<void>;
  regenerate: () => Promise<void>;
  editAndResend: (messageId: string, content: string) => Promise<void>;
  stop: () => void;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setPersona: (persona: PersonaId) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const tempId = () => `temp-${crypto.randomUUID()}`;

/** 도구 실행 중 표시용 (결과는 비어 있음) */
function toolPlaceholder(tools: ToolInfo[], name: string): Message['tool'] {
  const t = tools.find((x) => x.name === name);
  return { name, title: t?.title ?? name, emoji: t?.emoji ?? '🔧', result: '', isError: false };
}

const initial = {
  conversations: [],
  listLoaded: false,
  search: '',
  currentId: null,
  messages: [],
  loadingMessages: false,
  streaming: null,
  error: null,
  personas: [],
  tools: [],
  defaultPersona: null,
  draftPersona: storage.get(PERSONA_KEY) as PersonaId | null,
};

export const useChat = create<ChatState>((set, get) => {
  /** 서버에 요청을 보내고 스트림을 반영한다. */
  async function run(conversationId: string, body: SendMessageRequest) {
    const controller = new AbortController();
    set({ streaming: { conversationId, content: '', status: null, controller }, error: null });

    // 토큰마다 렌더하지 않고 프레임 단위로 모아서 반영
    let pending = '';
    let frame = 0;
    const flush = () => {
      frame = 0;
      const s = get().streaming;
      if (s && pending) set({ streaming: { ...s, content: s.content + pending, status: null } });
      pending = '';
    };

    const isCurrent = () => get().currentId === conversationId;
    try {
      for await (const ev of streamMessage(conversationId, body, controller.signal)) {
        switch (ev.type) {
          case 'start':
            if (ev.userMessage && isCurrent()) {
              // 임시 메시지를 서버가 저장한 메시지로 교체
              const msgs = get().messages.filter((m) => !m.id.startsWith('temp-'));
              set({ messages: [...msgs, ev.userMessage] });
            }
            set({
              conversations: get().conversations.map((c) =>
                c.id === conversationId ? { ...c, title: ev.title } : c,
              ),
            });
            break;
          case 'tool':
            if (isCurrent()) {
              set({ messages: get().messages.map((m) => (m.id === ev.messageId ? { ...m, tool: ev.tool } : m)) });
            }
            break;
          case 'status': {
            const s = get().streaming;
            if (s) set({ streaming: { ...s, status: ev.message } });
            break;
          }
          case 'delta':
            pending += ev.content;
            if (!frame) frame = requestAnimationFrame(flush);
            break;
          case 'done':
            cancelAnimationFrame(frame);
            if (isCurrent()) set({ messages: [...get().messages, ev.message] });
            break;
          case 'error':
            cancelAnimationFrame(frame);
            if (isCurrent()) {
              set({ error: ev.error, messages: ev.message ? [...get().messages, ev.message] : get().messages });
            }
            break;
        }
      }
    } catch (err) {
      if (isCurrent()) set({ error: (err as Error).message });
    } finally {
      cancelAnimationFrame(frame);
      const aborted = controller.signal.aborted;
      set({ streaming: null });
      // 대화를 맨 위로
      const now = new Date().toISOString();
      const list = get().conversations;
      const c = list.find((x) => x.id === conversationId);
      if (c) set({ conversations: [{ ...c, updatedAt: now }, ...list.filter((x) => x.id !== conversationId)] });
      // 중지한 경우 서버에 저장된 부분 답변을 다시 불러온다
      if (aborted && isCurrent()) {
        setTimeout(() => {
          if (get().currentId === conversationId && !get().streaming) {
            api.conversation(conversationId).then((d) => isCurrent() && set({ messages: d.messages }), () => {});
          }
        }, 400);
      }
    }
  }

  return {
    ...initial,

    async loadConversations(q) {
      const search = q ?? get().search;
      set({ search });
      try {
        const conversations = await api.conversations(search || undefined);
        if (get().search === search) set({ conversations, listLoaded: true });
      } catch (err) {
        set({ error: (err as Error).message, listLoaded: true });
      }
    },

    async loadTools() {
      try {
        set({ tools: await api.tools() });
      } catch {
        set({ tools: [] });
      }
    },

    async loadPersonas() {
      try {
        const res = await api.personas();
        const draft = get().draftPersona;
        set({
          personas: res.personas,
          defaultPersona: res.default,
          // 기억해 둔 캐릭터가 더 이상 없으면 기본값으로
          draftPersona: draft && res.personas.some((p) => p.id === draft) ? draft : res.default,
        });
      } catch {
        /* 목록을 못 받으면 서버 기본 캐릭터로 동작 */
      }
    },

    async select(id) {
      if (get().currentId === id) return;
      set({ currentId: id, messages: [], error: null, loadingMessages: !!id });
      if (!id) return;
      try {
        const detail = await api.conversation(id);
        if (get().currentId === id) set({ messages: detail.messages, loadingMessages: false });
      } catch (err) {
        if (get().currentId === id) set({ error: (err as Error).message, loadingMessages: false });
      }
    },

    newChat() {
      set({ currentId: null, messages: [], error: null, loadingMessages: false });
    },

    async send(content, tool) {
      const text = content.trim();
      if (!text || get().streaming) return;
      let id = get().currentId;
      const optimistic: Message = {
        id: tempId(),
        conversationId: id ?? '',
        role: 'user',
        content: text,
        persona: null,
        // 도구 결과는 서버가 실행한 뒤 'tool' 이벤트로 채운다
        tool: tool ? toolPlaceholder(get().tools, tool) : null,
        incomplete: false,
        createdAt: new Date().toISOString(),
      };
      set({ messages: [...get().messages, optimistic], error: null });

      if (!id) {
        try {
          const c = await api.createConversation(get().draftPersona ?? undefined);
          id = c.id;
          set({ currentId: id, conversations: [c, ...get().conversations] });
        } catch (err) {
          set({ error: (err as Error).message, messages: get().messages.filter((m) => m.id !== optimistic.id) });
          return;
        }
      }
      await run(id, { content: text, tool });
    },

    async regenerate() {
      const id = get().currentId;
      if (!id || get().streaming) return;
      const msgs = get().messages;
      if (msgs.at(-1)?.role === 'assistant') set({ messages: msgs.slice(0, -1) });
      await run(id, { regenerate: true });
    },

    async editAndResend(messageId, content) {
      const id = get().currentId;
      const text = content.trim();
      if (!id || !text || get().streaming) return;
      const msgs = get().messages;
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      // 도구를 썼던 질문은 수정 후에도 같은 도구로 다시 실행
      const tool = msgs[idx]!.tool?.name;
      set({
        messages: [
          ...msgs.slice(0, idx),
          { ...msgs[idx]!, id: tempId(), content: text, tool: tool ? toolPlaceholder(get().tools, tool) : null },
        ],
      });
      await run(id, { content: text, editFrom: messageId, tool });
    },

    stop() {
      get().streaming?.controller.abort();
    },

    async rename(id, title) {
      const updated = await api.updateConversation(id, { title });
      set({ conversations: get().conversations.map((c) => (c.id === id ? updated : c)) });
    },

    async remove(id) {
      await api.deleteConversation(id);
      set({ conversations: get().conversations.filter((c) => c.id !== id) });
      if (get().currentId === id) get().newChat();
    },

    async setPersona(persona) {
      storage.set(PERSONA_KEY, persona);
      set({ draftPersona: persona });
      const id = get().currentId;
      if (!id) return;
      const updated = await api.updateConversation(id, { persona });
      set({ conversations: get().conversations.map((c) => (c.id === id ? updated : c)) });
    },

    clearError: () => set({ error: null }),
    reset: () => {
      get().streaming?.controller.abort();
      set({ ...initial, draftPersona: storage.get(PERSONA_KEY) as PersonaId | null });
    },
  };
});

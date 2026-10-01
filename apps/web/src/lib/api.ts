import type {
  Conversation,
  ConversationDetail,
  HealthResponse,
  LoginResponse,
  PersonaId,
  PersonasResponse,
  SendMessageRequest,
  StreamEvent,
  ToolInfo,
  User,
} from '@doona/shared';
import { isTauri } from './platform';
import { storage } from './storage';

const SERVER_KEY = 'doona.server';
const TOKEN_KEY = 'doona.token';

/**
 * API 서버 주소.
 * - PWA/웹: 같은 출처('')
 * - Windows 앱: 사용자가 입력한 주소 (기본값은 빌드 시 VITE_DEFAULT_SERVER)
 */
export function getServerUrl(): string {
  if (!isTauri) return '';
  return (storage.get(SERVER_KEY) ?? import.meta.env.VITE_DEFAULT_SERVER ?? '').replace(/\/$/, '');
}
export function setServerUrl(url: string) {
  storage.set(SERVER_KEY, url.trim().replace(/\/$/, '') || null);
}

export const getToken = () => storage.get(TOKEN_KEY);
export const setToken = (t: string | null) => storage.set(TOKEN_KEY, t);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** 401 발생 시 호출 (auth store가 등록) */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`${getServerUrl()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크를 확인하세요.', 0);
  }
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `요청 실패 (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('Content-Type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  login: (username: string, password: string) =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', body: json({ username, password }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  me: () => request<User>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<LoginResponse>('/api/auth/password', { method: 'POST', body: json({ currentPassword, newPassword }) }),

  personas: () => request<PersonasResponse>('/api/personas'),
  tools: () => request<ToolInfo[]>('/api/tools'),

  conversations: (q?: string) =>
    request<Conversation[]>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createConversation: (persona?: PersonaId) =>
    request<Conversation>('/api/conversations', { method: 'POST', body: json({ persona }) }),
  conversation: (id: string) => request<ConversationDetail>(`/api/conversations/${id}`),
  updateConversation: (id: string, patch: { title?: string; persona?: PersonaId }) =>
    request<Conversation>(`/api/conversations/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteConversation: (id: string) => request<void>(`/api/conversations/${id}`, { method: 'DELETE' }),
  exportConversation: (id: string, format: 'md' | 'json') =>
    request<string | object>(`/api/conversations/${id}/export?format=${format}`),

  users: () => request<User[]>('/api/admin/users'),
  createUser: (username: string, password: string, isAdmin: boolean) =>
    request<User>('/api/admin/users', { method: 'POST', body: json({ username, password, isAdmin }) }),
  resetPassword: (id: number, password: string) =>
    request<void>(`/api/admin/users/${id}/password`, { method: 'POST', body: json({ password }) }),
  deleteUser: (id: number) => request<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),
};

/**
 * 질문을 보내고 SSE 스트림을 이벤트 단위로 읽는다.
 * (EventSource는 POST/헤더를 지원하지 않으므로 fetch 스트림을 직접 파싱)
 */
export async function* streamMessage(
  conversationId: string,
  body: SendMessageRequest,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getServerUrl()}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers,
      body: json(body),
      signal,
    });
  } catch (err) {
    if (signal.aborted) return;
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크를 확인하세요.', 0);
  }
  if (res.status === 401) onUnauthorized();
  if (!res.ok || !res.body) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(b?.error ?? `요청 실패 (${res.status})`, res.status);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (data) yield JSON.parse(data) as StreamEvent;
      }
    }
  } catch (err) {
    if (signal.aborted) return;
    throw new ApiError('응답을 받는 중 연결이 끊어졌습니다.', 0);
  } finally {
    reader.releaseLock();
  }
}

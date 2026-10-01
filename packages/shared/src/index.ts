// API 공용 타입 — server와 web이 함께 사용한다.

export type Role = 'system' | 'user' | 'assistant';

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

/** 대화 상대(두나 캐릭터) — 캐릭터마다 모델과 말투가 다르다 */
export type PersonaId = 'lively' | 'shy' | 'careful';

export interface Persona {
  id: PersonaId;
  name: string;
  emoji: string;
  /** 한 줄 소개 */
  tagline: string;
  /** 어떤 질문에 좋은지 */
  description: string;
  /** 예상 답변 시간 (예: '약 5초') */
  speed: string;
  /** 디자인 토큰 브랜드 색 (--brand-lime | --brand-cyan | --brand-violet) */
  color: 'lime' | 'cyan' | 'violet';
  model: string;
}

export interface PersonasResponse {
  default: PersonaId;
  personas: Persona[];
}

export interface Conversation {
  id: string;
  title: string;
  persona: PersonaId;
  model: string;
  createdAt: string;
  updatedAt: string;
}

/** doona-tools 가 제공하는 도구 (화면용 정보) */
export interface ToolInfo {
  name: string;
  title: string;
  emoji: string;
  placeholder: string;
  description: string;
}

/** 질문에 붙은 도구 실행 기록 */
export interface MessageTool {
  name: string;
  title: string;
  emoji: string;
  /** 도구 결과 (실패하면 오류 문구) */
  result: string;
  isError: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  /** 답변한 캐릭터 (assistant 메시지만) */
  persona: PersonaId | null;
  /** 사용한 도구 (user 메시지만) */
  tool: MessageTool | null;
  /** 생성이 중지/실패해 답변이 완결되지 않은 경우 true */
  incomplete: boolean;
  createdAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  expiresAt: string;
}

export interface SendMessageRequest {
  content?: string;
  /** true면 마지막 assistant 답변을 지우고 다시 생성 (content 무시) */
  regenerate?: boolean;
  /** 지정한 user 메시지와 그 이후 메시지를 지우고 content로 다시 질문 (질문 수정) */
  editFrom?: string;
  /** 이 질문에 쓸 도구 이름 (ToolInfo.name) — content 가 도구 입력이 된다 */
  tool?: string;
}

/** POST /api/conversations/:id/messages 가 SSE로 보내는 이벤트 */
export type StreamEvent =
  | { type: 'start'; userMessage: Message | null; title: string }
  /** 답변 시작 전 대기 사유 (다른 캐릭터와 모델 교체 대기 등) */
  | { type: 'status'; message: string }
  /** 도구 실행이 끝남 — 해당 질문(userMessage)에 결과를 붙인다 */
  | { type: 'tool'; messageId: string; tool: MessageTool }
  | { type: 'delta'; content: string }
  | { type: 'done'; message: Message }
  | { type: 'error'; error: string; message?: Message };

export interface HealthResponse {
  ok: boolean;
  ollama: boolean;
  model: string;
}

export interface ApiError {
  error: string;
}

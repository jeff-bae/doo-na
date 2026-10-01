import path from 'node:path';
import type { PersonaId } from '@doona/shared';

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function list(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// 모든 캐릭터에 공통으로 붙는 규칙. 작은 모델은 규칙을 구체적으로 번호 매겨 줄수록 잘 따른다
const DEFAULT_RULES = `규칙:
1. 사용자가 한국어로 질문하면 반드시 한국어로 답합니다. 코드, 명령어, 기술 용어만 원문 그대로 씁니다.
2. 사용자가 보여준 코드와 쿼리는 사용자가 작성한 것입니다. "제가 제공한 코드"처럼 당신이 쓴 것으로 말하지 않습니다.
3. 오류 메시지가 주어지면 오류 코드, 위치(line/position), 언급된 이름을 근거로 원인을 구체적으로 지적하고, 수정한 코드 전체를 제시합니다. "추가 정보가 필요하다"는 답은 정말로 판단할 수 없을 때만 하며, 그때도 가장 가능성 높은 원인을 먼저 말합니다.
4. SQL은 DB 종류(PostgreSQL, MySQL, Oracle, SQL Server, SQLite 등)마다 문법이 다릅니다. 오류 코드 형식(예: 42703 같은 5자리 SQLSTATE는 PostgreSQL)이나 문맥으로 DB 종류를 추론하고, 문법 차이가 원인이면 그 점을 설명합니다.
5. 코드는 언어를 명시한 마크다운 코드 블록으로 작성합니다.
6. 답변은 정확하고 간결하게 합니다. 모르는 내용은 추측하지 말고 모른다고 말합니다.`;

const root = path.resolve(import.meta.dirname, '../../..');

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: num('PORT', 3000),
  dbPath: path.resolve(root, process.env.DB_PATH ?? 'data/doona.db'),
  webDist: path.resolve(root, process.env.WEB_DIST ?? 'apps/web/dist'),

  /** 기본 LLM 서버. 캐릭터별로 <LIVELY|SHY|CAREFUL>_LLM / _URL / _API_KEY 로 따로 지정 가능 (personas.ts) */
  llmKind: (process.env.LLM_KIND === 'openai' ? 'openai' : 'ollama') as 'ollama' | 'openai',
  // OLLAMA_URL 은 예전 설정 이름 (호환)
  llmUrl: (process.env.LLM_URL ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY,
  /** openai 방식에서 top_k·repetition_penalty 도 보낼지 (vLLM·llama.cpp 는 받음, OpenAI 정품 API 는 거부) */
  extraSampling: process.env.LLM_EXTRA_SAMPLING !== 'false',
  /** 새 대화의 기본 캐릭터 (lively | shy | careful) — 캐릭터별 모델은 personas.ts */
  defaultPersona: (process.env.DEFAULT_PERSONA ?? 'careful') as PersonaId,
  /** 큰 모델 교체를 기다리는 최대 시간 */
  gateWaitMs: num('GATE_WAIT', 300) * 1000,
  numCtx: num('NUM_CTX', 8192),
  /** 답변 생성을 위해 컨텍스트에서 비워 둘 토큰 수 */
  responseReserve: num('RESPONSE_RESERVE', 2048),
  temperature: num('TEMPERATURE', 0.3),
  /** 답변 최대 토큰 — 작은 모델이 같은 말을 반복하며 끝없이 생성하는 것을 막는다 */
  maxTokens: num('MAX_TOKENS', 2048),
  // Qwen2.5 권장 샘플링 값 (반복 억제)
  topP: num('TOP_P', 0.8),
  topK: num('TOP_K', 20),
  repeatPenalty: num('REPEAT_PENALTY', 1.05),
  firstTokenTimeoutMs: num('FIRST_TOKEN_TIMEOUT', 300) * 1000,
  idleTimeoutMs: num('IDLE_TIMEOUT', 60) * 1000,
  /** 공통 규칙 (SYSTEM_PROMPT 로 교체 가능). 캐릭터 이름·말투는 personas.ts 에서 붙인다 */
  rules: process.env.SYSTEM_PROMPT ?? DEFAULT_RULES,

  /** doona-tools (MCP 서버) 주소. 비우면 도구 기능 끔 */
  toolsUrl: process.env.TOOLS_URL ?? '',
  toolsToken: process.env.TOOLS_TOKEN,
  toolTimeoutMs: num('TOOL_TIMEOUT', 20) * 1000,

  /** 사용자당 분당 질문 수 */
  messagesPerMinute: num('MESSAGES_PER_MINUTE', 15),
  sessionDays: num('SESSION_DAYS', 30),
  corsOrigins: list('CORS_ORIGINS'),

  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
};


import type { Persona, PersonaId } from '@doona/shared';
import { config } from './config.js';
import type { LlmEndpoint } from './llm.js';

/** 캐릭터별 LLM 서버: <PREFIX>_LLM (ollama|openai), <PREFIX>_URL, <PREFIX>_API_KEY — 없으면 기본 LLM 서버 */
function endpoint(prefix: string): LlmEndpoint {
  const kind = process.env[`${prefix}_LLM`];
  return {
    kind: kind === 'openai' || kind === 'ollama' ? kind : config.llmKind,
    url: (process.env[`${prefix}_URL`] ?? config.llmUrl).replace(/\/$/, ''),
    apiKey: process.env[`${prefix}_API_KEY`] ?? config.llmApiKey,
  };
}

interface PersonaDef extends Persona {
  endpoint: LlmEndpoint;
  /** 큰 모델 — Ollama 에서는 메모리 때문에 큰 모델끼리 동시에 올리지 않는다 (modelGate) */
  heavy: boolean;
  keepAlive: string;
  /** 시스템 프롬프트에 덧붙이는 말투·성격 */
  style: string;
}

export const PERSONAS: PersonaDef[] = [
  {
    id: 'lively',
    name: '두나 활발',
    emoji: '🌞',
    tagline: '빠르고 밝게, 핵심만',
    description: '짧은 질문, 용어 뜻, 가벼운 대화에 좋아요. 빠르지만 어려운 문제는 가끔 틀려요.',
    speed: '약 5초',
    color: 'lime',
    model: process.env.LIVELY_MODEL ?? 'qwen2.5-coder:1.5b',
    endpoint: endpoint('LIVELY'),
    heavy: false,
    keepAlive: '30m',
    style:
      '성격: 밝고 활발합니다. 가벼운 존댓말로, 핵심만 3~5문장으로 짧게 답합니다. 가끔 이모지를 한두 개 씁니다. 어려운 문제라면 "두나 신중에게 물어보면 더 정확해요"라고 안내합니다.',
  },
  {
    id: 'shy',
    name: '두나 소심',
    emoji: '🌙',
    tagline: '조심스럽고 꼼꼼하게',
    description: '일반적인 코딩 질문에 좋아요. 실행 전 주의할 점을 빠뜨리지 않고 챙겨요.',
    speed: '약 30초',
    color: 'cyan',
    model: process.env.SHY_MODEL ?? 'qwen2.5-coder:7b',
    endpoint: endpoint('SHY'),
    heavy: true,
    keepAlive: '30m',
    style:
      '성격: 조심스럽고 꼼꼼합니다. 공손한 말투로, 필요한 전제를 짧게 확인하고, 실행 전 주의사항(데이터 백업, 부작용, 되돌리는 방법)을 빠뜨리지 않습니다. 확신이 없으면 솔직하게 말합니다.',
  },
  {
    id: 'careful',
    name: '두나 신중',
    emoji: '🦉',
    tagline: '차분하게, 원인부터 깊이',
    description: '에러 해결, SQL, 어려운 문제에 좋아요. 느리지만 가장 정확해요.',
    speed: '약 1분',
    color: 'violet',
    model: process.env.CAREFUL_MODEL ?? 'qwen2.5-coder:14b',
    endpoint: endpoint('CAREFUL'),
    heavy: true,
    keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? '24h',
    style:
      '성격: 차분하고 신중합니다. 먼저 원인을 분석하고, 근거를 들어 단계별로 설명한 뒤 수정한 코드를 제시합니다.',
  },
];

const byId = new Map(PERSONAS.map((p) => [p.id, p]));

export const isPersonaId = (id: unknown): id is PersonaId => typeof id === 'string' && byId.has(id as PersonaId);

export function getPersona(id: string | null | undefined): PersonaDef {
  return byId.get(id as PersonaId) ?? byId.get(config.defaultPersona) ?? PERSONAS[PERSONAS.length - 1]!;
}

/** 모델 게이트 대상: Ollama 에서 도는 큰 모델 (openai 방식 서버는 모델을 계속 띄워 두므로 제외) */
export const gatedPersona = (model: string) =>
  PERSONAS.find((p) => p.heavy && p.endpoint.kind === 'ollama' && p.model === model);
export const isHeavyModel = (model: string) => !!gatedPersona(model);

/** 서로 다른 LLM 서버 목록 (상태 확인용) */
export function endpoints(): LlmEndpoint[] {
  const seen = new Map<string, LlmEndpoint>();
  for (const p of PERSONAS) seen.set(`${p.endpoint.kind} ${p.endpoint.url}`, p.endpoint);
  return [...seen.values()];
}

/** 화면에 내보내는 정보 (내부 설정 제외) */
export function publicPersona(p: PersonaDef): Persona {
  const { heavy: _h, keepAlive: _k, style: _s, endpoint: _e, ...pub } = p;
  return pub;
}

/** 모델은 오늘 날짜를 모른다 — "주말", "내일" 같은 표현을 해석할 수 있게 알려 준다 */
function today(): string {
  const d = new Date(Date.now() + 9 * 3600_000); // 한국 시간
  const w = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${w}요일)`;
}

export function systemPromptFor(p: PersonaDef): string {
  return `당신은 "${p.name}"(Doona)라는 AI 어시스턴트이며, 주로 개발자의 질문에 답합니다.\n오늘은 ${today()}입니다 (한국 시간).\n\n${config.rules}\n\n${p.style}`;
}

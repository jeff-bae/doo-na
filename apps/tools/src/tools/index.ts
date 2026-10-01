import type { DoonaTool } from '../tool.js';
import { search } from './search.js';
import { weather } from './weather.js';

/** 등록된 도구 목록 — 새 도구는 여기에 한 줄 추가 (화면에도 이 순서로 보인다) */
export const TOOLS: DoonaTool[] = [search, weather];

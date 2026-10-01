import { ToolError, cached, fetchWithTimeout, type DoonaTool } from '../tool.js';

// DuckDuckGo lite 버전 (html 버전은 서버에서 호출하면 봇 확인 화면이 나옴)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const MAX_RESULTS = 5;

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** DuckDuckGo 중계 링크(//duckduckgo.com/l/?uddg=...)를 실제 주소로 */
function realUrl(href: string): string {
  const m = /[?&]uddg=([^&]+)/.exec(href);
  return m ? decodeURIComponent(m[1]!) : href.startsWith('//') ? `https:${href}` : href;
}

interface Result {
  title: string;
  url: string;
  snippet: string;
}

const searchDdg = cached(10 * 60_000, async (q: string, signal): Promise<Result[]> => {
  const res = await fetchWithTimeout(
    `https://lite.duckduckgo.com/lite/?${new URLSearchParams({ q, kl: 'kr-kr' })}`,
    { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' }, timeoutMs: 12_000 },
    signal,
  );
  const html = await res.text();
  if (res.status !== 200 || /anomaly|captcha/i.test(html)) {
    throw new ToolError('검색 서비스가 잠시 요청을 막았습니다. 조금 뒤에 다시 시도해 주세요.');
  }
  const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g)];
  return links
    .map((m, i) => ({ url: realUrl(m[1]!), title: decode(m[2]!), snippet: decode(snippets[i]?.[1] ?? '') }))
    // 광고 링크 제외
    .filter((r) => !/duckduckgo\.com\/y\.js|bing\.com\/aclick/.test(r.url))
    .slice(0, MAX_RESULTS);
});

export const search: DoonaTool = {
  name: 'web_search',
  title: '웹 검색',
  emoji: '🔎',
  placeholder: '검색할 내용을 입력하세요 (예: PostgreSQL 42703 에러)',
  description: 'DuckDuckGo로 웹을 검색해 상위 결과(제목, 주소, 요약)를 돌려준다.',
  async run(query, signal) {
    const q = query.trim().slice(0, 300);
    const results = await searchDdg(q, signal);
    if (!results.length) throw new ToolError('검색 결과가 없습니다. 다른 표현으로 검색해 보세요.');
    return [
      `"${q}" 검색 결과 (DuckDuckGo, 상위 ${results.length}개):`,
      ...results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`),
    ].join('\n');
  },
};

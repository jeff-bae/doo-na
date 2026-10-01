# 두나 Doona

소그룹용 AI 질문·답변 채팅 앱. 자체 Ollama 서버에서 성격이 다른 세 대화 상대(🌞활발 1.5B · 🌙소심 7B · 🦉신중 14B)가 답하며 **PWA(웹/모바일)** 와 **Windows 앱(Tauri)** 을 하나의 코드로 제공합니다.

```
apps/web      React + Vite + Tailwind — PWA 겸 Tauri 프론트엔드
  src-tauri/  Windows 앱 (Tauri 2, Rust)
apps/server   Fastify + SQLite — 인증 · 대화 저장 · Ollama 스트리밍 프록시 · MCP 클라이언트
apps/tools    doona-tools — 가벼운 도구 모음 MCP 서버 (날씨, 웹 검색 …)
packages/shared  API 공용 타입
```

```
PWA / Windows 앱 ──HTTPS──► Cloudflare (dona.cam) ══Tunnel══► cloudflared ──► doona 서버(:3000) ──► Ollama(:8001)
                                                                                └─ SQLite (data/doona.db)
```

- 공개 주소: **https://dona.cam** (Cloudflare Tunnel — 서버에 포트를 열 필요 없음)

## 디자인 시스템

`ui_guide_tokens/` 의 디자인 토큰(doosolution)을 따릅니다.

- `apps/web/src/styles/tokens.css` — 원본 복사본. 값은 원본과 함께 바꾸고, 원본과 다른 점은 `[doona]` 주석으로 표시 (폰트를 CDN 대신 npm `pretendard` 로 번들: CSP·오프라인 때문)
- `apps/web/src/index.css` — 토큰 → Tailwind 유틸리티 연결 (`bg-surface-1`, `text-fg-2`, `border-line`, `bg-brand`, `text-state-danger` …). `rounded-sm`(4px)·`shadow-md`·`font-sans` 는 토큰 값이 그대로 적용
- 모서리: 버튼·박스는 `rounded-xs/sm`(≤4px), `rounded-full` 은 배지·아바타만
- 컨트롤 높이: `xs 28 / sm 35 / md 40 / lg 48px`. **입력창·선택 상자 기본은 `sm`**, 버튼 기본은 `md` (`components/ui.tsx`)
- 아이콘: Remixicon (`@remixicon/react`), 크기 `ICON.sm/md/lg` = 16/20/24
- 다크 모드: `<html data-theme="light|dark">` (토큰 기준)

## 빠른 시작 (개발)

```bash
npm install
cp .env.example .env        # ADMIN_PASSWORD 를 꼭 바꾸세요
npm run dev                 # 서버 :3000 + 웹 :5173 (웹이 /api 를 서버로 프록시)
```

브라우저에서 http://localhost:5173 → `.env`의 관리자 계정으로 로그인.

## 배포 (Docker)

```bash
npm run build               # 선택 — 이미지 안에서도 빌드됨
docker compose up -d --build
```

- 서버는 `127.0.0.1:3000` 에만 열립니다. 외부 접속은 Cloudflare Tunnel 을 통해서만 받습니다.
- DB는 `./data/doona.db` (볼륨). 백업은 이 파일만 복사하면 됩니다.
  (실행 중 백업: `sqlite3 data/doona.db ".backup backup.db"`)

### 공개 접속 — Cloudflare Tunnel (https://dona.cam)

서버가 Cloudflare로 **나가는** 연결을 유지하는 방식이라 공유기 포트포워딩·공인 IP가 필요 없고, HTTPS 인증서도 Cloudflare가 자동 관리합니다.

**1. 도메인을 Cloudflare에 연결 (1회)**

1. https://dash.cloudflare.com 가입 → **Add a domain** → `dona.cam` → **Free** 플랜
2. Cloudflare가 알려주는 네임서버 2개를 복사
3. Spaceship → Domain Manager → `dona.cam` → **Nameservers** → Custom → 위 2개 입력 → 저장
4. Cloudflare에서 도메인 상태가 **Active** 가 될 때까지 대기 (보통 수분 ~ 수시간)

**2. 터널 만들기 (1회)**

1. Cloudflare → **Zero Trust** → Networks → **Tunnels** → Create a tunnel → **Cloudflared** → 이름 `doona`
2. 설치 안내 화면의 명령어에서 `--token` 뒤의 긴 문자열(`eyJ...`)만 복사 (설치 명령은 실행하지 않음 — Docker로 실행)
3. **Public Hostname** 추가
   - Subdomain: (비움) · Domain: `dona.cam`
   - Service: **HTTP** · URL: `doona:3000`
4. `.env` 에 추가:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   COMPOSE_PROFILES=tunnel
   ```
5. 실행:
   ```bash
   docker compose up -d
   docker compose logs cloudflared --tail 20   # "Registered tunnel connection" 이 보이면 성공
   ```

**3. Cloudflare 권장 설정**

| 위치 | 설정 |
|---|---|
| SSL/TLS → Edge Certificates | **Always Use HTTPS** 켜기, Minimum TLS 1.2 |
| Speed → Optimization | **Rocket Loader 끄기** (앱 스크립트를 깨뜨림) |
| Security → WAF → Rate limiting rules | 경로 `/api/auth/login`, 10초에 10회 초과 시 차단 (무료 플랜 1개 규칙) |
| Security → Bots | Bot Fight Mode는 **끄기** 권장 (Windows 앱의 API 요청을 막을 수 있음) |
| Caching → Configuration | Browser Cache TTL → **Respect Existing Headers** |
| Analytics → Web Analytics | 자동 삽입(Automatic setup) **끄기** — 앱 CSP가 삽입 스크립트를 차단하므로 콘솔 오류만 생김 |

> `www.dona.cam` 도 쓰려면 Public Hostname을 하나 더 추가하거나, Rules → Redirect Rules 로 `dona.cam` 으로 리다이렉트하세요.

### (선택) Tailscale 전용 접속

Tailscale 사용자는 `tailscale serve --bg 3000` 으로 `https://<머신>.<tailnet>.ts.net` 경로를 추가로 열 수 있습니다. (tailnet 관리 콘솔에서 Serve/HTTPS 활성화 필요)

## 사용자 관리

소그룹용이라 **회원가입 없이 관리자가 계정을 발급**합니다.

- 웹: 설정 → 사용자 관리 (관리자만)
- CLI:
  ```bash
  npm run user -- list
  npm run user -- add 홍길동            # 비밀번호 입력 프롬프트
  npm run user -- add jeff --admin
  npm run user -- passwd 홍길동
  npm run user -- remove 홍길동
  # Docker 안에서
  docker exec -it doona node apps/server/dist/cli/user.js add 홍길동
  ```

## Windows 앱

Windows PC에서 빌드합니다 (Rust + MSVC 필요).

```powershell
# 1회: https://rustup.rs 설치, Visual Studio Build Tools(C++ 워크로드) 설치
npm ci
$env:VITE_DEFAULT_SERVER="https://dona.cam"
npm run tauri -w @doona/web -- build
# 결과: apps/web/src-tauri/target/release/bundle/{nsis,msi}/
```

또는 GitHub Actions `Windows 앱 빌드` 워크플로(`.github/workflows/windows.yml`)를 실행하면 설치 파일이 아티팩트로 올라옵니다. 저장소 Variables에 `DOONA_SERVER_URL=https://dona.cam` 을 설정하세요.

개발 중 실행: `npm run tauri -w @doona/web -- dev`

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 3000 | 서버 포트 |
| `OLLAMA_URL` | http://127.0.0.1:8001 | Ollama 주소 (Docker에서는 `DOCKER_OLLAMA_URL`, 기본 `host.docker.internal:8001`) |
| `LIVELY_MODEL` / `SHY_MODEL` / `CAREFUL_MODEL` | 1.5b / 7b / 14b | 대화 상대별 모델 (`apps/server/src/personas.ts` 에 성격·설명) |
| `DEFAULT_PERSONA` | careful | 새 대화 기본 대화 상대 |
| `GATE_WAIT` | 300 | 큰 모델 교체 대기 한도(초) |
| `NUM_CTX` | 8192 | 컨텍스트 길이. 대화가 길면 오래된 메시지부터 잘라냄 |
| `MAX_TOKENS` | 2048 | 답변 최대 길이 (반복 루프 방지) |
| `REPEAT_PENALTY` / `TOP_P` / `TOP_K` | 1.05 / 0.8 / 20 | 샘플링 (Qwen 권장값) |
| `RESPONSE_RESERVE` | 2048 | 답변용으로 남겨둘 토큰 |
| `TEMPERATURE` | 0.3 | 코드·SQL은 낮을수록 일관됨 |
| `OLLAMA_KEEP_ALIVE` | 24h | 신중(14B) 메모리 상주 시간 (활발·소심은 30m) |
| `SYSTEM_PROMPT` | (공통 규칙) | 모든 대화 상대에 공통으로 붙는 규칙. 이름·말투는 personas.ts |
| `SESSION_DAYS` | 30 | 로그인 유지 기간 |
| `MESSAGES_PER_MINUTE` | 15 | 사용자당 분당 질문 수 |
| `FIRST_TOKEN_TIMEOUT` / `IDLE_TIMEOUT` | 300 / 60 | AI 응답 대기 한도(초) |
| `TOOLS_URL` | (compose가 설정) | doona-tools MCP 주소. 비우면 도구 기능 끔 |
| `TOOLS_TOKEN` / `TOOL_TIMEOUT` | — / 20 | doona↔도구 서버 인증 토큰 / 도구 대기 한도(초) |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | Cloudflare Tunnel 토큰 |
| `COMPOSE_PROFILES` | — | `tunnel` 로 설정하면 cloudflared 함께 실행 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | 사용자가 없을 때 최초 관리자 생성 |
| `CORS_ORIGINS` | — | 웹을 다른 출처에서 띄울 때 (Tauri 출처는 자동 허용) |

## 보안 권장 사항

- **Ollama 포트를 외부에 열지 마세요.** 현재 `0.0.0.0:8001` 로 게시되어 있어 tailnet/LAN 의 누구나 인증 없이 모델을 쓰거나 삭제할 수 있습니다. 권장 구성:
  ```bash
  docker network create doona-net
  docker network connect doona-net ollama-server
  # docker-compose.yml 에 doona-net(external) 추가 후 .env 에 DOCKER_OLLAMA_URL=http://ollama-server:11434
  # 그 다음 ollama 컨테이너의 포트 게시를 제거하거나 127.0.0.1:8001:11434 로 제한
  ```
- 인터넷에 공개되어 있으므로 **초기 비밀번호는 반드시 변경**하고, 추측하기 어려운 비밀번호를 쓰세요.
- `CLOUDFLARE_TUNNEL_TOKEN` 은 비밀번호와 같습니다. 유출되면 Cloudflare에서 터널을 삭제·재발급하세요.
- 비밀번호는 scrypt 해시로 저장, 세션 토큰은 SHA-256 해시로만 DB에 저장됩니다.
- 로그인 제한: IP당 10분에 10회, **아이디당 15분에 10회 실패 시 잠금** (메모리 보관 — 서버 재시작 시 해제). 없는 아이디도 같은 시간이 걸려 아이디 존재 여부가 드러나지 않습니다.
- 질문 제한: 사용자당 분당 15회, 동시 생성 2개.
- 보안 헤더: CSP(`script-src 'self'`), HSTS, X-Frame-Options, nosniff 등. 사용자 IP는 `CF-Connecting-IP` 로 판별합니다.

## 도구 (doona-tools)

`apps/tools` 는 두나가 쓰는 도구를 모은 **MCP 서버**입니다 (Streamable HTTP, `doona-tools:4000/mcp`, 포트 미게시 — doona 컨테이너만 접근).

```
화면에서 🔧 도구 선택 → 두나 서버(MCP 클라이언트) → doona-tools → 결과를 질문에 붙여 → Ollama 가 답변
```

- 도구는 **사용자가 고릅니다.** 모델이 스스로 도구를 부르게 하지 않은 이유: qwen2.5-coder(1.5B/7B/14B)는 테스트에서 도구 호출 형식이 Ollama에 인식되지 않았고, 필요 없는 질문에도 도구를 부르려 했음 (2026-09-30).
- 결과는 질문 메시지에 저장(`messages.tool_json`)되어 화면에서 펼쳐 볼 수 있고, 다시 생성할 때 재사용합니다.

| 도구 | 파일 | 외부 서비스 |
|---|---|---|
| 🔎 웹 검색 `web_search` | `src/tools/search.ts` | DuckDuckGo lite (키 불필요) |
| 🌤 날씨 조회 `weather` | `src/tools/weather.ts` | Open-Meteo (키 불필요). 주요 국내 지역은 좌표 내장 |

### 새 도구 추가하기

1. `apps/tools/src/tools/<이름>.ts` 작성:
   ```ts
   import { ToolError, cached, fetchWithTimeout, type DoonaTool } from '../tool.js';

   export const exchange: DoonaTool = {
     name: 'exchange',                 // 영문 id
     title: '환율 조회',                // 화면 이름
     emoji: '💱',
     placeholder: '통화를 입력하세요 (예: 달러 환율)',
     description: '주요 통화의 원화 환율을 조회한다.',
     async run(query, signal) {
       // query: 사용자가 입력한 문장 그대로. 결과는 모델이 읽기 좋은 짧은 텍스트로
       const res = await fetchWithTimeout('https://...', {}, signal);
       if (!res.ok) throw new ToolError('환율 서비스가 응답하지 않습니다.'); // 사용자에게 보여줄 오류
       return '1 USD = 1,380원 (출처: ...)';
     },
   };
   ```
2. `apps/tools/src/tools/index.ts` 의 `TOOLS` 배열에 추가
3. `docker compose up -d --build doona-tools` — 두나 서버는 1분 안에 새 도구를 인식하고 화면 도구 메뉴에 나타남

팁: 작은 모델은 숫자 해석을 자주 틀립니다. 결과에 해석을 같이 붙이면 정확해집니다 (예: `강수확률 4% (비 올 가능성 낮음)`, 요일에 `[주말]` 표시).

## 메모리 관리 (모델 게이트)

서버 메모리(WSL 20GB)로는 7B와 14B를 동시에 올릴 수 없어 `apps/server/src/modelGate.ts` 가 관리합니다.

- 1.5B(활발)는 항상 통과
- 큰 모델(7B·14B)은 하나만 상주. 다른 큰 모델 요청은 선착순으로 줄을 서고, 현재 모델의 진행 중인 답변이 끝나면 내리고 교체
- 기다리는 동안 SSE `status` 이벤트로 사유를 알림, `GATE_WAIT` 초가 지나면 오류
- 상태: `GET /api/admin/gate` (관리자)

## API

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/auth/login` · `/logout` · `/password` | 인증 |
| GET | `/api/auth/me` | 내 정보 |
| GET | `/api/health` | 서버·Ollama 상태 |
| GET | `/api/personas` | 대화 상대 목록과 기본값 |
| GET | `/api/tools` | 쓸 수 있는 도구 목록 (doona-tools) |
| GET/POST | `/api/conversations` | 목록(`?q=` 검색) / 생성 |
| GET/PATCH/DELETE | `/api/conversations/:id` | 조회 / 이름·모델 변경 / 삭제 |
| POST | `/api/conversations/:id/messages` | 질문 → SSE 스트리밍 (`regenerate`, `editFrom`, `tool` 지원) |
| GET | `/api/conversations/:id/export?format=md\|json` | 내보내기 |
| GET/POST/DELETE | `/api/admin/users[/:id[/password]]` | 사용자 관리 (관리자) |

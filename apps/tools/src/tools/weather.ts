import { ToolError, cached, fetchWithTimeout, type DoonaTool } from '../tool.js';

// 자주 쓰는 지역은 좌표를 직접 둔다 (Open-Meteo 지명 검색은 한글 이름에 약하고, 같은 이름의 다른 지역을 고르기도 함)
const REGIONS: Record<string, [name: string, lat: number, lon: number]> = {
  서울: ['서울특별시', 37.5665, 126.978], 부산: ['부산광역시', 35.1796, 129.0756], 대구: ['대구광역시', 35.8714, 128.6014],
  인천: ['인천광역시', 37.4563, 126.7052], 광주: ['광주광역시', 35.1595, 126.8526], 대전: ['대전광역시', 36.3504, 127.3845],
  울산: ['울산광역시', 35.5384, 129.3114], 세종: ['세종특별자치시', 36.48, 127.289], 수원: ['경기 수원시', 37.2636, 127.0286],
  성남: ['경기 성남시', 37.42, 127.1265], 판교: ['경기 성남시 판교', 37.3947, 127.1112], 분당: ['경기 성남시 분당', 37.3827, 127.1189],
  고양: ['경기 고양시', 37.6584, 126.832], 일산: ['경기 고양시 일산', 37.676, 126.769], 용인: ['경기 용인시', 37.2411, 127.1776],
  부천: ['경기 부천시', 37.5034, 126.766], 안산: ['경기 안산시', 37.3219, 126.8309], 안양: ['경기 안양시', 37.3943, 126.9568],
  남양주: ['경기 남양주시', 37.636, 127.2165], 화성: ['경기 화성시', 37.1995, 126.8313], 평택: ['경기 평택시', 36.9921, 127.1129],
  의정부: ['경기 의정부시', 37.7381, 127.0337], 파주: ['경기 파주시', 37.7599, 126.7802], 김포: ['경기 김포시', 37.6153, 126.7156],
  춘천: ['강원 춘천시', 37.8813, 127.7298], 원주: ['강원 원주시', 37.3422, 127.9202], 강릉: ['강원 강릉시', 37.7519, 128.8761],
  속초: ['강원 속초시', 38.207, 128.5918], 청주: ['충북 청주시', 36.6424, 127.489], 천안: ['충남 천안시', 36.8151, 127.1139],
  전주: ['전북 전주시', 35.8242, 127.148], 군산: ['전북 군산시', 35.9676, 126.7366], 목포: ['전남 목포시', 34.8118, 126.3922],
  여수: ['전남 여수시', 34.7604, 127.6622], 순천: ['전남 순천시', 34.9507, 127.4872], 포항: ['경북 포항시', 36.019, 129.3435],
  경주: ['경북 경주시', 35.8562, 129.2247], 구미: ['경북 구미시', 36.1195, 128.3446], 안동: ['경북 안동시', 36.5684, 128.7294],
  창원: ['경남 창원시', 35.228, 128.6811], 김해: ['경남 김해시', 35.2285, 128.8894], 진주: ['경남 진주시', 35.18, 128.1076],
  통영: ['경남 통영시', 34.8544, 128.4332], 거제: ['경남 거제시', 34.8806, 128.6211], 제주: ['제주특별자치도 제주시', 33.4996, 126.5312],
  서귀포: ['제주특별자치도 서귀포시', 33.2541, 126.5601],
};

// WMO 날씨 코드 → 한국어
const WMO: Record<number, string> = {
  0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '짙은 안개',
  51: '약한 이슬비', 53: '이슬비', 55: '강한 이슬비', 56: '어는 이슬비', 57: '강한 어는 이슬비',
  61: '약한 비', 63: '비', 65: '강한 비', 66: '어는 비', 67: '강한 어는 비',
  71: '약한 눈', 73: '눈', 75: '강한 눈', 77: '싸락눈', 80: '약한 소나기', 81: '소나기', 82: '강한 소나기',
  85: '약한 눈보라', 86: '강한 눈보라', 95: '뇌우', 96: '우박을 동반한 뇌우', 99: '강한 우박 뇌우',
};
const sky = (code: number) => WMO[code] ?? `코드 ${code}`;

interface Place {
  name: string;
  admin?: string;
  country?: string;
  lat: number;
  lon: number;
}

const geocode = cached(24 * 3600_000, async (name: string, signal): Promise<Place | null> => {
  const known = REGIONS[name];
  if (known) return { name: known[0], country: '대한민국', lat: known[1], lon: known[2] };
  const params = new URLSearchParams({ name, count: '1', language: 'ko', format: 'json' });
  const res = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {}, signal);
  if (!res.ok) throw new ToolError(`지역 검색 실패 (${res.status})`);
  const data = (await res.json()) as {
    results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
  };
  const r = data.results?.[0];
  return r ? { name: r.name, admin: r.admin1, country: r.country, lat: r.latitude, lon: r.longitude } : null;
});

/** "부산 내일 날씨 어때?" → "부산" */
function extractPlace(query: string): string {
  const q = query.trim();
  // 알려진 지역 이름이 들어 있으면 가장 긴 것
  const hit = Object.keys(REGIONS)
    .filter((k) => q.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  if (hit) return hit;
  const rest = q
    .replace(/[?!.,~]/g, ' ')
    .replace(/(오늘|내일|모레|글피|이번\s*주|주말|지금|현재|날씨|기온|온도|비|눈|예보|어때요?|알려\s*줘|알려\s*주세요|좀|의|은|는|이|가|에서?)(?=\s|$)/g, ' ')
    .replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구)$/g, '')
    .trim()
    .split(/\s+/)[0];
  return rest || '서울';
}

const forecast = cached(10 * 60_000, async (key: string, signal) => {
  const [lat, lon] = key.split(',');
  const params = new URLSearchParams({
    latitude: lat!,
    longitude: lon!,
    timezone: 'Asia/Seoul',
    forecast_days: '7',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
    daily: 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum',
    wind_speed_unit: 'ms',
  });
  const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {}, signal);
  if (!res.ok) throw new ToolError(`날씨 조회 실패 (${res.status})`);
  return (await res.json()) as {
    current: Record<string, number | string>;
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_min: number[];
      temperature_2m_max: number[];
      precipitation_probability_max: (number | null)[];
      precipitation_sum: number[];
    };
  };
});

/** 작은 모델이 숫자를 잘못 해석하지 않도록 해석을 함께 붙인다 */
function rainChance(p: number): string {
  const label = p < 20 ? '비 올 가능성 낮음' : p < 50 ? '비 올 수도 있음' : p < 70 ? '비 올 가능성 높음' : '비 올 가능성 매우 높음';
  return `강수확률 ${p}% (${label})`;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const LABEL = ['오늘', '내일', '모레'];

export const weather: DoonaTool = {
  name: 'weather',
  title: '날씨 조회',
  emoji: '🌤',
  placeholder: '지역과 궁금한 점을 입력하세요 (예: 부산 내일 비 와?)',
  description: '지역의 현재 날씨와 7일 예보를 조회한다 (Open-Meteo). 지역을 말하지 않으면 서울.',
  async run(query, signal) {
    const name = extractPlace(query);
    const place = await geocode(name, signal);
    if (!place) throw new ToolError(`"${name}" 지역을 찾지 못했습니다. 시·군 이름으로 다시 입력해 보세요.`);

    const w = await forecast(`${place.lat.toFixed(3)},${place.lon.toFixed(3)}`, signal);
    const c = w.current;
    const lines = [
      `📍 ${[place.name, place.admin !== place.name ? place.admin : null, place.country].filter(Boolean).join(', ')}`,
      `현재 (${String(c.time).replace('T', ' ')}): ${sky(Number(c.weather_code))}, ${c.temperature_2m}°C (체감 ${c.apparent_temperature}°C), 습도 ${c.relative_humidity_2m}%, 바람 ${c.wind_speed_10m}m/s${Number(c.precipitation) > 0 ? `, 강수 ${c.precipitation}mm` : ''}`,
      '예보:',
      ...w.daily.time.map((d, i) => {
        const date = new Date(`${d}T00:00:00+09:00`);
        const pop = w.daily.precipitation_probability_max[i];
        const day = date.getDay();
        const tags = [LABEL[i], day === 0 || day === 6 ? '주말' : null].filter(Boolean).join(', ');
        return `- ${date.getMonth() + 1}/${date.getDate()}(${DAYS[day]})${tags ? ` [${tags}]` : ''}: ${sky(w.daily.weather_code[i]!)}, ${w.daily.temperature_2m_min[i]}~${w.daily.temperature_2m_max[i]}°C${pop != null ? `, ${rainChance(pop)}` : ''}${w.daily.precipitation_sum[i]! > 0 ? `, 강수량 ${w.daily.precipitation_sum[i]}mm` : ''}`;
      }),
      '(출처: Open-Meteo)',
    ];
    return lines.join('\n');
  },
};

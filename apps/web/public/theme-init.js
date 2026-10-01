// 첫 렌더 전에 테마 적용 (깜빡임 방지). CSP 때문에 인라인 대신 파일로 둔다.
// 디자인 토큰 기준에 맞춰 <html data-theme="light|dark"> 를 항상 명시한다.
try {
  var t = localStorage.getItem('doona.theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (e) {}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Pretendard 가변 폰트 (필요한 글자 범위만 내려받는 dynamic subset)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import 'highlight.js/styles/github-dark.css';
import './index.css';
import './store/theme';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

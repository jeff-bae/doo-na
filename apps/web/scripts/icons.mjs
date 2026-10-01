// public/favicon.svg → PWA/Tauri 아이콘 PNG 생성
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.resolve(import.meta.dirname, '..');
const svg = fs.readFileSync(path.join(dir, 'public/favicon.svg'));
const out = (p) => path.join(dir, p);

const render = (size) => sharp(svg, { density: 384 }).resize(size, size).png();

await render(192).toFile(out('public/pwa-192.png'));
await render(512).toFile(out('public/pwa-512.png'));
await render(180).toFile(out('public/apple-touch-icon.png'));

// maskable: 안전 영역(80%) 안에 들어가도록 여백 추가
const inner = await render(400).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#5B5FEE' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(out('public/pwa-maskable-512.png'));

// Tauri `tauri icon` 입력용 1024px 원본
fs.mkdirSync(out('src-tauri'), { recursive: true });
await render(1024).toFile(out('src-tauri/app-icon.png'));

console.log('아이콘 생성 완료');

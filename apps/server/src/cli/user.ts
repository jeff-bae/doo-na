// 사용자 관리 CLI
//   npm run user -- list
//   npm run user -- add <아이디> [--admin]
//   npm run user -- passwd <아이디>
//   npm run user -- remove <아이디>
import { createInterface } from 'node:readline/promises';
import { createUser, findUserByName, setPassword, toUser } from '../auth.js';
import { db } from '../db.js';

async function askPassword(): Promise<string> {
  if (process.env.DOONA_PASSWORD) return process.env.DOONA_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question('비밀번호 (8자 이상): ');
  rl.close();
  if (pw.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
  return pw;
}

const [cmd, name, ...flags] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'list': {
      const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as Parameters<typeof toUser>[0][];
      console.table(rows.map(toUser));
      break;
    }
    case 'add': {
      if (!name) throw new Error('아이디를 지정하세요.');
      if (findUserByName(name)) throw new Error('이미 있는 아이디입니다.');
      const u = await createUser(name, await askPassword(), flags.includes('--admin'));
      console.log(`생성됨: ${u.username}${u.isAdmin ? ' (관리자)' : ''}`);
      break;
    }
    case 'passwd': {
      const u = name && findUserByName(name);
      if (!u) throw new Error('사용자를 찾을 수 없습니다.');
      await setPassword(u.id, await askPassword());
      console.log('비밀번호를 변경했습니다. 기존 로그인은 모두 해제됩니다.');
      break;
    }
    case 'remove': {
      const u = name && findUserByName(name);
      if (!u) throw new Error('사용자를 찾을 수 없습니다.');
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      console.log(`삭제됨: ${u.username}`);
      break;
    }
    default:
      console.log('사용법: npm run user -- <list|add|passwd|remove> [아이디] [--admin]');
  }
} catch (err) {
  console.error(`오류: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  db.close();
}

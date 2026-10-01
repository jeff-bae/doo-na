import { config } from './config.js';
import { listRunning, unloadModel } from './llm.js';
import { PERSONAS, gatedPersona, isHeavyModel } from './personas.js';

/** 게이트 대상 모델이 도는 Ollama 주소 */
const urlOf = (model: string) => gatedPersona(model)?.endpoint.url;

/**
 * 큰 모델(7B, 14B)은 메모리(20GB) 때문에 한 번에 하나만 올린다.
 *
 * - 가벼운 모델(1.5B)은 제한 없이 통과
 * - 올라가 있는 큰 모델과 같은 모델 요청은 바로 통과 (동시 생성은 Ollama가 처리)
 * - 다른 큰 모델 요청은 줄을 서고, 지금 모델의 진행 중인 답변이 모두 끝나면
 *   그 모델을 내린 뒤 새 모델로 교체한다
 * - 줄은 선착순: 교체를 기다리는 요청이 있으면, 그 뒤에 온 기존 모델 요청도 뒤에 선다 (교체가 굶지 않게)
 */

interface Waiter {
  model: string;
  resolve: () => void;
}

export class GateTimeoutError extends Error {}

class ModelGate {
  private resident: string | null = null;
  private active = 0;
  private queue: Waiter[] = [];
  private switching = false;

  /** 서버 시작 시: 이미 올라가 있는 큰 모델을 파악하고, 둘 이상이면 하나만 남긴다 */
  async init(preferred: string, log: { info: (m: string) => void; warn: (m: string) => void }) {
    const urls = [...new Set(PERSONAS.filter((p) => isHeavyModel(p.model)).map((p) => p.endpoint.url))];
    if (!config.modelGate) return log.info('모델 게이트: 꺼짐 (MODEL_GATE=off — 큰 모델도 동시에 상주)');
    if (!urls.length) return log.info('모델 게이트: 대상 없음 (큰 모델이 Ollama 가 아닌 서버에서 동작)');
    try {
      const running = (await Promise.all(urls.map((u) => listRunning(u)))).flat();
      const heavy = running.filter(isHeavyModel);
      if (!heavy.length) return;
      const keep = heavy.includes(preferred) ? preferred : heavy[0]!;
      for (const m of heavy) {
        if (m !== keep) {
          log.warn(`큰 모델이 동시에 올라가 있어 내립니다: ${m}`);
          await unloadModel(urlOf(m)!, m);
        }
      }
      this.resident = keep;
      log.info(`메모리에 올라간 큰 모델: ${keep}`);
    } catch (err) {
      log.warn(`모델 상태 확인 실패: ${(err as Error).message}`);
    }
  }

  /**
   * 모델 사용 권한을 얻는다. 돌려받은 함수를 답변이 끝나면 반드시 호출해야 한다.
   * @param onWait 기다려야 할 때 한 번 호출 (화면에 사유 표시용)
   */
  async acquire(model: string, signal: AbortSignal, timeoutMs: number, onWait: () => void): Promise<() => void> {
    if (!isHeavyModel(model)) return () => {};

    const free = !this.queue.length && !this.switching && (this.resident === null || this.resident === model);
    if (!free) {
      onWait();
      await new Promise<void>((resolve, reject) => {
        const w: Waiter = { model, resolve: () => cleanup(resolve) };
        const drop = (err: Error) => {
          this.queue = this.queue.filter((x) => x !== w);
          cleanup(() => reject(err));
          void this.pump();
        };
        const onAbort = () => drop(new DOMException('aborted', 'AbortError'));
        const timer = setTimeout(
          () => drop(new GateTimeoutError('다른 두나가 오래 답변 중이에요. 잠시 후 다시 시도하세요.')),
          timeoutMs,
        );
        const cleanup = (fn: () => void) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          fn();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        this.queue.push(w);
        void this.pump();
      });
    } else {
      this.resident = model;
      this.active++;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      void this.pump();
    };
  }

  private async pump() {
    if (this.switching) return;
    while (this.queue.length) {
      const head = this.queue[0]!;
      if (this.resident === null || head.model === this.resident) {
        this.queue.shift();
        this.resident = head.model;
        this.active++;
        head.resolve();
        continue;
      }
      // 다른 큰 모델 차례 — 지금 모델의 답변이 모두 끝나야 교체
      if (this.active > 0) return;
      this.switching = true;
      const old = this.resident;
      try {
        await unloadModel(urlOf(old)!, old);
      } catch {
        /* 내리기 실패해도 Ollama가 메모리 부족 시 스스로 내린다 */
      }
      this.resident = head.model;
      this.switching = false;
    }
  }

  status() {
    return { resident: this.resident, active: this.active, waiting: this.queue.length, switching: this.switching };
  }
}

export const modelGate = new ModelGate();

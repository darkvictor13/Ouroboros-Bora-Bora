/**
 * O cronômetro global do app.
 *
 * Até a v2 este relógio morava no processo main do Electron: o modal mandava
 * `start`/`pause`/`reset` por IPC e recebia um `timer-tick` por segundo. Com o
 * desktop fora do caminho, a mesma máquina de estado passou a morar aqui.
 *
 * Duas propriedades do original que valia a pena preservar:
 *
 * 1. **O tempo sobrevive ao modal.** O estado é do módulo, não do componente —
 *    fechar e reabrir o cronômetro não zera nada, como não zerava quando ele
 *    ficava no outro processo.
 * 2. **O tempo não depende do tick.** O decorrido é sempre calculado a partir
 *    de `Date.now()`, e não somando intervalos. Isso importa muito mais no
 *    browser do que no Electron: aba em segundo plano tem `setInterval`
 *    estrangulado para uma vez por minuto, e um relógio que contasse ticks
 *    atrasaria sozinho. O intervalo abaixo só decide de quanto em quanto tempo
 *    a tela se redesenha.
 */

type Listener = (elapsedMs: number) => void;

/** Quanto já havia rodado antes da pausa mais recente. */
let elapsedBeforePause = 0;
/** Instante do último `start`, ou `null` quando parado. */
let startedAt: number | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

export function getElapsed(): number {
  return elapsedBeforePause + (startedAt === null ? 0 : Date.now() - startedAt);
}

export function isRunning(): boolean {
  return startedAt !== null;
}

function emit(): void {
  const elapsed = getElapsed();
  for (const listener of listeners) listener(elapsed);
}

function stopTicking(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function start(): void {
  if (startedAt !== null) return;
  startedAt = Date.now();
  // 250 ms para o segundo virar na tela sem meio segundo de atraso visível. A
  // precisão não vem daqui — vem do `Date.now()` de `getElapsed`.
  intervalId = setInterval(emit, 250);
  emit();
}

export function pause(): void {
  if (startedAt === null) return;
  elapsedBeforePause = getElapsed();
  startedAt = null;
  stopTicking();
  emit();
}

export function reset(): void {
  elapsedBeforePause = 0;
  startedAt = null;
  stopTicking();
  emit();
}

/** Inscreve um ouvinte e já o chama com o valor corrente. Devolve o cancelador. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(getElapsed());
  return () => {
    listeners.delete(listener);
  };
}

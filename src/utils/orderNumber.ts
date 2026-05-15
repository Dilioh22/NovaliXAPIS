class SimpleMutex {
  private queue: Promise<void> = Promise.resolve();
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const prev = this.queue;
    this.queue = prev.then(() => next);
    return prev.then(() => release);
  }
}

const mutex = new SimpleMutex();
let counter = 0;
let lastDate = '';

export async function generateOrderNumber(): Promise<string> {
  const release = await mutex.acquire();
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (today !== lastDate) { counter = 0; lastDate = today; }
    counter++;
    return `ORD-${today}-${String(counter).padStart(4, '0')}`;
  } finally {
    release();
  }
}

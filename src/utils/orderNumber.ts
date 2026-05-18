import { prisma } from '../lib/prisma';

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

async function syncCounterFromDb(today: string): Promise<void> {
  const prefix = `ORD-${today}-`;
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  if (last) {
    const seq = parseInt(last.orderNumber.slice(prefix.length), 10);
    counter = isNaN(seq) ? 0 : seq;
  } else {
    counter = 0;
  }
}

export async function generateOrderNumber(): Promise<string> {
  const release = await mutex.acquire();
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (today !== lastDate) {
      await syncCounterFromDb(today);
      lastDate = today;
    }
    counter++;
    return `ORD-${today}-${String(counter).padStart(4, '0')}`;
  } finally {
    release();
  }
}

import { EventEmitter } from 'events';

/**
 * In-process pub/sub used for live order tracking and the kitchen display.
 * Correct for a single server instance. For multiple instances, replace publish/subscribe
 * internals with Postgres LISTEN/NOTIFY (the interface stays identical).
 */
const g = globalThis as unknown as { __bus?: EventEmitter };
const bus = g.__bus ?? new EventEmitter();
bus.setMaxListeners(0);
g.__bus = bus;

export function publish(channel: string, payload: unknown) {
  bus.emit(channel, payload);
}

export function subscribe(channel: string, fn: (payload: unknown) => void) {
  bus.on(channel, fn);
  return () => {
    bus.off(channel, fn);
  };
}

/** Build a Server-Sent Events response that forwards events from the given channels. */
export function sseResponse(req: Request, channels: string[]): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubs = channels.map((c) => subscribe(c, (payload) => send('update', payload)));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubs.forEach((u) => u());
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener('abort', cleanup);
      controller.enqueue(encoder.encode('retry: 3000\n\n'));
      send('ready', { ok: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

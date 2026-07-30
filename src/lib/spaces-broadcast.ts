import type { SpaceMessageRecord } from './spaces';

type Subscriber = (message: SpaceMessageRecord) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribeToBroadcast(spaceName: string, callback: Subscriber): () => void {
  if (!subscribers.has(spaceName)) {
    subscribers.set(spaceName, new Set());
  }
  const set = subscribers.get(spaceName)!;
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0) {
      subscribers.delete(spaceName);
    }
  };
}

export function broadcastToSpace(spaceName: string, message: SpaceMessageRecord): void {
  const set = subscribers.get(spaceName);
  if (!set) return;
  for (const callback of set) {
    try {
      callback(message);
    } catch {
      // ignore subscriber errors
    }
  }
}

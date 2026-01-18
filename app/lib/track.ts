type EventPayload = Record<string, any>;

export function track(event: string, payload: EventPayload) {
  // V1: simple console log
  console.log(`[TRACK] ${event}`, {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

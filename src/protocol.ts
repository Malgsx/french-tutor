export type AvatarState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "correction"
  | "success"
  | "error";
export type Fragment = {
  role: "user" | "assistant";
  text: string;
  start_ms: number;
  end_ms: number;
};
export type LiveEvent = {
  type: string;
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  delegation?: { id: string; target: string };
  reason?: string;
};
export function transcript(event: LiveEvent): Fragment | null {
  if (
    ![
      "session.input_transcript.delta",
      "session.output_transcript.delta",
    ].includes(event.type) ||
    typeof event.delta !== "string" ||
    typeof event.start_ms !== "number" ||
    typeof event.end_ms !== "number"
  )
    return null;
  return {
    role:
      event.type === "session.input_transcript.delta" ? "user" : "assistant",
    text: event.delta,
    start_ms: event.start_ms,
    end_ms: event.end_ms,
  };
}
export function commentary(
  content: string,
  delegation_id: string | null = null,
) {
  return {
    type: "session.commentary.append",
    event_id: crypto.randomUUID(),
    delegation_id,
    content,
  };
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result as T;
}

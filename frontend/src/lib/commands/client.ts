"use client";

export async function callCommand<T = { ok: true }>(
  command: string,
  input: Record<string, unknown>,
) {
  const response = await fetch(`/api/commands/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: string;
  } | null;
  if (!response.ok || !body?.data) {
    throw new Error(body?.error ?? "The action could not be completed.");
  }
  return body.data;
}

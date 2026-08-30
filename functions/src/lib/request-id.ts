import { randomUUID } from "node:crypto";

const validRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(candidate: string | undefined): string {
  return candidate && validRequestId.test(candidate) ? candidate : randomUUID();
}

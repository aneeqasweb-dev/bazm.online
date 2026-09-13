"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;

// Server-rendered auth forms must not submit before React attaches handlers.
export function useAuthReady() {
  return useSyncExternalStore(subscribe, clientReady, serverReady);
}

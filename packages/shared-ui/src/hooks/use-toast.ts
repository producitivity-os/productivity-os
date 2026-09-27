import * as React from "react";

import type { ToastActionElement, ToastProps } from "../components/ui/toast";

type ToastMessage = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type ToastInput = Omit<ToastMessage, "id">;

const listeners = new Set<() => void>();
let messages: ToastMessage[] = [];

function emit() {
  listeners.forEach((listener) => listener());
}

function dismiss(id?: string) {
  messages = id ? messages.filter((message) => message.id !== id) : [];
  emit();
}

function toast(input: ToastInput) {
  const id = crypto.randomUUID();
  messages = [{ ...input, id }, ...messages].slice(0, 4);
  emit();
  return { id, dismiss: () => dismiss(id) };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return messages;
}

function useToast() {
  const toasts = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { toast, dismiss, toasts };
}

export { toast, useToast };
export type { ToastInput, ToastMessage };

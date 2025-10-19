// Custom toast system - replaces Sonner to avoid portal stacking issues
// This provides the same API as Sonner but renders directly in the titlebar

import type { ToastType } from '../toast/ToastContext';

// Global toast function reference - set by ToastProvider
let globalToastFn: ((message: string, type: ToastType) => void) | null = null;

export function setGlobalToast(fn: (message: string, type: ToastType) => void) {
  globalToastFn = fn;
}

// Main toast function with Sonner-compatible API
export function toast(message: string) {
  if (globalToastFn) {
    globalToastFn(message, 'default');
  }
}

toast.success = (message: string) => {
  if (globalToastFn) {
    globalToastFn(message, 'success');
  }
};

toast.error = (message: string) => {
  if (globalToastFn) {
    globalToastFn(message, 'error');
  }
};

toast.warning = (message: string) => {
  if (globalToastFn) {
    globalToastFn(message, 'warning');
  }
};

// For backward compatibility - export Toaster (not used, but keeps imports happy)
export const Toaster = () => null;

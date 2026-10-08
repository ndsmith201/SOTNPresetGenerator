import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Toast({ message }: { message: string }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    let modalStack: HTMLDialogElement[] = [];
    const updateDialog = (records: MutationRecord[] = []) => {
      // Native modal backdrops blur the page; keep notifications in the active modal's top layer.
      const modals = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog:modal"));
      const openModals = new Set(modals);
      modalStack = modalStack.filter(modal => openModals.has(modal));
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "open"
          && record.target instanceof HTMLDialogElement && openModals.has(record.target)) {
          // The top layer follows opening order, which can differ from DOM order.
          modalStack = modalStack.filter(modal => modal !== record.target);
          modalStack.push(record.target);
        }
      }
      for (const modal of modals) {
        if (!modalStack.includes(modal)) modalStack.push(modal);
      }
      const focusedDialog = document.activeElement?.closest<HTMLDialogElement>("dialog:modal");
      setDialog(focusedDialog && openModals.has(focusedDialog)
        ? focusedDialog : modalStack[modalStack.length - 1] ?? null);
    };
    const observer = new MutationObserver(updateDialog);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    const onFocusIn = () => updateDialog();
    document.addEventListener("focusin", onFocusIn, true);
    updateDialog();
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, []);

  const toast = <div className={`toast${message ? " is-visible" : ""}`} role="status" aria-live="polite">{message}</div>;
  return dialog ? createPortal(toast, dialog) : toast;
}

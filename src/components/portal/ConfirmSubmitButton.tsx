"use client";

import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = {
  confirmMessage: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  /** Shown while the surrounding form is submitting. */
  pendingLabel?: string;
};

export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
  disabled,
  pendingLabel = "Working…",
}: ConfirmSubmitButtonProps) {
  // Batch actions here fax and email patient documentation and can run for well over a
  // minute with nothing else on screen changing. Without this the button stays clickable
  // and a second click sends every document again.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (pending || !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

"use client";

type ConfirmSubmitButtonProps = {
  confirmMessage: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
  disabled,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}

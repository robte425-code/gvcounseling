"use client";

type ConfirmSubmitButtonProps = {
  confirmMessage: string;
  children: React.ReactNode;
  className?: string;
};

export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
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

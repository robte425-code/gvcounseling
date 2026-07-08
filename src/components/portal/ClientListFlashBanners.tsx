type FlashMessage = {
  key: string;
  message: string;
};

type Props = {
  messages: FlashMessage[];
};

export function ClientListFlashBanners({ messages }: Props) {
  if (!messages.length) return null;

  return (
    <div className="space-y-2">
      {messages.map((item) => (
        <p
          key={item.key}
          className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark"
          role="status"
        >
          {item.message}
        </p>
      ))}
    </div>
  );
}

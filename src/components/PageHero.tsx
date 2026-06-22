type PageHeroProps = {
  title: string;
  subtitle?: string;
  compact?: boolean;
};

export function PageHero({ title, subtitle, compact }: PageHeroProps) {
  return (
    <section
      className={`relative overflow-hidden bg-gradient-to-br from-primary-dark via-primary to-primary-light text-white ${
        compact ? "py-14 sm:py-16" : "py-20 sm:py-28"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/90 sm:text-lg">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}

import Image from "next/image";

type PageHeroProps = {
  title: string;
  subtitle?: string;
  compact?: boolean;
  /** Override default interior hero image */
  imageSrc?: string;
  imageAlt?: string;
};

export function PageHero({
  title,
  subtitle,
  compact,
  imageSrc = "/images/texture-soft-light.jpg",
  imageAlt = "",
}: PageHeroProps) {
  return (
    <section
      className={`relative isolate overflow-hidden text-white ${
        compact ? "min-h-[38vh]" : "min-h-[46vh]"
      }`}
    >
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        priority
        sizes="100vw"
        className="site-hero-media object-cover object-center"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-primary-dark/92 via-primary-dark/78 to-primary/55"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(124,179,66,0.22),transparent_55%)]"
        aria-hidden="true"
      />

      <div
        className={`relative mx-auto flex max-w-6xl flex-col justify-end px-4 sm:px-6 lg:px-8 ${
          compact ? "py-14 sm:py-16" : "py-16 sm:py-20"
        }`}
      >
        <div className="site-hero-copy max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Grandview Counseling
          </p>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/88 sm:text-lg">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

import { PageHero } from "@/components/PageHero";

type LegalSection = {
  heading?: string;
  paragraphs: string[];
  list?: string[];
};

type LegalPageContentProps = {
  title: string;
  intro?: string;
  sections: LegalSection[];
};

export function LegalPageContent({ title, intro, sections }: LegalPageContentProps) {
  return (
    <>
      <PageHero title={title} compact />
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {intro ? <p className="text-base leading-relaxed text-muted">{intro}</p> : null}
        <div className={`space-y-8 ${intro ? "mt-8" : ""}`}>
          {sections.map((section, i) => (
            <section key={i}>
              {section.heading ? (
                <h2 className="font-serif text-xl font-semibold text-primary-dark">
                  {section.heading}
                </h2>
              ) : null}
              <div className="mt-3 space-y-3 text-base leading-relaxed text-muted">
                {section.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
              {section.list ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>
    </>
  );
}

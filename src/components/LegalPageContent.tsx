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
    <article className="prose prose-neutral mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-serif text-3xl font-semibold text-primary-dark">{title}</h1>
      {intro && <p className="mt-4 text-base leading-relaxed text-muted">{intro}</p>}
      <div className="mt-8 space-y-8">
        {sections.map((section, i) => (
          <section key={i}>
            {section.heading && (
              <h2 className="font-serif text-xl font-semibold text-primary-dark">{section.heading}</h2>
            )}
            <div className="mt-3 space-y-3 text-base leading-relaxed text-muted">
              {section.paragraphs.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
            {section.list && (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

import Link from "next/link";

export const metadata = {
  title: "Accessibility",
};

export default function AccessibilityPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-serif text-3xl font-semibold text-primary-dark">Accessibility</h1>
      <div className="mt-8 space-y-4 text-base leading-relaxed text-muted">
        <p>
          Grandview Counseling is committed to making our website accessible for all, including those
          with disabilities. Please be aware that our efforts are ongoing and include improvements to
          meet WCAG guidelines over time.
        </p>
        <p>
          This site is built with semantic HTML, keyboard navigation support, sufficient color contrast,
          and responsive layouts to support a wide range of devices and assistive technologies.
        </p>
        <p>
          If you would like to request accessibility-related assistance, report any accessibility
          issues, or request information in alternative format(s), please contact us using{" "}
          <Link href="/contact-us" className="font-medium text-primary hover:underline">
            Grandview Counseling&apos;s Contact Us page
          </Link>
          .
        </p>
      </div>
    </article>
  );
}

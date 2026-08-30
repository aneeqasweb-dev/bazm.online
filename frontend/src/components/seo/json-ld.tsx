export function JsonLd({ data, id }: { data: unknown; id: string }) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
      id={id}
      type="application/ld+json"
    />
  );
}

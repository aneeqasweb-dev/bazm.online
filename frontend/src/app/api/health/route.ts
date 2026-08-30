export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      service: "bazm-web",
      status: "ok",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

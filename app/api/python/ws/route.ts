export async function GET() {
  return Response.json(
    {
      status: 'degraded',
      data_source: 'error',
      error: 'ws_proxy_not_supported',
      detail: 'Connect frontend directly to NEXT_PUBLIC_API_WS_URL (/ws on Python API).',
    },
    { status: 501 },
  );
}

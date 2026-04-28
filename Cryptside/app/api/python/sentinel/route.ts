export async function GET() {
  try {
    const response = await fetch('http://127.0.0.1:3010/sentinel', {
      cache: 'no-store',
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'sentinel_unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

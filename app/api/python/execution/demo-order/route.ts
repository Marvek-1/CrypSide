import { proxyPython } from '../../_proxy';

export async function POST(req: Request) {
  const body = await req.json();
  return proxyPython('/api/v1/execution/demo-order', 'POST', undefined, body);
}

import { proxyPython } from '../_proxy';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return proxyPython('/signals', 'GET', searchParams);
}

import { proxyPython } from '../_proxy';

export async function GET() {
  return proxyPython('/status', 'GET');
}

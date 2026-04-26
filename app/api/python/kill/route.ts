import { proxyPython } from '../_proxy';

export async function POST() {
  return proxyPython('/kill', 'POST');
}

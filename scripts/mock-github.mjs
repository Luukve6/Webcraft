// Nagebootste GitHub API voor Node (tests en `npm run dev`).
// De eigenlijke code staat in admin/js/lib/mock-github.js, zodat de
// demoversie in de browser precies dezelfde nabootsing gebruikt.

import { createMockGitHub as createPortable } from '../admin/js/lib/mock-github.js';

export function createMockGitHub(opts = {}) {
  const mock = createPortable(opts);
  // In Node geven we Buffers terug, zodat .toString('utf8') werkt.
  const files = () => new Map([...mock.files()].map(([p, b]) => [p, Buffer.from(b)]));
  return { ...mock, files };
}

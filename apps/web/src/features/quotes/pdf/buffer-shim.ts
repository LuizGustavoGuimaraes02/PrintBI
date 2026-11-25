import { Buffer } from 'buffer';

/**
 * The PDF library's font code expects Node's global Buffer. It is provided here, only in the
 * PDF chunk, which loads when a quote's PDF is first made.
 */
const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
scope.Buffer ??= Buffer;

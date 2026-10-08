/** Enforce the actual byte limit even when Content-Length is missing or incorrect. */
export async function readBoundedJson<T>(request: Request, maxBytes: number): Promise<T | null> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return null;
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as T : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function apiGet(path: string) {
  const res = await fetch(path, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Erro na requisição");
  return data;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v);
    if (!s.length) return;
    u.set(k, s);
  });
  return u.toString();
}

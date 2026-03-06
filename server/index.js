import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const app = express();
const PORT = Number(process.env.API_PORT || 3001);

app.use(cors());
app.use(express.json());

const ALLOWLIST = new Set([
  "get_lojas",
  "get_servicos",
  "get_cliente",
  "set_cliente",
  "get_agenda_horario_disponivel",
  "set_agendamento"
]);

app.get("/api/mapsis/:method", async (req, res) => {
  const { method } = req.params;

  if (!ALLOWLIST.has(method)) {
    return res.status(400).json({ error: "Método não permitido" });
  }

  const base =
    process.env.MAPSIS_URL || process.env.VITE_MAPSIS_URL;

  const usuario =
    process.env.MAPSIS_USER || process.env.VITE_MAPSIS_USER;

  const senha =
    process.env.MAPSIS_PASS || process.env.VITE_MAPSIS_PASS;

  const chave =
    process.env.MAPSIS_KEY || process.env.VITE_MAPSIS_KEY;

  if (!base || !usuario || !senha || !chave) {
    return res.status(500).json({
      error: "Servidor sem credenciais do MapSis (.env/.env.local)"
    });
  }

  try {
    const outUrl = new URL(`${base}/${method}.asp`);
    outUrl.searchParams.set("usuario", usuario);
    outUrl.searchParams.set("senha", senha);
    outUrl.searchParams.set("chave", chave);
    outUrl.searchParams.set("encode", "true");

    Object.entries(req.query).forEach(([k, v]) => {
      if (v !== undefined) outUrl.searchParams.set(k, String(v));
    });

    const r = await fetch(outUrl.toString());
    const text = await r.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      return res.status(502).json({
        error: "Falha ao chamar MapSis",
        status: r.status,
        details: data
      });
    }

    return res.json(data);
  } catch (err) {
    console.error("[MapSis proxy error]", err);
    return res.status(500).json({
      error: "Erro interno no proxy",
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

app.listen(PORT, () => {
  console.log(`✓ API proxy rodando em http://localhost:${PORT}`);
});
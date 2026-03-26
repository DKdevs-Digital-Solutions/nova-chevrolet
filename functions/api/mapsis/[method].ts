// functions/api/mapsis/[method].ts
interface Env {
  MAPSIS_URL: string
  MAPSIS_USER: string
  MAPSIS_PASS: string
  MAPSIS_KEY: string
}

const ALLOWLIST = new Set([
  "get_lojas",
  "get_servicos",
  "get_cliente",
  "set_cliente",
  "get_consultores",
  "get_agenda_horario_disponivel",
  "set_agendamento",
])

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, request, env } = context
  const method = String(params.method || "")

  if (!ALLOWLIST.has(method)) {
    return Response.json({ error: "Método não permitido" }, { status: 400 })
  }

  if (!env.MAPSIS_URL || !env.MAPSIS_USER || !env.MAPSIS_PASS || !env.MAPSIS_KEY) {
    return Response.json(
      { error: "Servidor sem credenciais do MapSis" },
      { status: 500 }
    )
  }

  try {
    const incomingUrl = new URL(request.url)
    const outUrl = new URL(`${env.MAPSIS_URL.replace(/\/$/, "")}/${method}.asp`)

    outUrl.searchParams.set("usuario", env.MAPSIS_USER)
    outUrl.searchParams.set("senha", env.MAPSIS_PASS)
    outUrl.searchParams.set("chave", env.MAPSIS_KEY)
    outUrl.searchParams.set("encode", "true")

    incomingUrl.searchParams.forEach((value, key) => {
      outUrl.searchParams.set(key, value)
    })

    const response = await fetch(outUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    })

    const text = await response.text()

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (!response.ok) {
      return Response.json(
        {
          error: "Falha ao chamar MapSis",
          status: response.status,
          details: data,
        },
        { status: 502 }
      )
    }

    return Response.json(data)
  } catch (error) {
    return Response.json(
      {
        error: "Erro interno no proxy",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

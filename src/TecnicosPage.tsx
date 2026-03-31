import { useEffect, useMemo, useState } from "react";
import { apiGet, qs } from "@/lib/api";

/* ── Lojas fixas ── */
const LOJAS = [
  { cod_loja: "1", nome: "Tatuapé" },
  { cod_loja: "4", nome: "João Dias" },
];

/* ── Tipos ── */
interface Tecnico {
  id_box_mapsis: number;
  box: string;
  nome_produtivo: string;
  cod_produtivo: string;
}

interface Agendamento {
  id_veiculo_mapsis: number;
  placa: string;
  chassi: string;
  modelo_carro: string;
  box: number;
  data: string;
  horario: string;
  horario_fim: string;
  servico: string;
  oficina: string;
  consultor: string | null;
  status: string;
  status_descritivo: string;
  id_mapsis_agendamento: number;
  codigo_externo: string | null;
  nome: string;
  cpf_cnpj: string;
  telefone: string;
}

/* ── Helpers ── */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── ID lojas MapSis (mapeamento cod_loja → id_loja_mapsis) ── */
async function fetchIdLojaMapsis(): Promise<Record<string, string>> {
  try {
    const data = await apiGet("/api/mapsis/get_lojas");
    const all: any[] = data?.lojas ?? data?.Lojas ?? data?.loja ?? [];
    const map: Record<string, string> = {};
    for (const l of all) {
      const cod = String(l.cod_loja ?? "");
      const id = String(l.id_loja_mapsis ?? "");
      if (cod && id) map[cod] = id;
    }
    return map;
  } catch {
    return {};
  }
}

/* ══════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════ */
export default function TecnicosPage() {
  const [codLoja, setCodLoja] = useState(LOJAS[0].cod_loja);
  const [idLojaMap, setIdLojaMap] = useState<Record<string, string>>({});
  const [dataInicio, setDataInicio] = useState(todayStr());
  const [dataFim, setDataFim] = useState(todayStr());

  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loadingTec, setLoadingTec] = useState(false);
  const [loadingAg, setLoadingAg] = useState(false);
  const [erroTec, setErroTec] = useState("");
  const [erroAg, setErroAg] = useState("");

  const idLoja = idLojaMap[codLoja] ?? "";

  /* Carrega mapeamento de lojas uma vez */
  useEffect(() => {
    fetchIdLojaMapsis().then(setIdLojaMap);
  }, []);

  /* Carrega técnicos quando seleciona loja */
  useEffect(() => {
    if (!codLoja) return;
    setLoadingTec(true);
    setErroTec("");
    apiGet(`/api/mapsis/get_boxes?${qs({ cod_loja: codLoja })}`)
      .then((data) => {
        const list: Tecnico[] = data?.consultores ?? data?.boxes ?? [];
        setTecnicos(Array.isArray(list) ? list : []);
      })
      .catch((e) => setErroTec(e?.message || "Erro ao carregar técnicos"))
      .finally(() => setLoadingTec(false));
  }, [codLoja]);

  /* Carrega agendamentos quando seleciona loja ou período */
  useEffect(() => {
    if (!codLoja || !dataInicio || !dataFim) return;
    setLoadingAg(true);
    setErroAg("");
    const params: Record<string, string> = {
      data_inicio: dataInicio,
      data_fim: dataFim,
      cod_loja: codLoja,
      status_agenda: "P,C,O,S",
    };
    if (idLoja) params.id_loja_mapsis = idLoja;

    apiGet(`/api/mapsis/get_lista_agendamentos?${qs(params)}`)
      .then((data) => {
        const list: Agendamento[] = data?.agendamentos ?? [];
        setAgendamentos(Array.isArray(list) ? list : []);
      })
      .catch((e) => setErroAg(e?.message || "Erro ao carregar agendamentos"))
      .finally(() => setLoadingAg(false));
  }, [codLoja, idLoja, dataInicio, dataFim]);

  /* Agrupa agendamentos por box (internamente) para cruzar com técnicos */
  const agendamentosPorBox = useMemo(() => {
    const map = new Map<number, Agendamento[]>();
    for (const ag of agendamentos) {
      const boxId = ag.box;
      if (!map.has(boxId)) map.set(boxId, []);
      map.get(boxId)!.push(ag);
    }
    // Ordena cada lista por data + horário
    map.forEach((list) => {
      list.sort((a, b) => {
        const da = a.data.split("/").reverse().join("") + a.horario.replace(":", "");
        const db = b.data.split("/").reverse().join("") + b.horario.replace(":", "");
        return da.localeCompare(db);
      });
    });
    return map;
  }, [agendamentos]);

  /* Dados finais: técnicos com seus agendamentos */
  const tecnicosComAgenda = useMemo(() => {
    return tecnicos.map((t) => {
      const ags = agendamentosPorBox.get(Number(t.box)) ?? [];
      return { ...t, agendamentos: ags };
    });
  }, [tecnicos, agendamentosPorBox]);

  const loading = loadingTec || loadingAg;

  /* Handler de atalhos de período */
  function setPeriodo(tipo: "hoje" | "amanha" | "semana") {
    const hoje = todayStr();
    if (tipo === "hoje") { setDataInicio(hoje); setDataFim(hoje); }
    else if (tipo === "amanha") { const am = addDays(hoje, 1); setDataInicio(am); setDataFim(am); }
    else if (tipo === "semana") { setDataInicio(hoje); setDataFim(addDays(hoje, 6)); }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Técnicos & Disponibilidade</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Nova Chevrolet — Pós-Vendas</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Filtros */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 space-y-4">
          {/* Loja */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Oficina</label>
            <div className="flex gap-2">
              {LOJAS.map((l) => (
                <button
                  key={l.cod_loja}
                  onClick={() => setCodLoja(l.cod_loja)}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border ${
                    codLoja === l.cod_loja
                      ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                      : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:border-amber-300"
                  }`}
                >
                  {l.nome}
                </button>
              ))}
            </div>
          </div>

          {/* Período */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Período</label>
            <div className="flex gap-2 mb-2">
              {[
                { label: "Hoje", key: "hoje" as const },
                { label: "Amanhã", key: "amanha" as const },
                { label: "Próx. 7 dias", key: "semana" as const },
              ].map((b) => (
                <button
                  key={b.key}
                  onClick={() => setPeriodo(b.key)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:border-amber-400 hover:text-amber-600 transition-colors"
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
              />
              <span className="text-gray-400 text-sm">até</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Máximo 7 dias por consulta (limitação MapSis)</p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            <span className="ml-3 text-sm text-gray-500">Carregando...</span>
          </div>
        )}

        {/* Erros */}
        {erroTec && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {erroTec}
          </div>
        )}
        {erroAg && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-sm text-orange-700 dark:text-orange-300">
            {erroAg}
          </div>
        )}

        {/* Lista de técnicos */}
        {!loading && tecnicos.length > 0 && (
          <div className="space-y-3">
            {tecnicosComAgenda.map((tec) => {
              const temAgenda = tec.agendamentos.length > 0;

              return (
                <div
                  key={tec.id_box_mapsis}
                  className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden"
                >
                  {/* Cabeçalho do técnico */}
                  <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-zinc-800">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white bg-zinc-600">
                      {tec.nome_produtivo?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {tec.nome_produtivo || "Sem nome"}
                      </p>
                      <p className="text-xs text-gray-400">
                        Cód: {tec.cod_produtivo || "—"}
                      </p>
                    </div>
                  </div>

                  {/* Agendamentos desse técnico */}
                  {temAgenda && (
                    <div className="divide-y divide-gray-50 dark:divide-zinc-800/50">
                      {tec.agendamentos.map((ag) => {
                        return (
                          <div
                            key={ag.id_mapsis_agendamento}
                            className="px-4 py-2.5 flex items-center gap-3 text-xs"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-gray-800 dark:text-gray-200">
                                {ag.horario} – {ag.horario_fim}
                              </span>
                              <p className="text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {ag.servico} • {ag.modelo_carro || "—"} {ag.placa ? `(${ag.placa})` : ""}
                              </p>
                              <p className="text-gray-400 truncate">
                                {ag.nome} • {ag.data}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Sem agendamentos */}
                  {!temAgenda && (
                    <div className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 italic">
                      Nenhum agendamento no período selecionado
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Nenhum técnico */}
        {!loading && !erroTec && tecnicos.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p>Nenhum técnico encontrado para esta oficina</p>
          </div>
        )}
      </main>
    </div>
  );
}

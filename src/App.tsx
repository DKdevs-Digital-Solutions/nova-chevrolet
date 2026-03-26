import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ZodError } from "zod";
import { Icons, InfoBox, Input, Select, Button, Card, CardHeader, CardBody, Divider } from "@/components/ui";
import { Stepper, StepId } from "@/components/stepper";
import { useToast } from "@/components/toast";
import { apiGet, qs } from "@/lib/api";
import { atendimentoSchema, cadastroSchema, cpfCnpjSchema, horarioSchema, onlyDigits } from "@/lib/validators";

/* ── Nomes das lojas fixas para fallback de exibição ── */
const NOMES_LOJAS: Record<string, string> = {
  "TATUAPÉ": "TATUAPÉ",
  "JOÃO DIAS": "JOÃO DIAS",
};

/* ── Helpers ── */
function formatDoc(v: string) {
  const d = onlyDigits(v);
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
function getErroApi(p: any): string | null {
  const e = p?.retorno?.erro ?? p?.erro ?? p?.error;
  return typeof e === "string" && e.trim() ? e : null;
}

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome Completo", celular: "Celular", telefone: "Telefone", email: "E-mail",
  cpf_cnpj: "CPF / CNPJ", cod_loja: "Local da Compra", marca_veiculo: "Fabricação",
  modelo_veiculo: "Modelo do Veículo", placa: "Placa", ano: "Ano", km: "Quilometragem",
  chassi: "Chassi", data_compra: "Data de Compra",
  id_loja_mapsis: "Oficina", id_servico_mapsis: "Serviço",
  data: "Data", hora: "Horário",
};

function parseZodError(err: ZodError) {
  const issues = err.issues;
  if (issues.length === 1) {
    const pathKey = issues[0].path.at(-1);
    const label   = pathKey !== undefined ? (FIELD_LABELS[String(pathKey)] ?? String(pathKey)) : null;
    return {
      title:   label ? `Campo obrigatório: ${label}` : "Campo obrigatório",
      message: issues[0].message,
    };
  }
  const fields = [...new Set(
    issues
      .map(i => i.path.at(-1))
      .filter((k): k is string | number => k !== undefined)
      .map(k => FIELD_LABELS[String(k)] ?? String(k))
  )];
  return {
    title:   "Preencha os campos obrigatórios",
    message: fields.length > 0 ? fields.join(", ") : issues.map(i => i.message).join(". "),
  };
}

/* ── PWA install hook ── */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => { });
    const h = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", h);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const install = async () => {
    if (!prompt) return; prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") { setPrompt(null); setInstalled(true); }
  };
  const dismiss = () => setDismissed(true);
  return { canInstall: !!prompt && !installed && !dismissed, install, dismiss };
}

/* ══════════════════════════════════════
   PAGE
══════════════════════════════════════ */
export default function Page() {
  const toast = useToast();
  const { canInstall, install, dismiss } = useInstallPrompt();

  const [step, setStep] = useState<StepId>("doc");
  const [clientePayload, setCliente] = useState<any>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [idLoja, setIdLoja] = useState("");
  const [idServico, setIdServico] = useState("");
  const [dataAgenda, setDataAgenda] = useState("");
  const [horaAgenda, setHoraAgenda] = useState("");
  const [idVeiculo, setIdVeiculo] = useState("");
  const [idConsultor, setIdConsultor] = useState(""); // "" = sem preferência
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<"idle" | "consultando" | "encontrado" | "carregando">("idle");
  const cardRef = useRef<HTMLDivElement>(null);

  /* Veículos do cliente — API retorna "veiculos" (plural) */
  const veiculos = useMemo(() => {
    const arr = clientePayload?.veiculos ?? clientePayload?.veiculo ?? clientePayload?.Veiculo ?? [];
    return Array.isArray(arr) ? arr : [];
  }, [clientePayload]);

  /* Previsão de serviço do veículo selecionado */
  const previsaoServico = useMemo(() => {
    const vSel = veiculos.find((v: any) => (v.id_veiculo_mapsis ?? "") === idVeiculo) ?? veiculos[0];
    return vSel?.previsao_servico ?? vSel?.proximo_servico ?? null;
  }, [veiculos, idVeiculo]);

  /* Filtro de placa na tabela */
  const [placaFiltro, setPlacaFiltro] = useState("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState<5 | 10>(5);

  const veiculosFiltrados = useMemo(() => {
    if (!placaFiltro) return veiculos;
    return veiculos.filter((v: any) => (v.placa ?? "").toLowerCase().includes(placaFiltro.toLowerCase()));
  }, [veiculos, placaFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(veiculosFiltrados.length / itensPorPagina));

  const veiculosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return veiculosFiltrados.slice(inicio, inicio + itensPorPagina);
  }, [veiculosFiltrados, paginaAtual, itensPorPagina]);

  // Garante que idVeiculo é sempre string e inicializa com o primeiro veículo ao carregar
  useEffect(() => {
    if (veiculos.length > 0 && !idVeiculo) {
      setIdVeiculo(String(veiculos[0].id_veiculo_mapsis ?? "0"));
    }
  }, [veiculos]);

  useEffect(() => {
    setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [step]);

  /* Queries */
  const lojasQ = useQuery({ queryKey: ["lojas"], queryFn: () => apiGet("/api/mapsis/get_lojas"), staleTime: 600000 });
  const servicosQ = useQuery({ queryKey: ["servicos"], queryFn: () => apiGet("/api/mapsis/get_servicos"), staleTime: 600000 });
  const horariosQ = useQuery({
    queryKey: ["horarios", idLoja, idServico, dataAgenda, idVeiculo, idConsultor],
    queryFn: () => {
      const useConsultor = !!idConsultor;
      return apiGet(`/api/mapsis/get_agenda_horario_disponivel?${qs({
        id_veiculo_mapsis: idVeiculo,
        id_loja_mapsis: idLoja,
        id_servico_mapsis: idServico,
        data_agendamento: dataAgenda,
        retorno_consultor: useConsultor ? "1" : "0",
        ...(useConsultor ? { id_consultor_mapsis: idConsultor } : {}),
      })}`);
    },
    enabled: step === "agendamento" && !!idLoja && !!idServico && !!dataAgenda && !!idVeiculo, retry: 0,
  });

  /* Forms */
  const docForm = useForm<{ cpf_cnpj: string }>({ defaultValues: { cpf_cnpj: "" } });

  const cadForm = useForm<any>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: {
      cpf_cnpj: "", nome: "", email: "", telefone: "", celular: "",
      modelo_busca: "", chassi: "", sem_chassi: false,
      marca_veiculo: "", modelo_veiculo: "", placa: "", ano_fab: "", ano_mod: "", km: "",
      data_compra: "", sem_data_compra: false, cod_loja: "",
    }
  });

  const agForm = useForm<any>({
    resolver: zodResolver(atendimentoSchema),
    defaultValues: { id_loja_mapsis: "", id_servico_mapsis: "" }
  });
  const lojaFormValue = agForm.watch("id_loja_mapsis");
  const consultoresQ = useQuery({
    queryKey: ["consultores", lojaFormValue],
    queryFn: () => apiGet(`/api/mapsis/get_consultores?${qs({ id_loja_mapsis: lojaFormValue })}`),
    enabled: step === "agendamento" && !!lojaFormValue,
    staleTime: 600000,
  });
  const horForm = useForm<any>({
    resolver: zodResolver(horarioSchema),
    defaultValues: { data: "", hora: "" }
  });
  const [condutor, setCondutor] = useState<"proprietario" | "outros">("proprietario");
  const [nomeOutro, setNomeOutro] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const contForm = useForm<any>({ defaultValues: { email: "", telefone: "", celular: "", whatsapp: false, telefone_c: true, email_c: true, sms: false, app: false } });

  /* Error wrapper */
  async function run(fn: () => Promise<void>) {
    setLoading(true);
    try { await fn(); }
    catch (e: any) {
      if (e instanceof ZodError) {
        const { title, message } = parseZodError(e);
        toast.error(title, message);
      } else {
        const msg: string = e?.message ?? "";
        if (/cpf|cnpj|documento/i.test(msg)) toast.error("Documento inválido", "Verifique o CPF ou CNPJ informado.");
        else if (/cliente/i.test(msg)) toast.error("Cliente não encontrado", "Não foi possível localizar o cadastro.");
        else if (/hor[aá]rio/i.test(msg)) toast.error("Horário indisponível", "O horário escolhido não está mais disponível.");
        else if (/agenda/i.test(msg)) toast.error("Erro no agendamento", "Não foi possível confirmar. Tente outro horário.");
        else if (msg) toast.error("Algo deu errado", msg);
        else toast.error("Erro inesperado", "Tente novamente em alguns instantes.");
      }
    } finally { setLoading(false); setLoadingStatus("idle"); }
  }

  /* ── Handlers ── */
  async function handleValidarDoc() {
    const raw = docForm.getValues("cpf_cnpj");
    if (!raw || onlyDigits(raw).length < 11) {
      toast.warn("CPF / CNPJ obrigatório", "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)."); return;
    }
    const d = cpfCnpjSchema.parse(raw);
    setCpfCnpj(d);
    setLoadingStatus("consultando");
    const payload = await apiGet(`/api/mapsis/get_cliente?cpf_cnpj=${d}`);
    const err = getErroApi(payload);
    const temCliente = Array.isArray(payload?.cliente) ? payload.cliente.length > 0 : !!payload?.cliente || !!payload?.id_cliente_mapsis;
    if (err || !temCliente) {
      setCliente(null); cadForm.setValue("cpf_cnpj", d);
      toast.info("Novo cadastro", "Cadastro não encontrado. Preencha seus dados para continuar.");
      setStep("cadastro");
    } else {
      setLoadingStatus("encontrado");
      await new Promise(r => setTimeout(r, 900));
      setLoadingStatus("carregando");
      setCliente(payload);
      await new Promise(r => setTimeout(r, 400));
      setStep("dados_cliente");
    }
  }

  async function handleCadastrar() {
    const v = cadForm.getValues();
    const d = cpfCnpjSchema.parse(v.cpf_cnpj);
    cadastroSchema.parse({ ...v, cpf_cnpj: d });
    const r = await apiGet(`/api/mapsis/set_cliente?${qs({ ...v, cpf_cnpj: d })}`);
    const e = getErroApi(r); if (e) throw new Error(e);
    const cliente = await apiGet(`/api/mapsis/get_cliente?cpf_cnpj=${d}`);
    setCliente(cliente); setCpfCnpj(d);
    toast.success("Cadastro realizado!", "Seus dados foram salvos com sucesso.");
    setStep("dados_cliente");
  }

  async function handleAtendimento() {
    const loja = agForm.getValues("id_loja_mapsis");
    const serv = agForm.getValues("id_servico_mapsis");
    const data = horForm.getValues("data");
    if (!loja) { toast.warn("Oficina obrigatória", "Selecione a oficina desejada."); return; }
    if (!serv) { toast.warn("Serviço obrigatório", "Selecione o serviço a ser executado."); return; }
    if (!data) { toast.warn("Data obrigatória", "Selecione a data desejada antes de buscar horários."); return; }
    // Persiste ids — isso ativa a query de horários (enabled depende desses valores)
    setIdLoja(loja);
    setIdServico(serv);
    setDataAgenda(data);
    toast.info("Buscando horários...", "Aguarde enquanto consultamos a disponibilidade.");
  }

  async function handleConfirmar() {
    const vCont = contForm.getValues();
    if (!vCont.telefone && !vCont.celular) {
      toast.warn("Telefone obrigatório", "Informe ao menos um telefone ou celular para confirmação."); return;
    }
    const vHor = horForm.getValues();
    const cli = clientePayload?.cliente?.[0] ?? {};
    const idV = idVeiculo || String(veiculos?.[0]?.id_veiculo_mapsis ?? "");
    const veiSel = veiculos.find((v: any) => String(v.id_veiculo_mapsis) === idV) ?? veiculos[0] ?? {};

    // Formata data de AAAA-MM-DD para DD/MM/AAAA
    const [ano, mes, dia] = (vHor.data ?? "").split("-");
    const dataFmt = dia && mes && ano ? `${dia}/${mes}/${ano}` : vHor.data;

    // Separa DDD do telefone/celular
    const telDigits = onlyDigits(vCont.telefone ?? "");
    const celDigits = onlyDigits(vCont.celular ?? "");
    const ddd = telDigits.length >= 10 ? telDigits.slice(0, 2) : (cli.ddd ?? "");
    const tel = telDigits.length >= 10 ? telDigits.slice(2) : (telDigits || (cli.telefone?.replace(/\D/g, "") ?? ""));
    const dddCel = celDigits.length >= 10 ? celDigits.slice(0, 2) : (cli.ddd_celular ?? ddd);
    const cel = celDigits.length >= 10 ? celDigits.slice(2) : (celDigits || (cli.celular?.replace(/\D/g, "") ?? ""));

    const r = await apiGet(`/api/mapsis/set_agendamento?${qs({
      cpf_cnpj: cpfCnpj,
      nome: cli.nome_cliente ?? cli.nome ?? "",
      email: vCont.email || cli.email || "",
      ddd,
      telefone: tel,
      ddd_celular: dddCel,
      celular: cel,
      cod_loja: veiSel.cod_loja ?? idLoja,
      id_loja_mapsis: idLoja,
      id_servico_mapsis: idServico,
      id_veiculo_mapsis: idV,
      ...(idConsultor ? { id_consultor: idConsultor } : {}),
      marca_veiculo: veiSel.marca ?? "Chevrolet",
      modelo_veiculo: veiSel.modelo_carro ?? veiSel.modelo ?? "",
      ano_fabricacao: veiSel.ano_fabricacao ?? "",
      ano_modelo: veiSel.ano_modelo ?? "",
      km_atual: veiSel.kilometragem_atual ?? "",
      placa: veiSel.placa ?? "",
      chassi: veiSel.chassis ?? "",
      data_agendamento: dataFmt,
      hora_agendamento: vHor.hora,
      observacao: observacoes,
      status_agendamento: "P",
    })}`);
    const e = getErroApi(r); if (e) throw new Error(e);
    setDataAgenda(vHor.data); setHoraAgenda(vHor.hora);
    toast.success("Agendamento confirmado!", "Você receberá uma confirmação em breve.");
    setStep("confirmado");
  }

  const servicos = useMemo(() => servicosQ.data?.servicos ?? servicosQ.data?.Servicos ?? [], [servicosQ.data]);

  /* Filtra só as duas lojas pelo nome — IDs reais vêm da API */
  const lojas = useMemo(() => {
    const all: any[] = lojasQ.data?.lojas ?? lojasQ.data?.Lojas ?? lojasQ.data?.loja ?? [];
    const filtradas = all.filter((l: any) => {
      const nome = (l.nome ?? l.nome_loja ?? "").toUpperCase();
      return nome.includes("TATUAP") || nome.includes("JO") && nome.includes("DIAS");
    });
    return filtradas.length > 0 ? filtradas : all; // fallback: mostra todas se filtro não bater
  }, [lojasQ.data]);
  const consultoresList = useMemo(() => {
    const c = consultoresQ.data?.consultores ?? consultoresQ.data?.Consultores ?? [];
    return Array.isArray(c) ? c : [];
  }, [consultoresQ.data]);
  const horariosList = useMemo(() => {
    const h = horariosQ.data?.horarios ?? horariosQ.data?.Horarios ?? [];
    return Array.isArray(h) ? h : [];
  }, [horariosQ.data]);

  const lojaName = lojas.find((l: any) => String(l.id_loja_mapsis ?? l.id ?? "") === idLoja)?.nome ?? lojas.find((l: any) => String(l.id_loja_mapsis ?? l.id ?? "") === idLoja)?.nome_loja ?? idLoja;
  const servicoName = servicos.find((s: any) => (s.id_servico_mapsis ?? "") === idServico)?.nome ?? idServico;

  /* Extrai dados do cliente do retorno real da API */
  const cliData = useMemo(() => {
    const c = Array.isArray(clientePayload?.cliente)
      ? clientePayload.cliente[0]
      : clientePayload?.cliente ?? clientePayload ?? {};
    // Normaliza campos para exibição
    return {
      cpf_cnpj: c.cpf_cnpj ?? cpfCnpj,
      nome: c.nome_cliente ?? c.nome ?? "",
      email: c.email ?? "",
      telefone: c.ddd && c.telefone ? `(${c.ddd}) ${c.telefone}` : c.telefone ?? "",
      celular: c.ddd_celular && c.celular ? `(${c.ddd_celular}) ${c.celular}` : c.celular ?? "",
    };
  }, [clientePayload, cpfCnpj]);

  /* ─────────────────────────── RENDER ─────────────────────────── */
  return (
    <>
      <div className="app-bg" />
      <div className="app-root">

        {/* Install Banner — mobile/tablet only */}
        {canInstall && (
          <div className="install-popup">
            <div className="install-popup-icon">
              <Icons.Download />
            </div>
            <div className="install-popup-text">
              <span className="install-popup-title">Instalar app</span>
              <span className="install-popup-sub">Acesse mais rápido pela tela inicial</span>
            </div>
            <button className="install-popup-btn" onClick={install}>Instalar</button>
            <button className="install-popup-close" onClick={dismiss} aria-label="Fechar">
              <Icons.X />
            </button>
          </div>
        )}

        {/* Topbar */}
<header className="topbar">
  <div className="topbar-brand">
    <div className="topbar-text">
      <img src="/icons/logo.png" alt="Nova Chevrolet" />
      <span className="topbar-tag">Agendamento Online</span>
    </div>
  </div>
</header>

        <main className="app-shell">
          <Stepper current={step} />
          <div ref={cardRef} style={{ scrollMarginTop: 70 }} />

          {/* ══════ STEP 1 — IDENTIFICAÇÃO ══════ */}
          {step === "doc" && (
            <Card>
              <CardHeader title="Identificação" subtitle="Informe seu CPF ou CNPJ para começar." icon={<Icons.IdCard />} />
              <CardBody>
                <Input
                  label="CPF ou CNPJ" required
                  placeholder="000.000.000-00" inputMode="numeric"
                  icon={<Icons.IdCard />}
                  value={docForm.watch("cpf_cnpj")}
                  onChange={e => docForm.setValue("cpf_cnpj", formatDoc(e.target.value))}
                  hint="Se ainda não for cliente, abriremos o cadastro automaticamente."
                />
                <Button
                  className={`btn-full${loadingStatus === "encontrado" ? " btn-found" : ""}`}
                  loading={loadingStatus === "consultando" || loadingStatus === "carregando"}
                  onClick={() => run(handleValidarDoc)}
                >
                  {loadingStatus === "consultando" && <>Consultando cadastro...</>}
                  {loadingStatus === "encontrado"  && <><Icons.CheckCircle /> Cadastro encontrado!</>}
                  {loadingStatus === "carregando"  && <>Carregando seus dados...</>}
                  {loadingStatus === "idle"        && <>Continuar <Icons.ChevronRight /></>}
                </Button>
                {loadingStatus === "encontrado" && (
                  <div className="found-banner">
                    <Icons.CheckCircle /> Cadastro localizado com sucesso. Carregando informações...
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* ══════ STEP 2 — CADASTRO ══════ */}
          {step === "cadastro" && (
            <Card>
              <CardHeader title="Preencha o formulário abaixo" subtitle="Documento não encontrado - faça seu cadastro para continuar." icon={<Icons.ClipboardList />} />
              <CardBody>

                {/* Dados pessoais */}
                <div className="grid-2">
                  <Input label="CPF ou CNPJ" required icon={<Icons.IdCard />}
                    value={cadForm.watch("cpf_cnpj")} placeholder="CPF ou CNPJ" inputMode="numeric"
                    onChange={e => cadForm.setValue("cpf_cnpj", formatDoc(e.target.value))} />
                  <Input label="Nome Completo" required icon={<Icons.User />}
                    value={cadForm.watch("nome")} placeholder="Nome Completo"
                    onChange={e => cadForm.setValue("nome", e.target.value)} />
                </div>
                <Input label="E-mail" icon={<Icons.Mail />}
                  value={cadForm.watch("email")} placeholder="E-mail"
                  onChange={e => cadForm.setValue("email", e.target.value)} />
                <div className="grid-2">
                  <Input label="Telefone" icon={<Icons.Phone />}
                    value={cadForm.watch("telefone")} placeholder="Telefone" inputMode="numeric"
                    onChange={e => cadForm.setValue("telefone", onlyDigits(e.target.value))} />
                  <Input label="Celular" required icon={<Icons.Phone />}
                    value={cadForm.watch("celular")} placeholder="Celular" inputMode="numeric"
                    onChange={e => cadForm.setValue("celular", onlyDigits(e.target.value))} />
                </div>

                <Divider />

                {/* Veículo */}
                <div>
                  <Input label="Modelo Veículo" required icon={<Icons.Car />}
                    value={cadForm.watch("modelo_busca")} placeholder="Ex: Captiva EV"
                    onChange={e => cadForm.setValue("modelo_busca", e.target.value)} />
                </div>
                <div className="grid-2">
                  <div>
                    <Input label="Chassi" icon={<Icons.Settings2 />}
                      value={cadForm.watch("chassi")} placeholder="Chassi"
                      disabled={cadForm.watch("sem_chassi")}
                      onChange={e => cadForm.setValue("chassi", e.target.value)} />
                    <label className="checkbox-row" style={{ marginTop: 6 }}>
                      <input type="checkbox"
                        checked={cadForm.watch("sem_chassi")}
                        onChange={e => { cadForm.setValue("sem_chassi", e.target.checked); if (e.target.checked) cadForm.setValue("chassi", ""); }} />
                      Clique aqui caso não saiba o Chassi
                    </label>
                  </div>
                  <div />
                </div>

                <div className="grid-4">
                  <Input label="Fabricação" placeholder="Ano Fab" inputMode="numeric"
                    value={cadForm.watch("ano_fab")} onChange={e => cadForm.setValue("ano_fab", onlyDigits(e.target.value).slice(0, 4))} />
                  <Input label="Modelo" placeholder="Ano Mod" inputMode="numeric"
                    value={cadForm.watch("ano_mod")} onChange={e => cadForm.setValue("ano_mod", onlyDigits(e.target.value).slice(0, 4))} />
                  <div>
                    <Input label="Placa" required placeholder="Placa"
                      value={cadForm.watch("placa")} onChange={e => cadForm.setValue("placa", e.target.value.toUpperCase())} />
                    <p className="field-hint" style={{ marginTop: 4 }}>Somente letras e números (Ex: AAA1111)</p>
                  </div>
                  <Input label="Quilometragem" placeholder="Quilometragem" inputMode="numeric"
                    value={cadForm.watch("km")} onChange={e => cadForm.setValue("km", onlyDigits(e.target.value))} />
                </div>

                <Divider />

                <div className="grid-2">
                  <div>
                    <Input label="Data Compra Veículo" type="date"
                      value={cadForm.watch("data_compra")}
                      disabled={cadForm.watch("sem_data_compra")}
                      onChange={e => cadForm.setValue("data_compra", e.target.value)} />
                    <label className="checkbox-row" style={{ marginTop: 6 }}>
                      <input type="checkbox"
                        checked={cadForm.watch("sem_data_compra")}
                        onChange={e => { cadForm.setValue("sem_data_compra", e.target.checked); if (e.target.checked) cadForm.setValue("data_compra", ""); }} />
                      Clique aqui caso não saiba a data
                    </label>
                  </div>
                  <Select label="Local da Compra" required
                    value={cadForm.watch("cod_loja")}
                    onChange={e => cadForm.setValue("cod_loja", e.target.value)}>
                    <option value="">- Selecione -</option>
                    {lojas.map((l: any) => { const lid = String(l.id_loja_mapsis ?? l.id ?? ""); const lnome = l.nome ?? l.nome_loja ?? lid; return <option key={lid} value={lid}>{lnome}</option>; })}
                  </Select>
                </div>

                <div className="action-row">
                  <Button variant="ghost" onClick={() => setStep("doc")}><Icons.ChevronLeft /> Voltar</Button>
                  <span className="spacer" />
                  <Button loading={loading} onClick={() => run(handleCadastrar)}>
                    {loading ? "Salvando..." : <>Avançar <Icons.ChevronRight /></>}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ══════ STEP 3 — DADOS CLIENTE + VEÍCULOS ══════ */}
          {step === "dados_cliente" && (
            <Card>
              <CardHeader title="Seus dados" subtitle="Confira seus dados e escolha o veículo para o serviço desejado. Qualquer dúvida entre em contato com nossa central de atendimento." icon={<Icons.User />} />
              <CardBody>
                {/* Dados readonly */}
                <div className="grid-2">
                  <Input label="CPF ou CNPJ" value={cliData.cpf_cnpj} readOnly />
                  <Input label="Nome Completo" value={cliData.nome} readOnly />
                </div>
                <Input label="E-mail" value={cliData.email} readOnly />
                <div className="grid-2">
                  <Input label="Telefone" value={cliData.telefone} readOnly />
                  <Input label="Celular" value={cliData.celular} readOnly />
                </div>

                <Divider label="Escolha o veículo para realizar o agendamento" />

                {/* Busca por placa */}
                <div className="table-placa-search">
                  <label>Placa:</label>
                  <input className="table-placa-input" placeholder="Filtrar por placa" value={placaFiltro} onChange={e => { setPlacaFiltro(e.target.value); setPaginaAtual(1); }} />
                  <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-2)" }}>
                    Exibir:
                    <select
                      value={itensPorPagina}
                      onChange={e => { setItensPorPagina(Number(e.target.value) as 5 | 10); setPaginaAtual(1); }}
                      style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px", fontSize: 13, background: "var(--surface-2)", color: "var(--text-1)" }}
                    >
                      <option value={5}>5 por página</option>
                      <option value={10}>10 por página</option>
                    </select>
                  </label>
                </div>

                {/* Tabela de veículos */}
                <div className="vehicle-table-wrap">
                  <table className="vehicle-table">
                    <thead>
                      <tr>
                        <th>SELECIONE</th>
                        <th>Modelo</th>
                        <th>Ano/Modelo</th>
                        <th>Chassi</th>
                        <th>Placa</th>
                        <th>Km atual</th>
                        <th>Dt Compra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {veiculosPaginados.length === 0 && (
                        <tr><td colSpan={7} style={{ color: "var(--text-3)", padding: "18px" }}>Nenhum veículo encontrado.</td></tr>
                      )}
                      {veiculosPaginados.map((v: any, i: number) => {
                        const vid = String(v.id_veiculo_mapsis ?? i);
                        const sel = idVeiculo === vid || (!idVeiculo && i === 0);
                        return (
                          <tr key={vid} className={sel ? "selected" : ""} onClick={() => setIdVeiculo(vid)} style={{ cursor: "pointer" }}>
                            <td><input type="radio" name="veiculo" checked={sel} onChange={() => setIdVeiculo(vid)} /></td>
                            <td>{v.modelo_carro ?? v.modelo ?? "—"}</td>
                            <td>{v.ano_fabricacao ?? "—"}/{v.ano_modelo ?? "—"}</td>
                            <td style={{ fontSize: 11 }}>{v.chassis ?? v.chassi ?? "—"}</td>
                            <td>{v.placa ?? "—"}</td>
                            <td>{v.kilometragem_atual ?? v.km_atual ?? v.km ?? "—"}</td>
                            <td>{v.data_compra ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="table-pagination">
                  <span className="pagination-info">{veiculosFiltrados.length === 0 ? "0" : `${(paginaAtual - 1) * itensPorPagina + 1}–${Math.min(paginaAtual * itensPorPagina, veiculosFiltrados.length)}`} de {veiculosFiltrados.length}</span>
                  <button className="page-btn" disabled={paginaAtual === 1} onClick={() => setPaginaAtual(p => p - 1)}>‹ Ant.</button>
                  {(() => {
                    const pages: (number | "...")[] = [];
                    if (totalPaginas <= 7) {
                      for (let i = 1; i <= totalPaginas; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (paginaAtual > 3) pages.push("...");
                      for (let i = Math.max(2, paginaAtual - 1); i <= Math.min(totalPaginas - 1, paginaAtual + 1); i++) pages.push(i);
                      if (paginaAtual < totalPaginas - 2) pages.push("...");
                      pages.push(totalPaginas);
                    }
                    return pages.map((p, idx) =>
                      p === "..."
                        ? <span key={`e${idx}`} className="page-ellipsis">…</span>
                        : <button key={p} className={`page-btn${paginaAtual === p ? " active" : ""}`} onClick={() => setPaginaAtual(p as number)}>{p}</button>
                    );
                  })()}
                  <button className="page-btn" disabled={paginaAtual === totalPaginas} onClick={() => setPaginaAtual(p => p + 1)}>Próx. ›</button>
                </div>

                <p className="notice-text">
                  Caso tenha um agendamento para os próximos dias, queira cancelar ou alterar a data/horário, entre em contato com nossa central de atendimento: Agende seu próximo serviço você mesmo, acesse o link: https://bit.ly/2RVQOeQ / São Paulo(11) 2090- São Paulo(11) 2090-1730 (Whatsapp Business https://wa.me/5511209...
                </p>

                <div className="action-row">
                  <Button variant="ghost" onClick={() => setStep("doc")}><Icons.ChevronLeft /> Voltar</Button>
                  <span className="spacer" />
                  <Button onClick={() => setStep("agendamento")}>
                    Avançar <Icons.ChevronRight />
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ══════ STEP 4 — AGENDAMENTO ══════ */}
          {step === "agendamento" && (
            <Card>
              <CardHeader title="Dados do agendamento" subtitle="" icon={<Icons.Calendar />} />
              <CardBody>

                {/* Previsão próximo serviço */}
                {previsaoServico && (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-2)" }}>Previsão do seu próximo serviço.</p>
                    <table className="prev-table">
                      <thead>
                        <tr>
                          <th>Serviço / Manutenção</th>
                          <th>Previsto Para</th>
                          <th>Km Previsto</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{previsaoServico.nome ?? "—"}</td>
                          <td>{previsaoServico.data ?? "—"}</td>
                          <td>{previsaoServico.km ?? "0"}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="notice-text" style={{ marginTop: 8 }}>
                      A previsão do próximo serviço a ser realizado é só uma estimativa sob cálculos feitos do seu perfil de uso do veículo. Este é somente um dado de lembrete.
                    </p>
                  </div>
                )}

                <div className="grid-2">
                  <Select label="Serviço a ser executado:" required
                    value={agForm.watch("id_servico_mapsis")}
                    onChange={e => {
                      agForm.setValue("id_servico_mapsis", e.target.value);
                      // Reseta oficina, técnico, data e horário
                      agForm.setValue("id_loja_mapsis", "");
                      setIdConsultor("");
                      horForm.setValue("hora", "");
                      horForm.setValue("data", "");
                      setHoraAgenda("");
                      setDataAgenda("");
                      setIdServico("");
                      setIdLoja("");
                    }}>
                    <option value="">- Selecione -</option>
                    {servicos.map((s: any) => (
                      <option key={s.id_servico_mapsis ?? s.nome} value={s.id_servico_mapsis ?? ""}>{s.nome ?? "Serviço"}</option>
                    ))}
                  </Select>
                  <Select label="Oficina Desejada:" required
                    value={agForm.watch("id_loja_mapsis")}
                    onChange={e => {
                      agForm.setValue("id_loja_mapsis", e.target.value);
                      setIdConsultor("");
                      horForm.setValue("hora", "");
                      setHoraAgenda("");
                      setDataAgenda("");
                      setIdLoja("");
                    }}>
                    <option value="">- Selecione -</option>
                    {lojas.map((l: any) => { const lid = String(l.id_loja_mapsis ?? l.id ?? ""); const lnome = l.nome ?? l.nome_loja ?? lid; return <option key={lid} value={lid}>{lnome}</option>; })}
                  </Select>
                </div>

                {/* Seleção de Técnico/Mecânico */}
                {agForm.watch("id_loja_mapsis") && (
                  <div className="field">
                    <label className="field-label">Técnico / Mecânico Preferido:</label>
                    {consultoresQ.isFetching && (
                      <p className="field-hint" style={{ marginTop: 4 }}>Carregando técnicos...</p>
                    )}
                    {!consultoresQ.isFetching && consultoresList.length > 0 && (
                      <div className="tecnico-grid">
                        {/* Opção sem preferência */}
                        <button
                          type="button"
                          className={`tecnico-chip${idConsultor === "" ? " selected" : ""}`}
                          onClick={() => {
                            setIdConsultor("");
                            horForm.setValue("hora", "");
                            setHoraAgenda("");
                            setDataAgenda("");
                          }}
                        >
                          <span className="tecnico-avatar">?</span>
                          <span className="tecnico-nome">Sem preferência</span>
                        </button>
                        {consultoresList.map((c: any) => {
                          const cid = String(c.id_consultor_mapsis ?? "");
                          const cnome = c.nome ?? c.nome_consultor ?? cid;
                          const sel = idConsultor === cid;
                          const initials = cnome.split(" ").slice(0,2).map((w: string) => w[0]?.toUpperCase() ?? "").join("");
                          return (
                            <button
                              key={cid}
                              type="button"
                              className={`tecnico-chip${sel ? " selected" : ""}`}
                              onClick={() => {
                                setIdConsultor(cid);
                                horForm.setValue("hora", "");
                                setHoraAgenda("");
                                setDataAgenda("");
                              }}
                            >
                              <span className="tecnico-avatar">{initials}</span>
                              <span className="tecnico-nome">{cnome}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {!consultoresQ.isFetching && consultoresList.length === 0 && !consultoresQ.isError && consultoresQ.isFetched && agForm.watch("id_loja_mapsis") && (
                      <p className="field-hint" style={{ marginTop: 4 }}>Nenhum técnico cadastrado para esta oficina.</p>
                    )}
                  </div>
                )}

                <div className="grid-2">
                  <div>
                    <Input label="Data desejada:" type="date"
                      value={horForm.watch("data")}
                      onChange={e => {
                        horForm.setValue("data", e.target.value);
                        // Reseta horário e query ao trocar data
                        horForm.setValue("hora", "");
                        setHoraAgenda("");
                        // Limpa ids para forçar nova busca ao clicar no botão
                        setDataAgenda("");
                        setIdLoja("");
                        setIdServico("");
                      }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <Button variant="green" className="btn-full"
                      loading={horariosQ.isFetching}
                      disabled={!horForm.watch("data") || !agForm.watch("id_loja_mapsis") || !agForm.watch("id_servico_mapsis")}
                      onClick={() => {
                        const loja = agForm.getValues("id_loja_mapsis");
                        const serv = agForm.getValues("id_servico_mapsis");
                        const data = horForm.getValues("data");
                        if (!loja) { toast.warn("Oficina obrigatória", "Selecione a oficina desejada."); return; }
                        if (!serv) { toast.warn("Serviço obrigatório", "Selecione o serviço a ser executado."); return; }
                        if (!data) { toast.warn("Data obrigatória", "Selecione a data desejada."); return; }
                        if (!idVeiculo) { toast.warn("Veículo obrigatório", "Selecione o veículo na etapa anterior."); return; }
                        horForm.setValue("hora", "");
                        setHoraAgenda("");
                        setIdLoja(loja);
                        setIdServico(serv);
                        setDataAgenda(data);
                      }}>
                      {horariosQ.isFetching ? "Buscando..." : "Busca Horários"}
                    </Button>
                  </div>
                </div>

                <div className="field">
                  <label className="field-label">Horários Disponíveis:</label>
                  {horariosQ.isFetching && (
                    <p className="field-hint" style={{ marginTop: 4 }}>Buscando horários...</p>
                  )}
                  {horariosQ.isError && (
                    <InfoBox type="warn">Não foi possível carregar os horários. Verifique os dados e tente novamente.</InfoBox>
                  )}
                  {!horariosQ.isFetching && !dataAgenda && (
                    <p className="field-hint" style={{ marginTop: 4 }}>Preencha os campos acima e clique em Busca Horários.</p>
                  )}
                  {!horariosQ.isFetching && dataAgenda && horariosList.length === 0 && !horariosQ.isError && (
                    <InfoBox type="warn">Nenhum horário disponível para esta data.</InfoBox>
                  )}
                  {horariosList.length > 0 && (
                    <div className="horarios-grid">
                      {/* Deduplica por horário — pega só horários únicos */}
                      {[...new Map(horariosList.map((h: any) => {
                        const hora = typeof h === "string" ? h : h.horario;
                        return [hora, hora];
                      })).values()]
                        .filter((hora: string) => hora.endsWith(":00"))
                        .map((hora: string) => {
                        const sel = horForm.watch("hora") === hora;
                        return (
                          <button
                            key={hora}
                            type="button"
                            className={`horario-chip${sel ? " selected" : ""}`}
                            onClick={() => { horForm.setValue("hora", hora); setHoraAgenda(hora); }}
                          >
                            {hora}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label className="field-label">Observações/Informações Adicionais:</label>
                  <textarea className="field-input field-textarea"
                    value={observacoes} onChange={e => setObservacoes(e.target.value)}
                    placeholder="Digite observações opcionais..." />
                </div>

                <div className="field">
                  <label className="field-label">Quem será o condutor do veículo até a oficina?</label>
                  <div className="condutor-row">
                    <label className="radio-row">
                      <input type="radio" name="condutor" checked={condutor === "proprietario"} onChange={() => setCondutor("proprietario")} />
                      Proprietário
                    </label>
                    <label className="radio-row">
                      <input type="radio" name="condutor" checked={condutor === "outros"} onChange={() => setCondutor("outros")} />
                      Outros
                    </label>
                    {condutor === "outros" && (
                      <input className="field-input" style={{ flex: 1, minWidth: 160 }}
                        placeholder="Nome Outro" value={nomeOutro} onChange={e => setNomeOutro(e.target.value)} />
                    )}
                  </div>
                </div>

                <p className="notice-text">
                  Agende seu próximo serviço você mesmo. São Paulo (11) 2090-1730 (Whatsapp Business). Endereços: Tatuapé – Av. Condessa Elisabeth de Robiano, 2.640 / Santo Amaro – Av. João Dias, 2300. Aguardamos sua presença e agradecemos por escolher a NOVA CHEVROLET.
                </p>

                <div className="action-row">
                  <Button variant="ghost" onClick={() => setStep("dados_cliente")}><Icons.ChevronLeft /> Voltar</Button>
                  <span className="spacer" />
                  <Button
                    disabled={!agForm.watch("id_loja_mapsis") || !agForm.watch("id_servico_mapsis") || !horForm.watch("hora")}
                    onClick={() => {
                      if (!agForm.watch("id_servico_mapsis")) { toast.warn("Serviço obrigatório", "Selecione o serviço a ser executado."); return; }
                      if (!agForm.watch("id_loja_mapsis")) { toast.warn("Oficina obrigatória", "Selecione a oficina desejada."); return; }
                      if (!horForm.watch("hora")) { toast.warn("Horário obrigatório", "Clique em Busca Horários e selecione um horário."); return; }
                      // Pré-preenche contato com dados já conhecidos do cliente
                      const cli = clientePayload?.cliente?.[0] ?? {};
                      if (!contForm.getValues("email") && cli.email) contForm.setValue("email", cli.email);
                      if (!contForm.getValues("telefone") && cli.ddd) contForm.setValue("telefone", `${cli.ddd}${(cli.telefone ?? "").replace(/\D/g, "")}`);
                      if (!contForm.getValues("celular") && cli.ddd_celular) contForm.setValue("celular", `${cli.ddd_celular}${(cli.celular ?? "").replace(/\D/g, "")}`);
                      setStep("contato");
                    }}>
                    Avançar <Icons.ChevronRight />
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ══════ STEP 5 — CONFIRMAÇÃO CONTATO ══════ */}
          {step === "contato" && (
            <Card>
              <CardHeader title="Confirme seu e-mail e telefone(s)." subtitle="" icon={<Icons.Phone />} />
              <CardBody>
                <Input label="E-mail:" icon={<Icons.Mail />}
                  value={contForm.watch("email")} placeholder="E-mail"
                  onChange={e => contForm.setValue("email", e.target.value)} />
                <div className="grid-2">
                  <Input label="Telefone:" icon={<Icons.Phone />}
                    value={contForm.watch("telefone")} placeholder="Telefone" inputMode="numeric"
                    onChange={e => contForm.setValue("telefone", onlyDigits(e.target.value))} />
                  <Input label="Celular:" icon={<Icons.Phone />}
                    value={contForm.watch("celular")} placeholder="Celular" inputMode="numeric"
                    onChange={e => contForm.setValue("celular", onlyDigits(e.target.value))} />
                </div>

                <div className="field">
                  <label className="field-label">O(a) Sr(a) gostaria de ser contatado por quais meios:</label>
                  <div className="meios-row">
                    {[
                      { key: "whatsapp", label: "Whatsapp" },
                      { key: "telefone_c", label: "Telefone" },
                      { key: "email_c", label: "E-mail" },
                      { key: "sms", label: "SMS/Torpedo" },
                      { key: "app", label: "App" },
                    ].map(({ key, label }) => (
                      <label key={key}>
                        <input type="checkbox"
                          checked={contForm.watch(key as any)}
                          onChange={e => contForm.setValue(key as any, e.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <p className="notice-text">
                  Estou ciente que este agendamento on-line é somente uma reserva de agendamento com o horário previsto do serviço conforme acertado entre as partes. A NOVA CHEVROLET se reserva o direito de ajustar Box e Horário de atendimento em até 30 min, em caso de necessidades operacionais da oficina. O seu agendamento de serviço será feito, mas em alguns casos poderemos entrar em contato com você para confirmação (dentro do horário comercial de expediente da central). Solicitamos a gentileza de serem retirados todos os pertences pessoais do interior do veículo.
                </p>

                <div className="action-row">
                  <Button variant="ghost" onClick={() => setStep("agendamento")}><Icons.ChevronLeft /> Voltar</Button>
                  <span className="spacer" />
                  <Button loading={loading} onClick={() => run(handleConfirmar)}>
                    {loading ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ══════ STEP 6 — CONFIRMADO ══════ */}
          {step === "confirmado" && (
            <Card>
              <CardBody>
                <div className="success-wrapper">
                  <div className="success-icon-wrap"><Icons.CheckCircle /></div>
                  <div>
                    <p className="success-heading">Agendamento confirmado!</p>
                    <p className="success-sub">Seu atendimento foi registrado com sucesso. Até breve na Nova Chevrolet!</p>
                  </div>
                  <div className="summary-card">
                    <div className="summary-row">
                      <span className="summary-key"><Icons.MapPin /> Oficina</span>
                      <span className="summary-val">{lojaName}</span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-key"><Icons.Wrench /> Serviço</span>
                      <span className="summary-val">{servicoName}</span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-key"><Icons.Calendar /> Data</span>
                      <span className="summary-val">{dataAgenda}</span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-key"><Icons.Clock /> Horário</span>
                      <span className="summary-val">{horaAgenda}</span>
                    </div>
                    {idConsultor && (() => {
                      const cons = consultoresList.find((c: any) => String(c.id_consultor_mapsis ?? "") === idConsultor);
                      return cons ? (
                        <div className="summary-row">
                          <span className="summary-key"><Icons.Wrench /> Técnico</span>
                          <span className="summary-val">{cons.nome ?? cons.nome_consultor ?? "—"}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div style={{ width: "100%" }}>
                    <Button variant="secondary" className="btn-full" onClick={() => window.location.reload()}>
                      <Icons.Plus /> Novo agendamento
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <footer className="app-footer">
            {new Date().getFullYear()} · Nova Chevrolet
          </footer>
        </main>
      </div>
    </>
  );
}

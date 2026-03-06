import { z } from "zod";

export function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

function validarCPF(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(cpf[10]);
}

function validarCNPJ(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (c: string, pesos: number[]) =>
    pesos.reduce((s, p, i) => s + parseInt(c[i]) * p, 0);
  const mod = (n: number) => { const r = n % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = mod(calc(cnpj, [5,4,3,2,9,8,7,6,5,4,3,2]));
  const d2 = mod(calc(cnpj, [6,5,4,3,2,9,8,7,6,5,4,3,2]));
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13]);
}

export const cpfCnpjSchema = z
  .string()
  .transform(v => onlyDigits(v))
  .refine(v => v.length === 11 || v.length === 14, "CPF/CNPJ inválido (use 11 ou 14 dígitos)")
  .refine(v => v.length === 11 ? validarCPF(v) : validarCNPJ(v), "O número informado não corresponde a um CPF/CNPJ válido");

export const cadastroSchema = z.object({
  cpf_cnpj:       z.string(),
  nome:           z.string().min(3, "Informe o nome completo"),
  email:          z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone:       z.string().optional().or(z.literal("")),
  celular:        z.string().min(8, "Informe o celular"),
  modelo_busca:   z.string().min(1, "Informe o modelo do veículo"),
  chassi:         z.string().optional().or(z.literal("")),
  sem_chassi:     z.boolean().optional(),
  marca_veiculo:  z.string().optional().or(z.literal("")),
  modelo_veiculo: z.string().optional().or(z.literal("")),
  placa:          z.string().optional().or(z.literal("")),
  ano_fab:        z.string().optional().or(z.literal("")),
  ano_mod:        z.string().optional().or(z.literal("")),
  km:             z.string().optional().or(z.literal("")),
  data_compra:    z.string().optional().or(z.literal("")),
  sem_data_compra:z.boolean().optional(),
  cod_loja:       z.string().min(1, "Selecione o local da compra"),
});

export const atendimentoSchema = z.object({
  id_loja_mapsis:    z.string().min(1, "Selecione a oficina"),
  id_servico_mapsis: z.string().min(1, "Selecione o serviço"),
});

export const horarioSchema = z.object({
  data: z.string().min(1, "Selecione a data"),
  hora: z.string().min(1, "Selecione o horário"),
});

import * as React from "react";
import { cx } from "./ui";

export type StepId = "doc" | "cadastro" | "dados_cliente" | "agendamento" | "contato" | "confirmado";

export const STEPS: Array<{ id: StepId; title: string }> = [
  { id: "doc",          title: "CPF/CNPJ"    },
  { id: "cadastro",     title: "Cadastro"     },
  { id: "dados_cliente",title: "Veículo"      },
  { id: "agendamento",  title: "Agendamento"  },
  { id: "contato",      title: "Contato"      },
  { id: "confirmado",   title: "Concluído"    },
];

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function Stepper({ current }: { current: StepId }) {
  const currentIndex = STEPS.findIndex(s => s.id === current);
  const progress = currentIndex === 0 ? 0 : Math.round((currentIndex / (STEPS.length - 1)) * 100);

  return (
    <div className="stepper-container">
      {/* Mobile */}
      <div className="stepper-mobile">
        <div className="stepper-mobile-top">
          <span className="stepper-step-badge">Etapa {currentIndex + 1} / {STEPS.length}</span>
          <span className="stepper-step-title">{STEPS[currentIndex]?.title}</span>
        </div>
        <div className="stepper-track">
          <div className="stepper-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="stepper-dots">
          {STEPS.map((s, idx) => {
            const done   = idx < currentIndex;
            const active = idx === currentIndex;
            return (
              <div key={s.id} className={cx("stepper-dot", done && "dot-done", active && "dot-active")}>
                {done ? <CheckIcon /> : idx + 1}
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop */}
      <ol className="stepper-desktop">
        {STEPS.map((s, idx) => {
          const done   = idx < currentIndex;
          const active = idx === currentIndex;
          const future = idx > currentIndex;
          return (
            <li key={s.id} className="step-item">
              {idx < STEPS.length - 1 && (
                <div className={cx("step-connector", done && "done")} />
              )}
              <div className={cx("step-bubble", done && "bubble-done", active && "bubble-active", future && "bubble-future")}>
                {done ? <CheckIcon /> : <span style={{ fontSize: 12, fontWeight: 800 }}>{idx + 1}</span>}
              </div>
              <span className={cx("step-label", active && "label-active", done && "label-done")}>{s.title}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

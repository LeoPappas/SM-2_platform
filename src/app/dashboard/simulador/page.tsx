"use client";

import { useMemo, useState } from "react";
import { FlaskConical, RotateCcw, SlidersHorizontal } from "lucide-react";
import { BrandName } from "@/components/brand-name";
import type { DifficultyRating, Importance, PerformanceBand } from "@/lib/database.types";
import {
  DEFAULT_ENGINE_CONFIG,
  calculateNextInterval,
  calculatePriority,
  type EngineConfig,
} from "@/lib/revision-engine";

type ControlTab = "desempenho" | "amostra" | "prioridade";

const performanceBands: PerformanceBand[] = ["muito_ruim", "ruim", "bom", "muito_bom"];
const difficulties: DifficultyRating[] = ["Muito difícil", "Difícil", "Médio", "Fácil", "Muito fácil"];
const importances: Importance[] = ["alta", "media", "baixa"];

export default function SimulatorPage() {
  const [config, setConfig] = useState<EngineConfig>(() => cloneConfig(DEFAULT_ENGINE_CONFIG));
  const [tab, setTab] = useState<ControlTab>("desempenho");
  const scenarios = useMemo(() => runScenarios(config), [config]);

  const updateRecord = <K extends keyof EngineConfig>(
    section: K,
    key: keyof EngineConfig[K],
    value: number,
  ) => {
    setConfig(current => ({
      ...current,
      [section]: {
        ...(current[section] as Record<string, number>),
        [key]: value,
      },
    }));
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Calibração do motor</p>
          <h1 className="page-title">Simulador <BrandName /></h1>
          <p className="page-subtitle">Parâmetros experimentais aplicados aos cenários de validação. O motor ativo não é alterado nesta tela.</p>
        </div>
        <button type="button" onClick={() => setConfig(cloneConfig(DEFAULT_ENGINE_CONFIG))} className="button-secondary"><RotateCcw size={16} /> Restaurar valores</button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="h-fit overflow-hidden rounded-md border border-gray-200 bg-white xl:sticky xl:top-6">
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-4">
            <SlidersHorizontal size={18} className="text-emerald-700" />
            <div>
              <h2 className="text-sm font-semibold text-gray-950">Parâmetros</h2>
              <p className="mt-0.5 text-xs text-gray-500">Valores da rodada atual</p>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50 p-1">
            <TabButton active={tab === "desempenho"} onClick={() => setTab("desempenho")}>Desempenho</TabButton>
            <TabButton active={tab === "amostra"} onClick={() => setTab("amostra")}>Amostra</TabButton>
            <TabButton active={tab === "prioridade"} onClick={() => setTab("prioridade")}>Prioridade</TabButton>
          </div>

          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-4">
            {tab === "desempenho" && (
              <div className="space-y-5">
                <ControlGroup title="Limites gerais">
                  <NumberControl label="Piso (dias)" value={config.minimumIntervalDays} min={1} step={1} onChange={value => setConfig(current => ({ ...current, minimumIntervalDays: value }))} />
                  <NumberControl label="Teto (dias)" value={config.maximumIntervalDays} min={config.minimumIntervalDays} step={1} onChange={value => setConfig(current => ({ ...current, maximumIntervalDays: value }))} />
                </ControlGroup>
                <ControlGroup title="Primeiro retorno">
                  {performanceBands.map(band => <NumberControl key={band} label={bandLabel(band)} value={config.firstIntervals[band]} min={1} step={1} onChange={value => updateRecord("firstIntervals", band, value)} />)}
                </ControlGroup>
                <ControlGroup title="Multiplicador nas revisões">
                  {performanceBands.map(band => <NumberControl key={band} label={bandLabel(band)} value={config.performanceFactors[band]} min={0.1} step={0.1} onChange={value => updateRecord("performanceFactors", band, value)} />)}
                </ControlGroup>
                <ControlGroup title="Ajuste por dificuldade">
                  {difficulties.map(difficulty => <NumberControl key={difficulty} label={difficulty} value={config.difficultyFactors[difficulty]} min={0.1} step={0.1} onChange={value => updateRecord("difficultyFactors", difficulty, value)} />)}
                </ControlGroup>
              </div>
            )}

            {tab === "amostra" && (
              <div className="space-y-5">
                <ControlGroup title="Primeiro retorno">
                  {difficulties.map(difficulty => <NumberControl key={difficulty} label={difficulty} value={config.smallSampleFirstIntervals[difficulty]} min={1} step={1} onChange={value => updateRecord("smallSampleFirstIntervals", difficulty, value)} />)}
                </ControlGroup>
                <ControlGroup title="Multiplicador seguinte">
                  {difficulties.map(difficulty => <NumberControl key={difficulty} label={difficulty} value={config.smallSampleFactors[difficulty]} min={0.1} step={0.1} onChange={value => updateRecord("smallSampleFactors", difficulty, value)} />)}
                </ControlGroup>
              </div>
            )}

            {tab === "prioridade" && (
              <div className="space-y-5">
                <ControlGroup title="Elegibilidade">
                  <NumberControl label="Urgência mínima" value={config.eligibilityThreshold} min={0} max={2} step={0.05} onChange={value => setConfig(current => ({ ...current, eligibilityThreshold: value }))} />
                </ControlGroup>
                <ControlGroup title="Importância no intervalo">
                  {importances.map(importance => <NumberControl key={importance} label={importanceLabel(importance)} value={config.importanceFactors[importance]} min={0.1} step={0.1} onChange={value => updateRecord("importanceFactors", importance, value)} />)}
                </ControlGroup>
                <ControlGroup title="Importância na fila">
                  {importances.map(importance => <NumberControl key={importance} label={importanceLabel(importance)} value={config.priorityImportance[importance]} min={0.1} step={0.1} onChange={value => updateRecord("priorityImportance", importance, value)} />)}
                </ControlGroup>
                <ControlGroup title="Fraqueza na fila">
                  {performanceBands.map(band => <NumberControl key={band} label={bandLabel(band)} value={config.weaknessFactors[band]} min={0.1} step={0.1} onChange={value => updateRecord("weaknessFactors", band, value)} />)}
                </ControlGroup>
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-4">
              <FlaskConical size={18} className="text-teal-700" />
              <div>
                <h2 className="text-sm font-semibold text-gray-950">Cenários longitudinais</h2>
                <p className="mt-0.5 text-xs text-gray-500">Intervalos calculados em cada contato</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {scenarios.longitudinal.map(scenario => (
                <div key={scenario.name} className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.4fr)_8rem] md:items-center">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-950">{scenario.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">{scenario.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {scenario.intervals.map((interval, index) => (
                      <span key={`${scenario.name}-${index}`} className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold tabular-nums ${interval === config.maximumIntervalDays ? "bg-teal-100 text-teal-800" : interval === config.minimumIntervalDays ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                        {index === 0 ? "1º" : `${index + 1}º`} · {interval}d
                      </span>
                    ))}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Último intervalo</span>
                    <strong className="mt-0.5 block text-xl font-semibold tabular-nums text-gray-950">{scenario.intervals.at(-1)} dias</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-4">
              <h2 className="text-sm font-semibold text-gray-950">Montagem da semana · capacidade 4</h2>
              <p className="mt-0.5 text-xs text-gray-500">Prioridade = urgência × fraqueza × importância</p>
            </div>
            <div className="hidden grid-cols-[minmax(10rem,1fr)_7rem_7rem_7rem_7rem] border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 sm:grid">
              <span>Tema</span><span>Urgência</span><span>Fraqueza</span><span>Importância</span><span>Prioridade</span>
            </div>
            <div className="divide-y divide-gray-100">
              {scenarios.weekly.map((item, index) => (
                <div key={item.name} className="grid gap-2 px-4 py-3.5 text-sm sm:grid-cols-[minmax(10rem,1fr)_7rem_7rem_7rem_7rem] sm:items-center">
                  <span className="flex items-center gap-2 font-semibold text-gray-950">
                    <span className={`h-2 w-2 rounded-full ${index < 4 ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {item.name}
                  </span>
                  <span className="tabular-nums text-gray-600">{item.urgency.toFixed(2)}</span>
                  <span className="tabular-nums text-gray-600">{item.weakness.toFixed(1)}</span>
                  <span className="tabular-nums text-gray-600">{item.importance.toFixed(1)}</span>
                  <span className="font-semibold tabular-nums text-gray-950">{item.priority.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
              Selecionados: {scenarios.weekly.slice(0, 4).map(item => item.name).join(", ")} · Atrasado: {scenarios.weekly[4]?.name}
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-md border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-gray-500">Tema cronicamente ruim</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-800">{scenarios.floor.intervalDays} dias</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">O resultado bruto foi {scenarios.floor.rawIntervalDays.toFixed(1)} dias e {scenarios.floor.hitMinimum ? "acionou" : "não acionou"} o piso.</p>
            </section>
            <section className="rounded-md border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-gray-500">Revisão depois da prova</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-teal-800">{scenarios.afterExam.intervalDays} dias</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">Próxima janela em {formatDate(scenarios.afterExam.nextReviewDate)}. Alerta pré-prova: {scenarios.afterExam.fallsAfterExam ? "sim" : "não"}.</p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function runScenarios(config: EngineConfig) {
  const scenario1 = sequence(config, [
    { questions: 20, correct: 16, difficulty: "Médio" as DifficultyRating, importance: "alta" as Importance },
    { questions: 20, correct: 18, difficulty: "Médio" as DifficultyRating, importance: "alta" as Importance },
    { questions: 20, correct: 17, difficulty: "Fácil" as DifficultyRating, importance: "alta" as Importance },
  ]);
  const scenario2 = sequence(config, [
    { questions: 20, correct: 11, difficulty: "Médio" as DifficultyRating, importance: "alta" as Importance },
    { questions: 20, correct: 14, difficulty: "Médio" as DifficultyRating, importance: "alta" as Importance },
    { questions: 20, correct: 10, difficulty: "Difícil" as DifficultyRating, importance: "alta" as Importance },
  ]);
  const scenario3 = sequence(config, [
    { questions: 20, correct: 6, difficulty: "Muito difícil" as DifficultyRating, importance: "alta" as Importance },
    { questions: 15, correct: 7, difficulty: "Difícil" as DifficultyRating, importance: "alta" as Importance },
    { questions: 20, correct: 15, difficulty: "Médio" as DifficultyRating, importance: "alta" as Importance },
  ]);
  const scenario4 = sequence(config, [
    { questions: 10, correct: 9, difficulty: "Muito fácil" as DifficultyRating, importance: "baixa" as Importance },
    { questions: 10, correct: 10, difficulty: "Fácil" as DifficultyRating, importance: "baixa" as Importance },
  ]);

  const weeklyInputs = [
    { name: "Hiponatremia", urgency: 1.4, band: "muito_ruim" as PerformanceBand, importance: "alta" as Importance },
    { name: "Sepse", urgency: 1.17, band: "ruim" as PerformanceBand, importance: "alta" as Importance },
    { name: "Cirrose", urgency: 1.33, band: "bom" as PerformanceBand, importance: "alta" as Importance },
    { name: "DPOC", urgency: 0.9, band: "bom" as PerformanceBand, importance: "media" as Importance },
    { name: "Nefrítica", urgency: 1.25, band: "muito_bom" as PerformanceBand, importance: "baixa" as Importance },
  ];
  const weekly = weeklyInputs.map(item => ({
    ...item,
    weakness: config.weaknessFactors[item.band],
    importance: config.priorityImportance[item.importance],
    priority: calculatePriority({ urgency: item.urgency, performanceBand: item.band, importance: item.importance, config }),
  })).sort((a, b) => b.priority - a.priority);

  const floor = calculateNextInterval({
    questionCount: 20,
    correctCount: 8,
    perceivedDifficulty: "Muito difícil",
    importance: "media",
    previousIntervalDays: 7,
    isFirstContact: false,
    config,
  });
  const afterExam = calculateNextInterval({
    questionCount: 20,
    correctCount: 20,
    perceivedDifficulty: "Muito fácil",
    importance: "baixa",
    previousIntervalDays: config.maximumIntervalDays,
    isFirstContact: false,
    reviewDate: "2026-10-01",
    examDate: "2026-11-30",
    config,
  });

  return {
    longitudinal: [
      { name: "Sepse", description: "Bom desempenho · alta importância", intervals: scenario1 },
      { name: "Insuficiência cardíaca", description: "Desempenho instável · alta importância", intervals: scenario2 },
      { name: "TEP", description: "Amostra pequena no segundo contato", intervals: scenario3 },
      { name: "Vasculite rara", description: "Fácil · baixa importância · amostra pequena", intervals: scenario4 },
    ],
    weekly,
    floor,
    afterExam,
  };
}

function sequence(
  config: EngineConfig,
  contacts: Array<{ questions: number; correct: number; difficulty: DifficultyRating; importance: Importance }>,
) {
  let previous = config.minimumIntervalDays;
  return contacts.map((contact, index) => {
    const result = calculateNextInterval({
      questionCount: contact.questions,
      correctCount: contact.correct,
      perceivedDifficulty: contact.difficulty,
      importance: contact.importance,
      previousIntervalDays: previous,
      isFirstContact: index === 0,
      config,
    });
    previous = result.intervalDays;
    return result.intervalDays;
  });
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-2 border-b border-gray-100 pb-2 text-xs font-semibold text-gray-500">{title}</h3><div className="space-y-2">{children}</div></section>;
}

function NumberControl({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max?: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-600">{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} className="h-9 w-20 rounded-md border border-gray-300 px-2 text-right text-xs font-semibold tabular-nums focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
    </label>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded px-2 py-2 text-[11px] font-semibold ${active ? "bg-white text-emerald-800 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{children}</button>;
}

function cloneConfig(config: EngineConfig): EngineConfig {
  return JSON.parse(JSON.stringify(config)) as EngineConfig;
}

function bandLabel(band: PerformanceBand) {
  return { muito_ruim: "Muito ruim", ruim: "Ruim", bom: "Bom", muito_bom: "Muito bom" }[band];
}

function importanceLabel(importance: Importance) {
  return { alta: "Alta", media: "Média", baixa: "Baixa" }[importance];
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

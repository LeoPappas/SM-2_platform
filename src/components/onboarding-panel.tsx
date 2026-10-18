"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInMonths } from "date-fns";
import { Check, Minus, Plus } from "lucide-react";
import { BrandName } from "@/components/brand-name";
import { METAMED_TOPIC_TOTAL, loadCourseCatalogOptions, type CourseCatalogOption } from "@/lib/course-catalog";
import type { CourseCatalogSource, StudentProfile } from "@/lib/database.types";
import { planningToday } from "@/lib/planning-date";
import { rebalanceAutomaticReviewSlots } from "@/lib/revision-actions";
import { supabase } from "@/lib/supabase";

const weekDays = [
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
  { value: 7, short: "Dom", label: "Domingo" },
];

export function OnboardingPanel({
  userId,
  profile,
  onSaved,
  compact = false,
}: {
  userId: string;
  profile?: StudentProfile | null;
  onSaved: (profile: StudentProfile) => void | Promise<void>;
  compact?: boolean;
}) {
  const [preferredName, setPreferredName] = useState(profile?.preferred_name ?? "");
  const [studyDays, setStudyDays] = useState<number[]>(profile?.study_days?.length ? profile.study_days : [1, 2, 3, 4, 5]);
  const [examDate, setExamDate] = useState(profile?.exam_date ?? "");
  const [dailyCapacity, setDailyCapacity] = useState(profile?.daily_theme_capacity ?? 1);
  const [customDailyCapacity, setCustomDailyCapacity] = useState(Boolean(profile?.daily_capacities));
  const [dailyCapacities, setDailyCapacities] = useState<Record<string, number>>(() => Object.fromEntries(
    weekDays.map(day => [String(day.value), profile?.daily_capacities?.[String(day.value)]
      ?? ((profile?.study_days ?? [1, 2, 3, 4, 5]).includes(day.value) ? profile?.daily_theme_capacity ?? 1 : 0)]),
  ));
  const [weekStartsOn, setWeekStartsOn] = useState(profile?.week_starts_on ?? 1);
  const [timezone, setTimezone] = useState(profile?.timezone ?? "America/Sao_Paulo");
  // Only the MetaMed list and the course catalogs are offered; an old uploaded list must pick one of them.
  const [catalogSource, setCatalogSource] = useState<CourseCatalogSource | null>(
    profile?.course_catalog_source === "upload" ? null : profile?.course_catalog_source ?? null,
  );
  const [catalogReleaseId, setCatalogReleaseId] = useState<string | null>(profile?.course_catalog_release_id ?? null);
  const [courseOptions, setCourseOptions] = useState<CourseCatalogOption[]>([]);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? "");
  const [examInterests, setExamInterests] = useState(profile?.exam_interests?.join(", ") ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [studyExperienceYears, setStudyExperienceYears] = useState(profile?.study_experience_years?.toString() ?? "");
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const weeklyCapacity = customDailyCapacity
    ? studyDays.reduce((total, day) => total + (dailyCapacities[String(day)] ?? dailyCapacity), 0)
    : studyDays.length * dailyCapacity;
  const today = planningToday(timezone);
  const preparationStart = profile?.preparation_start_date ?? today;
  const horizonMonths = useMemo(() => examDate
    ? Math.max(1, differenceInMonths(new Date(`${examDate}T12:00:00`), new Date(`${preparationStart}T12:00:00`)))
    : 12, [examDate, preparationStart]);

  useEffect(() => {
    let active = true;
    loadCourseCatalogOptions()
      .then(options => { if (active) setCourseOptions(options); })
      .catch(() => { if (active) setCoursesError("Não foi possível carregar os cursinhos."); });
    return () => { active = false; };
  }, []);

  const chooseCourse = (releaseId: string | null) => {
    setCatalogSource(releaseId ? "course" : "metamed");
    setCatalogReleaseId(releaseId);
  };

  const toggleDay = (day: number) => {
    const selected = studyDays.includes(day);
    if (selected && studyDays.length === 1) return;
    setStudyDays(current => selected ? current.filter(value => value !== day) : [...current, day].sort());
    setDailyCapacities(current => ({
      ...current,
      [String(day)]: selected ? 0 : Math.max(1, current[String(day)] || dailyCapacity),
    }));
  };

  const changeDailyCapacity = (delta: number) => {
    const nextCapacity = Math.min(20, Math.max(1, dailyCapacity + delta));
    setDailyCapacity(nextCapacity);
    if (!customDailyCapacity) {
      setDailyCapacities(Object.fromEntries(weekDays.map(day => [String(day.value), studyDays.includes(day.value) ? nextCapacity : 0])));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preferredName.trim() || !examDate || studyDays.length === 0) return;
    if (!catalogSource || (catalogSource === "course" && !catalogReleaseId)) {
      setError("Escolha o seu cursinho.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSavedMessage(null);

    try {
      const normalizedInterests = examInterests.split(",").map(value => value.trim()).filter(Boolean);
      const topicTotal = catalogSource === "metamed"
        ? METAMED_TOPIC_TOTAL
        : courseOptions.find(option => option.id === catalogReleaseId)?.itemCount ?? profile?.course_theme_total ?? null;
      const { data, error: saveError } = await supabase
        .from("student_profiles")
        .upsert({
          user_id: userId,
          preferred_name: preferredName.trim(),
          study_days: studyDays,
          daily_theme_capacity: dailyCapacity,
          weekly_review_capacity: weeklyCapacity,
          daily_capacities: customDailyCapacity
            ? Object.fromEntries(weekDays.map(day => [String(day.value), studyDays.includes(day.value)
              ? dailyCapacities[String(day.value)] ?? dailyCapacity : 0]))
            : null,
          week_starts_on: weekStartsOn,
          timezone,
          exam_date: examDate,
          preparation_start_date: preparationStart,
          preparation_horizon_months: horizonMonths,
          course_theme_total: topicTotal,
          course_catalog_source: catalogSource,
          course_catalog_filename: null,
          course_catalog_release_id: catalogSource === "course" ? catalogReleaseId : null,
          birth_date: birthDate || null,
          exam_interests: normalizedInterests,
          city: city.trim() || null,
          study_experience_years: studyExperienceYears ? Number(studyExperienceYears) : null,
          phone_number: phoneNumber.trim() || null,
          onboarding_completed: true,
        }, { onConflict: "user_id" })
        .select()
        .single();

      if (saveError || !data) throw new Error("Não foi possível salvar suas preferências.");
      let planningPending = false;
      try {
        await rebalanceAutomaticReviewSlots({
          userId,
          studyDays: data.study_days,
          dailyCapacity: data.daily_theme_capacity,
          dailyCapacities: data.daily_capacities,
          weekStartsOn: data.week_starts_on,
          timezone: data.timezone,
        });
      } catch {
        planningPending = true;
      }
      await onSaved(data);
      setSavedMessage(planningPending
        ? "Preferências salvas. Alguns estudos ainda precisam ser reorganizados; confira seu plano ao voltar ao Início."
        : "Preferências salvas e planejamento atualizado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar suas preferências.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={compact ? "w-full" : "mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12"}>
      {!compact && (
        <header className="mb-10 max-w-2xl">
          <p className="page-eyebrow">Configuração inicial</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">Como a <BrandName /> entra na sua rotina?</h1>
          <p className="mt-3 text-base leading-7 text-gray-600">Defina sua disponibilidade e a base de temas que será usada no planejamento.</p>
        </header>
      )}

      <form onSubmit={submit} className="space-y-10">
        <FormSection title="Como você quer ser chamado?">
          <label className="block max-w-md">
            <FieldLabel>Vocativo preferido</FieldLabel>
            <input required value={preferredName} onChange={event => setPreferredName(event.target.value)} placeholder="Ex.: Leonardo" className="field-control" />
          </label>
        </FormSection>

        <FormSection title="Quando você costuma estudar?" description="Esses dias orientam o planejamento automático, mas não limitam quando você pode estudar.">
          <div className="grid max-w-3xl grid-cols-4 gap-2 sm:grid-cols-7">
            {weekDays.map(day => {
              const selected = studyDays.includes(day.value);
              return <button key={day.value} type="button" onClick={() => toggleDay(day.value)} aria-pressed={selected} title={day.label} className={`h-11 rounded-md border text-sm font-semibold transition-colors ${selected ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"}`}>{day.short}</button>;
            })}
          </div>
        </FormSection>

        <FormSection title="Qual é sua capacidade habitual por dia?" description="Usaremos esse número para montar o planejamento; blocos extras continuam permitidos.">
          <div className="flex flex-wrap items-center gap-5">
            {!customDailyCapacity && <div className="inline-flex items-center overflow-hidden rounded-md border border-gray-300 bg-white">
              <button type="button" onClick={() => changeDailyCapacity(-1)} className="icon-button rounded-none border-r border-gray-200" aria-label="Reduzir capacidade"><Minus size={16} /></button>
              <span className="w-20 text-center text-sm font-semibold tabular-nums">{dailyCapacity}</span>
              <button type="button" onClick={() => changeDailyCapacity(1)} className="icon-button rounded-none border-l border-gray-200" aria-label="Aumentar capacidade"><Plus size={16} /></button>
            </div>}
            <p className="text-sm text-gray-600"><strong className="font-semibold text-gray-900">{weeklyCapacity} temas por semana</strong> em {studyDays.length} {studyDays.length === 1 ? "dia" : "dias"}</p>
          </div>
          <label className="mt-5 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={customDailyCapacity} onChange={event => setCustomDailyCapacity(event.target.checked)} className="h-4 w-4 accent-blue-700" />
            Definir uma capacidade diferente para cada dia
          </label>
          {customDailyCapacity && (
            <div className="mt-4 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {weekDays.map(day => (
                <label key={day.value} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600">{day.short}</span>
                  <input type="number" aria-label={`Capacidade de ${day.label.toLocaleLowerCase("pt-BR")}`} min={1} max={20} disabled={!studyDays.includes(day.value)} value={studyDays.includes(day.value) ? dailyCapacities[String(day.value)] ?? dailyCapacity : 0} onChange={event => setDailyCapacities(current => ({ ...current, [String(day.value)]: Math.min(20, Math.max(1, Number(event.target.value))) }))} className="field-control disabled:bg-gray-100 disabled:text-gray-500" />
                </label>
              ))}
            </div>
          )}
          <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Sua semana começa em">
              <select value={weekStartsOn} onChange={event => setWeekStartsOn(Number(event.target.value))} className="field-control">
                {weekDays.map(day => <option key={day.value} value={day.value % 7}>{day.label}</option>)}
              </select>
            </Field>
            <Field label="Fuso horário do planejamento">
              <select value={timezone} onChange={event => setTimezone(event.target.value)} className="field-control">
                {[...new Set([timezone, "America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha"])].map(value => <option key={value} value={value}>{timezoneLabel(value)}</option>)}
              </select>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Quando é sua prova-alvo?">
          <label className="block max-w-xs">
            <FieldLabel>Data da prova</FieldLabel>
            <input type="date" required min={today} value={examDate} onChange={event => setExamDate(event.target.value)} className="field-control" />
          </label>
        </FormSection>

        <FormSection title="Qual cursinho você faz?">
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <Choice selected={catalogSource === "metamed"} onClick={() => chooseCourse(null)} title={<>Lista <BrandName /></>} />
            {courseOptions.map(option => (
              <Choice
                key={option.id}
                selected={catalogSource === "course" && catalogReleaseId === option.id}
                onClick={() => chooseCourse(option.id)}
                title={option.label}
              />
            ))}
          </div>
          {coursesError && <p className="mt-3 max-w-3xl text-sm text-amber-800">{coursesError}</p>}
        </FormSection>

        <FormSection title="Para te conhecer melhor" description="Estas informações são opcionais.">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Data de nascimento"><input type="date" max={today} value={birthDate} onChange={event => setBirthDate(event.target.value)} className="field-control" /></Field>
            <Field label="Cidade"><input value={city} onChange={event => setCity(event.target.value)} placeholder="Ex.: São Paulo" className="field-control" /></Field>
            <Field label="Provas de interesse"><input value={examInterests} onChange={event => setExamInterests(event.target.value)} placeholder="Ex.: ENARE, USP, Unifesp" className="field-control" /></Field>
            <Field label="Tempo de estudo em anos"><input type="number" min={0} max={80} step={0.5} value={studyExperienceYears} onChange={event => setStudyExperienceYears(event.target.value)} placeholder="Ex.: 2,5" className="field-control" /></Field>
            <Field label="Celular"><input type="tel" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} placeholder="(11) 99999-9999" className="field-control" /></Field>
          </div>
        </FormSection>

        {error && <div className="max-w-3xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {savedMessage && <div role="status" className="max-w-3xl rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">{savedMessage}</div>}
        <div className="flex max-w-3xl justify-end border-t border-gray-200 pt-6">
          <button type="submit" disabled={submitting} className="button-primary min-w-40"><Check size={16} /> {submitting ? "Salvando..." : compact ? "Salvar alterações" : "Concluir configuração"}</button>
        </div>
      </form>
    </div>
  );
}

function timezoneLabel(value: string) {
  return ({
    "America/Sao_Paulo": "Brasília",
    "America/Manaus": "Manaus",
    "America/Rio_Branco": "Rio Branco",
    "America/Noronha": "Fernando de Noronha",
  } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
}

function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="max-w-4xl border-b border-gray-200 pb-10 last:border-0"><h2 className="text-base font-semibold text-gray-900">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>}<div className="mt-4">{children}</div></section>;
}

function Choice({ selected, onClick, title }: { selected: boolean; onClick: () => void; title: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`flex min-h-14 items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors ${selected ? "border-blue-700 bg-blue-50" : "border-gray-300 bg-white hover:bg-gray-100"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300"}`}>{selected && <Check size={12} />}</span><span className="text-sm font-semibold text-gray-900">{title}</span></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><FieldLabel>{label}</FieldLabel>{children}</label>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-gray-900">{children}</span>;
}

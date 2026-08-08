"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInMonths, format } from "date-fns";
import { Check, FileUp, Link2, Minus, Plus } from "lucide-react";
import { BrandName } from "@/components/brand-name";
import { readCatalogFile, replaceUploadedCatalog, type ParsedCourseTopic } from "@/lib/course-catalog";
import type { CourseCatalogSource, StudentProfile } from "@/lib/database.types";
import { reconcileQuestionBlocksCalendar } from "@/lib/calendar-sync";
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
  const [catalogSource, setCatalogSource] = useState<CourseCatalogSource>(profile?.course_catalog_source ?? "metamed");
  const [catalogFilename, setCatalogFilename] = useState(profile?.course_catalog_filename ?? "");
  const [uploadedTopics, setUploadedTopics] = useState<ParsedCourseTopic[] | null>(null);
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? "");
  const [examInterests, setExamInterests] = useState(profile?.exam_interests?.join(", ") ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [studyExperienceYears, setStudyExperienceYears] = useState(profile?.study_experience_years?.toString() ?? "");
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number ?? "");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(profile?.calendar_sync_enabled ?? false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weeklyCapacity = studyDays.length * dailyCapacity;
  const preparationStart = profile?.preparation_start_date ?? format(new Date(), "yyyy-MM-dd");
  const horizonMonths = useMemo(() => examDate
    ? Math.max(1, differenceInMonths(new Date(`${examDate}T12:00:00`), new Date(`${preparationStart}T12:00:00`)))
    : 12, [examDate, preparationStart]);

  useEffect(() => {
    supabase.auth.getUserIdentities().then(({ data }) => {
      const connected = Boolean(data?.identities.some(identity => identity.provider === "google"));
      setGoogleConnected(connected);
      if (!profile) setCalendarSyncEnabled(connected);
    });
  }, [profile]);

  const toggleDay = (day: number) => {
    setStudyDays(current => current.includes(day)
      ? current.length === 1 ? current : current.filter(value => value !== day)
      : [...current, day].sort());
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      const parsed = await readCatalogFile(file);
      if (parsed.length === 0) throw new Error("Nenhum tema foi encontrado no arquivo.");
      setUploadedTopics(parsed);
      setCatalogFilename(file.name);
      setCatalogSource("upload");
    } catch (cause) {
      setUploadedTopics(null);
      setCatalogFilename("");
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o arquivo.");
    }
  };

  const connectGoogle = async () => {
    setConnectingGoogle(true);
    setError(null);
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard/configuracoes`,
        scopes: "https://www.googleapis.com/auth/calendar.events",
        queryParams: { prompt: "consent", access_type: "offline" },
      },
    });
    if (linkError) {
      setError("Não foi possível iniciar a conexão com o Google Calendar.");
      setConnectingGoogle(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preferredName.trim() || !examDate || studyDays.length === 0) return;
    if (catalogSource === "upload" && !uploadedTopics && !profile?.course_catalog_filename) {
      setError("Escolha a lista de temas do seu cursinho.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      if (catalogSource === "upload" && uploadedTopics) {
        await replaceUploadedCatalog({ filename: catalogFilename, topics: uploadedTopics });
      }

      const normalizedInterests = examInterests.split(",").map(value => value.trim()).filter(Boolean);
      const topicTotal = catalogSource === "metamed" ? 184 : uploadedTopics?.length ?? profile?.course_theme_total ?? null;
      const { data, error: saveError } = await supabase
        .from("student_profiles")
        .upsert({
          user_id: userId,
          preferred_name: preferredName.trim(),
          study_days: studyDays,
          daily_theme_capacity: dailyCapacity,
          weekly_review_capacity: weeklyCapacity,
          exam_date: examDate,
          preparation_start_date: preparationStart,
          preparation_horizon_months: horizonMonths,
          course_theme_total: topicTotal,
          course_catalog_source: catalogSource,
          course_catalog_filename: catalogSource === "upload" ? catalogFilename : null,
          calendar_sync_enabled: googleConnected && calendarSyncEnabled,
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
      await rebalanceAutomaticReviewSlots({
        userId,
        studyDays: data.study_days,
        dailyCapacity: data.daily_theme_capacity,
      });
      const calendarResult = await reconcileQuestionBlocksCalendar(userId);
      await onSaved(data);
      if (calendarResult.failed > 0) {
        setError("As preferências foram salvas, mas alguns eventos do Google Calendar ficaram pendentes e serão tentados novamente.");
      }
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
          <p className="text-xs font-semibold text-emerald-700">Configuração inicial</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950">Como a <BrandName /> entra na sua rotina?</h1>
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
              return <button key={day.value} type="button" onClick={() => toggleDay(day.value)} aria-pressed={selected} title={day.label} className={`h-11 rounded-md border text-sm font-semibold ${selected ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"}`}>{day.short}</button>;
            })}
          </div>
        </FormSection>

        <FormSection title="Qual é sua capacidade habitual por dia?" description="Usaremos esse número para montar o planejamento; blocos extras continuam permitidos.">
          <div className="flex flex-wrap items-center gap-5">
            <div className="inline-flex items-center overflow-hidden rounded-md border border-gray-300 bg-white">
              <button type="button" onClick={() => setDailyCapacity(value => Math.max(1, value - 1))} className="icon-button rounded-none border-r border-gray-200" aria-label="Reduzir capacidade"><Minus size={16} /></button>
              <span className="w-20 text-center text-sm font-semibold tabular-nums">{dailyCapacity}</span>
              <button type="button" onClick={() => setDailyCapacity(value => Math.min(20, value + 1))} className="icon-button rounded-none border-l border-gray-200" aria-label="Aumentar capacidade"><Plus size={16} /></button>
            </div>
            <p className="text-sm text-gray-600"><strong className="font-semibold text-gray-950">{weeklyCapacity} temas por semana</strong> · {dailyCapacity} por dia em {studyDays.length} {studyDays.length === 1 ? "dia" : "dias"}</p>
          </div>
        </FormSection>

        <FormSection title="Quando é sua prova-alvo?">
          <label className="block max-w-xs">
            <FieldLabel>Data da prova</FieldLabel>
            <input type="date" required min={format(new Date(), "yyyy-MM-dd")} value={examDate} onChange={event => setExamDate(event.target.value)} className="field-control" />
          </label>
        </FormSection>

        <FormSection title="Qual lista de temas você quer usar?">
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <Choice selected={catalogSource === "metamed"} onClick={() => setCatalogSource("metamed")} title={<>Lista <BrandName /></>} description="184 aulas do Extensivo R1 2026." />
            <Choice selected={catalogSource === "upload"} onClick={() => setCatalogSource("upload")} title="Lista do meu cursinho" description="Envie um CSV, TSV ou TXT." />
          </div>
          {catalogSource === "upload" && (
            <label className="mt-4 flex max-w-3xl cursor-pointer items-center justify-between gap-4 rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-4 hover:border-emerald-500 hover:bg-emerald-50/40">
              <span className="flex min-w-0 items-center gap-3"><FileUp size={19} className="shrink-0 text-emerald-700" /><span className="truncate text-sm font-medium text-gray-700">{catalogFilename || "Escolher arquivo"}</span></span>
              <span className="shrink-0 text-xs font-semibold text-emerald-700">{uploadedTopics ? `${uploadedTopics.length} temas` : "Procurar"}</span>
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={event => chooseFile(event.target.files?.[0])} className="sr-only" />
            </label>
          )}
        </FormSection>

        <FormSection title="Google Calendar" description="Quando habilitado, todos os blocos de estudo são criados e atualizados automaticamente no seu calendário.">
          {googleConnected ? (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center gap-3 text-sm font-medium text-emerald-800"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-100"><Check size={17} /></span>Google Calendar conectado</div>
              <button
                type="button"
                role="switch"
                aria-checked={calendarSyncEnabled}
                onClick={() => setCalendarSyncEnabled(value => !value)}
                className="flex w-full items-center justify-between gap-5 border-t border-gray-200 pt-4 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-gray-950">Sincronizar blocos de estudo</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500">Alterações de datas, conteúdo e conclusão serão refletidas no Google Calendar.</span>
                </span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${calendarSyncEnabled ? "bg-emerald-700" : "bg-gray-300"}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${calendarSyncEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </span>
              </button>
            </div>
          ) : (
            <button type="button" onClick={connectGoogle} disabled={connectingGoogle} className="button-secondary"><Link2 size={16} /> {connectingGoogle ? "Conectando..." : "Conectar Google Calendar"}</button>
          )}
        </FormSection>

        <FormSection title="Para te conhecer melhor" description="Estas informações são opcionais.">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Data de nascimento"><input type="date" max={format(new Date(), "yyyy-MM-dd")} value={birthDate} onChange={event => setBirthDate(event.target.value)} className="field-control" /></Field>
            <Field label="Cidade"><input value={city} onChange={event => setCity(event.target.value)} placeholder="Ex.: São Paulo" className="field-control" /></Field>
            <Field label="Provas de interesse"><input value={examInterests} onChange={event => setExamInterests(event.target.value)} placeholder="Ex.: ENARE, USP, Unifesp" className="field-control" /></Field>
            <Field label="Tempo de estudo em anos"><input type="number" min={0} max={80} step={0.5} value={studyExperienceYears} onChange={event => setStudyExperienceYears(event.target.value)} placeholder="Ex.: 2,5" className="field-control" /></Field>
            <Field label="Celular"><input type="tel" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} placeholder="(11) 99999-9999" className="field-control" /></Field>
          </div>
        </FormSection>

        {error && <div className="max-w-3xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="flex max-w-3xl justify-end border-t border-gray-200 pt-6">
          <button type="submit" disabled={submitting} className="button-primary min-w-40"><Check size={16} /> {submitting ? "Salvando..." : compact ? "Salvar alterações" : "Concluir configuração"}</button>
        </div>
      </form>
    </div>
  );
}

function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="max-w-4xl border-b border-gray-200 pb-10 last:border-0"><h2 className="text-base font-semibold text-gray-950">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>}<div className="mt-4">{children}</div></section>;
}

function Choice({ selected, onClick, title, description }: { selected: boolean; onClick: () => void; title: React.ReactNode; description: string }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`flex min-h-24 items-start gap-3 rounded-md border p-4 text-left ${selected ? "border-emerald-700 bg-emerald-50" : "border-gray-300 bg-white hover:border-gray-400"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300"}`}>{selected && <Check size={12} />}</span><span><span className="block text-sm font-semibold text-gray-950">{title}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{description}</span></span></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><FieldLabel>{label}</FieldLabel>{children}</label>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-gray-700">{children}</span>;
}

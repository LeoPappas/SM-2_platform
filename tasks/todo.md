# Tarefas: remoção do Google Calendar

Plano: [`tasks/plan.md`](plan.md). Verificação padrão de cada tarefa: `npm test`, `npx tsc --noEmit`, `npm run lint`.

## Fase A — Código

### T1: Separar as escritas protegidas de `question_blocks` da sincronização

**Descrição:** Criar `src/lib/question-block-writes.ts` com `updateQuestionBlock`, `persistAutomaticReviewSchedule` e `deleteQuestionBlock`. Os três mantêm as guardas atuais: `expectedRepetitions`, o filtro `planning_source` nulo/automático com `repetitions` e o escopo por `user_id`, mas não chamam o Calendar. Em seguida, `revision-actions.ts` passa a usar esse módulo, e os retornos deixam de ter `calendar`, `calendarError` e `calendarPending`. Os campos `calendar_sync_status`/`calendar_last_error` saem de `changes`.

**Critérios de aceite:**
- [ ] `scheduleBlockReview`, `unscheduleBlockReview`, `setPreExamReviewRequest`, `rebalanceAutomaticReviewSlots` e `completeBlockReview` não importam nada de `calendar-*`
- [ ] Os testes de concorrência de `revision-actions.test.ts` que não dependem do Calendar continuam passando: revisão idempotente, plano automático antigo não substitui remarcação manual, edição em outra sessão. Os testes do Calendar saem
- [ ] `completeBlockReview` retorna `{ calculation }`

**Dependências:** nenhuma · **Arquivos:** `src/lib/question-block-writes.ts` (novo), `src/lib/revision-actions.ts`, `src/lib/revision-actions.test.ts` · **Tamanho:** M

### T2: Telas de estudo sem Calendar

**Descrição:** Ajustar os consumidores ao novo retorno da T1 e retirar as mensagens "Google Calendar pendente", os selos "Calendar pendente", "Sincronizando" e "Reconectar Calendar" e o texto "O mesmo dia será sincronizado". `topic-form-modal` deixa de enviar `calendar_event_id: null` e de chamar a sincronização. Em Temas, a exclusão passa a usar `deleteQuestionBlock`.

**Critérios de aceite:**
- [ ] Registrar revisão, remarcar, voltar à sugestão automática, criar/editar tema e excluir tema funcionam e mostram só as mensagens de sucesso ou erro da MetaMed
- [ ] Nenhum selo ou texto menciona Calendar ou Google

**Dependências:** T1 · **Arquivos:** `src/components/review-modal.tsx`, `src/components/schedule-review-modal.tsx`, `src/components/topic-form-modal.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/blocos/page.tsx` · **Tamanho:** M

### T3: Configurações sem a seção Google Calendar

**Descrição:** Em `onboarding-panel.tsx`, retirar o estado `google*`/`calendarSyncEnabled`, `connectGoogle`, a `FormSection` "Google Calendar", a chamada a `reconcileCalendar` e a gravação de `calendar_sync_enabled` no perfil. As mensagens de salvamento passam a cobrir só o planejamento.

**Critérios de aceite:**
- [ ] Salvar as preferências não consulta `getUserIdentities` nem grava `calendar_sync_enabled`
- [ ] As mensagens possíveis são: salvo, ou salvo com reorganização pendente

**Dependências:** T1 · **Arquivos:** `src/components/onboarding-panel.tsx` · **Tamanho:** S

### T4: Login com escopos básicos, layout sem reconciliação e limpeza dos tokens antigos

**Descrição:** `handleGoogleLogin` fica sem `scopes`, `prompt` e `access_type`. O layout perde `recoverCalendar`, os listeners de `focus`/`online` e o rastreio de `provider_token`. Cria-se uma limpeza única que remove as 4 chaves `metamed.google_provider_*` do `localStorage`, executada no layout ao montar e no logout. Também sai `persistGoogleProviderToken` de Início, Temas, Calendário, Métricas e Configurações, e o texto "Atualiza a MetaMed e o Google Calendar" em `calendario/page.tsx:225`.

**Critérios de aceite:**
- [ ] O consentimento do Google pede só nome, e-mail e foto
- [ ] Depois de abrir o dashboard, nenhuma chave `metamed.google_provider_*` fica no `localStorage`
- [ ] A troca de usuário e o logout continuam redirecionando corretamente

**Dependências:** nenhuma (pode rodar em paralelo à T1) · **Arquivos:** `src/app/page.tsx`, `src/app/dashboard/layout.tsx`, as 5 páginas do dashboard (uma linha cada), `src/lib/legacy-google-token-cleanup.ts` (novo, com teste) · **Tamanho:** M (mecânica)

### T5: Apagar os módulos mortos, a rota de refresh e os tipos

**Descrição:** Apagar `calendar.ts`, `calendar-auth.ts`, `calendar-sync.ts`, `calendar-sync-state.ts`, `calendar-reconciliation.ts`, `google-provider-token.ts`, os testes de cada um e `src/app/api/google/refresh-token/`. Remover `CalendarSyncStatus` e os campos `calendar_*` de `database.types.ts`. Um teste com referência a Calendar em `performance-metrics.test.ts` deve ser conferido.

**Critérios de aceite:**
- [ ] `npx tsc --noEmit` passa sem os tipos `calendar_*`
- [ ] Um grep por `calendar_sync|calendar_event|provider_token|googleapis` em `src/` não encontra nada

**Dependências:** T1–T4 · **Arquivos:** ~13 arquivos apagados, `src/lib/database.types.ts` · **Tamanho:** S (só exclusões)

### T6: Documentação e configuração

**Descrição:** No README, retirar a seção "Google Calendar" e as linhas 18 e 60 e trocar por uma nota de uma linha sobre a decisão. Tirar `GOOGLE_OAUTH_*` de `.env.example`. Em `scripts/verify-weekly-planning.mjs`, retirar a checagem `calendar_sync_status` e o `calendar_sync_enabled` do insert, ou deixá-los para a T8 se o script rodar contra o schema atual. No roteiro da Fase 0, marcar a seção 5 e o cenário 13 como obsoletos.

**Dependências:** T5 · **Arquivos:** `README.md`, `.env.example`, `scripts/verify-weekly-planning.mjs`, `outputs/MetaMed_fase0_roteiro_2026-10-06.md` · **Tamanho:** S

## Checkpoint A
- [x] `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build` passam
- [ ] Teste manual no preview: login com Google, cadastro de tema, revisão, remarcação, exclusão; nenhuma requisição a `googleapis.com`
- [ ] Revisão humana antes de fazer merge em `main`

## Fase B — Infraestrutura (depois do deploy da Fase A)

### T7: Desligar Calendar no Google Cloud e na Vercel

**Descrição:** São ações manuais ou de painel, e cada uma precisa de confirmação.
- [ ] Vercel: remover `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` dos 3 ambientes (resolve também o alerta `readable-secret`). Remover também do `.env` local
- [ ] Google Cloud: tirar `calendar.events` da tela de consentimento, desativar a Calendar API e publicar o app. Com escopos básicos, não há verificação de escopo sensível
- [ ] Supabase → Providers → Google: **manter**, porque o login depende dele
- [ ] Apagar à mão o único evento "Revisar bloco: …" que sobrou e revogar o acesso da MetaMed em myaccount.google.com/permissions

**Dependências:** Fase A em produção · **Tamanho:** XS

## Fase C — Contract do schema (deploy separado)

### T8: Migration de remoção (escrita e testada; NÃO aplicada no remoto)

> Implementada como `supabase/migrations/20260918235900_drop_google_calendar_sync.sql`, antes da v3 de propósito, com rollback em `supabase/rollbacks/`. A v3 não aplicada e o gerador foram ajustados para não recriar a cláusula do Calendar. Aplicar no remoto só depois do deploy do código da Fase A.

**Descrição:** Uma migration nova que:
1. remove os triggers `apply_profile_calendar_sync_to_blocks` e `inherit_profile_calendar_sync_on_insert` e as funções com o mesmo nome;
2. redefine `complete_block_review` (a versão da v3) sem a linha `calendar_sync_status = …, calendar_last_error = null`;
3. remove os índices `question_blocks_user_calendar_sync_status_idx` e `question_blocks_calendar_reconciliation_idx` e a constraint `question_blocks_calendar_sync_status_check`;
4. remove as colunas `question_blocks.calendar_event_id/_sync_enabled/_sync_status/_last_error/_last_synced_at/_sync_fingerprint` e `student_profiles.calendar_sync_enabled`.

O caminho de volta recria as colunas com os defaults de antes. Perder um `calendar_event_id` é aceitável.

**Critérios de aceite:**
- [ ] Aplicada e testada numa branch do Supabase: registrar revisão pela RPC, criar tema e salvar preferências
- [ ] `scripts/verify-weekly-planning.mjs` passa sem referência ao Calendar
- [ ] As advisories do Supabase não mostram regressão

**Dependências:** T7 e relevância v3 aplicada no remoto · **Arquivos:** `supabase/migrations/<timestamp>_drop_google_calendar_sync.sql`, `scripts/verify-weekly-planning.mjs` · **Tamanho:** S

# MetaMed Revisao

Plataforma semanal de revisao por temas para estudantes de medicina. O aluno cadastra o primeiro contato, informa seu desempenho e escolhe em quais dias da semana realizara as revisoes priorizadas pelo motor MetaMed.

## Escopo do MVP

- Onboarding com vocativo, dias de estudo, capacidade por dia, inicio da semana, fuso, prova-alvo e dados opcionais de perfil.
- Rotina habitual com ajuste por semana, pausa com capacidade zero e restauracao do padrao.
- Catalogo MetaMed com 184 aulas ou importacao privada de CSV/TSV do cursinho.
- Cinco grandes areas fixas e especialidades padronizadas.
- Cadastro por selecao no catalogo vigente; a base canonica e a relevancia numerica propostas ainda aguardam validacao editorial.
- Motor deterministico proprio, isolado da interface.
- Regra de amostra pequena para menos de 20 questoes.
- Planejamento semanal: atrasos FIFO, revisoes devidas por prioridade e antecipacoes elegiveis somente com vagas restantes.
- Atraso criado apos o fechamento da semana, com ocorrencia unica e antiguidade preservada.
- Movimentacao manual por arrastar ou escolher data, inclusive fora da rotina e em semanas futuras.
- Previa da proxima semana sem alterar a agenda automatica da semana atual.
- Conclusao de revisao atomica e idempotente; falha do Calendar preserva o estudo salvo.
- Decisao manual para uma ultima revisao antes da prova.
- Calendario com distincao entre janela calculada e dia escolhido.
- Metricas de progressao e desempenho por grande area ponderadas pela quantidade de questoes.
- Simulador interativo dos parametros do motor.

Banco de questoes, flashcards, IA e rankings nao fazem parte deste MVP.

## Motor MetaMed v1

O codigo do motor esta em `src/lib/revision-engine.ts` e seus cenarios de validacao em `src/lib/revision-engine.test.ts`.

Valores iniciais:

- Piso de 7 dias e teto de 180 dias.
- Desempenho: muito ruim, ruim, bom e muito bom.
- Importancia: alta, media e baixa.
- Dificuldade percebida em cinco niveis.
- Amostras abaixo de 20 questoes usam a dificuldade como fator principal.
- Antecipacao elegivel a partir de urgencia 0,8, apos os atrasos e revisoes devidas da semana.
- Prioridade: urgencia x fraqueza x importancia.

Os valores experimentais podem ser alterados em `/dashboard/simulador` sem afetar o motor ativo.

## Requisitos

- Node.js 20.9 ou superior
- npm
- Projeto Supabase com Google OAuth habilitado

## Configuracao

Crie um arquivo `.env` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

As credenciais privadas do Google permanecem no servidor e sao usadas para renovar o token de acesso ao Calendar.

## Banco de dados

A evolucao semanal do MVP esta em:

```text
supabase/migrations/20260712164450_metamed_weekly_planner.sql
supabase/migrations/20260806212017_student_profile_and_course_catalog.sql
supabase/migrations/20260806213252_course_topics_area_uniqueness.sql
supabase/migrations/20260806213415_atomic_course_topic_replacement.sql
supabase/migrations/20260918230725_weekly_availability_and_review_occurrences.sql
```

A migration e aditiva, preserva os blocos existentes e cria:

- `student_profiles`
- preferencias de disponibilidade, vocativo e dados opcionais em `student_profiles`
- `course_topics` para listas privadas enviadas pelo aluno
- `weekly_plans`
- `weekly_plan_items` com ocorrencias, fechamento, divida e historico de reagendamento
- RPCs para disponibilidade semanal, fechamento idempotente e conclusao atomica de revisao
- classificacao medica, importancia e metadados do motor em `question_blocks`
- data escolhida, backlog congelado e decisao pre-prova
- metadados estruturados do calculo em `block_reviews`

Antes de aplicar em um projeto vinculado, confira o historico:

```bash
npx supabase migration list
npx supabase db push --linked --dry-run
```

Nao repare divergencias de historico automaticamente sem confirmar como o schema remoto foi criado.

A entrega de setembro depende da migracao `20260918230725_weekly_availability_and_review_occurrences.sql`. Aplique-a antes de publicar o frontend correspondente. A verificacao isolada pode ser reproduzida com PostgreSQL via PGlite, instalado fora das dependencias da aplicacao:

```powershell
$weeklyVerificationDir = Join-Path $env:TEMP 'metamed-pglite-verify'
npm install --prefix $weeklyVerificationDir --no-save @electric-sql/pglite
$env:PGLITE_MODULE = Join-Path $weeklyVerificationDir 'node_modules/@electric-sql/pglite/dist/index.js'
node scripts/verify-weekly-planning.mjs
```

## Desenvolvimento local

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Verificacao

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Google Calendar

O motor calcula a proxima sugestao e o planejador escolhe um dia automatico quando ha capacidade. O aluno pode remarcar esse dia manualmente. Com sincronizacao habilitada, cada tema possui um evento ativo para sua proxima revisao; depois do estudo, o evento e atualizado para a nova data. O historico de revisoes permanece na MetaMed.

As configuracoes permitem vincular ou reconectar Google. A recuperacao de pendencias ocorre ao abrir o dashboard, recuperar foco/conexao ou receber um novo token OAuth. Falhas sao registradas separadamente do salvamento do estudo; uma resposta externa antiga nao substitui a preferencia ou o agendamento mais recente.

# MetaMed Revisao

Plataforma semanal de revisao por temas para estudantes de medicina. O aluno cadastra o primeiro contato, informa seu desempenho e escolhe em quais dias da semana realizara as revisoes priorizadas pelo motor MetaMed.

## Escopo do MVP

- Onboarding com vocativo, dias de estudo, capacidade diaria, prova-alvo e dados opcionais de perfil.
- Capacidade semanal derivada dos dias disponiveis multiplicados pela capacidade diaria.
- Catalogo MetaMed com 184 aulas ou importacao privada de CSV/TSV do cursinho.
- Cinco grandes areas fixas e especialidades padronizadas.
- Tema final livre, com catalogo inicial e importancia sugerida editavel.
- Motor deterministico proprio, isolado da interface.
- Regra de amostra pequena para menos de 20 questoes.
- Planejamento semanal por elegibilidade, prioridade e capacidade.
- Fila de atrasados com urgencia congelada e extras voluntarios.
- Decisao manual para uma ultima revisao antes da prova.
- Calendario com distincao entre janela calculada e dia escolhido.
- Metricas de progressao e desempenho por grande area.
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
- Elegibilidade semanal a partir de urgencia 0,8.
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
```

A migration e aditiva, preserva os blocos existentes e cria:

- `student_profiles`
- preferencias de disponibilidade, vocativo e dados opcionais em `student_profiles`
- `course_topics` para listas privadas enviadas pelo aluno
- `weekly_plans`
- classificacao medica, importancia e metadados do motor em `question_blocks`
- data escolhida, backlog congelado e decisao pre-prova
- metadados estruturados do calculo em `block_reviews`

Antes de aplicar em um projeto vinculado, confira o historico:

```bash
npx supabase migration list
npx supabase db push --linked --dry-run
```

Nao repare divergencias de historico automaticamente sem confirmar como o schema remoto foi criado.

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

O motor calcula uma janela, nao um compromisso. Um evento so e criado quando o aluno escolhe um dia. Depois da revisao, o evento permanece como historico e a proxima janela volta a ficar sem dia ate uma nova escolha.

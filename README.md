# MetaMed Revisao

Plataforma semanal de revisao por temas para estudantes de medicina. O aluno cadastra o primeiro contato, informa seu desempenho e escolhe em quais dias da semana realizara as revisoes priorizadas pelo motor MetaMed.

## Escopo do MVP

- Onboarding com vocativo, dias de estudo, capacidade por dia, inicio da semana, fuso, prova-alvo e dados opcionais de perfil.
- Rotina habitual com ajuste por semana, pausa com capacidade zero e restauracao do padrao.
- Catalogo MetaMed com 184 aulas ou importacao privada de CSV/TSV do cursinho.
- Cinco grandes areas fixas e especialidades padronizadas.
- Cadastro por selecao no catalogo vigente de 184 aulas. A base canonica v3 esta validada estruturalmente em staging, mas continua inativa enquanto as pendencias editoriais e de proveniencia sao reconciliadas.
- Motor deterministico proprio, isolado da interface.
- Regra de amostra pequena para menos de 20 questoes.
- Planejamento semanal: atrasos FIFO, revisoes devidas por prioridade e antecipacoes elegiveis somente com vagas restantes.
- Atraso criado apos o fechamento da semana, com ocorrencia unica e antiguidade preservada.
- Movimentacao manual por arrastar ou escolher data, inclusive fora da rotina e em semanas futuras.
- Previa da proxima semana sem alterar a agenda automatica da semana atual.
- Conclusao de revisao atomica e idempotente.
- Decisao manual para uma ultima revisao antes da prova.
- Calendario com distincao entre janela calculada e dia escolhido.
- Metricas de progressao e desempenho por grande area ponderadas pela quantidade de questoes.
- Escolha do cursinho (Lista MetaMed, Medway, MedCof ou Medcurso) e cadastro de temas pela lista de aulas dele, com busca por sinonimos e tema proprio.

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

## Requisitos

- Node.js 20.9 ou superior
- npm
- Projeto Supabase com Google OAuth habilitado
- Python 3.11 e `openpyxl` 3.1 ou superior apenas para regenerar a carga da relevancia v3 a partir da planilha-fonte

## Configuracao

Crie um arquivo `.env` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Banco de dados

A evolucao semanal do MVP esta em:

```text
supabase/migrations/20260712164450_metamed_weekly_planner.sql
supabase/migrations/20260806212017_student_profile_and_course_catalog.sql
supabase/migrations/20260806213252_course_topics_area_uniqueness.sql
supabase/migrations/20260806213415_atomic_course_topic_replacement.sql
supabase/migrations/20260918230725_weekly_availability_and_review_occurrences.sql
supabase/migrations/20260927180243_relevance_catalog_v3_foundation.sql
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

## Relevancia v3 e catalogos dos cursinhos

A v3 e uma publicacao imutavel e versionada: taxonomia canonica de 492 temas, os catalogos Medway (172 aulas), MedGrupo/Medcurso (90) e MedCof (658), 1.235 vinculos ponderados e a relevancia GLOBAL/2026. A planilha `MetaMed_relevancia_v3.xlsx`, sem a aba `leia-me`, e a fonte da verdade. A plataforma acrescenta apenas o sinonimo `ICC` em `CM-CAR-004`, registrado em `PLATFORM_ALIAS_ADDITIONS` e no relatorio de validacao. `MC-186` fica reservado por tombstone; `MC-375` e o item mantido.

Desde 18/10/2026 as duas migracoes estao no Supabase remoto (`relevance_catalog_v3_foundation` e `activate_course_catalogs`). Os tres catalogos estao ativos e o aluno escolhe entre Lista MetaMed, Medway, MedCof e Medcurso no onboarding ou em Configuracoes. Ao registrar um tema, a aula guarda `catalog_item_id`, a versao e a nota da publicacao; a importancia sugerida vem da nota (>= 7,5 alta, <= 3,5 baixa, demais media) e entra no motor categorico atual. O motor numerico continua inativo: nenhuma ativacao `shadow` foi criada.

A migracao embute os temas e as aulas num unico documento JSON conferido por MD5, o que a mantem em cerca de 260 KB. Como ainda e grande demais para uma chamada do conector, ela foi aplicada assim: o texto exato do arquivo foi gravado em partes num schema privado temporario, cada parte conferida por MD5, e uma migracao curta conferiu o MD5 do arquivo inteiro, executou o conteudo e apagou o schema. O registro remoto mostra esse carregador, nao o SQL completo.

Para conferir as fontes sem gerar arquivos, defina a pasta que contem os dois documentos e execute cada linha separadamente:

```powershell
$relevanceSourceDir = 'C:\caminho\para\SM2'
python scripts/generate-relevance-catalog-v3.py --workbook (Join-Path $relevanceSourceDir 'MetaMed_relevancia_v3.xlsx') --technical-document (Join-Path $relevanceSourceDir 'MetaMed_relevancia_documento_tecnico_v2') --check-only
```

A verificacao isolada da migracao tambem usa PGlite fora das dependencias da aplicacao:

```powershell
$relevanceVerificationDir = Join-Path $env:TEMP 'metamed-pglite-relevance-verify'
npm install --prefix $relevanceVerificationDir --no-save @electric-sql/pglite
$env:PGLITE_MODULE = Join-Path $relevanceVerificationDir 'node_modules/@electric-sql/pglite/dist/index.js'
node scripts/verify-relevance-catalog.mjs
```

A ativacao do modo `shadow` do motor continua sendo uma decisao separada e auditavel. A transformacao experimental da nota fica em `src/lib/relevance-engine.ts`; snapshots de comparacao em revisoes reais so sao criados no banco quando existe uma ativacao GLOBAL em modo `shadow`. O modo ativo ainda nao existe nesta versao e deve ser introduzido por outra migracao somente depois da calibracao.

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

As verificacoes de banco rodam em PGlite isolado, sem credenciais. Instale `@electric-sql/pglite` fora do projeto e aponte `PGLITE_MODULE` para o seu `dist/index.js`:

```bash
PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite/dist/index.js npm run verify:db
```

## Agenda e login com Google

O motor calcula a proxima sugestao e o planejador escolhe um dia automatico quando ha capacidade. O aluno pode remarcar esse dia manualmente; o historico de revisoes e a agenda ficam na MetaMed.

A sincronizacao com o Google Calendar foi removida em outubro de 2026: o escopo `calendar.events` exige verificacao do Google, o token de refresh ficava no navegador e a sincronizacao so rodava com o app aberto. O login com Google continua, apenas com nome e e-mail, e o provedor Google e configurado no Supabase Auth, sem variaveis de ambiente neste projeto.

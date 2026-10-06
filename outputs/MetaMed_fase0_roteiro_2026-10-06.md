# MetaMed — Fase 0: publicar o que existe e começar o ensaio

Data: 06/10/2026. Complementa `MetaMed_reuniao_vs_plataforma_2026-10-04.md` (seção 5, Fase 0). Este documento registra o que foi executado, o que foi verificado e o que depende de acessos que a automação não tem (projeto Supabase MetaMed, Vercel, Google Cloud).

## 1. Situação dos cinco passos

| # | Passo | Situação | Quem |
|---|---|---|---|
| 1 | Enviar os 4 commits de design system para `origin/dev` e conferir o preview | Executado; ver seção 2 | Automação |
| 2 | Reconciliar o histórico de migrations do Supabase | **Pendente**: exige acesso ao projeto `qwrlokkaxhtogmcgablr` (seção 3) | Leonardo |
| 3 | PR `dev → main`, publicar, desligar o projeto Vercel duplicado | PR aberto. Merge e Vercel dependem de decisão e acesso (seção 4) | Leonardo |
| 4 | Validar o Google com conta real e conferir o modo do app OAuth | **Pendente**: exige login real e o Google Cloud (seção 5) | Leonardo |
| 5 | Ensaio de 3 semanas | Roteiro pronto (seção 6); a execução é de vocês | Leonardo, Gabriel, Pejoy |

## 2. Verificações antes de publicar

| Verificação | Resultado |
|---|---|
| Commits locais de design system (4) | Só classes de estilo, tokens, fontes e tamanho de SVG; nenhuma linha de lógica, handler ou acesso a dados |
| `npm test` | 91 testes em 11 arquivos passaram |
| `npx tsc --noEmit` e `npm run lint` | Sem erros |
| `npm run build` | Passou; 9 rotas geradas |
| Objetos de banco usados pelo frontend da `dev` | 7 tabelas e 5 funções (`prepare_weekly_plan`, `save_weekly_availability`, `reset_weekly_availability`, `complete_block_review`, `replace_course_topics`). Todos existem no remoto; as funções respondem "permissão negada" para a chave anon, o esperado |
| Dependência de tabelas da relevância v3 | Nenhuma. O frontend só as referencia em `database.types.ts`; a migration v3 **não** precisa ser aplicada para publicar |

Limite da verificação: a sondagem usa a chave pública, sem sessão de aluno. Ela confirma que os objetos existem e estão protegidos, mas não executa as funções. Isso só se prova no fluxo autenticado (seção 5 e ensaio).

## 3. Reconciliar o histórico de migrations (passo 2)

### Por que importa

A migration de setembro foi aplicada no remoto em 04/10 como versão `20261004230438`, mas o arquivo local se chama `20260918230725_weekly_availability_and_review_occurrences.sql`. Se alguém rodar `supabase db push` agora:

1. O CLI vê `20260918230725` como não aplicada e tenta executá-la de novo; ela falha em `add column` porque as colunas já existem.
2. A migration v3 (`20260927180243`) é mais antiga que a versão remota `20261004230438`, e o CLI recusa inserir migrations antes da última aplicada.

Renomear o arquivo local para `20261004230438` não resolve: a v3 depende da migration de setembro e ficaria ordenada antes dela.

### Procedimento (nesta ordem; nada abaixo altera dados de alunos)

Pré-requisito: `npx supabase login` e projeto vinculado (`supabase/.temp/project-ref` já aponta para `qwrlokkaxhtogmcgablr`).

**a) Somente leitura: ver o desalinhamento.**

```bash
npx supabase migration list --linked
```

Anote cada versão que aparece só no remoto e cada uma só no local. Os documentos de 04/10 já registram que há diferenças anteriores a setembro.

**b) Somente leitura: provar que o SQL remoto equivale ao arquivo.** No SQL Editor do Supabase:

```sql
select version, name, array_length(statements, 1) as statements
from supabase_migrations.schema_migrations
order by version;

select statements from supabase_migrations.schema_migrations
where version = '20261004230438';
```

Compare o conteúdo de `statements` com o arquivo local (diff). Só prossiga se forem equivalentes. Faça o mesmo para qualquer outro par remoto/local do passo (a).

**c) Reparar apenas o registro do histórico**, depois de provar a equivalência:

```bash
npx supabase migration repair --status reverted 20261004230438
npx supabase migration repair --status applied 20260918230725
npx supabase migration list --linked
```

`repair` só edita a tabela de histórico; não executa SQL. Depois, a lista deve mostrar `20260918230725` aplicada nos dois lados.

**d) Conferir o efeito esperado.**

```bash
npx supabase db push --linked --dry-run
```

Deve listar **somente** `20260927180243_relevance_catalog_v3_foundation.sql` (e outras migrations locais realmente pendentes). Se listar `20260918230725`, o passo (c) não pegou.

**Não aplique a v3 nesta fase.** Ela pertence à Fase 2 e só deve entrar depois de verificada em uma branch do Supabase.

## 4. PR e publicação (passo 3)

- PR `dev → main` com todos os commits desde `92b4760` (planejamento semanal, relevância v3 em staging, correção do início, design system e documentos).
- Publicar é fazer o merge: a Vercel publica a `main`. O código novo substitui a versão de 08/08 e passa a usar as funções de setembro, que já estão no banco.
- **Reversão:** no painel da Vercel, promover novamente o deploy de produção anterior (`92b4760`), ou reverter o merge. O banco não precisa voltar atrás, porque a migration de setembro é aditiva.

### Projeto Vercel duplicado

Os mesmos commits geram deploys em dois projetos do time `leopappas-projects`:

| Projeto | Deploy de produção atual |
|---|---|
| `sm-2-platform` | `sm-2-platform-cixr3yb9p-leopappas-projects.vercel.app` |
| `sm-2-platform-c2mn` | `sm-2-platform-c2mn-qcgjwyqx6-leopappas-projects.vercel.app` |

A automação não enxerga qual deles tem o domínio de produção e as variáveis de ambiente. No painel da Vercel:

1. Em cada projeto, confira **Settings → Domains** e **Settings → Environment Variables** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, em Production **e** Preview).
2. Mantenha o que tem o domínio usado pelos alunos.
3. No outro, use **Settings → Git → Disconnect** em vez de excluir: é reversível e interrompe os deploys duplicados.
4. No Supabase (**Authentication → URL Configuration**), confirme que o domínio mantido está em Site URL e Redirect URLs, incluindo `/dashboard/configuracoes` e um padrão para os previews.

## 5. Validar o Google com conta real (passo 4)

### Conferências de configuração (5 minutos)

1. **Google Cloud → APIs e serviços → Tela de consentimento OAuth.** Se o status de publicação for **Testing**, os refresh tokens expiram em 7 dias para escopos sensíveis como `calendar.events`. É uma causa provável da desconexão vista na reunião. Alternativas: publicar o app (o Google exige verificação para escopos sensíveis, que leva dias a semanas; até lá, aparece o aviso de app não verificado) ou aceitar a reconexão semanal durante o ensaio e registrar isso.
2. **Mesmo cliente OAuth nos dois lados.** O ID e o segredo em **Supabase → Authentication → Providers → Google** precisam ser os mesmos de `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` na Vercel. A rota `/api/google/refresh-token` renova o token com as variáveis da Vercel; se forem de outro cliente, a renovação falha com `invalid_client` ou `unauthorized_client`.
3. **URI de redirecionamento** `https://qwrlokkaxhtogmcgablr.supabase.co/auth/v1/callback` cadastrada no cliente OAuth.

### Teste com conta real (no deploy publicado, não em `localhost`)

| Passo | Esperado |
|---|---|
| Entrar com Google | Chega ao Início; sem erro de planejamento |
| Configurações → conectar/reconectar Google Calendar → ativar sincronização | Mensagem de preferências salvas; sem pendência |
| Registrar um tema e uma revisão | Um evento por tema no Google Calendar, com a data correta |
| Remarcar o dia do tema | O mesmo evento muda de data; não cria outro |
| Fechar a aba, esperar mais de 1 hora, reabrir e remarcar | Atualiza sem pedir novo login (prova a renovação do token) |
| Entrar em um segundo dispositivo e remarcar | Lembre que o refresh token fica só no navegador de cada aparelho; anote o que acontece |
| Revogar o acesso em myaccount.google.com/permissions e remarcar | Estudo salvo; aviso de Calendar pendente; botão de reconectar visível; ao reconectar, a pendência é recuperada |

Qualquer falha vira issue com o rótulo `calendar`.

## 6. Roteiro do ensaio (passo 5)

### Perfis sugeridos

| Perfil | Rotina | Foco do teste |
|---|---|---|
| A. Rotina fixa | Segunda a sexta, 2 por dia | Fluxo básico, atrasos, FIFO |
| B. Internato em rodízio | Muda a cada semana; semana começa no domingo | Ajuste semanal, capacidade zero, próxima semana |
| C. Plantão irregular | Dias e capacidades diferentes por dia | Capacidade por dia, dias fora da rotina, movimentação |

Cada pessoa cadastra de 10 a 15 temas com resultados variados (alguns com menos de 20 questões).

### Como testar atraso sem esperar semanas

A data do primeiro contato aceita datas passadas. Cadastre alguns temas com primeiro contato de 3 a 6 semanas atrás: a primeira revisão cai em semanas já encerradas, e o fechamento da semana cria a dívida na hora. Isso permite verificar FIFO, antiguidade e distribuição logo no primeiro dia. A revisão também aceita data retroativa, entre o último contato e hoje.

### Cenários prioritários (do plano de 18/09, seção 13)

| # | Cenário | Como provocar | Esperado |
|---|---|---|---|
| 1 | Tema de quinta não feito na sexta | Deixar passar um dia sem concluir | Continua em "Por fazer" da mesma semana |
| 2 | Semana encerra com tarefas abertas | Primeiro contato retroativo | Uma dívida por ocorrência, mais antigas primeiro |
| 3 | Várias semanas sem entrar | Primeiros contatos de 5 semanas atrás | Uma dívida por ocorrência; antiguidade preservada |
| 4 | Excedente de capacidade | Mais revisões que vagas | "Pendentes nesta semana", sem virar atraso |
| 5 | Capacidade diferente por dia | Perfil C | Contagem correta por dia na faixa da semana |
| 6 | Exceção só desta semana | "Ajustar esta semana" | A semana seguinte volta ao padrão |
| 7 | Semana com capacidade zero | Zerar todos os dias | Nenhuma distribuição automática; escolha manual continua |
| 8 | Mover para dia fora da rotina e para outra semana | Arrastar ou botão de calendário | Escolha preservada; vira "Extra"; não registra revisão |
| 9 | Reabrir o Início após mover para a semana seguinte | Recarregar | A data escolhida não volta |
| 10 | Antecipar uma revisão | Registrar antes da data sugerida | Próxima sugestão parte da data real |
| 11 | Salvar a mesma revisão em dois dispositivos | Duas abas | Um único contato registrado |
| 12 | Amostra de 19 versus 20 questões | Duas revisões | Aviso e modo de cálculo mudam no limite |
| 13 | Calendar sem autorização | Seção 5 | Estudo salvo; pendência identificada; recuperação |
| 14 | Mudar o dia de início da semana | Configurações | Semanas já encerradas não mudam |

A lista completa tem 28 cenários no plano de 18/09; estes 14 cobrem o que a reunião tornou prioritário.

### O que medir

- Cumprimento do plano: revisões concluídas ÷ planejadas por semana.
- Número de remarcações manuais por semana.
- Carga prevista versus carga percebida (pergunta de 1 a 5 no fim da semana).
- Dívida acumulada, em quantidade de ocorrências atrasadas.
- Frequência com que cada tema voltou.
- Tela e momento em que a pessoa travou ou ficou em dúvida.

### Modelo de issue

```
Título: [tela] resumo em uma linha
Perfil / semana: A, B ou C · semana de dd/mm
Passos:
1. ...
Esperado:
Observado:
Evidência: captura de tela ou gravação
Rótulo: ensaio · calendar | semana | cadastro | desempenho | visual
```

### Ritmo sugerido

| Semana | Objetivo |
|---|---|
| 1 | Cadastro dos temas, configuração das rotinas, cenários 1 a 8; triagem das issues no fim da semana |
| 2 | Cenários 9 a 14; testar o aviso de início de semana (ainda não existe, anotar a expectativa) |
| 3 | Uso livre; medir cumprimento, remarcações e dívida; conversa de fechamento entre Gabriel e Leonardo |

O resultado orienta o que entra na Fase 1 e a calibração da Fase 3.

# MetaMed — Fase 0: publicar o que existe e começar o ensaio

Data: 06/10/2026, atualizado na mesma data após a segunda passada, já com acesso ao projeto Supabase MetaMed e à Vercel. Complementa `MetaMed_reuniao_vs_plataforma_2026-10-04.md` (seção 5, Fase 0) e **substitui a descrição de ambientes daquele documento**, que era de 04/10.

## 1. Situação dos cinco passos

| # | Passo | Situação |
|---|---|---|
| 1 | Enviar os 4 commits de design system para `origin/dev` | Executado |
| 2 | Reconciliar o histórico de migrations do Supabase | **Verificado, sem alteração por decisão.** SQL remoto idêntico ao local nas 11 migrations. O `supabase db push` deste repositório é inviável pelas razões da seção 3 |
| 3 | PR `dev → main`, publicar, desligar o projeto Vercel duplicado | Executado. PR #3 mesclado (`c3cab9e`); produção publicada. `sm-2-platform` pausado em 06/10; o oficial é `sm-2-platform-c2mn` |
| 4 | Validar o Google com conta real | **Parcial.** Lado Vercel verificado (seção 5). Falta o teste com login real e as conferências no Google Cloud e no Supabase Auth |
| 5 | Ensaio de 3 semanas | Roteiro pronto (seção 6). O banco ainda tem 1 tema e 1 revisão: o ensaio não começou |

## 2. Verificações

| Verificação | Resultado |
|---|---|
| Commits de design system | Só classes de estilo, tokens, fontes e tamanho de SVG; nenhuma lógica |
| `npm test`, `tsc`, `lint`, `build` | 91 testes passaram; sem erros; build gerou 9 rotas |
| Objetos de banco usados pelo frontend | 7 tabelas e 5 funções existem no remoto; nada da relevância v3 é usado |
| Deploy de produção | Os dois projetos Vercel têm `c3cab9e` em produção, estado READY |
| Erros de runtime (7 dias) | Nenhum, nos dois projetos |
| Login em produção (`sm-2-platform-c2mn.vercel.app`) | Renderiza com o novo design |
| URLs `.vercel.app` de produção | Públicas (HTTP 200). A proteção SSO só vale para URLs de preview e de deploy específico |

Limite: nada disso cobre o fluxo autenticado de um aluno (login Google, registro de revisão, sincronização). Isso depende do teste da seção 5 e do ensaio.

## 3. Histórico de migrations

### O que foi verificado

Comparei o SQL registrado no remoto (`supabase_migrations.schema_migrations`) com cada arquivo local, ignorando comentários, espaços e `;`. As 11 migrations do MetaMed são **idênticas**. Não há desvio de schema. Só os números de versão diferem:

| Arquivo local | Versão registrada no remoto | Mesmo número? |
|---|---|---|
| `20260604010000_question_blocks_schema` | `20260605005505` | Não |
| `20260604011000_question_blocks_advisor_fixes` | `20260605011004` | Não |
| `20260705000000` a `20260807221210` (8 arquivos) | idêntica ao nome do arquivo | Sim |
| `20260918230725_weekly_availability_and_review_occurrences` | `20261004230438` | Não |
| `20260604000000_initial_schema` | não registrada | Só local |
| `20260927180243_relevance_catalog_v3_foundation` | não registrada | Só local, intencional |

### Por que o plano original (reparar o histórico e usar `db push`) não serve

1. **O projeto Supabase é compartilhado.** Além das tabelas do MetaMed, o banco guarda o MetaAssist (usuários, decks do Brainscape), o CRM e o creative_os. O histórico remoto tem duas migrations que não são deste repositório: `20260512234535 create_creative_os_schema` e `20260531233025 create_crm_schema`. Pelo comportamento documentado do CLI (não executei o comando, que exige credenciais do banco), enquanto existirem versões remotas ausentes localmente o `supabase db push` recusa executar. A saída padrão, marcá-las como `reverted`, apagaria o registro de outros produtos.
2. **O conector grava a versão com a hora da aplicação.** Toda migration aplicada por `apply_migration` ganha um número diferente do nome do arquivo, como aconteceu em 04/10. Reparar uma vez não impede a divergência de voltar na próxima.
3. **`20260604000000_initial_schema.sql` é uma armadilha.** Nunca foi registrada no remoto e é superada pela `question_blocks_schema`, que apaga `themes` e `study_sessions`. Aplicá-la de novo (por exemplo com `db push --include-all`) recriaria essas tabelas em produção.

Verificado e descartado: as migrations redefinem `public.set_updated_at()` num schema compartilhado, mas os 7 triggers que a usam são todos de tabelas do MetaMed e a função é trivial.

### Decisão de 06/10: não alterar o histórico remoto

- Continuar aplicando migrations pelo conector, como em 04/10. Nenhuma escrita em `schema_migrations`.
- **Nunca rodar `supabase db push` nem `supabase migration repair` neste projeto.**
- A tabela acima é o mapeamento oficial arquivo → versão remota.
- Antes de aplicar a v3 (Fase 2), repetir esta verificação de equivalência nas migrations pendentes e aplicar primeiro em uma branch do Supabase.
- Se no futuro preferirem o fluxo por CLI, o caminho é: alinhar as 3 versões divergentes (`update` em `schema_migrations`) e criar arquivos placeholder vazios para as 2 migrations de outros produtos. Isso **não foi executado**.

## 4. Publicação e projetos Vercel

PR #3 (`dev → main`) mesclado. **Reversão:** na Vercel, promover novamente o deploy `92b4760` (`dpl_8qfyca8TRcmjTpVCuDNbkFHvLQqu` em `sm-2-platform`, `dpl_Hp8dUMG1QsQdy5U9j1J4r9aHCx76` em `sm-2-platform-c2mn`). O banco não precisa voltar, porque a migration de setembro é aditiva.

### Projeto duplicado

| | `sm-2-platform` | `sm-2-platform-c2mn` |
|---|---|---|
| Variáveis do Supabase | Sim | Sim |
| `GOOGLE_OAUTH_CLIENT_ID` e `_SECRET` | **Ausentes** | Presentes (Production, Preview e Development) |
| `POST /api/google/refresh-token` com token falso | `500 Google OAuth refresh is not configured` | `400 Bad Request` (o Google aceitou o cliente e rejeitou só o token inventado) |
| Situação em 06/10 | **Pausado** (responde 503) | Oficial |

Sem as variáveis do Google, quem usava `sm-2-platform` perdia a sincronização do Calendar assim que o token inicial de cerca de 1 hora expirava. É uma causa provável da desconexão vista na reunião, mas não está provado que Leonardo usava esse endereço naquele dia.

Para desfazer a pausa: painel da Vercel (projeto `sm-2-platform` → Resume) ou `unpause_project`.

**Conferir (a automação não consegue ler):** em Supabase → Authentication → URL Configuration, a Site URL e as Redirect URLs devem apontar para `https://sm-2-platform-c2mn.vercel.app` (incluindo `/dashboard/configuracoes`). Se ainda estiverem no domínio pausado, o login Google deixa de funcionar. Os links já enviados ao Gabriel e ao Pejoy também precisam usar o domínio c2mn.

### Segredo legível na Vercel

A Vercel marca `GOOGLE_OAUTH_CLIENT_SECRET` com o alerta `readable-secret`: a variável está salva como legível por quem tem acesso ao projeto. Recomenda-se recriá-la como **Sensitive** no painel (Settings → Environment Variables). Não foi alterado.

## 5. Google Calendar

### Já verificado

- Projeto oficial tem ID e segredo do Google configurados, e o Google os aceita.

### Falta conferir (5 minutos)

1. **Google Cloud → APIs e serviços → Tela de consentimento OAuth.** Se o status de publicação for **Testing**, o refresh token expira em 7 dias para escopos sensíveis como `calendar.events`. Alternativas: publicar o app (o Google exige verificação para escopos sensíveis, que leva de dias a semanas; até lá aparece o aviso de app não verificado) ou aceitar a reconexão semanal durante o ensaio e registrar isso.
2. **Mesmo cliente OAuth nos dois lados.** O resultado `400` acima prova que o cliente da Vercel é válido no Google, mas não que seja o mesmo configurado em **Supabase → Authentication → Providers → Google**. Se forem diferentes, os tokens emitidos no login não podem ser renovados pela rota.
3. **URI de redirecionamento** `https://qwrlokkaxhtogmcgablr.supabase.co/auth/v1/callback` cadastrada no cliente OAuth.

### Teste com conta real (em `sm-2-platform-c2mn.vercel.app`)

| Passo | Esperado |
|---|---|
| Entrar com Google | Chega ao Início; sem erro de planejamento |
| Configurações → conectar/reconectar Google Calendar → ativar sincronização | Mensagem de preferências salvas; sem pendência |
| Registrar um tema e uma revisão | Um evento por tema no Google Calendar, com a data correta |
| Remarcar o dia do tema | O mesmo evento muda de data; não cria outro |
| Fechar a aba, esperar mais de 1 hora, reabrir e remarcar | Atualiza sem pedir novo login (prova a renovação do token) |
| Entrar em um segundo dispositivo e remarcar | O refresh token fica só no navegador de cada aparelho; anotar o que acontece |
| Revogar o acesso em myaccount.google.com/permissions e remarcar | Estudo salvo; aviso de Calendar pendente; botão de reconectar visível; ao reconectar, a pendência é recuperada |

Qualquer falha vira issue com o rótulo `calendar`.

## 6. Roteiro do ensaio

### Perfis sugeridos

| Perfil | Rotina | Foco do teste |
|---|---|---|
| A. Rotina fixa | Segunda a sexta, 2 por dia | Fluxo básico, atrasos, FIFO |
| B. Internato em rodízio | Muda a cada semana; semana começa no domingo | Ajuste semanal, capacidade zero, próxima semana |
| C. Plantão irregular | Dias e capacidades diferentes por dia | Capacidade por dia, dias fora da rotina, movimentação |

Cada pessoa cadastra de 10 a 15 temas com resultados variados (alguns com menos de 20 questões). Todos devem usar `https://sm-2-platform-c2mn.vercel.app`.

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

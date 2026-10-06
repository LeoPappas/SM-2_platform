# MetaMed — reunião de 20/08 × plataforma atual

Análise de 04/10/2026. Fontes: transcrição da reunião Leonardo × Gabriel (20/08/2026), os oito documentos de `outputs/`, histórico das branches `main`/`dev`, código do checkout local e sondagem somente leitura do banco remoto `qwrlokkaxhtogmcgablr`. Nenhuma alteração foi feita no código, no banco ou nos deploys.

## 1. Conclusão

Quase tudo o que a reunião definiu para a **mecânica semanal** já está implementado e testado na branch `dev`: dias habituais, ajuste por semana, capacidade por dia, início da semana configurável, atraso só depois que a semana fecha, FIFO dos atrasados, movimentação livre e próxima revisão no card.

O problema é que **nada disso está em produção**. A Vercel publica `main`, que está em `92b4760` (08/08), a mesma versão mostrada na reunião. Ela ainda cria atraso no meio da semana, o comportamento que vocês rejeitaram. O banco remoto, por outro lado, já recebeu a migração de setembro em 04/10. Produção e banco estão dessincronizados.

O que **ainda não existe** concentra-se em três frentes:

1. **Catálogos dos cursinhos e tema próprio.** Não há escolha entre Medway, MedCof e Medcurso, nem criação de tema fora da lista. Os três catálogos existem na migração de relevância v3, mas ela não foi aplicada ao banco nem ligada à interface.
2. **Importância no cálculo.** O motor tem fatores alta/média/baixa, mas todo item do catálogo entra como "média". Na prática, a importância não influencia nenhuma data real hoje. A nota 1–10 do Gabriel está só em modo de comparação (shadow) e fora do banco remoto.
3. **Matriz por banca, desempenho estratégico e ensaio.** A matriz tema × prova com média ponderada não foi iniciada; a página de desempenho tem só métricas básicas; o ensaio com vocês como alunos não aconteceu (o banco tinha 1 tema e 1 revisão em 04/10).

## 2. Onde cada coisa está

| Ambiente | Estado | Observação |
|---|---|---|
| Produção (Vercel, `main`) | `92b4760`, 08/08/2026 | Versão da reunião. Dois projetos Vercel (`sm-2-platform` e `sm-2-platform-c2mn`) recebem os mesmos deploys |
| `origin/dev` (preview Vercel) | `f6df2b9`, 04/10/2026 | Planejamento semanal (set.), relevância v3 em staging, correção do início |
| `dev` local | `2e508d5`, 4 commits à frente de `origin/dev` | Design System MetaMed aplicado (só UI), não enviado |
| Banco remoto | Migrações até `20260918230725` aplicadas | Confirmado por sondagem: `weekly_plan_items` e RPCs semanais existem; nenhuma tabela da v3 (`course_catalog_items`, `canonical_topics`…) nem `question_blocks.catalog_item_id` |
| Histórico de migrações | Divergente | A migração de setembro foi registrada no remoto como `20261004230438`. Reconciliar antes de qualquer `db push` |
| Qualidade do código | Verde | `npm test` 91/91 em 11 arquivos, `tsc` e `lint` sem erros |

Linha do tempo: protótipo SM-2 (mar.–abr.) → blocos de questões e Calendar (jun.–jul., PR #1) → visão MetaMed com motor próprio, catálogo de 184 aulas e onboarding (08/08, PR #2, **produção**) → reunião (20/08) → salvaguardas semanais (27/09) → relevância v3 em staging (27/09) → migração semanal no remoto (04/10) → design system (04/10, local).

## 3. Reunião × plataforma, item a item

Legenda: ✅ implementado em `dev` · 🟡 parcial · ❌ não implementado. Nenhum item ✅ está em produção, exceto onde indicado.

### A. Mecânica semanal (o "coração", 34:16)

| # | Definido na reunião | Situação | Evidência e avaliação |
|---|---|---|---|
| 1 | Dias habituais obrigatórios no onboarding (11:44) | ✅ também em produção | `onboarding-panel.tsx`. Funciona bem |
| 2 | "Caixa de caixas": cada dia tem N vagas (13:41, 23:13) | ✅ | `buildStudyWeekSlots` em `study-availability.ts`. Fiel ao modelo descrito |
| 3 | Dias fora da rotina: algoritmo não agenda, aluno pode estudar (13:41) | ✅ | Dias sem capacidade aparecem em cinza; revisões manuais nesses dias viram "Extra" |
| 4 | Padrão habitual + alteração voluntária por semana (15:03–22:17) | ✅ | "Ajustar esta semana" + RPC `save_weekly_availability`; "Usar rotina habitual" restaura; a próxima semana também pode ser ajustada |
| 5 | Capacidade diferente por dia (35:09–37:05) | ✅ | Opcional no onboarding e por semana no modal, como o Gabriel sugeriu |
| 6 | Escolher o dia em que a semana começa (16:26, 22:17) | ✅ | `week_starts_on`; semanas já gravadas preservam a âncora |
| 7 | Aviso no começo da semana perguntando os dias livres (17:12, 22:47) | 🟡 | Existe o botão, mas nenhum aviso proativo. Quem esquecer fica com o padrão, como foi aceito na reunião |
| 8 | Temas atribuídos à semana, não ao dia (20:30) | ✅ | `weekly_plan_items.due_week_start`. Tema de quinta não feito na sexta continua "por fazer" |
| 9 | Atraso só quando a semana termina (19:24, 27:10) | ✅ em `dev` · ❌ em produção | `dev`: `prepare_weekly_plan`, fechamento idempotente. `main`: `revision-engine.ts:400-404` grava `backlog_since = weekStart` para o excedente da semana corrente |
| 10 | Atrasados entram primeiro na semana seguinte, FIFO, empurrando a fila (08:11, 25:15–26:42) | ✅ | `sortBacklogFifo` + primeira vaga livre (`revision-engine.ts:432`). Antiguidade preservada mesmo após semanas sem entrar |
| 11 | Semana com mais vagas absorve atrasados (24:44) | ✅ | Aumentar capacidade redistribui pendentes e atrasados |
| 12 | Algoritmo só agenda onde há vaga; aluno coloca onde quiser (27:55–30:38, 34:16) | ✅ | Escolha manual preservada pelo planejador; qualquer data a partir de hoje |
| 13 | Drag and drop (30:15, 31:34) | 🟡 | Só na faixa da semana do Início, com HTML5 nativo: não funciona no toque do celular, nem entre semanas, nem no calendário mensal. Há alternativa por botão |
| 14 | Adiantar tema (27:55–30:38) | ✅ | Por data manual ou registrando a revisão antes; antecipações automáticas só usam vagas que sobram |
| 15 | Adiantar não distorce o cálculo (31:02–31:32) | ✅ | Intervalo = intervalo anterior × fatores (o nº de revisões está implícito no encadeamento); a data parte da revisão real |
| 16 | Excluir tema, ex.: "fiz liga de hematologia" (09:01) | 🟡 | Excluir existe, mas apaga o histórico em cascata. O caso da liga (tirar uma área inteira antes de estudar) não se aplica, porque a plataforma só planeja revisões de temas já estudados |

### B. Cadastro e catálogo

| # | Definido na reunião | Situação | Evidência e avaliação |
|---|---|---|---|
| 17 | Data do 1º contato, questões, acertos, % calculado, dificuldade, tempo opcional (06:10–07:41) | ✅ também em produção | `topic-form-modal.tsx`. Regra de amostra < 20 questões explicada na tela |
| 18 | "Próxima revisão: data X" no card do Início (10:24–10:53) | ✅ | `dashboard/page.tsx:227`, inclusive nos Feitos. Não existe em produção |
| 19 | Escolher o cursinho antes da grande área: Medway, MedCof, Medcurso, ou lista MetaMed (03:49, 06:33, 12:20) | ❌ | A interface só oferece "Lista MetaMed" ou upload CSV. A "Lista MetaMed" de 184 aulas é, pelo próprio seed da v3, o **Extensivo R1 2026 da Medway**. Os três catálogos (172/90/658 itens) estão na migração v3, não aplicada |
| 20 | Medcurso atualizado com as diferenças da Gabi (48:49) | ❌ | A v3 usa "Medcurso 2020" |
| 21 | Cadastrar tema que não está na lista / editar (06:10–07:01) | ❌ | Só seleção no catálogo; "editar" troca por outro item da lista |
| 22 | Refinar a nomenclatura ("síndrome disfágica" em vez de "gastro", 05:43) | 🟡 | A taxonomia canônica v3 (492 temas, 1.244 sinônimos) resolve parte disso, mas está inativa |

### C. Importância e relevância

| # | Definido na reunião | Situação | Evidência e avaliação |
|---|---|---|---|
| 23 | Importância deve entrar no cálculo (38:57–39:21) | 🟡 | O motor aplica 0,8/1,0/1,2 no intervalo e 3/2/1 na prioridade, mas `course-catalog.ts:131` fixa `suggestedImportance: "media"` para todo item. Efeito real hoje: nenhum |
| 24 | Escala numérica 0–10 (49:31–50:08) | ✅ decidido | A v3 usa 1–10, com uma casa decimal; zero nunca aparece. Confirmar que zero fica proibido |
| 25 | Começar pelo genérico (45:36–47:36) | 🟡 | Relevância GLOBAL/2026 auditada e pronta em staging (hash fixado, `MC-186` reservado). Não aplicada nem ativada |
| 26 | Matriz tema × banca, ponderada pelas provas do aluno (42:56–44:56) | ❌ | `topic_relevance_scores.exam_code` existe na v3, só com GLOBAL. "Provas de interesse" é texto livre, sem pesos |

### D. Desempenho

| # | Definido na reunião | Situação | Evidência e avaliação |
|---|---|---|---|
| 27 | Desempenho como canal de engajamento (37:15–38:29) | 🟡 | Métricas corretas (acurácia por questões, 8 semanas, cinco áreas, temas frágeis). Faltam a estratégia e as sugestões do Gabriel, que não estão no repositório |
| 28 | Usar "temas por semana" para uma contagem regressiva (11:44) | ❌ | O número é calculado e salvo, sem uso |

### E. Problemas observados na reunião

| # | Ocorrência | Situação | Evidência e avaliação |
|---|---|---|---|
| 29 | Calendar desconectou e não reconectou (10:55–11:27) | 🟡 | `dev` separa vincular de reconectar e recupera pendências ao focar, voltar a conexão ou receber novo token. Não publicado nem testado com conta real. A causa estrutural continua: o refresh token do Google fica só no `localStorage` do dispositivo (`google-provider-token.ts:35`) e a sincronização é 100% feita no navegador |
| 30 | Mensagem de falha em Configurações quando o plano tinha sido reorganizado (18:16) | ✅ em `dev` | Falha de planejamento e pendência do Calendar têm mensagens distintas. Não publicado |
| 31 | Ainda sem design system/branding (02:06) | ✅ local | 4 commits só de UI, não enviados |
| 32 | Rotina de ensaio como alunos (01:16) | ❌ | Não realizada. Em 04/10 o banco tinha 1 tema, 1 revisão e 2 perfis |

## 4. O que está funcionando bem

- **Semântica semanal no banco.** Ocorrências únicas por bloco e número de revisão, fechamento idempotente, uma dívida por ocorrência mesmo após semanas fora, urgência congelada. Corresponde exatamente ao que foi combinado.
- **Registro de revisão confiável.** `complete_block_review` é atômico, idempotente (`operation_id`) e protegido contra concorrência (`expected_repetitions`).
- **Estudo salvo e Calendar separados.** Falha do Google não pede para registrar a revisão de novo.
- **Escolhas manuais preservadas.** O planejamento automático não sobrescreve o que o aluno moveu.
- **Motor isolado e testado.** 91 testes cobrem motor, disponibilidade, métricas, tokens e concorrência.
- **Pipeline da v3.** Reprodutível por hash, versionado, com tombstone, estados `validated → active` e motor numérico apenas em shadow.
- **Segurança.** RLS em todas as tabelas; com a chave anon, as RPCs semanais e o catálogo retornam permissão negada.

### Pontos de atenção encontrados

| Ponto | Onde | Impacto |
|---|---|---|
| Produção cria atraso no meio da semana | `main:src/lib/revision-engine.ts:400-404` | O Gabriel, testando em produção, vê o comportamento antigo |
| Primeiro contato não é transacional (insere bloco, depois o contato, com exclusão compensatória) | `topic-form-modal.tsx:169-232` | Baixo, mas é o único registro fora de RPC |
| Excluir tema apaga o histórico | `blocos/page.tsx:294` | Perda irreversível de dados de desempenho |
| Data padrão do 1º contato usa o fuso do dispositivo | `topic-form-modal.tsx:54` e `:302` | Divergência perto da meia-noite fora de Brasília |
| No calendário mensal, o aviso "fora da rotina" usa os dias habituais, não o ajuste da semana | `calendario/page.tsx:249` | Aviso incorreto em semanas ajustadas |
| Simulador visível para todo aluno | `dashboard/layout.tsx:26` | Ferramenta interna exposta |
| Planejamento automático gravado pelo navegador ao abrir o Início | `dashboard/page.tsx:117-134` | Funciona porque o fechamento é idempotente, mas o Calendar só atualiza quando o aluno abre o app |

## 5. Plano de implementação

Esforço relativo: P (dias), M (1–2 semanas), G (2+ semanas). As fases 0 e 1 só dependem de tecnologia; a partir da 2, há dependência editorial do Gabriel/Pejoy.

### Fase 0 — Publicar o que existe e começar o ensaio (P · pré-requisito de tudo)

1. Enviar os 4 commits de design system para `origin/dev` e conferir o preview.
2. Reconciliar o histórico de migrações: registrar `20260918230725` como aplicada, depois de confirmar que o SQL remoto é idêntico. Não reexecutar o SQL.
3. Abrir PR `dev → main`, publicar e arquivar o projeto Vercel duplicado.
4. Validar o Google com uma conta real: login, reconexão, criação e atualização de evento, uso após 1 hora e em segundo dispositivo. Verificar no Google Cloud se o app OAuth está em modo "Testing"; nesse modo os refresh tokens expiram em 7 dias, uma causa provável da desconexão vista na reunião.
5. Ensaio de 3 semanas com Leonardo, Gabriel e Pejoy em perfis diferentes (rodízio de internato, plantão irregular, rotina fixa), 10–15 temas cada, usando os cenários da seção 13 do plano de setembro. Registrar cada problema como issue.

**Critério de saída:** produção igual a `dev`; ensaio em andamento com dados reais.

### Fase 1 — Fechar a experiência semanal (M)

1. **Aviso de início de semana.** Banner no Início no primeiro acesso da semana (e nos dois dias anteriores para a próxima): "Sua semana começa na segunda. Quais dias você tem livres?", com atalho para o modal e opção "manter padrão". Coluna aditiva `weekly_plans.availability_confirmed_at`.
2. **Drag and drop completo.** Adotar uma biblioteca com toque e teclado (ex.: `@dnd-kit/core`); arrastar entre dias, para a próxima semana e no calendário mensal; desfazer visualmente se o salvamento falhar; manter o botão de calendário.
3. **Card concluído.** Mostrar também "Agendada para" quando a próxima revisão já tiver dia.
4. **Correções pequenas.** Fuso do perfil na data do 1º contato; disponibilidade da semana no modal do calendário; esconder o Simulador de alunos (flag de papel no perfil).
5. **Arquivar em vez de excluir.** `question_blocks.archived_at`: sai do planejamento e do Calendar, mantém o histórico; exclusão definitiva vira ação secundária.

### Fase 2 — Cursinhos e tema próprio (G · depende do Gabriel para o item 2)

1. Aplicar a migração v3 em uma branch Supabase, rodar `verify-relevance-catalog.mjs` e `verify-weekly-planning.mjs`, depois aplicar no remoto, ainda inativa.
2. Gabriel e Pejoy: diferenças do Medcurso 2026 (mensagem da Gabi) e as correções documentais e o manifesto de proveniência pedidos em 27/09. Publicar como v4 (nova publicação, sem alterar a v3).
3. Migração de ativação dos três releases (`status = active`).
4. **Onboarding:** novo passo "Qual cursinho você faz?" — Medway, MedCof, Medcurso, ou "Outro" (lista MetaMed padrão ou upload). Novo campo `student_profiles.course_catalog_release_id`.
5. **Cadastro de tema:** cursinho → área do cursinho → módulo → aula, via `get_catalog_suggestions` (RPC já existente); gravar `catalog_item_id` (os gatilhos de snapshot já existem); busca por título e sinônimos, sempre com confirmação quando houver ambiguidade.
6. **Tema próprio:** "Não encontrei meu tema" cria um item privado com uma das cinco áreas obrigatória e relevância neutra 5 (ou escolhida). Sugere tema canônico por sinônimo, sem associar em silêncio.
7. **Troca de cursinho** nas configurações: catálogo novo para cadastros futuros; temas antigos e histórico intactos.
8. **Legado:** os blocos atuais vieram da lista de 184 aulas (Medway). Associar ao release Medway por título exato, com confirmação. Hoje há um único tema.

### Fase 3 — Importância no cálculo, relevância GLOBAL (M + calibração)

1. **Atalho imediato:** com o catálogo ativo, `get_catalog_suggestions` já converte a nota em categoria (≥ 7,5 alta; ≤ 3,5 baixa; resto média). O motor v1 usa essa categoria sem nenhuma mudança. A importância passa a valer de fato no ensaio.
2. **Shadow:** inserir a ativação GLOBAL em modo shadow; cada revisão grava o intervalo candidato da fórmula numérica. Comparar no simulador e em um relatório simples.
3. **Modo ativo:** nova migração habilitando `active`; motor v2 com f(R) = 1,2 − 0,4 × (R − 1) / 9, que **substitui** o fator categórico, sem multiplicar os dois. Na prioridade, comparar fator neutro e suave antes de decidir.
4. Ajuste individual de relevância pelo aluno, separado da nota editorial e rastreável.

### Fase 4 — Relevância por prova, a matriz (G · depende da base editorial)

1. **Modelo:** tabela `exams` (código, nome, banca, UF); notas por prova em `topic_relevance_scores` com `exam_code ≠ GLOBAL`; `student_exam_targets` (aluno, prova, peso). Substituir o texto livre "provas de interesse" por seleção estruturada; prova sem notas usa GLOBAL e informa isso.
2. **Composição:** para cada tema canônico, média ponderada das notas das provas escolhidas (GLOBAL para pares ausentes), depois a fórmula do item (0,7 × soma ponderada + 0,3 × máximo), uma única vez.
3. **Arquitetura:** a reunião falou em uma matriz por cursinho (três ou quatro). Com a taxonomia canônica, basta **uma** matriz de 492 temas × bancas; o de-para traduz para as aulas de cada cursinho. Isso reduz o trabalho editorial do Gabriel a um terço e mantém o resultado que vocês descreveram.
4. **Ordem editorial** (45:36): ENAMED → SUS-SP → USP-SP → demais grandes provas.
5. Snapshot com `exam_code`/hash da composição em cada revisão (limitação já registrada no manifesto da v3).
6. Interface: "Relevância personalizada para USP-SP + ENAMED" versus "GLOBAL (sem dados da banca)".

### Fase 5 — Desempenho e engajamento (M · em paralelo, após definição)

1. Sessão com o Gabriel para transformar as sugestões da mensagem dele em especificação.
2. Candidatos: cumprimento do plano semanal (feitos/planejados), constância (semanas seguidas), questões por semana, evolução por grande área canônica com distribuição proporcional, cobertura do cronograma do cursinho (exige Fase 2) e contagem regressiva (semanas até a prova × capacidade).

### Fase 6 — Calendar robusto (M · em paralelo às Fases 1–2)

1. Guardar o refresh token no servidor (tabela privada criptografada via Supabase Vault, escrita por uma rota após o OAuth), nunca no `localStorage`.
2. Sincronização no servidor (cron do Supabase ou da Vercel) para processar pendências mesmo com o app fechado.
3. Estado da conexão em Configurações: última sincronização, erro atual, botão de reconectar.

### Ordem recomendada

Fase 0 → Fase 1 (com a Fase 6 em paralelo) → Fase 2 → Fase 3 → Fase 5 → Fase 4. O marco do beta é **0 + 1 + 2 + 3.1**: semana confiável em produção, três cursinhos, tema próprio e importância influenciando as datas.

## 6. Decisões pendentes

| # | Decisão | Recomendação |
|---|---|---|
| D1 | A plataforma também planeja os **primeiros contatos** (seguir o cronograma do cursinho) ou só revisões? Na reunião, "os novos chegam em ordem de prioridade" (26:12) e "excluir hematologia" (09:01) sugerem cronograma | Beta só com revisões, como hoje. Cronograma de primeiro contato é um produto à parte |
| D2 | O que é a "Lista MetaMed"? Hoje é o Extensivo da Medway | Renomear para Medway e tratar "MetaMed" como uma cópia escolhida por vocês (06:33) |
| D3 | Usar a importância categórica derivada da nota (Fase 3.1) antes do motor numérico? | Sim: não exige mudança no motor e já foi testada |
| D4 | Zero é nota válida? | Não. Escala 1–10, como na v3 |
| D5 | O celular é o uso principal? | Define a biblioteca de drag and drop e a prioridade da Fase 1.2 |

## 7. Dependências externas

- **Gabriel/Gabi:** diferenças do Medcurso 2026.
- **Gabriel:** correções documentais e manifesto de proveniência da v3 (mensagem de 27/09).
- **Gabriel:** mensagem com sugestões de desempenho (não está no repositório).
- **Gabriel/Pejoy:** primeira matriz por prova (ENAMED).

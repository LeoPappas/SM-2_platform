# MetaMed: reuniões de 24/10 × plataforma

Análise de 24/10/2026. Fontes: as duas transcrições da sessão de onboarding do Gabriel (14h e 15h), o código da branch `dev` (`082b1d0`, igual a `origin/dev`; `main` em `c1e7ccf`, merge do PR #6) o seed da relevância v3 e consultas de leitura ao banco remoto `qwrlokkaxhtogmcgablr`.

**Atualização (24/10, noite):** depois da revisão do Leo, B6 foi descartado e foram implementados em `dev` e publicados em `main`:
- a importância do tema próprio (seção 5);
- a nova lista de temas (M10 a M13);
- a área do cursinho na lista e no filtro (seção 7);
- o limite de 3 linhas por dia no calendário (B4).

A migração `20261024120000_own_topic_relevance_values.sql` foi aplicada ao remoto, onde ficou registrada como versão `20261024175558`.

## 1. Conclusão

O **motor acertou todas as datas** registradas na reunião (tabela da seção 2). Os problemas que apareceram são de interface, de clareza e de integridade de dados. Nenhum é de cálculo.

Antes de o roteiro continuar na segunda, 26/10, quatro correções pesam mais:

1. **Tema duplicado.** Hoje dá para cadastrar o mesmo tema duas vezes, e cada cópia ganha a própria agenda de revisões (B1).
2. **Campos numéricos.** O zero não sai do campo de acertos ("011") e o campo de questões não esvazia. Isso aparece em todo registro (B2).
3. **"Atraso desde"** mostra o início da semana em que a revisão caía, não a data da revisão. Isso gerou o "11/10" que confundiu os dois (B3).
4. **Editar a última sessão.** Não existe. O botão "Editar" dos Temas edita a classificação do tema, e nos temas vinculados ao cursinho nem isso: só mostra o aviso para excluir e registrar de novo (M1).

Duas descobertas mudam o que foi dito na reunião:

- **O dia 13/10 não estava sem espaço.** A célula do calendário mostra até 4 itens mais um "+N". Imunizações sumiu do dia 13 porque, ao ser remarcada para hoje (24/10), o calendário passou a mostrá-la só na data nova. O banco confirma: o dia 13 tinha 3 eventos (B4).
- **No primeiro contato com 20 questões ou mais, nem a dificuldade percebida nem a relevância mudam o intervalo.** Só o percentual de acerto decide. Na reunião, o Leo respondeu ao Gabriel que a dificuldade entra no cálculo. Ela entra, mas só na amostra pequena e a partir da primeira revisão (seção 2).

## 2. Conferência do motor com os casos da reunião

Regras em `revision-engine.ts:42-88`. No primeiro contato, a faixa de acerto define o intervalo (muito ruim < 50% → 7 dias; ruim < 70% → 10; bom < 85% → 14; muito bom → 21). Com menos de 20 questões, a dificuldade percebida decide (de "Muito difícil" = 7 até "Muito fácil" = 21).

| Tema | 1º contato | Resultado | Regra aplicada | Próxima revisão | Confere |
|---|---|---|---|---|---|
| Imunizações | 03/10 | 11/20 = 55% | ruim → 10 dias | 13/10 | ✅ |
| Anatomia pélvica | 03/10 | 11/20 = 55% | ruim → 10 dias | 13/10 | ✅ |
| Imunizações (duplicata) | 24/10 | 11/20 = 55% | ruim → 10 dias | 03/11 | ✅ (mas não devia existir, B1; já apagada do banco) |
| Glomerulopatias | 13/10 | 15/20 = 75% | bom → 14 dias | 27/10 | ✅ |
| Tireoide | 13/10 | 15/20 = 75% | bom → 14 dias | 27/10 | ✅ |
| ICC | 16/10 | 22/25 = 88% | muito bom → 21 dias | 06/11 | ✅ |
| Técnica operatória | 16/10 | 7/8, Muito fácil | amostra pequena → 21 dias | 06/11 | ✅ |
| Pré-natal | 20/10 | 9/20 = 45% | muito ruim → 7 dias | 27/10 | ✅ |
| Síndromes neurológicas | 20/10 | 9/15, Difícil | amostra pequena → 10 dias | 30/10 | esperado, não lido na reunião |
| HAS ("Como cai na PED") | 23/10 | 14/20 = 70% | bom → 14 dias | 06/11 | esperado, não lido na reunião |

Notas para o Gabriel:

- **Pré-natal não bateu no piso.** Os 7 dias são o primeiro intervalo da faixa "muito ruim", que coincide com o mínimo global de 7 dias.
- **Dificuldade e relevância no primeiro contato.** Com 20 questões ou mais, `calculateNextInterval` (`revision-engine.ts:189-192`) usa só a faixa de acerto. A relevância entra na fila de prioridade desde o primeiro contato, mas no intervalo só a partir da primeira revisão. Foi uma decisão documentada ("o primeiro contato não muda", `MetaMed_implementacao_relevancia_v3_2026-09-27.md`), mas precisa ser explicada ao Gabriel, porque ele saiu da reunião achando o contrário.
- **Fórmula da relevância efetiva confirmada:** `round(0,7 × Σ(peso × nota) + 0,3 × maior nota, 1)`, validada no seed (`relevance_catalog_v3_foundation.sql:1847-1860`).
- **Os limites são 3,5 e 7,5, não 4 e 7,5:** ≤ 3,5 é baixa, ≥ 7,5 é alta (`revision-engine.ts:98-108`).

## 3. Bugs

| # | Problema | Onde surgiu | Causa no código | Correção sugerida |
|---|---|---|---|---|
| B1 | Mesmo tema cadastrado duas vezes (Imunizações) | 14h, 30:12–31:50 | `createBlock` (`topic-form-modal.tsx:246`) insere sem checar se já existe. Não há índice único em `question_blocks` por `catalog_item_id` nem por título | ✅ **Feito em `dev`:** o formulário recusa tema já cadastrado (aula, tema MetaMed ou nome do tema próprio) e aponta para revisão ou para os Arquivados; índices únicos parciais no banco (`20261024220000_one_active_topic`, remoto `20261024191322`). |
| B2 | O zero de "Acertos" não apaga ("011"); "Questões" não esvazia e volta para 1 | 14h, 26:13–26:56 | Os campos guardam número, não texto: `Math.max(1, Number(value))` e `Math.max(0, …)` em `topic-form-modal.tsx:485-492` e `review-modal.tsx:188-209`. Campo vazio vira 0 ou 1 e o React mantém o "0" digitado à frente | ✅ **Feito em `dev`:** os três formulários guardam o texto digitado (`lib/count-input.ts`); campo pode ficar vazio, zero à esquerda some, acertos acima das questões mostram aviso em vez de serem cortados. |
| B3 | "Atraso desde 11/10" para uma revisão prevista para 13/10 | 14h, 27:58–40:08 | O selo mostra `backlog_since` (`dashboard/page.tsx:297`), que é o início da semana da revisão (`due_week_start`, `weekly_confirmation_and_archive.sql:112`). A semana do Gabriel começa no domingo 11/10 | ✅ **Feito em `dev`:** a coluna Atrasados mostra "Previsto para DD/MM" (`next_review_date`); a coluna Por fazer não mostra selo. |
| B4 | Imunizações "devia aparecer no dia 13" do calendário | 15h, 04:30–05:52 | A revisão aparece numa data só: a planejada, se houver; senão, a calculada (`calendario/page.tsx:95-110`). Imunizações tem `planned_review_date = 24/10` no banco, por isso saiu do dia 13. O dia 13 tinha 3 eventos: a janela de Anatomia pélvica e os primeiros contatos de Glomerulopatias e Tireoide. Com 4 eventos, a célula mostra os 4 e cresce; a linha da semana inteira acompanha. Com 5 ou mais, mostra os 4 primeiros e um "+N" que não abre nada (`:292, :308`) | **Decidido e feito em `dev`:** a célula tem altura fixa e cabe 3 linhas. Com até 3 eventos, todos aparecem; com 4 ou mais, aparecem os 2 primeiros e "+N mais" (o mouse sobre ele lista os nomes). "+N mais" abre a lista do dia. **Decidido:** a data original não aparece na grade; a janela do evento remarcado mostra "Data calculada: DD/MM" |
| B5 | Busca por "pre natal" não acha "Pré-natal" | 14h, 56:07–56:11 | `normalizeHeader` (`course-catalog.ts:397`) tira acento e caixa, mas mantém hífen e pontuação. O RPC usa `ilike` puro no título | ✅ **Feito em `dev`:** busca ignora acento, caixa, hífen e espaços ("pre natal", "prenatal", "Pré-natal"); o filtro dos Temas usa a mesma regra. |

O relato "tempo em minutos não deu certo" (14h, 26:56) foi descartado pelo Leo.

## 4. Melhorias de UX

### Editar, excluir e arquivar

| # | Pedido | Situação hoje | Proposta e decisão |
|---|---|---|---|
| M1 | Editar uma sessão (acertos, questões, dificuldade) e não o tema | ✅ em `dev`, a partir dos Temas: "Editar" abre a última sessão (`components/session-edit-modal.tsx`) com prévia da nova próxima revisão; a classificação virou o link "Editar classificação do tema". A gravação é a RPC `edit_last_block_session` (migração `20261024200000`, verificada em PGlite com 16 checagens; aplicada no remoto como versão `20261024184048`; a correção `20261024210000_edit_session_keeps_schedule`, que mantém o dia marcado quando a data calculada não muda, entrou como `20261024185253`). No calendário, a última sessão abre a edição e as antigas mostram os dados sem edição. Antes disto: não existia edição de `block_reviews`. No calendário, "Primeiro contato" e "Revisão concluída" são botões desativados (`calendario/page.tsx:305`) | **Decidido:** editar só a última sessão, a partir dos Temas (coluna "Última revisão" com lápis) e do calendário. Editar a última sessão é seguro: basta recalcular a partir do intervalo anterior e regravar a próxima data. Sessões antigas ficam bloqueadas até a simulação. O motor é determinístico (intervalo = anterior × fatores), então reprocessar a cadeia inteira é viável. O difícil é o que já foi planejado e marcado como atraso nas semanas passadas |
| M2 | Separar "editar tema" de "editar sessão" | O lápis da lista abre "Editar tema" | Renomear para "Classificação" ou tirar da linha, como o Leo sugeriu (15h, 00:52) |
| M3 | Excluir ao lado de Arquivar | Excluir só aparece na aba Arquivados (`blocos/page.tsx:279-285`) | **Decidido:** manter Arquivar (pausa o tema e guarda o histórico; restaurar já funciona) e pôr a lixeira ao lado |

### Cadastro de tema

| # | Pedido | Situação hoje | Proposta |
|---|---|---|---|
| M4 | Listas suspensas em ordem alfabética | Seguem a ordem da planilha: `order by i.source_order` no RPC e `unique()` sem ordenar em `course-catalog.ts:295-305` | ✅ **Feito em `dev`:** área, especialidade e tema em ordem alfabética. |
| M5 | Explicar a amostra pequena para leigos e pedir confirmação | Uma linha técnica (`topic-form-modal.tsx:513`) | ✅ **Feito em `dev`:** texto simples e caixa "Entendi, quero registrar mesmo assim" obrigatória no cadastro, no registro de revisão e na edição de sessão. |
| M6 | Importância do tema próprio proporcional às notas reais | ✅ em `dev`: alta = 8,5, média = 6,2, baixa = 3 (seção 5). Migração aplicada no remoto (`20261024175558`) | Falta a dica com exemplos de alta, média e baixa |
| M7 | "Novo tema" do Início abrir o formulário direto | É um link para `/dashboard/blocos` (`dashboard/page.tsx:218`), onde é preciso clicar em "Novo tema" de novo | ✅ **Feito em `dev`:** o botão abre o formulário no próprio Início. |
| M8 | A busca dos Temas parece a busca do cadastro | Ela filtra só os temas já estudados (`blocos/page.tsx:77-86`) | Placeholder "Filtrar meus temas…". M7 já tira a principal fonte da confusão |
| M9 | Capacidade conta aulas do cursinho, não temas canônicos | Confirmado no código: cada aula é um item, ligado a 1 ou mais temas canônicos. A pergunta da capacidade aparece **antes** da escolha do cursinho (`onboarding-panel.tsx:200` e `:244`) | Pôr o cursinho antes e trocar o texto para "Quantas aulas do seu cursinho você consegue revisar por dia?" |

### Lista de temas

| # | Pedido | Situação hoje | Proposta |
|---|---|---|---|
| M10 | Mostrar último contato e intervalo ("7 dias após o último contato") | ✅ em `dev` (`components/topic-table.tsx`) | Colunas Tema · Número de contatos · Último contato · Próximo contato · Ações. Passar o mouse ou tocar na data do próximo contato mostra "N dias após o último contato" |
| M11 | Ordenar por próxima revisão nos dois sentidos | Não há como ordenar; a lista vem pela última atualização | Seta no cabeçalho da coluna. O filtro por grande área já existe |
| M12 | "Ver detalhes" no tema (importância, último acerto) | ✅ em `dev`, como dica no nome do tema | Passar o mouse ou tocar no nome mostra data, acurácia e importância do último contato |
| M13 | Colunas parecem desalinhadas, puxadas para a direita | ✅ em `dev` | Cabeçalho e linhas usam a mesma grade proporcional, tudo alinhado à esquerda. No celular, cada valor ganha o próprio rótulo |
| M14 | As ações não se explicam sem passar o mouse | Só ícones, com `title` | Rótulo visível nas telas largas ou menu "⋯". Pesa no celular, que é o foco do roteiro do Gabriel |

### Calendário

| # | Pedido | Situação hoje | Proposta |
|---|---|---|---|
| M15 | "+N mais" clicável | "+N" é texto solto (`calendario/page.tsx:308`) | Abrir uma lista do dia com todos os itens, clicáveis. Ver B4 |
| M16 | Arrastar muda só o dia de fazer, não o dia calculado? (dúvida do Leo, 14h, 45:26) | **Confirmado:** `scheduleBlockReview` grava só `planned_review_date` e `planning_source = "manual"`; `next_review_date` não muda (`revision-actions.ts:139-157`). O arraste já funciona no toque (dnd-kit com `TouchSensor`) | Nada a fazer. O registro da revisão também aceita a data real em que foi feita (`review-modal.tsx:170-175`), o que cobre o caso "fiz no dia 14, não no 13" |

### Dados e desempenho

| # | Pedido | Situação hoje | Proposta |
|---|---|---|---|
| M17 | Horas de estudo por dia e semana, com médias e tendência | `time_spent_minutes` é salvo e nunca lido (nenhuma referência em `metricas/` ou `performance-metrics.ts`) | ⏸️ **Aguardando definição do Leo com o Gabriel** (dia ou semana, médias, tendência, convite para quem não preenche). |
| M18 | Percentual de progresso | Não existe | Definir o denominador (aulas do cursinho estudadas ÷ total do catálogo?) antes de construir |

## 5. Importância do tema próprio

O Gabriel desconfiou que "baixa" ficaria fora da escala das tabelas. Os números do seed confirmam:

| Catálogo | Aulas | Mínimo | Mediana | Máximo | Baixa (≤ 3,5) | Média | Alta (≥ 7,5) | Mediana da faixa média | Mediana da faixa alta |
|---|---|---|---|---|---|---|---|---|---|
| Medway | 172 | 3,0 | 7,4 | 10 | 1 | 89 | 82 | 6,4 | 8,7 |
| MedGrupo | 90 | 4,0 | 8,0 | 10 | 0 | 35 | 55 | 6,7 | 8,6 |
| MedCof | 658 | 2,0 | 6,0 | 10 | 65 | 383 | 210 | 6,0 | 8,0 |

- Um tema próprio "baixa" recebe 1, abaixo de qualquer aula de qualquer cursinho. Um "alta" recebe 10, o topo absoluto. Um "média" recebe 5,5, abaixo da mediana da faixa média em todos os catálogos.
- No catálogo do Gabriel (Medway), 48% das aulas são "alta" e só uma é "baixa". O selo perde a função de diferenciar.

**Decidido e implementado em `dev`:** o tema próprio passa a valer a mediana da faixa (baixa 3,0; média 6,2; alta 8,5) em vez de 1 / 5,5 / 10. A mudança está em `relevanceFromImportance` (`revision-engine.ts`) e na migração `20261024120000_own_topic_relevance_values.sql`, que troca o gatilho e a restrição do banco e recalcula os temas que só têm categoria. As revisões já feitas guardam o número antigo. A verificação isolada `scripts/verify-own-topic-relevance.mjs` passou com 10 checagens. Hoje não há nenhum tema próprio no banco, então a migração não muda nenhuma data existente.

**Até a migração ser aplicada,** o banco continua gravando 10 / 5,5 / 1, porque o gatilho sobrescreve o número que o cliente envia.

Mudar os limites de 3,5 e 7,5 é outra decisão, porque mexe no selo de todas as aulas. Fica para depois do teste, com os dados.

## 6. Discutido e não adotado

- **Semana sem dias definidos ("quero fazer 5 temas nesta semana")** (14h, 40:17–47:30). O Leo argumentou que, sem dias bloqueados, o motor jogaria tudo no mesmo dia. O Gabriel concordou que o arraste, a data real no registro e o ajuste por semana já cobrem a rotina variável. Sem mudança.
- **Mostrar só a grande área, sem especialidade** (14h, 16:51–19:22). Os dois conferiram que "Imunizações → Imunizações na infância → Puericultura" faz sentido e decidiram manter.

## 7. Pendência de verificação: de onde vem a grande área

O Leo ficou de checar (14h, 19:37). Resposta:

- No formulário, a lista "Grande área" mostra a **área do cursinho** (`catalog_area`, a coluna da planilha).
- O tema é **salvo** com `major_area` **derivada do tema canônico de maior peso** (`major_area_derivation = 'highest_weight_topic_experimental'`, `relevance_catalog_v3_foundation.sql:1796-1817`). É essa área que aparece na lista de Temas, no filtro e no Desempenho.
- A especialidade também vem do canônico: só quando todos os temas ligados à aula concordam. Caso contrário, vira "Conteúdo integrado".

Nas aulas em que cursinho e canônico divergem, o aluno escolhe uma área e vê outra depois de salvar. Contagem no banco:

| Catálogo | Aulas | Área diverge |
|---|---|---|
| Medway | 172 | 11 (6%) |
| MedGrupo | 90 | 3 (3%) |
| MedCof | 658 | 136 (21%) |

Exemplos da Medway, o mesmo caso de gastro que o Gabriel citou: "Síndrome Disfágica", "Hemorragia Digestiva", "Doença Inflamatória Intestinal" e "Afecções Pancreáticas" estão em Cirurgia Geral no cursinho e são salvas como Clínica Médica. "Neurointensivismo e Ética Médica" está em Clínica Médica e é salva como Preventiva.

O Gabriel prefere a área do cursinho, "porque a pessoa tá esperando ver o que aparece no cursinho". No MedCof, uma em cada cinco aulas é afetada.

**Decidido e feito em `dev`:**
- A lista de Temas, o filtro de áreas e o histórico mostram `catalog_area`, lida da aula vinculada (`loadCourseAreas` e `displayArea` em `course-catalog.ts`). Temas próprios e da Lista MetaMed continuam com a própria área.
- O filtro passa a oferecer as áreas que o aluno de fato tem, em ordem alfabética.
- `major_area` (canônica) continua gravada e é a que o Desempenho usa. Não houve migração.
- O card do Início, a janela de registrar revisão e a janela do evento no calendário também mostram a área do cursinho.

## 8. Fora do código desta plataforma

| Tema | Situação | Próximo passo |
|---|---|---|
| Tela do Google mostra o domínio do Supabase no login | O Leo não gosta | Domínio próprio de autenticação no Supabase (`auth.metamed.med.br`), junto com a migração de domínio |
| Produção no GCP e domínio `metamed.med.br` | Ainda na Vercel com nome SM-2 | Planejar a migração; link a partir do site institucional |
| Acesso só para e-mails liberados (embaixadores) | Não existe: qualquer conta Google entra | Lista de e-mails permitidos, conferida no login e no RLS. Prazo combinado: pronto até meados de novembro |
| Visual "com cara de IA" | Design System aplicado | Polimento de front-end só de UI, sem tocar no motor |
| Decisão de lançamento | Meados de novembro: lançar em 2026 ou no início de janeiro | — |
| Plataforma de flashcards | Conversa com um contato do Leo neste fim de semana | Fora deste repositório |

## 9. Ordem sugerida

0. **Feito e publicado em 24/10:** M1 e M2 (Temas e calendário), M3, M4, M5, M6, M7, M10, M12, M13, M15, B1, B2, B3, B4, B5, área do cursinho (seção 7) e Next 16.4.3, que corrige as falhas críticas da 16.4.0.
1. **Primeira semana do teste:** M8 (texto do filtro dos Temas), M11 (ordenar por próximo contato), M14 (rótulos das ações no celular).
2. **Antes de liberar os embaixadores:** lista de e-mails permitidos, domínio `metamed.med.br`, M9 (cursinho antes da capacidade no onboarding), dica de importância com exemplos (M6).
3. **Depois do teste, com dados:** simulação da edição de sessões antigas, M17 (horas de estudo, a definir com o Gabriel), M18, limites de relevância.

Decidido em 24/10: um tema que já entra atrasado no cadastro continua pegando a primeira vaga livre. A intenção é que atrasados saiam da lista o mais rápido possível.

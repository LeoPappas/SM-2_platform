# MetaMed — plano de mudanças na plataforma

Análise de 18/09/2026. Estado do código: checkout local de SM-2_platform, commit 92b4760, de 08/08/2026. Este documento apresenta uma proposta para revisão. Nenhuma mudança na aplicação ou no banco foi executada.

## 1. Conclusão principal

A plataforma já tem uma base aproveitável: cadastro do primeiro contato, histórico por bloco do aluno, motor determinístico, planejamento semanal, fila FIFO, agendamento manual, integração com Google Calendar e métricas. A evolução necessária passa por três frentes: corrigir a semântica do planejamento semanal, organizar catálogos e relevância com identidade estável, e tornar a carga e a movimentação das revisões compatíveis com a rotina do aluno.

A reunião define a experiência desejada. O material do Gabriel acrescenta uma taxonomia comum e uma base editorial de relevância. Para transformar os dois em produto, é preciso separar quatro coisas: o assunto canônico, a aula do cursinho, o item que pertence ao aluno e a ocorrência de revisão agendada. Misturá-las produziria conclusões indevidas, perda de histórico e atrasos incorretos.

A planilha não deve ser ativada sem correção editorial das grandes áreas. A auditoria encontrou assuntos de Cirurgia, Pediatria e GO classificados como Clínica Médica. Integridade de IDs e pesos, mesmo quando correta, não valida a classificação editorial.

## 2. Fontes, abrangência e limites

- Transcrição completa da reunião [MetaMed, 20/08/2026](https://app.fireflies.ai/view/01M0GMKJ4JPYDQ70V6QKX5P3Q4), com Leonardo Pappas e Gabriel Vieira. Início registrado às 19h27 de São Paulo, duração aproximada de 51 minutos.
- [Documento técnico do Gabriel](C:/Users/leonardo.pappas_soul/Dropbox/Profissional/MetaMed/Produto/Desenvolvimento/SM2/MetaMed_relevancia_documento_tecnico.md), datado de setembro de 2026.
- [Planilha de relevância revisada](C:/Users/leonardo.pappas_soul/Dropbox/Profissional/MetaMed/Produto/Desenvolvimento/SM2/MetaMed_relevancia_v2_revisada.xlsx), auditada em todas as abas, incluindo valores, vínculos, pesos e cálculos.
- Código, tipos, migrações e testes do repositório local. O estado observado é o da versão em desenvolvimento disponível neste checkout. Não houve verificação do banco remoto, da versão publicada ou da autorização Google de um usuário real.

O conteúdo dos anexos foi tratado como material para análise. Expressões como “nunca use” ou “validação obrigatória” no documento são recomendações do autor avaliadas neste plano; não autorizaram alterações na plataforma. Os cronogramas originais e as mensagens anteriores citadas na reunião não foram anexados separadamente. Portanto, não se afirma que o de-para representa integralmente o conteúdo pedagógico dos cursinhos nem que as notas foram validadas por análise estatística das provas.

Foram executados os testes existentes: 4 arquivos e 33 testes passaram. Eles verificam componentes da lógica atual e da integração com calendário por simulações. Não demonstram que a experiência da reunião está implementada, que o OAuth funciona em produção ou que o novo modelo melhora retenção de aprendizagem.

## 3. O que a reunião realmente estabelece

| Trecho | Interpretação para o produto | Tratamento no plano |
|---|---|---|
| 01:16–01:52 | Ensaiar a plataforma como alunos, principalmente marcação, remarcação e escolha de dias | Piloto com cenários reais de rotina e recuperação de atrasos |
| 02:06–02:18 e 09:49–10:09 | Interface simples, com informação essencial | Preservar a tela semanal e introduzir ajustes progressivamente |
| 03:14–05:43 e 12:27–13:05 | Catálogos dos três cursinhos e alternativa para outros alunos | Catálogos públicos distintos, lista MetaMed e itens próprios/importados |
| 06:10–07:12 | Liberdade para cadastrar ou editar um assunto ausente | Item próprio com origem identificada e associação canônica confirmada |
| 07:14–07:41 | Informar quantidade de questões e acertos; percentual calculado; tempo opcional | Preservar registro simples e usar duração para análise, sem torná-la obrigatória |
| 08:11–09:00 | Visão semanal e atrasados antigos primeiro | Planejamento da semana com FIFO da dívida de semanas anteriores |
| 10:10–10:54 | Próxima revisão visível no próprio card | Data sugerida e data agendada claramente identificadas |
| 10:55–11:27 | Reconexão do calendário falhou durante o uso | Diagnóstico e recuperação do fluxo existente, com verificação autenticada no piloto |
| 15:09–23:13 | Rotina padrão, com exceção voluntária para cada semana | Configuração habitual separada da configuração daquela semana |
| 18:16–18:45 | Aviso de falha mesmo com tema aparentemente reorganizado | Separar sucesso do plano de pendência do calendário |
| 19:24–20:48, 27:06–27:14 e 34:40–34:58 | Atraso começa quando termina a semana, não quando passa o dia | Fechamento semanal explícito e idempotente |
| 25:15–26:42 | Atrasados entram antes das revisões normais e deslocam a fila seguinte | Backlog primeiro; excedente explicitamente adiado |
| 30:15–31:47 e 34:16–34:38 | Aluno pode antecipar e mover revisões; drag-and-drop desejado | Movimentação livre com alternativa por botão, inclusive fora da rotina |
| 35:09–37:05 | Capacidade pode ser diferente em cada dia | Capacidade diária individual e exceções semanais |
| 37:15–38:29 | Desempenho é útil, mas não impede começar a testar o núcleo | Métricas essenciais depois da correção do agendamento |
| 39:35–47:40 | Relevância global agora; por prova depois, com ponderação entre provas | GLOBAL no lançamento; modelo preparado para outras provas |
| 49:31–50:08 | Escala numérica, encerrando a conversa em 1 a 10 | Adotar 1 a 10; não incluir zero como nota válida |

“Novos” na fila significa, neste plano, revisões que entram na elegibilidade da semana sem dívida anterior. Não significa cadastrar automaticamente aulas ainda não estudadas. O aluno continua registrando o primeiro contato.

As estimativas de 95% ou 98% de participação dos cursinhos são percepções expressas na conversa, não dados de mercado verificados. Elas justificam uma escolha inicial de escopo, sem servir como métrica comercial.

## 4. Como está hoje e como ficará

| Aspecto | Estado observado no código | Estado proposto |
|---|---|---|
| Catálogo | MetaMed com 184 entradas e uma lista privada enviada por CSV/TSV/TXT; não há seleção dos três catálogos oficiais | Medway, MedGrupo e MedCof identificados, com edição; opção MetaMed e alternativa própria/importada |
| Identidade | O cadastro copia nome, área e especialidade para o bloco; não mantém vínculo estável ao item do catálogo | Item do aluno ligado ao item editorial, que por sua vez tem vários vínculos canônicos |
| Histórico | Já é por bloco do aluno, e não por assunto global | Preservar essa granularidade e acrescentar IDs e versões; nenhuma conclusão propagada a outras aulas |
| Relevância | Alta/média/baixa; o carregamento do catálogo atribui média a todos os itens | Nota efetiva de 1,0 a 10,0, com origem, versão e override individual separado |
| Intervalo | Motor MetaMed v1, piso 7 dias, teto 180; importância afeta revisões posteriores ao primeiro contato | Motor v2 rastreável com relevância numérica conservadora, mantendo proteção de amostras pequenas e limites |
| Semana | Segunda a domingo, fixa | Início configurável e definição consistente em todas as telas, métricas e fechamento |
| Disponibilidade | Dias habituais e uma capacidade diária igual para todos os dias | Padrão habitual mais ajustes de dias e capacidade por data da semana |
| Planejamento | Calculado ao carregar a home; existe outra rotina para reorganizar datas em configurações | Uma política de planejamento compartilhada, persistida e com revisão de versão |
| Atraso | Overflow de capacidade já pode gerar backlog na semana corrente | Pendência da semana, excedente sem vaga e dívida de semana encerrada são estados distintos |
| Datas passadas | O planejamento semanal pode selecionar slots anteriores à data de referência | Não criar novas sugestões no passado; conservar o histórico das datas anteriormente planejadas |
| Fila | Atrasados FIFO já têm tratamento próprio | Preservar FIFO, acrescentar carga estimada e preferência por distribuir aulas relacionadas |
| Movimento manual | Modal permite escolha de dia; na home a faixa é a semana atual; calendário tem faixa maior | Movimento para outras semanas e dias fora da rotina, por arraste ou botão |
| Próxima revisão | Data existe em Temas; card da home mostra conclusão ou agendamento, sem próxima sugestão | Após concluir, card mostra próxima sugestão e agendamento efetivo, quando houver |
| Calendar | Já há sincronização, fingerprints, ID estável e tentativa de refresh; recuperação inicial ao entrar no dashboard | Manter infraestrutura e garantir reprocessamento de pendências após reconectar, sem misturar falha externa com falha do plano |
| Áreas | Bloco tem uma grande área e há metadado da área original no catálogo | Área do cursinho na navegação; áreas canônicas corrigidas nos relatórios, incluindo distribuição multitema |
| Métricas | Médias simples de percentuais por bloco/revisão e contagem de revisões | Acurácia por questões, volume e carga separados, origem do dado e estimativa de área transparentes |
| Provas | Dados de interesse/data existem; não há matriz numérica por prova consultada pelo motor | Notas em tabela longa, seleção e pesos do aluno, fallback GLOBAL explícito |
| Temas próprios | Modal de cadastro seleciona tema do catálogo; não oferece criação livre | Cadastro próprio, busca por nomes e sinônimos, confirmação do vínculo e nota neutra |

### Evidências que mudam a leitura da documentação

O README descreve tema livre, importância editável e eventos que permanecem como histórico. O fluxo efetivamente usado não implementa integralmente essas descrições. A proposta deve partir do código observado, e a documentação precisa ser reconciliada na entrega.

A importância já existe no motor: os fatores atuais são 0,8/1,0/1,2 para o intervalo e 3/2/1 para a prioridade. A afirmação da reunião de que importância “não está no cálculo” não descreve esse checkout. Ao mesmo tempo, o caminho atual de carregamento dos catálogos converte todas as sugestões para média. Portanto, ter fatores no motor não equivale a ter a relevância editorial do Gabriel funcionando.

O motor ativo também não é o SM-2 clássico. Ele usa tabelas próprias de desempenho e dificuldade, encadeadas pelo intervalo anterior. Embora existam campos legados com nomes de SM-2 e contador de repetições, o número de revisões não aparece diretamente na fórmula do intervalo. O tempo desde o último contato participa da urgência; a data efetiva da revisão ancora a próxima sugestão. Antecipar ou atrasar uma revisão muda essa data de ancoragem.

Há duas rotas de distribuição: a seleção semanal da home e a busca/reorganização global de slots. Elas não aplicam exatamente a mesma ordenação. Centralizar a política evitará que salvar configurações e abrir a home produzam respostas diferentes.

## 5. Modelo de dados recomendado

Reaproveitar question_blocks como a instância do item do aluno e block_reviews como histórico. Não substituir essas tabelas por um histórico global de tema_id.

| Entidade | Finalidade e regra principal |
|---|---|
| Temas canônicos | ID estável, nome, especialidade e uma das cinco áreas editoriais; nomes podem mudar |
| Aliases/sinônimos | Vários termos de busca ligados ao tema; não definem equivalência automática |
| Cursinhos e edições de catálogo | Identificar origem e edição do cronograma; MedGrupo não deve ser automaticamente apresentado como uma edição específica de Medcurso sem confirmação editorial |
| Itens de catálogo | Uma aula/unidade revisável; chave composta de catálogo/edição e id_item de origem |
| Item ↔ tema | Vários vínculos com pesos; unicidade de item e tema, pesos positivos e soma 1 |
| Versões de relevância | Identificador de publicação, ano de referência, data, autoria e origem |
| Relevância por tema/prova | Tabela longa: tema, prova, versão e nota; GLOBAL também é uma prova/contexto de relevância |
| Item do aluno | O bloco existente, proprietário, origem e vínculo opcional ao catálogo; itens próprios também vivem aqui |
| Histórico de contatos | Primeiro contato/revisão, resultado informado, data real, cálculo e versão utilizada |
| Padrão de disponibilidade | Início da semana, timezone e capacidade habitual por dia |
| Configuração semanal | Exceção para datas daquela semana; não sobrescreve o padrão |
| Ocorrência/plano de revisão | Semana atribuída, data sugerida, data escolhida, origem automática/manual, estado e versão do plano |
| Pendência de Calendar | Intenção de sincronização e estado de tentativa, independente de salvar o estudo/plano |

O vínculo canônico orienta relevância, classificação e preferência de distribuição. Ele não transfere desempenho entre aulas. Revisar uma das seis aulas associadas a cirurgia cardíaca deve alterar apenas aquela instância do aluno.

Uma correção publicada duas vezes em 2026 precisa gerar duas versões distintas. ano_referencia não basta. Versão de relevância e edição de catálogo também são objetos diferentes. Uma mudança de nome não deve criar uma nova identidade; uma mudança material de aula/mapeamento precisa de política editorial e snapshot histórico.

No histórico, guardar a nota efetiva usada, a origem/override, os vínculos e pesos ou uma referência imutável à sua versão, o multiplicador e a versão do motor. Caso contrário, corrigir uma planilha no futuro alteraria retroativamente a explicação de decisões anteriores.

## 6. Planejamento semanal: comportamento proposto

### Padrão e exceção

No onboarding, o aluno informa os dias habituais e uma capacidade simples. Na tela da semana, “Ajustar esta semana” permite alterar cada dia e sua capacidade. Quem não alterar recebe o padrão. A personalização é opcional e pode ser feita para a semana seguinte antes de ela começar.

O início escolhido da semana deve valer para o agrupamento de tarefas, a consulta de concluídos, o FIFO, o cálculo das métricas semanais e o fechamento. Armazenar datas e timezone consistentemente. Mudar esse início não deve relabelar planos já encerrados.

### Três estados que precisam ser separados

1. **Por fazer nesta semana:** tarefa incluída no plano, mesmo que o dia originalmente escolhido tenha passado.
2. **Sem vaga/adiada:** revisão elegível que não coube na capacidade e recebe previsão de encaixe; não é automaticamente “atrasada” por ter sido calculada na semana.
3. **Atrasada de semana anterior:** ocorrência devida e não concluída quando sua semana de responsabilidade terminou.

É necessário definir a semana de responsabilidade de revisões elegíveis pelo limiar atual de urgência 0,8. Recomendo ancorá-la na semana da data sugerida ou na semana explicitamente escolhida pelo aluno. A elegibilidade antecipada pode oferecer estudo opcional, sem criar dívida antes da semana devida. Assim, um tema não fica atrasado apenas porque o sistema o considerou elegível cedo.

Uma revisão devida nesta semana que ficou sem vaga permanece “sem vaga” durante a semana e entra em dívida no fechamento, se não concluída. Uma revisão que só era opcional antecipadamente não entra em dívida nessa virada. A remarcação automática altera apenas a data de encaixe; não desloca a semana devida original para ocultar falta de capacidade. A interface deve dizer quanto trabalho ficou de fora da capacidade.

### Ordem da distribuição

Preservar escolhas manuais, incluindo as datas escolhidas em outras semanas. Abrir a home da semana atual não deve puxar de volta uma ocorrência que o aluno agendou manualmente para a seguinte. O aluno pode ultrapassar a capacidade ou escolher um dia fora da rotina, com informação de que se trata de um extra.

No preenchimento automático, a ordem recomendada é: dívida FIFO de semanas anteriores; revisões devidas nesta semana pela prioridade do motor; antecipações elegíveis opcionais apenas com o saldo restante. Uma antecipação de alta relevância não deve deslocar uma revisão devida agora e provocar dívida evitável. Desempates precisam de critérios estáveis.

Evitar concentrar aulas que compartilham temas canônicos no mesmo dia é uma preferência da distribuição automática. Não deve fazer uma dívida antiga desaparecer da fila, impedir o aluno de escolher livremente ou exigir que seis aulas fiquem em seis dias diferentes.

Não criar novos agendamentos automáticos em datas anteriores a hoje. Se uma tarefa tinha sido planejada para ontem, manter essa informação histórica e oferecer redistribuição para os dias restantes; ela continua na semana até o fechamento.

### Fechamento e confiabilidade

O fechamento deve ser uma operação do domínio, não um efeito colateral exclusivo de abrir a home. Pode ocorrer no servidor ou ser recuperado na próxima interação, processando sequencialmente as semanas ausentes. Em ambos os casos, precisa ser idempotente e registrar a mesma dívida apenas uma vez.

Não criar múltiplas dívidas da mesma ocorrência porque o aluno ficou quatro semanas sem entrar. Preservar a data original de entrada no backlog e sua ordem FIFO. Reagendar uma ocorrência já atrasada muda a data escolhida, mas não apaga sua dívida nem reinicia sua antiguidade. Uma revisão ainda não atrasada movida voluntariamente para outra semana segue a nova semana acordada; o histórico preserva a alteração. A urgência congelada atual pode ser mantida no piloto, com a data da dívida auditável.

Recalcular uma configuração semanal não deve mover tarefas concluídas, apagar datas manuais ou reorganizar todas as semanas futuras sem necessidade. O orçamento já consumido por trabalho realizado deve ser contabilizado sem atribuir uma nova vaga a uma tarefa concluída. Salvar o resultado como nova revisão do plano. Dois dispositivos não podem concluir a mesma ocorrência duas vezes nem disputar silenciosamente a última vaga.

## 7. Relevância: adotar a fórmula, especificar a influência

A fórmula editorial proposta é adequada para implementação determinística:

R_item = 0,7 × soma(peso_tema × nota_tema) + 0,3 × maior_nota_tema.

Um item com um tema conserva exatamente sua nota. Calcular com precisão decimal suficiente, sem arredondar parcelas. Persistir a nota efetiva com uma casa decimal e regra half-up. O formato visual inteiro, se usado, não pode substituir o valor armazenado.

Não basta escrever “multiplicador entre 0,7 e 1,3”. É necessário definir direção, ponto neutro e limites finais. Minha recomendação para o primeiro experimento é usar uma faixa mais conservadora, próxima da amplitude já existente: 0,8 a 1,2, com nota maior reduzindo o intervalo. Uma transformação candidata é:

f(R) = 1,2 − 0,4 × (R − 1) / 9.

Nessa política, R=1 produz 1,2; R=5,5 produz 1,0; R=10 produz 0,8. Isso é uma hipótese de produto para simular e calibrar, não uma conclusão sobre a curva de esquecimento. A faixa 0,7–1,3 do Gabriel permanece uma possibilidade posterior.

O fator numérico deve substituir o fator categórico do intervalo, nunca ser multiplicado por ele. Aplicar o piso de 7 e o teto de 180 depois dos fatores e do arredondamento final do intervalo. Para minimizar mudanças simultâneas, preservar no primeiro piloto as tabelas do primeiro contato — que hoje não aplicam o fator de importância — e aplicar a relevância numérica às revisões posteriores. Se a relevância também for aplicada ao primeiro contato, tratar isso como um experimento separado, com impacto explicitado.

O peso da relevância na prioridade também merece cuidado: ela reduz o intervalo, o que aumenta a urgência, e pode receber ainda um fator direto de prioridade. Copiar a razão atual 3:2:1 para uma escala numérica sem avaliar essa combinação pode dar influência excessiva à relevância. Recomendo primeiro comparar cenários com fator direto neutro e com um fator suave; escolher a regra após medir ordem, frequência, teto e dívida acumulada. FIFO permanece anterior a essa ordenação.

Relevância editorial e preferência do aluno são campos distintos. Permitir override individual rastreável; um ajuste do aluno não modifica a nota publicada. Itens próprios começam em valor neutro ou pedem escolha explícita, sem sugestão alta. Para uma escala inteira de 1–10, a sugestão neutra de interface pode ser 5; o ponto neutro matemático de uma transformação precisa ficar documentado separadamente.

## 8. Carga de estudo: separar peso de conteúdo e esforço

O Gabriel identifica corretamente que um item do MedGrupo pode agrupar vários assuntos que o MedCof divide em aulas. “Cinco revisões” não significa necessariamente o mesmo esforço. O peso do de-para, entretanto, não resolve a carga por soma: como os pesos de cada item somam 1, a soma continuaria atribuindo carga igual a todas as aulas.

Criar um campo separado de carga estimada. A quantidade de temas distintos pode ser usada como sinal inicial de amplitude, mas não como duração real validada. Um tema amplo pode ser mais trabalhoso que vários temas estreitos, e uma mudança editorial na taxonomia não deveria duplicar a carga sem alterar a aula.

Proposta de evolução: liberar primeiro capacidade diferente por dia e coletar duração opcional, formato da revisão e percepção de esforço. Em piloto controlado, comparar fila por contagem com fila por carga estimada, usando uma política simples, versionada e ajustável. Ativar o orçamento por carga quando ele gerar distribuições plausíveis para os três cursinhos.

Na interface, manter “3 revisões” como quantidade factual e, quando houver carga, acrescentar uma estimativa compreensível. Só mostrar minutos/horas se houver calibração suficiente para sustentar essa tradução. Não transformar o número de temas canônicos em “horas” por convenção.

Definir os casos de uma aula maior que a capacidade de qualquer dia e de saldo que não comporta o próximo item FIFO. Recomendo não fragmentar automaticamente a aula nem pular silenciosamente a dívida antiga. Mostrar a incompatibilidade e oferecer ajustar o orçamento, escolher como extra ou decompor o item com confirmação explícita. Essas decisões fazem parte do produto antes de ativar o novo orçamento.

## 9. Experiência do aluno após a mudança

**Entrada:** escolher catálogo e edição, informar rotina habitual e começar pelo primeiro contato. Dados de perfil que não alteram o planejamento continuam opcionais. Quando não houver perfil de relevância específico para a prova, usar GLOBAL e dizer isso.

**Semana:** preservar a faixa dos sete dias e a visão Feitos/Por fazer/Atrasados. Incluir “Ajustar esta semana” e mostrar o que está sem vaga separadamente da dívida encerrada. Não forçar o aluno a refazer onboarding toda semana.

**Card:** exibir nome e área do cursinho, desempenho recente e data efetivamente planejada. Depois da conclusão, mostrar “Próxima sugestão: data” e “Agendada para: data” se a distribuição já a tiver colocado em um dia. Uma pendência no Calendar não pode ocultar a data interna.

**Mover revisão:** arrastar no computador ou usar “Mover”/“Escolher dia”, com funcionamento por toque e teclado. Mover altera o agendamento, não registra estudo nem recalcula desempenho. Só a conclusão efetiva atualiza o próximo intervalo. Em caso de falha ao salvar, reverter o movimento visual e explicar o que permanece salvo.

**Tema ausente:** procurar pelo nome e pelos sinônimos; mostrar candidatos com contexto. O aluno confirma ou cria um item próprio. Não aplicar associação em silêncio, não fundir históricos e não promover automaticamente um item particular ao catálogo editorial.

**Calendário externo:** tratar o planejamento da MetaMed como fonte de verdade. Mostrar conexão e ações de recuperação. Hoje a presença de uma identidade Google pode esconder a opção de reconectar, mesmo com sincronização falhando: vínculo de identidade não comprova token ou permissão Calendar válidos. Oferecer recuperação também a esses usuários e reprocessar as alterações pendentes após renovar autorização.

A estrutura atual sincroniza um evento ativo por bloco; manter essa política inicialmente é uma opção simples, com o histórico completo dentro da plataforma. Se eventos concluídos precisarem permanecer no Google, modelar IDs por ocorrência e testar essa política explicitamente, pois ela difere do comportamento atual.

## 10. Relatórios e provas

### Relatórios de desempenho

Só utilizar grande_area da base após a correção editorial. O nome “Medicina Preventiva” precisa de correspondência explícita com “Preventiva” no enum da plataforma, sem alterar a área original do cursinho.

Itens que atravessam áreas contribuem proporcionalmente aos pesos canônicos, em vez de contar uma revisão inteira em todas elas. Se uma aula tem 60% em uma área e 40% em outra, distribuir a contribuição com essa proporção, preservando o total de questões e contatos. Como o aluno informa um resultado agregado, essa distribuição é uma estimativa de desempenho por área; não é uma medição de acerto em cada tema.

Para acurácia por questões, usar soma dos acertos dividida pela soma das questões no conjunto/periodização escolhidos. Hoje há médias simples de percentuais: uma revisão de 10 questões pode ter o mesmo peso de uma de 100. Se quiser manter “média por item” como outra métrica, identificar claramente o significado. Não misturar resultados recentes por bloco com evolução histórica sem explicar a janela.

Separar volume de revisões, carga estimada, questões respondidas e taxa de cumprimento do plano. O MVP não tem ranking; não há motivo para criar um como parte desta mudança. Identificar amostras pequenas e itens sem classificação. Lacunas no de-para não demonstram que um cursinho deixou de ensinar um assunto.

### Relevância específica por prova

Preparar a tabela longa agora, mas lançar apenas GLOBAL, porque o anexo ainda não entrega notas específicas de ENAMED. Não apresentar notas genéricas como se fossem personalizadas.

Para várias provas, há uma decisão matemática adicional: ponderar primeiro notas canônicas e depois calcular a fórmula do item, ou calcular uma relevância do item para cada prova e depois ponderar os resultados. O termo de máximo torna as duas operações diferentes.

Exemplo hipotético, com duas provas e dois temas de pesos iguais: notas (10,1) para o primeiro tema e (1,10) para o segundo. Com provas igualmente importantes, ponderar temas primeiro resulta em 5,5. Calcular por prova primeiro resulta em 6,85 antes do arredondamento. Essa diferença precisa ser deliberada.

Recomendo ponderar primeiro as notas de cada tema pelas prioridades normalizadas das provas do aluno e depois aplicar a fórmula editorial do item, uma vez. Isso evita reforçar máximos diferentes simultaneamente sem intenção explícita. É uma recomendação para a futura personalização, não uma exigência do anexo. Para cada combinação tema/prova ausente, usar GLOBAL, manter a prova na média e mostrar cobertura específica versus fallback. Ausência nunca significa zero.

A taxonomia e o de-para podem ser reaproveitados na chegada de ENAMED, mas a interface não ficará literalmente intacta se ainda não tiver seleção de provas, pesos e indicação de cobertura. Essas partes devem ser previstas no desenho e ativadas quando a base específica existir.

## 11. Migração e preservação do que existe

1. Criar estruturas novas de forma aditiva e manter o motor atual acessível durante o piloto.
2. Validar e publicar uma versão editorial completa antes de ativá-la. Reimportar a mesma versão não duplica itens.
3. Preservar todos os blocos e contatos existentes com seus IDs e valores usados no cálculo.
4. Associar legado apenas quando houver correspondência inequívoca ou confirmação. Nome parecido não é prova de identidade; o cadastro atual não preserva o ID do item original.
5. Itens sem correspondência permanecem disponíveis como legado/privados, com sua importância categórica original e origem explícita. Não inventar uma nota editorial exata a partir de alta/média/baixa; qualquer conversão de compatibilidade precisa de política identificada.
6. Aplicar a nova política prospectivamente, na próxima revisão ou em uma ação explícita de recalcular. Não apagar agendamentos manuais nem reescrever resultados anteriores.
7. Ao trocar de cursinho, oferecer o novo catálogo e manter os itens antigos consultáveis. Não transferir conclusão entre aulas só porque compartilham tema_id.
8. Distinguir retirar da fila/arquivar de excluir definitivamente. Hoje a exclusão do bloco pode eliminar seu histórico por cascata; uma reorganização de catálogo não deve disparar esse efeito.
9. Salvar contato, atualizar estado do item e concluir a ocorrência numa transação idempotente; emitir a intenção de Calendar depois. Uma falha externa não deve pedir ao aluno que registre novamente a revisão já salva.
10. Reversão deve permitir voltar à versão do motor/catálogo anterior sem apagar contatos registrados no piloto. Snapshots mantêm a explicação do que foi calculado em cada versão.

## 12. Ordem recomendada de implementação

| Etapa | Entregas | Dependências | Critério de saída | Esforço relativo |
|---|---|---|---|---|
| 0 — corrigir a base e fechar regras | Revisão das grandes áreas, consistência de IDs/pesos, versão, nomenclatura MedGrupo/edição; decisões sobre semana devida e influência da relevância | Gabriel/curadoria e revisão deste plano | Base editorial publicada com relatório de validação; regras sem ambiguidades críticas | Médio, com dependência editorial |
| 1 — tornar a semana confiável | Padrão/exceção semanal, capacidade por dia, início da semana, estados de pendência/sem vaga/dívida, fechamento idempotente e política única de distribuição | Regras da etapa 0; pode avançar em paralelo à correção editorial | Sem atraso antecipado; sem novos slots no passado; sem alterações indevidas em manuais/concluídos | Grande |
| 2 — concluir o fluxo semanal | Mover por arraste/botão, próxima revisão no card, feedback separado de Calendar e recuperação após reconectar | Etapa 1; revisão autenticada da integração existente | Mesma ação funciona em todas as telas e a revisão continua salva com falha externa | Médio |
| 3 — integrar identidade e relevância | Catálogos e edições, temas canônicos, vínculos, blocos com identidade estável, notas GLOBAL, snapshots e motor v2 em piloto | Base corrigida; modelos aditivos podem ser preparados em paralelo à etapa 1 | Fórmula reproduz a base, históricos isolados por item, legado preservado | Grande |
| 4 — calibrar carga e métricas | Duração/esforço opcional, simulação de orçamento por carga, acurácia por questões, áreas proporcionais e cobertura da base | Identidade e áreas corrigidas; dados de piloto | Distribuição plausível entre cursinhos e totais reconciliados, sem duração fictícia | Médio a grande |
| 5 — personalizar provas | Base ENAMED, seleção e pesos, fallback por tema/prova, cobertura e comparação entre versões | Entrega editorial específica e política de composição | Personalização utiliza notas específicas verificáveis, sem fingir cobertura | Médio técnico, com dependência editorial |

O primeiro marco de produto é a semana confiável, com recuperação do calendário e visibilidade da próxima revisão. O marco seguinte é a integração dos três catálogos com relevância GLOBAL. Carga calibrada e relevância específica por prova vêm depois. As estimativas são de complexidade relativa; datas exigem conhecer disponibilidade e ritmo da equipe.

## 13. Validação necessária antes do piloto

| Cenário | Resultado esperado |
|---|---|
| Tema da quinta não estudado na sexta | Continua pendente da mesma semana |
| Semana encerrou com seis tarefas devidas abertas | Uma dívida por ocorrência, FIFO na seguinte |
| Aluno fica semanas sem entrar | Fechamentos recuperados sem repetir dívida ou mudar sua antiguidade |
| Revisão elegível antecipadamente, mas devida na próxima semana | Não cria dívida nesta virada |
| Antecipação de alta relevância versus revisão devida nesta semana | Antecipação só usa capacidade restante após dívida e devidas |
| Semana sem dias disponíveis | Plano explicita ausência de capacidade e preserva dívida/itens; não gera datas impossíveis |
| Capacidade diferente em segunda e sábado | Orçamento correto por data |
| Exceção apenas desta semana | Semana seguinte volta ao padrão, salvo outra exceção |
| Alteração de início da semana | Planos antigos mantidos; regra consistente para planos novos |
| Abrir plataforma na sexta | Nenhuma nova sugestão automática para segunda passada |
| Mover manualmente para dia fora da rotina ou outra semana | Escolha preservada; movimento não registra revisão |
| Abrir home depois de mover manualmente para semana futura | Data futura não é substituída pela distribuição da semana atual |
| Reagendar uma revisão que já está atrasada | Data escolhida muda; entrada original e ordem da dívida são preservadas |
| Concluir revisão antecipada | Próxima sugestão parte da data efetiva de conclusão |
| Salvar revisão duas vezes ou em dois dispositivos | Um contato/uma conclusão por operação lógica |
| Falha após salvar contato, antes de atualizar estado | Transação não deixa histórico e bloco contraditórios |
| Revisar uma das seis aulas de cirurgia cardíaca | Somente aquela aula recebe contato/conclusão |
| Item multitema | Um item, vários vínculos; soma de pesos 1 |
| Nota com decimal de empate | Half-up no valor final, sem arredondar parcelas |
| Nota alta e aluno domina o item | Frequência respeita fator conservador, piso e teto |
| Amostra com 19 versus 20 questões | Transição explícita entre os modos existentes |
| Item de relevância alta novo e dívida antiga baixa | FIFO da dívida preservado |
| Aula maior que orçamento diário | Mensagem e alternativa explícita; sem fragmentação ou descarte silencioso |
| Correção de relevância no mesmo ano | Duas versões auditáveis, histórico anterior intacto |
| Troca de cursinho | Nenhuma conclusão transferida sem confirmação |
| Item que atravessa áreas | Totais de questões/acertos preservados, distribuição identificada como estimativa |
| Prova sem nota específica | GLOBAL utilizado e indicado; peso não some da média |
| Calendar sem autorização, token expirado, evento removido ou conexão perdida | Estado interno íntegro, pendência identificada e recuperação sem duplicação |
| Reconectar após múltiplos movimentos | Calendar recebe o estado atual, sem repetir operações obsoletas |

O ensaio sugerido na reunião deve incluir alunos dos três catálogos, um usuário com tema próprio e rotinas de internato/plantão que mudem de semana. As rotinas de teste devem medir cumprimento do plano, número de remarcações, carga prevista versus percebida, dívida acumulada e frequência de revisões. Esses resultados orientarão o ajuste de fatores; não usar apenas aprovação dos testes de código como evidência de qualidade pedagógica.

## 14. Decisões que o plano torna concretas

| Decisão | Recomendação inicial |
|---|---|
| Unidade do histórico | Instância do item do aluno; reaproveitar o bloco existente |
| Unidade da dívida | Ocorrência devida em semana encerrada, com entrada FIFO estável |
| Identidade editorial | Catálogo/edição + id_item; vínculo item/tema único |
| Escala | 1–10; efetiva com uma decimal |
| Versão | Publicação explícita, separada de ano e edição do cronograma |
| Multiplicador | Simular 0,8–1,2 como início conservador; substituir fator antigo |
| Primeiro contato | Preservar tabela atual no piloto inicial; alteração em experimento separado |
| Relevância na prioridade | Comparar efeito neutro/suave, sem importar automaticamente razão 3:1 |
| Capacidade | Diferente por dia agora; orçamento por carga depois de calibrado |
| Peso do de-para | Participação de conteúdo/relevância; não equivale a esforço |
| Tema próprio | Privado, origem explícita, busca por nomes e aliases, vínculo confirmado |
| Área | Área do cursinho na navegação, canônica corrigida em relatórios |
| Provas | GLOBAL agora; cobertura específica e pesos quando houver base |
| Calendar | Estado interno autoritativo e sincronização recuperável; política de histórico externo explícita |

## 15. Referências no código auditado

- [Motor e configuração](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/revision-engine.ts:10): versão MetaMed v1, parâmetros, intervalo, urgência, prioridade e planejamento semanal.
- [Importância convertida para média no carregamento](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/course-catalog.ts:125): metadados do catálogo disponíveis, mas sem relevância editorial efetiva.
- [Cadastro por seleção e importância derivada do catálogo](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/components/topic-form-modal.tsx:108): não há criação livre nem override numérico no formulário atual.
- [Cadastro copia os atributos para o bloco](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/components/topic-form-modal.tsx:169): não preserva o ID do item editorial.
- [Backlog criado a partir do overflow](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/revision-engine.ts:400): semana corrente usada para marcar dívida.
- [Persistência do plano ao carregar a home](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/app/dashboard/page.tsx:103): operações por bloco, sem fechamento semanal explícito.
- [Teste que aceita agendas em datas anteriores à referência](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/revision-engine.test.ts:247): confirma o comportamento local, não sua adequação ao requisito.
- [Concluídos agregados por bloco na home](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/app/dashboard/page.tsx:159): inclui contatos da semana sem separar primeiro contato na consulta.
- [Card da home](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/app/dashboard/page.tsx:286): mostra conclusão/agendamento; precisa explicitar próxima sugestão.
- [Registro de revisão](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/revision-actions.ts:26): contato e atualização do bloco são operações separadas.
- [Busca e reorganização global de slots](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/revision-actions.ts:165): distribuição a alinhar com a política semanal.
- [Escolha manual de dia](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/components/schedule-review-modal.tsx:121): dia fora da rotina já é permitido; ampliar faixa/contexto e acrescentar movimentação acessível.
- [Métricas atuais](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/app/dashboard/metricas/page.tsx:44): médias simples e classificação a partir da área do bloco.
- [Estado e sincronização de Calendar](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/calendar-sync.ts:21): fila local por bloco, fingerprints e atualização de um evento ativo.
- [Tentativa de renovar autorização](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/calendar-auth.ts:22): infraestrutura existente a verificar no fluxo autenticado.
- [Reconciliação ao entrar no dashboard](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/app/dashboard/layout.tsx:34): não é evidência de recuperação contínua em segundo plano.
- [Plano semanal no modelo](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/src/lib/database.types.ts:127): estrutura atual guarda capacidade, sem detalhamento de datas/ocorrências.
- [Histórico com exclusão em cascata](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/supabase/migrations/20260604010000_question_blocks_schema.sql:53): razão para não apagar blocos ao migrar catálogo.

## Apêndice A — auditoria completa dos anexos

### Inventário e integridade

| Aba | Faixa de dados inspecionada | Registros | Fórmulas |
|---|---|---|---:|
| leia-me | A1:A82 | Texto de apoio | 0 |
| temas_canonicos | A1:J493 | 492 temas | 0 |
| depara_medway | A1:L325 | 172 itens, 324 vínculos | 1.944 |
| depara_medgrupo | A1:L227 | 90 itens, 226 vínculos | 1.356 |
| depara_medcof | A1:L687 | 659 itens, 686 vínculos | 4.116 |

Totais: 921 itens, 1.236 vínculos e 7.416 fórmulas. Os 492 registros canônicos têm os dez campos preenchidos; além dos campos descritos no exemplo do documento, há uma coluna de justificativa. Todas as notas são inteiras e estão entre 2 e 10; a escala válida continua 1–10, embora esta edição não use nota 1. São 270 temas com confiança alta e 222 com confiança média, todos com ano 2026.

Passaram os controles de IDs canônicos únicos, referências existentes, faixa de notas, pesos positivos até 1, soma decimal dos pesos exatamente 1, pares item/tema únicos e consistência do nome/área/cursinho nas linhas de um mesmo item. Não foram encontrados campos canônicos vazios ou fórmulas divergentes do padrão. Todos os valores calculados em cache foram reconciliados com cálculo independente: nenhum cache ausente, erro de fórmula ou diferença de resultado nas 7.416 fórmulas.

Isso verifica a coerência do arquivo entregue com suas entradas e sua fórmula. Não confirma a validade editorial das notas e classificações, a equivalência aos cronogramas originais ou o recálculo de uma edição futura em todos os aplicativos. A planilha usa funções como MAXIFS; um importador deve recalcular a relevância a partir dos dados de origem, sem depender exclusivamente dos caches.

### Granularidade

| Temas distintos por item | Medway | MedGrupo | MedCof |
|---:|---:|---:|---:|
| 1 | 79 | 15 | 633 |
| 2 | 54 | 34 | 25 |
| 3 | 23 | 29 | 1 |
| 4 | 13 | 7 | 0 |
| 5 | 2 | 3 | 0 |
| 6 | 1 | 1 | 0 |
| 7 | 0 | 1 | 0 |

As cardinalidades e máximos informados no documento conferem. As médias de temas por item são aproximadamente 1,884/2,511/1,041. A diferença de amplitude existe; não existe no anexo uma duração que transforme essas médias em esforço ou minutos.

O cenário de histórico por item também confere: depara_medcof!A396:E401 tem seis aulas associadas a CIR-CAR-001; A282:E286 tem cinco associadas a CIR-URO-001. São conteúdos distintos de cirurgia cardíaca e litíase, e não duplicatas que devam ser eliminadas. Há também seis aulas para PED-NEU-001, portanto o máximo de seis não é exclusivo de cirurgia cardíaca.

### Inconsistências que precisam ser reconciliadas

| Prioridade | Achado | Evidência no arquivo | Consequência |
|---|---|---|---|
| Bloqueia relatórios por área | Somente duas grandes áreas preenchidas, contrariando a descrição de cinco | temas_canonicos!C2:C493: 435 Clínica Médica e 57 Medicina Preventiva; 106 CIR em C176:C281, 85 PED em C284:C368 e 69 GO em C369:C437 estão como Clínica Médica | 260 classificações precisam de revisão editorial antes da ativação |
| Corrigir exemplo/especificação | Neurointensivismo e Ética Médica vale 7,7, não 8,1 | depara_medway!G111:L112: pesos 0,45/0,55, notas 5/9, média 7,2, máximo 9, bruto 7,74 → 7,7 | Não usar a narrativa desatualizada como resultado esperado de implementação |
| Corrigir exemplo | Especialidade Cirúrgica Parte I vale 7,3, não 7,4 | depara_medgrupo!A132:L138: média 6,95, máximo 8, bruto 7,265 → 7,3; Parte II A139:L144 continua 6,5 | Atualizar documento e cenários de validação |
| Corrigir contagem | Preventiva MedCof tem 72 itens, não 71 | Contagem de IDs distintos depara_medcof!A2:C687 com área Preventiva; leia-me!A69 informa 71 | Evitar métricas/descrições baseadas na contagem antiga |
| Corrigir afirmação absoluta | Foca na APS também mapeia temas próprios de Preventiva | depara_medcof!E669=MP-APS-001; E680=MP-ETI-003; E687=MP-VIG-009 | Diferença entre áreas permanece válida, mas o exemplo precisa ser corrigido |
| Corrigir recorte | Neuro-Ped tem 12 itens, 11 IDs distintos e 9 exclusivos frente aos outros dois mapas | depara_medcof!E486/E493 repetem PED-NEU-007; E492 também está em Medway!E248; E494 também em Medway!E107 e MedGrupo!E90 | Não apresentar “12 temas exclusivos” como contagem auditada |
| Verificar fonte original | A equivalência das duas especialidades cirúrgicas a mais de cem aulas não é demonstrada pelo de-para | Os 13 IDs de MG-058/MG-059 têm vínculos com 22 itens MedCof; total de Cirurgia MedCof é outro recorte | Granularidade pode ser discutida sem afirmar equivalência curricular não demonstrada |
| Corrigir contrato | Documento recomenda uma decimal no banco; leia-me recomenda nunca arredondar no banco | Documento seção 3; leia-me!A19; fórmulas L usam ROUND com uma decimal | Unificar contrato: precisão intermediária, half-up no resultado persistido e arredondamento visual separado |
| Corrigir conteúdo de busca | ICC, usado como exemplo, não aparece nos aliases da IC crônica | temas_canonicos!I5 contém ICFEr; ICFEp; IC ambulatorial | Validar inclusão do alias ou trocar o exemplo; a busca literal atual não encontraria ICC |
| Limpar texto de versão | Leia-me diz que há só um tema de Preventiva e o resto virá depois | leia-me!A45 versus 57 temas MP e texto posterior da própria aba | Documento de apoio contém trechos de versões diferentes |
| Rever apoio editorial | Há 11 divergências entre ausência/sinal MedCof e existência no mapa | temas_canonicos!F29 e F142 têm “—”, mas temas aparecem no mapa; F482 tem Alta para MP-VIG-006 ausente no mapa | Não usar sinal_medcof como variável do motor ou como prova automática de cobertura |
| Esclarecer duplicação de fonte | Oncocirurgia: Melanoma aparece duas vezes sob Cirurgia com IDs distintos e mesmo tema | depara_medcof!A194:E194, MC-186; A385:E385, MC-375; ambos CM-DER-006 | Conferir cronograma original antes de fundir itens ou tratar como duas aulas independentes |

Exemplos inequívocos das áreas: temas_canonicos!A176:C176 é Atendimento inicial ao politraumatizado; A284:C284 é Reanimação neonatal e sala de parto; A369:C369 é Pré-natal e diagnóstico de gravidez. Os três estão registrados como Clínica Médica. A distribuição por prefixo é 175 CM, 106 CIR, 85 PED, 69 GO e 57 MP; ela ajuda a localizar os casos, mas a correção deve ser editorial, sem presumir que um prefixo resolve toda dúvida de classificação.

### Arredondamento: caso real para o importador

depara_medcof!A670:L671, MC-651, Foca na APS: Infectologia — Tuberculose e Hanseníase: pesos 0,5/0,5, notas 9/6, média 7,5 e máximo 9. A fórmula produz 7,95, que deve ser persistido como 8,0 pela regra half-up. O cache da planilha tem esse resultado. Esse é um caso verificável para a nova implementação. Aritmética binária e regra de empate são problemas diferentes; usar decimais evita confundi-los.

### Cobertura dos cronogramas mapeados

| Curso | Temas canônicos com vínculo | Temas sem vínculo | Ausências com nota ≥9 |
|---|---:|---:|---:|
| Medway | 315 | 177 | 5 |
| MedGrupo | 223 | 269 | 12 |
| MedCof | 470 | 22 | 2 |

A união dos três mapas alcança todos os 492 temas. As ausências referem-se a este mapa, não à totalidade do que o cursinho ensina. Há aulas bônus e agrupamentos cujo conteúdo não foi entregue separadamente.

MP-APS-001 tem nota 10 em temas_canonicos!A452:E452 e nenhum vínculo no MedGrupo. Está em Medway!A311:E311 e MedCof!A624:E625 e A669:E669. Isso sustenta oferecer um item próprio/complementar. A afirmação genérica de que MedGrupo não cobre políticas de saúde precisa ser especificada: sua aula SUS mapeia MP-SUS-001/002/003/007; são determinadas políticas e temas de APS que faltam no mapa.

Oftalmologia e otorrino, nos quatro temas canônicos de temas_canonicos!A171:A174, só têm vínculos em MedCof!E195:E201. A exclusividade desse recorte do mapeamento confere.

### Sinônimos e correspondência

temas_canonicos!I2:I493 contém aliases em todos os temas, com 1.244 entradas. Após normalizar caixa, espaços e acentos, 37 termos aparecem ligados a mais de um ID. Por exemplo, ABCDE significa algo diferente em melanoma (I170) e politrauma (I176); GNPE aparece em contexto adulto (I41) e pediátrico (I330). Aliases não devem ter uma unicidade global artificial, nem justificar correspondência automática.

Os títulos também não são uma chave segura. Há títulos iguais em áreas distintas, como desenvolvimento sexual em Pediatria e GO. Distinguir coincidência de nome, item realmente duplicado, conteúdo relacionado e equivalência curricular exige contexto.

### Proveniência e controles adicionais para a carga

Os anexos não contêm URLs, bibliografia, hyperlinks, links externos, comentários com fontes, duração de aulas, incidência mensurada por banca ou notas específicas de ENAMED. As justificativas e notas são evidência editorial disponível; não devem ser apresentadas como medição estatística independente.

O validador de importação deve acrescentar aos controles que já passaram: classificação canônica em cinco áreas válidas; identidade/edição do catálogo; publicação/version_id; ausência de pares item/tema duplicados; atributos do item consistentes; nota efetiva recalculada; compatibilidade de nomes de área; relatório das lacunas e aliases ambíguos. Lacunas e ambiguidades legítimas geram informação para curadoria, não exclusão automática de dados.

Não validar unicidade de id_item por linha do de-para. Essa regra literal do documento rejeitaria itens multitema válidos. Validar item único na tabela de itens e vínculo item/tema único na tabela de relações. A ativação deve ser atômica, com a versão anterior recuperável e sem sobrescrever o histórico do aluno.

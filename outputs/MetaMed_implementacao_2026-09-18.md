# MetaMed — levantamento da primeira entrega

Data: 18/09/2026. Referência: reunião com Gabriel de 20/08/2026 e plano de mudanças produzido nesta tarefa. Entrega implementada no checkout local da plataforma, na branch existente `dev`.

O funcionamento da semana, a segurança do registro de revisões, a recuperação do Calendar e o cálculo das métricas foram implementados. A migração foi executada em um banco PostgreSQL isolado para verificação. **O banco remoto não foi alterado e a aplicação não foi publicada.** A ativação exige aplicar a migração e publicar o frontend correspondente.

Esta entrega avança nas mudanças que podem ser desenvolvidas independentemente da revisão editorial da planilha. A base de Gabriel e a relevância numérica ainda não estão integradas. O motor de intervalos continua MetaMed v1, com a importância categórica e as regras existentes.

## Como era e como fica nesta entrega

| Mudança | Antes | Implementado |
|---|---|---|
| Rotina habitual | Dias fixos com uma capacidade igual por dia | Dias habituais com capacidade opcional diferente por dia |
| Início da semana | Segunda-feira fixa | Preferência configurável; semanas já registradas preservam sua âncora |
| Fuso | Datas de planejamento dependentes do dispositivo | Data do aluno calculada pelo fuso do perfil, com Brasília como padrão |
| Exceção semanal | Rotina habitual aplicada diretamente | Ajuste por semana, sem alterar a rotina habitual; botão para restaurá-la |
| Semana sem estudo | Capacidade sem representação clara de pausa | Capacidade zero aceita; nenhuma distribuição automática, com liberdade para escolhas manuais |
| Dias já passados | Podiam receber distribuição automática | Novas sugestões automáticas usam vagas a partir de hoje |
| Sem vaga nesta semana | Capacidade excedida podia virar atraso imediatamente | Fila de pendentes da semana; dívida somente depois do encerramento da semana devida |
| Ordem da fila | Regras diferentes na home e no reajuste global | Mesmo motor para dívida FIFO, devidas por prioridade e antecipações elegíveis com vagas restantes |
| Capacidade consumida | Revisões realizadas não reservavam as vagas do plano | Contatos de revisão realizados consomem capacidade e o tema não é proposto novamente na mesma semana |
| Histórico semanal | Disponibilidade sem ocorrência individual persistida | Ocorrência única por usuário, bloco e número de revisão, com semana original, estado e histórico de reagendamento |
| Ausência prolongada | Dívida calculada a partir da projeção atual | Fechamento idempotente ao retornar; uma dívida por ocorrência, conservando antiguidade e urgência congelada |
| Movimentação | Escolha limitada à semana na home | Arrastar para os dias visíveis ou escolher uma data, inclusive fora da rotina e em semanas futuras |
| Escolha manual | Podia ser sobrescrita pelo planejamento | Planejador preserva a escolha; datas antigas pendentes continuam visíveis em Atrasados |
| Visão futura | Semana atual somente | Prévia da próxima semana; consulta não fecha uma semana futura nem grava sugestões automáticas prematuramente |
| Card do tema | Data agendada sem próxima sugestão sempre explícita | Mostra próxima sugestão, data agendada e indicadores de extra, antecipação e dívida |
| Registro da revisão | Inserção de histórico e atualização do bloco separadas | RPC transacional, operação idempotente e controle do número de revisão esperado |
| Resposta incerta | Uma nova tentativa podia duplicar ou exibir outro cálculo | Retry conserva a entrada e a operação; retorno usa a revisão efetivamente salva |
| Tela antiga | Reagendamento podia atingir a revisão seguinte | Escolhas manuais e automáticas usam a versão da revisão; plano automático não substitui movimento manual |
| Falha do Calendar | Aviso posterior podia parecer falha do estudo ou da preferência | Estudo e preferências continuam confirmados; pendência externa recebe mensagem própria |
| Reconectar Google | Vínculo existente não tinha um fluxo de renovação claro | Configurações distinguem vincular e reconectar; renovação pede consentimento e acesso offline |
| Recuperar pendências | Principalmente na entrada no dashboard | Também após foco, conexão e token novo, com reconciliação serializada por aluno |
| Tokens simultâneos | Renovações concorrentes e leitura repetida da sessão | Refresh compartilhado; token renovado preservado e resposta tardia descartada após logout |
| Resposta externa antiga | Podia substituir estado mais recente | Persistência do resultado condicionada à versão lida; sincronização não altera a preferência de ativação |
| Calendário interno | Cabeçalho e disponibilidade habituais fixos | Ordem dos dias conforme perfil e indisponibilidade conforme ajustes da semana |
| Métricas | Média de percentuais dos temas/revisões | Soma dos acertos dividida pela soma das questões; retrato atual separado da progressão histórica |
| Sem amostra | Ausência de questões podia aparecer como desempenho zero | Ausência de amostra explicitada e excluída das comparações de acurácia |
| Modais | Foco e altura sem tratamento uniforme | Foco inicial, contenção de Tab, restauração ao fechar, Escape, bloqueio durante salvamento e rolagem em telas baixas |
| Documentação | Descrição do catálogo e dos eventos divergente do código | README reconciliado com cadastro vigente, agenda automática, evento ativo e migração desta entrega |

O fechamento acontece ao acessar o planejamento ou calendário e nas atualizações periódicas da home. Não foi criado um processo agendado independente. A regra usa a data de encerramento da ocorrência; retornar semanas depois não reinicia sua antiguidade.

O reajuste redistribui cada **próxima revisão já existente** uma vez, por até 105 semanas. Ele não simula conclusões futuras, não cria novas revisões fictícias e preserva solicitações de pré-prova. Sem vaga no horizonte, mantém a revisão sem data automática. A prévia futura também representa as revisões atualmente abertas; não prevê o resultado dos estudos que ainda serão feitos.

## Arquivos da entrega

| Parte | Arquivos principais |
|---|---|
| Tela semanal | `src/app/dashboard/page.tsx`, `src/components/weekly-availability-modal.tsx` |
| Preferências | `src/components/onboarding-panel.tsx` |
| Calendário interno | `src/app/dashboard/calendario/page.tsx` |
| Registro e movimentação | `src/lib/revision-actions.ts`, `src/components/review-modal.tsx`, `src/components/schedule-review-modal.tsx` |
| Motor e disponibilidade | `src/lib/revision-engine.ts`, `src/lib/study-availability.ts`, `src/lib/planning-date.ts` |
| Banco e serviços | `supabase/migrations/20260918230725_weekly_availability_and_review_occurrences.sql`, `src/lib/database.types.ts`, `src/lib/weekly-planning.ts` |
| Integração Calendar | `src/lib/calendar-sync.ts`, `src/lib/calendar-reconciliation.ts`, `src/lib/google-provider-token.ts`, `src/app/dashboard/layout.tsx` |
| Métricas | `src/lib/performance-metrics.ts`, `src/app/dashboard/metricas/page.tsx` |
| Acessibilidade | `src/lib/modal-accessibility.ts`, `src/lib/use-modal-accessibility.ts` |
| Verificação | Testes dos módulos acima, `scripts/verify-weekly-planning.mjs` |
| Documentação | `README.md`, este levantamento, plano original e mensagem para Gabriel em `outputs/` |

A migração é aditiva. As verificações confirmaram preservação dos blocos e contatos existentes, ownership das ocorrências, RLS e vínculos que impedem associar uma ocorrência a um bloco de outro usuário. A conclusão valida datas, questões/acertos, coerência do intervalo e versão esperada. Revisões retrospectivas cronologicamente válidas continuam aceitas. O cadastro do primeiro contato conserva seu fluxo atual com reversão compensatória se o histórico falhar; a transação nova cobre a conclusão das revisões.

As funções do banco usam execução com os privilégios do usuário e permissões explícitas. A implementação segue a documentação de [funções](https://supabase.com/docs/guides/database/functions) e [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) do Supabase. A seleção entre vínculo novo e renovação de Google segue [linkIdentity](https://supabase.com/docs/reference/javascript/auth-linkidentity), [signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth) e [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Verificação realizada

| Verificação | Resultado | Alcance |
|---|---|---|
| `npm test` | **84 testes em 10 arquivos passaram** | Motor, disponibilidade, snapshots, métricas, tokens, reconciliação, concorrência das ações e acessibilidade |
| `npm run lint` | Passou | Checkout local |
| `npx tsc --noEmit` | Passou | Tipagem de toda a aplicação |
| `npm run build` | Passou | Compilação de produção e geração das rotas |
| `git diff --check` | Passou | Alterações rastreadas |
| Verificação SQL via PGlite | **58 verificações passaram** | Todas as migrações históricas executadas em PostgreSQL isolado, com papéis e identificação do usuário simulados |
| Navegador Edge via Playwright | Fluxos abaixo confirmados | Aplicação local com dados fictícios e APIs interceptadas; nenhum dado real de aluno alterado |

No navegador foram confirmados:

1. Dívida antiga recebe vaga antes das revisões devidas; revisão sem vaga aparece em Pendentes nesta semana.
2. Aumentar a capacidade de sexta-feira redistribui as revisões pendentes.
3. Arrastar uma revisão de sábado para domingo fora da rotina a marca como extra.
4. Consultar a próxima semana usa hoje real no fechamento e realiza **zero gravações automáticas**.
5. Salvar uma revisão com Calendar sem autorização mantém uma única operação, incrementa uma vez a revisão e apresenta “Revisão salva” com pendência externa.
6. Pausar a semana com capacidade zero mantém a capacidade habitual e a escolha manual; restaurar a rotina remove a exceção.
7. Escolher uma data na semana seguinte mantém a data calculada e o número de revisões, com origem manual.
8. Duas revisões com 9/10 e 15/20 aparecem na progressão como **24/30 = 80%**, sem média simples dos percentuais.
9. A home cabe em 390 pixels de largura; calendário semanal tem rolagem horizontal própria e cards ficam em sequência.

Capturas com dados fictícios: [semana em desktop](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/output/playwright/semana-desktop.png), [semana em celular](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/output/playwright/semana-mobile.png) e [métricas em desktop](C:/Users/leonardo.pappas_soul/Documents/GitHub/SM-2_platform/output/playwright/metricas-desktop.png). Os artefatos locais de navegador foram excluídos do rastreamento Git.

Limites da verificação: PGlite executa PostgreSQL, mas este teste não cobre concorrência entre conexões independentes nem a configuração do PostgREST remoto. Os testes de navegador usam APIs simuladas. A reconexão OAuth e a criação de eventos com uma conta real de Google precisam ser verificadas no ambiente publicado após a migração.

## O que fica para a etapa seguinte

| Parte do plano | Estado e próxima dependência |
|---|---|
| Corrigir e versionar a base de Gabriel | Aguardando revisão das 260 grandes áreas, exemplos e possível repetição de melanoma; mensagem pronta para envio |
| Importador com validação editorial | Ainda não implementado; deve recalcular dados e produzir relatório antes da ativação |
| Catálogo canônico, itens de cursinho e de-para | Ainda não integrados ao banco/formulário; o catálogo atual permanece ativo |
| Associação persistida por item/tema e snapshots de relevância | Ainda não implementada; necessária antes de trocar o motor de importância |
| Busca por sinônimos e desambiguação | Ainda não implementada; os aliases ambíguos exigem confirmação de correspondência |
| Relevância GLOBAL 1–10 | Ainda não ativa; importância categórica e intervalos MetaMed v1 preservados |
| Relevância por prova e combinação ponderada | Etapa posterior à base específica de provas; ENAMED não foi inferido a partir de GLOBAL |
| Esforço em minutos ou amplitude da aula | Capacidade continua em quantidade de revisões; tempo opcional existente foi preservado, sem converter quantidade de temas em duração |
| Personalização de conteúdo fora do catálogo | Não adicionada nesta entrega |
| Publicação | Migração pronta e verificada localmente; aplicação e banco remoto ainda não atualizados |

A próxima mudança de motor deve entrar separadamente, com exemplos reconciliados, precisão decimal, arredondamento acordado e simulação comparativa. Esta entrega não substitui a importância categórica por uma nota numérica nem multiplica os dois fatores.

## Ativação e reprodução

Aplique a migração de setembro antes de publicar o frontend. O README contém os comandos para conferir o histórico e a simulação de aplicação no projeto vinculado. Após ativar, confira as RPCs com um aluno de teste, a semana atual, uma exceção semanal e a reconexão real do Google.

Para reproduzir a verificação SQL local em PowerShell, execute cada linha separadamente na pasta da plataforma:

```powershell
$weeklyVerificationDir = Join-Path $env:TEMP 'metamed-pglite-verify'
npm install --prefix $weeklyVerificationDir --no-save @electric-sql/pglite
$env:PGLITE_MODULE = Join-Path $weeklyVerificationDir 'node_modules/@electric-sql/pglite/dist/index.js'
node scripts/verify-weekly-planning.mjs
```

O runtime de verificação permanece fora das dependências da aplicação. Nenhuma migração remota, publicação, mensagem ao Gabriel ou alteração dos anexos originais foi executada nesta tarefa.

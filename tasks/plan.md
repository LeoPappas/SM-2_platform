# Plano de implementação: remoção da integração com o Google Calendar

Data: 2026-10-10 · Skills aplicadas: `deprecation-and-migration`, `planning-and-task-breakdown`

## Visão geral

Retirar a sincronização de revisões com o Google Calendar. O calendário interno (`/dashboard/calendario`) continua sendo a visão de agenda do aluno. O login com Google também continua, mas só com os escopos básicos (`openid email profile`), sem `calendar.events`.

## Decisão de deprecação

| Pergunta da skill | Resposta |
|---|---|
| A feature ainda gera valor único? | Pouco. O aluno já vê o plano no Início e no calendário interno. O Calendar só repete essas datas como eventos de dia inteiro |
| Quantos dependem dela? | Em produção (consulta de 2026-10-10): 3 usuários, 1 perfil com sincronização ligada e 1 bloco com evento. É a conta de teste do próprio time |
| Existe substituto? | Sim, o calendário interno. Se aparecer demanda, um feed `.ics` somente leitura atende sem OAuth sensível (fora deste plano) |
| Custo de migrar os consumidores | Quase zero: apagar 1 evento à mão |
| Custo de manter até a produção | Alto (abaixo) |

**O que custa manter o Calendar até a produção:**

1. **Verificação do Google.** `calendar.events` é escopo sensível. Para publicar o app OAuth é preciso passar pela verificação do Google, que leva de dias a semanas. Até lá, ou o app fica em modo Testing (o refresh token expira em 7 dias) ou mostra o aviso de app não verificado.
2. **Atrito para todos.** Hoje o login com Google pede acesso ao Calendar a todo usuário (`src/app/page.tsx:38`), inclusive a quem nunca vai ativar a sincronização.
3. **Segurança.** O refresh token do Google fica no `localStorage` (`google-provider-token.ts:35`). Um XSS expõe uma credencial de longa duração. Corrigir isso é a "Fase 6 — Calendar robusto", de tamanho M: Vault, rota no servidor e cron.
4. **Confiabilidade.** A sincronização roda só no navegador, ou seja, só enquanto o app está aberto. Foi a causa provável do item #29 da reunião (o Calendar desconectou).
5. **Superfície de código.** São cerca de 1.500 linhas entre 6 módulos, 4 arquivos de teste, 1 rota de API, 2 triggers e 7 colunas. Além disso, o estado de sincronização está presente em todos os caminhos de escrita de `question_blocks`.

**Veredito:** remover. A deprecação é **compulsória e imediata**. Não há usuários externos para avisar, então a fase de aviso não se aplica.

## Decisões de arquitetura

- **Expand/contract invertido.** Primeiro o código deixa de ler e escrever o estado do Calendar (Fase A). As colunas, triggers e o trecho da RPC continuam no banco, sem uso e sem causar dano. Só depois, num deploy separado, uma migration remove essas peças (Fase C). Assim cada deploy pode ser revertido sozinho.
- **As guardas de concorrência ficam.** `calendar-sync.ts` mistura duas coisas: a sincronização e as escritas protegidas de `question_blocks`. As escritas incluem o filtro `expectedRepetitions`, a regra "plano automático não substitui movimento manual" (`.or(planning_source...)`) e a exclusão. Essas escritas vão para um módulo novo, com os testes de concorrência que não dependem do Calendar.
- **O compilador confirma que nada sobrou.** Os campos `calendar_*` saem de `database.types.ts` já na Fase A. As colunas têm default, então os inserts continuam válidos, e o `tsc` aponta qualquer referência restante.
- **Limpeza dos tokens antigos.** Navegadores que já usaram o app guardam `metamed.google_provider_*` no `localStorage`, inclusive o refresh token. Uma limpeza única ao carregar o dashboard remove essas chaves. Ela pode sair depois de alguns meses.
- **O cliente OAuth do Google continua existindo.** O Supabase Auth precisa dele para o login. Saem só o escopo do Calendar, `prompt=consent`/`access_type=offline` e as variáveis `GOOGLE_OAUTH_*` da Vercel, que só a rota de refresh usava.

## Lista de tarefas

Detalhes e critérios de aceite em [`tasks/todo.md`](todo.md).

### Fase A — Código (um deploy, schema intacto)
- [x] T1: Separar as escritas protegidas de `question_blocks` da sincronização
- [x] T2: Telas de estudo sem Calendar (revisão, agendamento, tema, Início, Temas)
- [x] T3: Configurações sem a seção Google Calendar
- [x] T4: Login com escopos básicos, layout sem reconciliação e limpeza dos tokens antigos
- [x] T5: Apagar os módulos mortos, a rota de refresh e os tipos `calendar_*`
- [x] T6: README, `.env.example`, script de verificação e roteiro da Fase 0

### Checkpoint A
- [x] `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build` passam
- [x] Nenhuma ocorrência de `googleapis.com/calendar`, `calendar_sync`, `calendar_event` ou `provider_token` em `src/`
- [ ] Fluxo manual: login com Google pede só nome e e-mail; cadastrar tema, revisar, remarcar e excluir funcionam; nenhuma requisição a `googleapis.com`

### Fase B — Infraestrutura (depois do deploy da Fase A em produção)
- [ ] T7: Desligar Calendar no Google Cloud e na Vercel; apagar o evento que sobrou

### Fase C — Contract do schema (deploy separado, depois do deploy do código da Fase A; não depende da v3)
- [x] T8: Migration que remove colunas, triggers, índices e o trecho da RPC

### Checkpoint final
- [x] A migration passa em PGlite (`npm run verify:db`) e foi aplicada no Supabase em 2026-10-11, sem branch, por decisão do time
- [x] `scripts/verify-weekly-planning.mjs` passa
- [x] Não há referência ao Calendar em `src/` (`src/lib/calendar-removal.test.ts`), exceto nas migrations antigas e nos documentos históricos em `outputs/`

## Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Perder uma guarda de concorrência ao desmontar `calendar-sync.ts` | Alto: remarcação antiga sobrescreve a nova | T1 move as guardas sem mudar nada e leva junto os testes de concorrência |
| Refresh token antigo esquecido no `localStorage` | Médio | Limpeza única na T4; revogar o acesso em myaccount.google.com/permissions (T7) |
| A migration de contract conflita com a `complete_block_review` da v3, que ainda não está no remoto | Médio | Resolvido: a migration fica antes da v3 na ordem, recria a função só se a v3 não estiver aplicada e aborta se sobrar função dependente. A v3 e o gerador foram corrigidos. Cobertura em `scripts/verify-drop-calendar-sync.mjs` |
| Supabase Auth ou Google Cloud ainda pedem `calendar.events` por configuração | Baixo | O escopo vem do código (`scopes:`); T7 confere a tela de consentimento |
| Arrependimento: o Calendar volta a ser pedido | Baixo | Feed `.ics` por URL secreta: somente leitura, sem escopo sensível, menor que a Fase 6 |

## Perguntas em aberto

1. Manter o botão "Entrar com Google" (só escopos básicos) ou deixar apenas o link mágico por e-mail? Recomendação: manter, porque não exige verificação do Google.
2. ~~A Fase C pode esperar a v3?~~ Decidido: não precisa esperar. Aplicada em 2026-10-11, antes do deploy, porque ainda não havia usuários reais.

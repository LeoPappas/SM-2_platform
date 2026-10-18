# MetaMed — Fase 1: experiência semanal

Data: 18/10/2026. Fecha a Fase 1 de `MetaMed_reuniao_vs_plataforma_2026-10-04.md`, agora antes do teste com Leonardo, Gabriel e Pejô.

## Decisões de 18/10

| # | Decisão |
|---|---|
| D1 | A plataforma não planeja o primeiro contato. Ela planeja só as revisões; o primeiro contato segue o cronograma do aluno. |
| D5 | Celular e computador têm a mesma importância até o teste com usuários reais. |
| — | A matriz por prova (Fase 4) e o desempenho estratégico (Fase 5) ficam para depois da validação. |
| — | Os resquícios do Google Calendar (Google Cloud, Vercel, evento antigo) foram apagados pelo Leonardo. |

## O que mudou

### Aviso de início de semana
No Início, enquanto a semana atual não foi respondida, aparece "Sua semana começou na segunda-feira (12/10). Quais dias você tem livres?", com **Ajustar esta semana** e **Manter minha rotina**. Nos dois últimos dias da semana, a pergunta passa a ser sobre a próxima. Quem configurou a rotina durante a semana atual não é perguntado de novo. Ajustar, voltar à rotina ou manter contam como resposta (`weekly_plans.availability_confirmed_at`).

### Arrastar e soltar
Biblioteca `@dnd-kit/core` 6.3.1.
- **Início:** a alça ⋮⋮ de cada tema e os itens da faixa da semana podem ser arrastados para outro dia ou para a faixa "Próxima semana", que leva ao primeiro dia com vaga daquela semana.
- **Calendário mensal:** as revisões agendadas e as janelas calculadas também podem ser arrastadas; um clique continua abrindo as opções.
- **Mouse, toque e teclado:** no mouse, o arraste começa depois de alguns pixels; no toque, depois de segurar por 0,2 s, para a página continuar rolando. No Início, o teclado usa Espaço ou Enter para pegar, as setas para pular de dia em dia e Esc para cancelar, com avisos em português para leitor de tela. No calendário, o teclado continua pelo botão da revisão ("Remarcar dia").
- **Falha ao salvar:** a revisão aparece no dia novo na hora; se o salvamento falhar, ela volta ao dia anterior com a mensagem do erro.
- O botão de calendário de cada tema continua lá.

### Card concluído
Em "Feitos", quando a próxima revisão já tem dia, o card mostra "Próxima revisão agendada para dd/MM".

### Correções
- A data do primeiro contato usa o fuso do perfil, não o relógio do aparelho.
- Ao escolher um dia (no Início ou no calendário), o aviso de "fora da disponibilidade" e os atalhos de dia seguem o ajuste daquela semana, não só a rotina habitual.
- O simulador já tinha saído em 18/10.

### Arquivar em vez de excluir
Em Temas, **Arquivar** tira o tema do planejamento e do calendário e guarda o histórico (`question_blocks.archived_at`). Em "Arquivados", o tema pode ser restaurado ou excluído definitivamente. No banco, `prepare_weekly_plan` não cria ocorrência, não gera atraso e não devolve temas arquivados; o planejamento automático e a busca de vagas também os ignoram. As métricas continuam contando o histórico.

## Banco remoto

| Migration | Versão remota |
|---|---|
| `20261018200000_weekly_confirmation_and_archive` | `20261018195950` |

Antes de aplicar, conferi que as três funções substituídas no remoto eram idênticas às do repositório (MD5 do corpo). Depois, os quatro corpos remotos batem com o arquivo, e `confirm_weekly_availability` não pode ser chamada sem login.

## Verificações

- `npm run verify:db`: cinco suítes em PGlite. A nova (`verify-weekly-confirmation-and-archive.mjs`, 13 verificações) cobre temas arquivados fora do plano e do atraso, restauração, confirmação da semana (manter, ajustar, voltar à rotina), semana fechada e acesso anônimo.
- `npm test`: 144 testes. Os novos cobrem a regra do aviso, a disponibilidade por semana, o teclado no arraste, o arquivamento e o fuso do primeiro contato.
- `npm run lint` e `npm run build` sem erros.
- Não testado com login: o arraste com mouse, toque e teclado na tela real, o aviso e o arquivamento precisam de uma conta logada. Fica para o teste de vocês.

# Correção do início — 04/10/2026

A página local `/dashboard` exibia “O planejamento semanal está temporariamente indisponível” porque o banco remoto conectado ainda não tinha a função `public.prepare_weekly_plan(date)`, a tabela `public.weekly_plan_items` nem as colunas de disponibilidade introduzidas em setembro. O frontend já dependia desses objetos.

Foi aplicada no projeto `qwrlokkaxhtogmcgablr` a migração existente `supabase/migrations/20260918230725_weekly_availability_and_review_occurrences.sql`, sem modificar seu conteúdo. O conector Supabase registrou a execução com versão remota `20261004230438` e nome `weekly_availability_and_review_occurrences`.

## Verificação

- 58 cenários isolados de planejamento em PostgreSQL/PGlite aprovados antes da aplicação.
- Função, tabela, colunas e permissões confirmadas no banco remoto.
- RLS habilitada em `weekly_plan_items`; função disponível a `authenticated` e indisponível a `anon`.
- Contagens de temas, revisões e perfis preservadas antes/depois: 1, 1 e 2.
- Página validada na sessão real do Chrome e após recarregamento: cabeçalho da semana, disponibilidade e tema atrasado renderizados sem o erro.
- Captura local em `output/playwright/inicio-corrigido-2026-10-04.png`.
- Advisor de segurança consultado: nenhuma ocorrência atribuída aos objetos desta migração. Avisos em outros módulos/Auth ficaram fora desta correção.

## Estado e histórico

O planejamento semanal agora está aplicado ao banco remoto. A migração de relevância v3 continua pendente/inativa; não foi necessária para corrigir a página.

O histórico remoto já tinha diferenças de versões em relação aos arquivos locais anteriores. A execução via conector também recebeu um timestamp remoto diferente do nome do arquivo de setembro. Antes de um futuro `db push`, conferir o histórico e reconciliar a equivalência comprovada desta migração; não executar novamente o SQL de setembro nem reparar entradas automaticamente.

As descrições de “somente local” dos levantamentos de setembro são registros históricos. Este documento registra a aplicação remota do planejamento em 04/10/2026.

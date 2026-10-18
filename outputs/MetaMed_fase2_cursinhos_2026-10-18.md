# MetaMed — Fase 2: cursinhos e tema próprio

Data: 18/10/2026. Continua a Fase 2 de `MetaMed_reuniao_vs_plataforma_2026-10-04.md`.

## Decisões de 18/10

- A planilha `MetaMed_relevancia_v3.xlsx`, sem a aba `leia-me`, é a fonte da verdade. O documento técnico e a reconciliação de volumes deixam de bloquear a ativação.
- O Medcurso 2026 fica para depois. O catálogo MedGrupo continua sendo o Medcurso 2020.
- `ICC` entra como sinônimo de `CM-CAR-004` (insuficiência cardíaca crônica). É a única adição da plataforma à planilha.
- As migrations vão direto para o banco remoto, sem branch do Supabase, porque o ambiente ainda é inicial.

## O que está no banco remoto

| Migration | Versão remota | Efeito |
|---|---|---|
| `20260927180243_relevance_catalog_v3_foundation` | `20261018165454` | 492 temas, 1.245 sinônimos, 920 aulas, 1.235 vínculos, publicação GLOBAL/2026 validada e imutável |
| `20261018120000_activate_course_catalogs` | `20261018165519` | Medway, MedGrupo e MedCof ativos; `student_profiles.course_catalog_release_id`; opção `course` em `course_catalog_source` |

O tema e a revisão que já existiam continuam intactos. O motor numérico segue inativo: não há ativação `shadow`, e os alunos não leem as notas por tema.

### Como a v3 foi aplicada

O gerador agora embute temas e aulas num único documento JSON conferido por MD5, o que reduziu a migration de 760 KB para 261 KB, com o mesmo conteúdo. A comparação em PGlite entre a versão antiga e a nova deu tabelas idênticas, exceto pelo sinônimo `ICC`.

Mesmo assim, o arquivo era grande demais para uma chamada do conector. O texto exato foi gravado em seis partes num schema privado (`relevance_v3_staging`), cada uma conferida por MD5. Depois, uma migration curta conferiu o MD5 do arquivo inteiro (`6cce1d0b6e600a0a9936aa58b49a63b0`), executou o conteúdo e apagou o schema. Por isso o registro remoto da `20261018165454` mostra esse carregador, não o SQL completo.

## O que mudou na plataforma

- **Onboarding e Configurações:** novo passo "Qual cursinho você faz?" com quatro opções, sem descrições: Lista MetaMed, Medway, MedCof e Medcurso. O envio de lista própria em CSV saiu da tela. Trocar de cursinho vale para os próximos temas; os temas já registrados não mudam.
- **Simulador:** a página e o item do menu foram retirados. A fórmula experimental continua em `src/lib/relevance-engine.ts` para a Fase 3.
- **Cadastro de tema:** grande área → especialidade → aula do cursinho, com busca por título, área e sinônimo (por exemplo, `ICC`). O aluno sempre escolhe o resultado; nada é associado sozinho.
- **Vínculo com a aula:** o tema guarda `catalog_item_id`, a versão e a nota da publicação. O primeiro contato grava o mesmo vínculo.
- **Importância:** vem da nota da aula (≥ 7,5 alta; ≤ 3,5 baixa; demais média) e já entra no motor atual. É o atalho 3.1 do plano.
- **Tema próprio:** "Não encontrei meu tema" pede nome, uma das cinco grandes áreas, especialidade e importância (média por padrão). Enquanto o aluno digita, aparecem aulas parecidas com o botão "Usar esta aula".
- **Temas antigos:** ao editar um tema sem vínculo, a plataforma procura a aula de mesmo título no cursinho escolhido e avisa que vai vinculá-la ao salvar. O único tema remoto ("Arritmias, Síncope e PCR") tem correspondência exata no Medway.
- **Tema vinculado:** não pode trocar de aula, porque o banco trata esse vínculo como imutável. A tela explica isso e sugere excluir e registrar de novo.

## Verificações

- `npm run verify:db`: 58 + 98 + 23 + 16 verificações em PGlite. A nova suíte `verify-course-catalog-choice.mjs` cobre ativação, escolha do cursinho, troca para catálogo inativo, vínculo de tema antigo, imutabilidade e snapshot do primeiro contato.
- `npm test`: 132 testes. `npm run lint`, `tsc` e `npm run build` sem erros.
- No banco remoto, simulando um aluno logado: três cursinhos visíveis, 172 aulas Medway, `ICC` → "Insuficiência Cardíaca" (alta), notas por tema ocultas.

## Ainda não feito

- Teste visual com login real: a tela depende de entrar com Google ou link por e-mail.
- Publicação da `dev` na `main`. A produção roda o código de 11/10 (PR #4, sem Calendar), que é compatível com o banco novo: as migrations de hoje só acrescentam tabelas e colunas opcionais.
- Medcurso 2026, relevância por prova (Fase 4) e modo `shadow` do motor (Fase 3.2).

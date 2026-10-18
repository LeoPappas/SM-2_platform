# MetaMed — relevância numérica no motor

Data: 18/10/2026. Substitui o uso de categorias (alta, média, baixa) no cálculo. Na prática, antecipa as Fases 3.2 e 3.3 do plano, sem o período em modo de comparação.

## Decisão

- O motor usa a nota de 1 a 10. O aluno vê só a categoria derivada dela: ≥ 7,5 alta, ≤ 3,5 baixa, demais média.
- A Lista MetaMed passa a ser os 492 temas canônicos da planilha (aba `temas_canonicos`). A nota de cada tema é a própria `relevancia_global`.

## Por que número e não categoria

Análise feita sobre as 920 aulas publicadas:
- A nota mediana é 7,0. 316 aulas (34%) ficam até meio ponto do corte de 7,5, e 122 perto do corte de 3,5.
- Com categorias, 0,1 ponto no corte mudava o 3º intervalo de 126 para 82 dias (−35%) e a prioridade na fila em 50%.
- As notas dos temas são inteiros dados por julgamento, e 45% dos temas têm confiança "média". Um erro de 1 ponto vira cerca de 4% no intervalo com o número, contra 0% ou 25% com a categoria.
- A categoria tratava 7,5 igual a 10.

## Regras

| | Como fica |
|---|---|
| Intervalo | O fator vai de 1,2 (nota 1) a 0,8 (nota 10), em linha reta, com 1,0 na nota 5,5. Os extremos são os mesmos de antes. |
| Prioridade na fila | O peso vai de 1 (nota 1) a 3 (nota 10), em linha reta. Antes era 1, 2 ou 3. |
| Primeiro contato | Continua sem influência da relevância. |
| Origem da nota | Aula do cursinho → nota da aula. Lista MetaMed → `relevancia_global` do tema. Tema próprio, lista antiga ou CSV → número equivalente à categoria (alta 10, média 5,5, baixa 1), o que reproduz exatamente os fatores antigos. |

O motor passou a se chamar `metamed-v2` (`ENGINE_VERSION`). O módulo experimental `src/lib/relevance-engine.ts` saiu, porque o motor principal agora faz esse cálculo.

## Banco

Migration `20261018220000_numeric_relevance_engine`, versão remota `20261018203032`:
- `question_blocks.engine_relevance` guarda a nota usada pelo motor, e `question_blocks.canonical_topic_id` guarda o tema da Lista MetaMed.
- Um gatilho deriva `engine_relevance` em toda gravação, a partir da aula, do tema canônico ou da categoria. Por isso a versão do site anterior a esta continua gravando temas sem erro, e nenhum cliente consegue guardar um número errado.
- `block_reviews.engine_relevance` registra, em cada revisão, a nota com que o intervalo foi calculado. Esse registro não pode ser alterado depois.
- Alunos logados agora leem os temas canônicos, os sinônimos e as notas GLOBAL dos catálogos ativos.
- O tema que já existia ("Arritmias, Síncope e PCR", média) ficou com 5,5, que é o mesmo fator de antes.

## Verificações

- `npm run verify:db`: seis suítes. A nova (`verify-numeric-relevance.mjs`, 16 verificações) cobre o número derivado de cada origem, a correção de números errados, os clientes antigos, a regra de uma única origem por tema, o registro imutável nas revisões e a leitura pelos alunos.
- `npm test`: 145 testes, `tsc`, `lint` e `build` sem erros.
- No banco remoto, conferi que o corpo das funções bate com o arquivo e que um aluno logado lê os 492 temas, as 492 notas e os 1.245 sinônimos.

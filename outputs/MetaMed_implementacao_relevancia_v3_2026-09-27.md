# Implementação da relevância v3 — levantamento de 27/09/2026

## Resultado executivo

A `MetaMed_relevancia_v3.xlsx` foi aprovada para carga controlada em staging: 492 temas canônicos, 920 itens de curso, 1.235 vínculos ponderados e 7.410 fórmulas conferidas. A carga fica identificada pelos hashes das duas fontes, preserva versões anteriores e reserva `MC-186` por tombstone.

A relevância numérica continua inativa. O catálogo vigente de 184 aulas e o cálculo real das próximas revisões não foram substituídos. A interface recebeu uma comparação experimental, e o banco recebeu a fundação para ativar primeiro um catálogo e depois o motor em modo `shadow` por decisões separadas.

## Como a plataforma estava

- Um catálogo MetaMed fixo com 184 aulas era usado no cadastro.
- A importância de cada tema era categórica: alta, média ou baixa.
- O motor usava essa categoria para ajustar o intervalo real.
- Não havia identidade versionada para as planilhas dos cursinhos, publicação auditável de relevância, tombstone para itens retirados nem snapshot numérico no histórico.
- O simulador permitia ajustar o motor atual, mas não comparar uma nota contínua de 1 a 10.

## Como ficou nesta entrega local

- A v3 pode ser reproduzida a partir dos anexos e carregada como release `validated`, ainda invisível para alunos.
- Temas, aliases, notas GLOBAL/2026, itens Medway, MedGrupo e MedCof e seus vínculos ficam versionados por publicação.
- `MC-186` não pode reaparecer como item elegível; `MC-375` permanece como a aula válida de melanoma.
- Releases de catálogo passam pelos estados `draft`, `validated`, `active` e `retired`.
- A ativação experimental do motor numérico é uma decisão separada do catálogo e admite somente `shadow` nesta versão.
- O simulador compara o motor atual, explicitamente com importância média, com a transformação linear experimental da nota 1–10 para o fator 1,2–0,8.
- O primeiro contato não muda no experimento. Nos contatos seguintes, uma nota maior produz um intervalo candidato menor.
- O navegador não cria snapshots de relevância. Quando houver ativação, o banco deriva versão, configuração, fator e intervalo candidato a partir da ativação GLOBAL, evitando que um cliente altere esses valores.
- O intervalo real continua sendo o resultado do motor categórico atual. O intervalo candidato fica separado para análise.

## Arquivos implementados

### Auditoria e comunicação

- `outputs/MetaMed_auditoria_relevancia_v3_2026-09-27.md`: auditoria integral, diferenças v2→v3, achados remanescentes e critérios de importação.
- `outputs/MetaMed_relevancia_v3_manifest.json`: contagens, hashes, distribuições e política experimental.
- `outputs/MetaMed_retorno_Gabriel_relevancia_v3_2026-09-27.md`: mensagem pronta com o parecer e as correções ainda solicitadas.

### Importação e banco

- `scripts/generate-relevance-catalog-v3.py`: lê os anexos, valida integridade, recalcula relevâncias com decimal e half-up e gera uma migração determinística.
- `supabase/migrations/20260927180243_relevance_catalog_v3_foundation.sql`: schema, dados versionados, tombstone, políticas de acesso, RPC de sugestões e snapshots opcionais.
- `scripts/verify-relevance-catalog.mjs`: executa a migração isoladamente e testa contagens, imutabilidade, acesso, ativações, histórico e tentativas de adulteração.

### Plataforma

- `src/lib/relevance-engine.ts`: transformação numérica isolada do motor ativo.
- `src/lib/relevance-engine.test.ts`: limites, interpolação, primeiro contato, separação do fator categórico e validação de configuração.
- `src/app/dashboard/simulador/page.tsx`: aba de relevância e tabela semântica de comparação.
- `src/lib/database.types.ts`: tipos das publicações, releases, itens, vínculos, ativações, sugestões e snapshots.
- `src/lib/medical-catalog.ts`: identidade estável e metadados opcionais para catálogos versionados.
- `src/lib/revision-actions.test.ts`: confirma que o cliente envia apenas os dados observados da revisão; a política numérica fica sob controle do banco.
- `README.md`: status da v3, limites da entrega e comandos de reprodução.

## Proteções adotadas

1. O seed cria a publicação e os releases como `validated`, sem catálogo ativo e sem ativação numérica.
2. Alunos só podem consultar releases ativos; o staging validado não aparece na aplicação.
3. Histórico já ligado a um item continua revisável mesmo depois que o release é aposentado.
4. Score, versão e identidade ligados a um bloco tornam-se imutáveis.
5. Snapshots de revisão não podem ser alterados depois da gravação.
6. Inserções diretas e chamadas da RPC não podem forjar score, fator, fórmula ou configuração.
7. Sem ativação GLOBAL em `shadow`, nenhuma comparação numérica é persistida.
8. A conclusão da revisão preserva atomicidade, idempotência e controle de concorrência do planejamento semanal.
9. Aliases são candidatos de busca, não chaves únicas; 37 formas normalizadas são ambíguas.
10. `sinal_medcof` permanece metadado editorial e não participa do algoritmo.

## Validações concluídas

- Hash da planilha: `3671a6c8ce245c5e89e744671adc518b48cef4151b195352505dc2819da3fd7e`.
- Hash do documento técnico: `7710cf33765ec6d5145ab15cecff2d21f3c803af015c7949172835f54188f668`.
- Hash da migração gerada: `ffaf98d3a7252e6ece5351ecc8b49573f4b3e4d63d4d2913b1b6ffe204d7e159`.
- Validação das fontes concluída; uma segunda geração reproduziu a migração e o manifesto byte a byte.
- 97 verificações isoladas do catálogo, segurança, ativações e snapshots aprovadas em PostgreSQL via PGlite.
- 91 testes da aplicação aprovados em 11 arquivos.
- Verificação de tipos aprovada.
- Lint aprovado.
- Build de produção aprovado, incluindo `/dashboard/simulador`.
- 58 verificações históricas do planejamento semanal aprovadas contra a nova migração.

## Pendências do material do Gabriel

Estas pendências não impedem staging estrutural, mas impedem chamar a fonte de totalmente reconciliada:

- corrigir 71 para 72 itens MedCof de Preventiva;
- substituir a afirmação de 12 temas exclusivos de Neuro-Ped pelos números auditados: 12 itens, 11 temas distintos e 9 exclusivos;
- remover o trecho obsoleto que diz haver só um tema de Preventiva;
- incluir `ICC` como alias, se a sigla deve funcionar na busca;
- alinhar o texto do arredondamento ao half-up aplicado somente no resultado final persistido;
- reconciliar os volumes declarados das fontes com 172 itens Medway, 90 MedGrupo e 658 MedCof;
- decidir se os 11 sinais MedCof divergentes devem acompanhar o de-para ou representar outro critério editorial;
- documentar a definição que sustenta a comparação de “mais de cem” itens MedCof;
- corrigir no documento técnico a menção a três tabelas de dados e a frase que diz quatro validações após listar seis.

## O que ainda não foi ativado

- Nenhuma migração foi aplicada ao Supabase remoto.
- Nenhum release v3 foi ativado para alunos.
- Nenhuma nota numérica alterou datas reais de revisão.
- Nenhuma mudança foi publicada em produção.
- OAuth e Google Calendar não foram revalidados em ambiente publicado nesta entrega.

## Próxima etapa segura

Após receber as correções editoriais e o manifesto de proveniência, a sequência recomendada é aplicar a migração em um ambiente de staging remoto, repetir as verificações, ativar somente o release escolhido, vincular novos blocos por identidade estável e observar o motor em modo `shadow`. Uma migração futura pode introduzir o modo ativo somente depois de comparar os intervalos candidatos com o comportamento real e aprovar a calibração.

A fundação desta entrega representa somente a publicação GLOBAL/2026. Uma futura relevância por prova, como ENAMED, precisa versionar o score efetivo por combinação item–prova e registrar `exam_code` no snapshot. Essa extensão deve ter proveniência própria, sem alterar silenciosamente a publicação GLOBAL já hashada.

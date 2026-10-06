# Auditoria integral — MetaMed_relevancia_v3.xlsx

Data da auditoria: 27/09/2026. Análise somente leitura. SHA-256 da v3: `3671a6c8ce245c5e89e744671adc518b48cef4151b195352505dc2819da3fd7e`.

## Parecer

A v3 está **estruturalmente pronta para uma importação controlada**. Ela corrige os dois defeitos materiais da v2: as 260 grandes áreas incorretas e a duplicação da aula de melanoma. Não encontrei referências quebradas, pesos inválidos, fórmulas divergentes, caches ausentes, erros de cálculo, chaves duplicadas nem alteração indevida de notas.

A importação deve ficar condicionada a três controles operacionais: usar IDs em vez de posições de linha; tratar `MC-186` como registro removido e permanentemente reservado; e registrar uma versão de dataset além de `ano_referencia`. Se a v2 já entrou em algum ambiente, um simples upsert da v3 não basta, pois deixaria `MC-186` órfão e duplicado no banco.

As discrepâncias restantes são principalmente de documentação, proveniência e qualidade editorial. Elas não impedem a carga estrutural, desde que `sinal_medcof` e sinônimos não sejam usados como chaves ou regras do algoritmo. Impedem chamar o arquivo de fonte plenamente reconciliada ou empiricamente validada.

## Inventário da v3

| Aba | Faixa | Registros | Fórmulas |
|---|---|---:|---:|
| leia-me | A1:A92 | 80 linhas textuais não vazias | 0 |
| temas_canonicos | A1:J493 | 492 temas | 0 |
| depara_medway | A1:L325 | 324 vínculos, 172 itens | 1.944 |
| depara_medgrupo | A1:L227 | 226 vínculos, 90 itens | 1.356 |
| depara_medcof | A1:L686 | 685 vínculos, 658 itens | 4.110 |

Totais: 920 itens, 1.235 relações item–tema e 7.410 fórmulas. As cinco abas estão visíveis. Não há linhas ou colunas ocultas, tabelas nativas do Excel, gráficos, imagens, comentários, hyperlinks, links externos ou nomes definidos. As quatro abas de dados mantêm filtros sobre toda a faixa e congelamento em B2.

## Validações que passaram

- 492 `tema_id` distintos e 492 nomes canônicos distintos.
- Todos os dez campos de todos os temas estão preenchidos.
- Zero `tema_id` inexistente nas três abas de vínculo.
- Prefixos de item consistentes: MW, MG e MC nas respectivas abas.
- `cursinho` consistente em todas as linhas de cada aba.
- Zero par (`id_item`, `tema_id`) repetido.
- Repetição de `id_item` ocorre somente para representar um item com vários temas; nome, área e cursinho permanecem constantes dentro do item.
- Todo peso é numérico, maior que zero e menor ou igual a um.
- A soma dos pesos de cada um dos 920 itens é 1, dentro da tolerância de 1e-6.
- As 492 relevâncias canônicas são inteiros de 1 a 10; valores observados de 2 a 10, sem zero.
- Distribuição das notas inalterada: 2=15, 3=29, 4=63, 5=61, 6=94, 7=88, 8=76, 9=49, 10=17.
- Confiança inalterada: 270 `alta`, 222 `média`; todas as linhas referem-se a 2026.
- Todas as fórmulas seguem o padrão esperado em F, H, I, J, K e L.
- Todos os 7.410 valores salvos de fórmula estão presentes e concordam com cálculo independente a partir dos temas e pesos, incluindo half-up final a uma casa decimal.
- Nenhum score dos 920 itens que permanecem nas duas versões mudou.
- Faixas de relevância efetiva: Medway 3–10; MedGrupo 4–10; MedCof 2–10.
- A união dos três cronogramas continua alcançando todos os 492 temas.

## Mudanças exatas da v2 para a v3

### Grandes áreas

Exatamente 260 registros mudaram, somente no campo `grande_area`:

- `temas_canonicos!C176:C281`: 106 temas CIR, de Clínica Médica para **Cirurgia Geral**.
- `temas_canonicos!C284:C368`: 85 temas PED, de Clínica Médica para **Pediatria**.
- `temas_canonicos!C369:C437`: 69 temas GO, de Clínica Médica para **Ginecologia e Obstetrícia**.

O resultado é internamente exato por prefixo: 175 CM/Clínica Médica, 106 CIR/Cirurgia Geral, 85 PED/Pediatria, 69 GO/Ginecologia e Obstetrícia e 57 MP/Medicina Preventiva. Nenhum outro campo de tema mudou: IDs, nomes, especialidades, notas, sinais, confiança, justificativas, sinônimos e ano são idênticos à v2.

### Duplicata de melanoma

A v2 tinha `MC-186` e `MC-375`, ambos “Oncocirurgia: Melanoma” → `CM-DER-006`. A v3 removeu somente o antigo `depara_medcof!A194:L194`, correspondente a `MC-186`. `MC-375` permanece em `depara_medcof!A384:L384` e é o registro declarado correto. O total MedCof caiu de 659 para 658 itens e de 686 para 685 vínculos.

Não reaproveitar `MC-186`. Em uma migração sobre v2 previamente importada:

1. desativar/remover `MC-186` explicitamente;
2. se já houver histórico associado a ele, decidir uma migração auditável para `MC-375` em vez de simplesmente apagar eventos;
3. manter uma tombstone ou registro de alias de migração, sem tornar `MC-186` novamente elegível para criação;
4. importar as áreas corrigidas por `tema_id`, sem depender da ordem das linhas.

Todas as 685 linhas restantes do MedCof tiveram fórmulas reendereçadas para o novo limite `$2:$686`; após a linha retirada, as referências locais também avançaram uma linha. Todos os novos resultados e caches conferem. Medway e MedGrupo são semanticamente idênticos à v2.

## Achados anteriores resolvidos

- **260 áreas erradas:** resolvido, conforme faixas acima e `leia-me!A82`.
- **Melanoma duplicado:** resolvido; `MC-186` removido e `MC-375` preservado; explicado em `leia-me!A83`.
- **Unicidade de item descrita incorretamente:** resolvido em `leia-me!A15`, que diferencia item único na lista de aulas e par único na tabela de vínculos.
- **Foca na APS descrito como totalmente externo a Preventiva:** resolvido em `leia-me!A77`. A descrição agora reconhece dez aulas, sete exclusivamente transversais e três que também alcançam tema de Preventiva. Os vínculos estão em `depara_medcof!A668:L686`.
- **Falso positivo “Diferenças no Desenvolvimento Sexual”:** documentado como duas aulas legítimas em `leia-me!A84`; elas permanecem como `MC-417` em `A426:E426` e `MC-574` em `A591:E591`.
- **Exemplo Neurointensivismo e Ética:** a planilha mantém o valor correto 7,7 em `depara_medway!L111:L112`; o documento técnico v2 também foi corrigido para média 7,2 e score 7,7.
- **Especialidade Cirúrgica I:** permanece corretamente em 7,3 em `depara_medgrupo!L132:L138`; Parte II permanece 6,5 em `L139:L144`. O documento técnico v2 usa os valores corrigidos.
- **Contagem MedCof:** o documento técnico v2 agora registra 658 itens e 920 no total.

## Achados remanescentes

### 1. Leia-me contém uma descrição de escopo obsoleta

`leia-me!A52` diz que a versão inclui um único tema de Medicina Preventiva e que o restante virá em etapa própria. A própria v3 contém 57 temas MP, e `A55` afirma que Preventiva está completa. Esse texto é autocontraditório. Não afeta a estrutura das abas, mas precisa ser corrigido antes de usar o leia-me como especificação.

### 2. O leia-me ainda diz 71 itens de Preventiva no MedCof

`leia-me!A76` diz “setenta e uma”; a contagem distinta da v3 continua sendo **72** itens com `area_no_cursinho = Preventiva` em `depara_medcof!A2:C686`. O documento técnico v2 já usa 72. É uma falha documental, sem impacto na carga.

### 3. “Doze temas exclusivos” de neuropediatria continua incorreto

`leia-me!A75` e o documento técnico v2 dizem doze temas que os outros dois não tocam. O bloco `Neuro-Ped` em `depara_medcof!A479:E493` tem 12 itens, 11 IDs canônicos e **9 IDs exclusivos**: PED-NEU-003/004/006/007/008/009/010/011/012. `PED-NEU-007` aparece em dois itens. `PED-OUT-002` também está no Medway; `CM-NEU-006` está no Medway e no MedGrupo. Essa divergência não quebra a importação, mas superestima a lacuna.

### 4. “Mais de cem” não é reproduzível pelo de-para equivalente

`leia-me!A71` e o documento técnico v2 dizem que Especialidade Cirúrgica I/II condensam o que o MedCof distribui em mais de cem. As duas aulas do MedGrupo apontam para 13 temas; exatamente 22 itens MedCof apontam para esses mesmos 13 IDs. O MedCof tem 211 itens classificados como Cirurgia no total, mas isso não demonstra correspondência temática com as duas aulas. A diferença de granularidade é real; a contagem “mais de cem” exige os cronogramas-fonte ou outra definição de equivalência.

### 5. Proveniência contém volumes não reconciliados

`leia-me!A18:A20` informa fontes de 185 aulas Medway, 46 semanas × 2 temas MedGrupo e 640 aulas MedCof. A base final contém 172, 90 e 658 itens. Exclusões de navegação são mencionadas em `A61`, mas não há manifesto de inclusão/exclusão que reconcilie cada fonte, e MedCof tem 18 itens a mais do que o volume declarado da fonte mesmo após a duplicata removida. Não há anexos, hyperlinks ou hashes dos cronogramas-fonte dentro da planilha. Isso **não impede a importação estrutural**, mas impede reproduzir/auditar integralmente a curadoria a partir da v3 sozinha.

### 6. Sinal MedCof não coincide com o mapa em 11 temas

`leia-me!A44` define travessão como ausência de aula correspondente. Há cinco temas com travessão que possuem item MedCof: `CM-PNE-009` (`F29`; itens em `E344:E346`), `CM-NEU-006` (`F142`; `E493`), `CIR-DIG-013` (`F214`; `E264`), `CIR-URO-010` (`F229`; `E305`) e `CIR-PED-005` (`F279`; `E391`).

Há seis temas com sinal diferente de travessão e sem vínculo MedCof: `CM-DER-003` (`F167`), `GO-OBS-015` (`F383`), `MP-EPI-002` (`F462`), `MP-EPI-016` (`F476`), `MP-VIG-006` (`F482`) e `MP-VIG-007` (`F483`). Como o próprio arquivo diz que esse sinal é apoio editorial e não entra no algoritmo, isso não bloqueia a carga se essa coluna for tratada exatamente assim.

### 7. Sinônimos continuam ambíguos

Os 492 campos de sinônimos estão preenchidos, com 1.244 aliases; 37 termos normalizados aparecem em mais de um tema. Exemplos: ABCDE (`I170/I176`), CEP (`I85/I472`), GNPE (`I41/I330`), varizes (`I83/I241`) e PNI (`I300/I485`). Além disso, o exemplo “ICC” do documento técnico não está em `temas_canonicos!I5`, que contém “ICFEr; ICFEp; IC ambulatorial”. Não usar alias como chave única nem aplicar correspondência automática. Isso não bloqueia a importação, mas bloqueia um autocomplete silencioso baseado apenas em igualdade de alias.

### 8. Contrato de arredondamento ainda é ambíguo no leia-me

`leia-me!A26` diz simultaneamente “guardar com uma casa decimal” e “arredondar só na exibição, nunca no banco”. As fórmulas da coluna L calculam e armazenam uma casa decimal. O documento técnico v2 diz corretamente: quantizar half-up somente no resultado final persistido, sem arredondar média ou componentes; uma exibição inteira pode arredondar novamente apenas visualmente. A planilha calcula corretamente, mas o leia-me deve adotar o mesmo contrato.

### 9. Versionamento não é suficiente para múltiplas liberações anuais

Todos os 492 temas têm apenas `ano_referencia = 2026`. A v2 e a v3 são duas liberações distintas do mesmo ano; o campo não permite distingui-las. A carga precisa criar externamente `dataset_version`, `released_at` e hash do arquivo, mantendo vigência e histórico. Este é um requisito operacional para importação auditável, não uma falha de integridade das linhas.

## Evidência de granularidade que permanece válida

- `CIR-CAR-001` continua em seis itens MedCof, `depara_medcof!A395:E400`.
- `CIR-URO-001` continua em cinco itens MedCof, `A281:E285`.
- `PED-NEU-001` continua em seis itens MedCof, `A471:E476`, além de uma entrada Medway em `E236`.
- `MP-APS-001`, nota 10 em `temas_canonicos!A452:E452`, não tem entrada MedGrupo; aparece no Medway `E311` e no MedCof `E623:E624` e `E668`.
- Oftalmologia e otorrinolaringologia para o generalista continuam exclusivos do mapa MedCof: temas em `temas_canonicos!A171:A174`, vínculos em `depara_medcof!E194:E200`.

## Recomendação de importação

Para staging, a v3 pode ser importada com as seguintes garantias:

1. fixar o arquivo pelo hash auditado e atribuir uma versão de dataset própria;
2. validar as contagens esperadas: 492 temas, 920 itens, 1.235 vínculos;
3. importar os valores-fonte A:E e G; recalcular relevância no serviço com decimal e half-up, sem depender de fórmula/caches Excel;
4. associar a relevância desta versão a `prova = GLOBAL` de forma explícita, pois a planilha não contém uma coluna `prova`;
5. aplicar a remoção/tombstone de `MC-186` e preservar `MC-375`;
6. fazer upsert por chaves estáveis, nunca por linha ou sequência numérica;
7. tratar `sinal_medcof` como metadado editorial e sinônimos como candidatos não exclusivos;
8. rejeitar qualquer carga futura que viole as mesmas validações de referência, peso, par, nota ou cardinalidade de item.

Classificação final:

- **Integridade estrutural para importação:** aprovada.
- **Migração incremental sobre v2:** aprovada com tombstone/migração explícita de `MC-186`.
- **Documentação interna:** requer correções, mas não bloqueia a estrutura.
- **Proveniência reproduzível:** incompleta; requer manifesto dos cronogramas e das exclusões.
- **Qualidade médica/psicométrica das notas:** não validável a partir dos anexos; permanece curadoria editorial.

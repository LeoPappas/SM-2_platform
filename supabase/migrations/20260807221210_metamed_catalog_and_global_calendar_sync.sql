create table public.metamed_topics (
  id uuid primary key default gen_random_uuid(),
  source_order integer not null unique
    check (source_order > 0),
  pdf_page integer,
  original_area text not null,
  major_area text not null
    check (
      major_area in (
        'Clínica Médica',
        'Cirurgia',
        'Ginecologia e Obstetrícia',
        'Pediatria',
        'Preventiva',
        'A classificar'
      )
    ),
  specialty text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (original_area, specialty, title)
);

create index metamed_topics_catalog_idx
  on public.metamed_topics (original_area, specialty, source_order);

alter table public.metamed_topics enable row level security;

create policy "Authenticated users can read MetaMed topics"
  on public.metamed_topics for select
  to authenticated
  using (true);

revoke all on public.metamed_topics from anon, authenticated;
grant select on public.metamed_topics to authenticated;

insert into public.metamed_topics (source_order, pdf_page, original_area, major_area, specialty, title)
values
  (1, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia do Aparelho Digestivo', 'Abdome Agudo Inflamatório'),
  (2, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia do Aparelho Digestivo', 'Abdome Agudo Obstrutivo'),
  (3, 2, 'Cirurgia Geral', 'Cirurgia', 'Hepatologia', 'Afecções Benignas das Vias Biliares'),
  (4, 2, 'Cirurgia Geral', 'Cirurgia', 'Gastroenterologia', 'Afecções Pancreáticas'),
  (5, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Geral', 'Anestesia'),
  (6, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Vascular', 'Aneurismas'),
  (7, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Pediátrica', 'Cirurgia Pediátrica'),
  (8, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Torácica', 'Cirurgia Torácica'),
  (9, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Vascular', 'Doença Arterial Periférica'),
  (10, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Geral', 'Feridas, Enxertos e Retalhos'),
  (11, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Geral', 'Hérnias'),
  (12, 2, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Geral', 'Técnica Operatória'),
  (13, 2, 'Cirurgia Geral', 'Cirurgia', 'Trauma', 'Trauma Cranioencefálico (TCE)'),
  (14, 2, 'Cirurgia Geral', 'Cirurgia', 'Dermatologia', 'Tumores Dermatológicos'),
  (15, 3, 'Cirurgia Geral', 'Cirurgia', 'Ortopedia', 'Fraturas Ósseas'),
  (16, 3, 'Cirurgia Geral', 'Cirurgia', 'Ortopedia', 'Ortopedia Pediátrica'),
  (17, 3, 'Cirurgia Geral', 'Cirurgia', 'Ortopedia', 'Luxações / Lesões Ligamentares'),
  (18, 3, 'Cirurgia Geral', 'Cirurgia', 'Ortopedia', 'Tendinites/ Tenossinovites/ Fasceítes e Bursites'),
  (19, 3, 'Cirurgia Geral', 'Cirurgia', 'Ortopedia', 'Tumores Ortopédicos'),
  (20, 3, 'Cirurgia Geral', 'Cirurgia', 'Endocrinologia', 'Como cai na CIR: Tireoide'),
  (21, 3, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia do Aparelho Digestivo', 'Abdome Agudo Isquêmico'),
  (22, 3, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia do Aparelho Digestivo', 'Abdome Agudo Perfurativo'),
  (23, 3, 'Cirurgia Geral', 'Cirurgia', 'Urologia', 'Afecções Urológicas Benignas'),
  (24, 3, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia do Aparelho Digestivo', 'Cólon e Reto na Cirurgia'),
  (25, 3, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Geral', 'Cuidados e Complicações Pós-Operatórias'),
  (26, 3, 'Cirurgia Geral', 'Cirurgia', 'Gastroenterologia', 'Doença Inflamatória Intestinal'),
  (27, 4, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Vascular', 'Doenças Venosas'),
  (28, 4, 'Cirurgia Geral', 'Cirurgia', 'Gastroenterologia', 'Síndrome Disfágica'),
  (29, 4, 'Cirurgia Geral', 'Cirurgia', 'Gastroenterologia', 'Síndrome Dispéptica'),
  (30, 4, 'Cirurgia Geral', 'Cirurgia', 'Gastroenterologia', 'Hemorragia Digestiva'),
  (31, 4, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia do Aparelho Digestivo', 'Tumores do Aparelho Digestivo'),
  (32, 4, 'Cirurgia Geral', 'Cirurgia', 'Urologia', 'Tumores Urológicos'),
  (33, 4, 'Cirurgia Geral', 'Cirurgia', 'Trauma', 'Abordagem Inicial (xABCDE)'),
  (34, 4, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia do Aparelho Digestivo', 'Cirurgia da Obesidade'),
  (35, 4, 'Cirurgia Geral', 'Cirurgia', 'Cirurgia Geral', 'Cuidados Pré-Operatórios'),
  (36, 4, 'Cirurgia Geral', 'Cirurgia', 'Trauma', 'Queimaduras'),
  (37, 4, 'Cirurgia Geral', 'Cirurgia', 'Trauma', 'Trauma Abdominal'),
  (38, 4, 'Cirurgia Geral', 'Cirurgia', 'Trauma', 'Trauma de Face e Pescoço'),
  (39, 4, 'Cirurgia Geral', 'Cirurgia', 'Trauma', 'Trauma Torácico'),
  (40, 4, 'Clínica Médica', 'Clínica Médica', 'Gastroenterologia', 'Como cai na CM: Síndrome Disfágica'),
  (41, 5, 'Clínica Médica', 'Clínica Médica', 'Cardiologia', 'Arritmias, Síncope e PCR'),
  (42, 5, 'Clínica Médica', 'Clínica Médica', 'Reumatologia', 'Artrites e Diagnósticos Diferenciais'),
  (43, 5, 'Clínica Médica', 'Clínica Médica', 'Neurologia', 'Cefaleias e Tumores do SNC'),
  (44, 5, 'Clínica Médica', 'Clínica Médica', 'Oncologia e Hematologia', 'Distúrbios da Hemostasia, Desordens Trombóticas e Transfusão de Hemocomponentes'),
  (45, 5, 'Clínica Médica', 'Clínica Médica', 'Pneumologia', 'Embolia Pulmonar e Hipertensão Pulmonar'),
  (46, 5, 'Clínica Médica', 'Clínica Médica', 'Nefrologia', 'Glomerulopatias e Tubulopatias'),
  (47, 5, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'Infecções do Sistema Nervoso Central'),
  (48, 5, 'Clínica Médica', 'Clínica Médica', 'Oncologia e Hematologia', 'Onco-Hematologia'),
  (49, 5, 'Clínica Médica', 'Clínica Médica', 'Neurologia', 'Síndromes Neurológicas e Fraqueza Muscular'),
  (50, 5, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'Tuberculose'),
  (51, 6, 'Clínica Médica', 'Clínica Médica', 'Endocrinologia', 'Paratireoides, Suprarrenal e Outras Síndromes Endócrinas'),
  (52, 6, 'Clínica Médica', 'Clínica Médica', 'Cardiologia', 'Valvopatias e Cardiomiopatias'),
  (53, 6, 'Clínica Médica', 'Clínica Médica', 'Hepatologia', 'Cirrose, Insuficiência Hepática e Complicações'),
  (54, 6, 'Clínica Médica', 'Clínica Médica', 'Reumatologia', 'Colagenoses e Miopatias'),
  (55, 6, 'Clínica Médica', 'Clínica Médica', 'Nefrologia', 'Distúrbios Hidroeletrolíticos e Acidobásicos'),
  (56, 6, 'Clínica Médica', 'Clínica Médica', 'Dermatologia', 'Farmacodermias e Dermatoses'),
  (57, 6, 'Clínica Médica', 'Clínica Médica', 'Endocrinologia', 'Tireoide'),
  (58, 6, 'Clínica Médica', 'Clínica Médica', 'Psiquiatria', 'Transtornos Mentais'),
  (59, 6, 'Clínica Médica', 'Clínica Médica', 'Reumatologia', 'Vasculites'),
  (60, 6, 'Clínica Médica', 'Clínica Médica', 'Neurologia', 'Neurointensivismo e Ética Médica'),
  (61, 6, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'Pneumonias e Síndromes Gripais'),
  (62, 6, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'Como cai na CM: Doenças Sexualmente Transmissíveis'),
  (63, 7, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'Como cai na CM: Infecções de Pele, Ossos e Partes Moles'),
  (64, 7, 'Clínica Médica', 'Clínica Médica', 'Gastroenterologia', 'Como cai na CM: Síndromes Diarreicas e Disabsortivas'),
  (65, 7, 'Clínica Médica', 'Clínica Médica', 'Endocrinologia', 'Diabetes'),
  (66, 7, 'Clínica Médica', 'Clínica Médica', 'Pneumologia', 'Distúrbios Obstrutivos'),
  (67, 7, 'Clínica Médica', 'Clínica Médica', 'Hepatologia', 'Hepatites e Doenças do Metabolismo da Bilirrubina'),
  (68, 7, 'Clínica Médica', 'Clínica Médica', 'Cardiologia', 'Hipertensão Arterial Sistêmica'),
  (69, 7, 'Clínica Médica', 'Clínica Médica', 'Nefrologia', 'Insuficiência Renal'),
  (70, 7, 'Clínica Médica', 'Clínica Médica', 'Terapia Intensiva', 'Sepse, Choque Séptico e Outros Tipos de Choque'),
  (71, 7, 'Clínica Médica', 'Clínica Médica', 'Endocrinologia', 'Síndrome Metabólica e Dislipidemia'),
  (72, 7, 'Clínica Médica', 'Clínica Médica', 'Oncologia e Hematologia', 'Anemias e Hemoglobinopatias'),
  (73, 7, 'Clínica Médica', 'Clínica Médica', 'Neurologia', 'AVC'),
  (74, 8, 'Clínica Médica', 'Clínica Médica', 'Dermatologia', 'Doenças Infectoparasitárias com Acometimento Dermatológico'),
  (75, 8, 'Clínica Médica', 'Clínica Médica', 'Pneumologia', 'Doenças pulmonares intersticiais'),
  (76, 8, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'Endocardite e Infecção de Corrente Sanguínea'),
  (77, 8, 'Clínica Médica', 'Clínica Médica', 'Geriatria', 'Geriatria e Demências'),
  (78, 8, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'HIV e AIDS no Adulto Não Gestante'),
  (79, 8, 'Clínica Médica', 'Clínica Médica', 'Cardiologia', 'Insuficiência Cardíaca'),
  (80, 8, 'Clínica Médica', 'Clínica Médica', 'Toxicologia e Farmacologia', 'Intoxicações Exógenas e Acidentes por Animais Peçonhentos'),
  (81, 8, 'Clínica Médica', 'Clínica Médica', 'Terapia Intensiva', 'Pneumointensivismo'),
  (82, 8, 'Clínica Médica', 'Clínica Médica', 'Cardiologia', 'Síndrome Coronariana e Diagnósticos Diferenciais'),
  (83, 8, 'Clínica Médica', 'Clínica Médica', 'Infectologia', 'Síndromes Febris'),
  (84, 9, 'Clínica Médica', 'Clínica Médica', 'Psiquiatria', 'Abuso de Álcool, Tabaco e Outras Substâncias'),
  (85, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Ginecologia Endócrina', 'Ciclo Menstrual'),
  (86, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Ginecologia Endócrina', 'Contracepção'),
  (87, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Doenças Clínicas na Gestação', 'Diabetes mellitus na Gravidez'),
  (88, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Infecções do Trato Genital Feminino', 'Doença Inflamatória Pélvica e Violência sexual'),
  (89, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Mama', 'Doenças Benignas da Mama'),
  (90, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Corpo Uterino', 'Doenças do Corpo Uterino e Endométrio'),
  (91, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Parto', 'Estática fetal, pelve e mecanismo de parto'),
  (92, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Prematuridade na Obstetrícia', 'Rotura Prematura de Membranas Ovulares e Infecção Ovular'),
  (93, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Sofrimento Fetal', 'Sofrimento Fetal'),
  (94, 9, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Prematuridade na Obstetrícia', 'Trabalho de parto prematuro'),
  (95, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Infecções do Trato Genital Feminino', 'Vulvovaginites'),
  (96, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Vulva e Vagina', 'Patologias de Vulva e Vagina'),
  (97, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Ginecologia Endócrina', 'Amenorreias e Síndrome dos Ovários Policísticos'),
  (98, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Ginecologia Geral', 'Anatomia Pélvica'),
  (99, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Parto', 'Assistência ao Parto'),
  (100, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Ginecologia Endócrina', 'Climatério'),
  (101, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Uroginecologia', 'Incontinência urinária e Prolapsos de Órgãos Pélvicos'),
  (102, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Infertilidade', 'Infertilidade Conjugal'),
  (103, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Medicina Fetal', 'Medicina Fetal'),
  (104, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Doenças Clínicas na Gestação', 'Outras doenças na gestação'),
  (105, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Sangramento Uterino Anormal', 'PALM-COEIN'),
  (106, 10, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Puerpério', 'Puerpério'),
  (107, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Sangramento na Gestação', 'Sangramento da Primeira Metade da Gestação'),
  (108, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Sangramento na Gestação', 'Sangramento da Segunda Metade da Gestação'),
  (109, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Colo Uterino', 'Tumores do Colo Uterino'),
  (110, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Ovários', 'Tumores dos Ovários'),
  (111, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Mama', 'Tumores Malignos da Mama'),
  (112, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Doenças Clínicas na Gestação', 'Síndromes Hipertensivas da Gestação'),
  (113, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Acompanhamento Gestacional', 'Pré-Natal'),
  (114, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Colo Uterino', 'Rastreamento do Câncer de Colo Uterino'),
  (115, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Úlceras Genitais', 'Úlceras genitais'),
  (116, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Ginecologia Geral', 'Dor pélvica crônica'),
  (117, 11, 'Ginecologia e Obstetrícia', 'Ginecologia e Obstetrícia', 'Doenças Clínicas na Gestação', 'Hepatites virais, HIV/AIDS e outras infecções na gestação'),
  (118, 12, 'Pediatria', 'Pediatria', 'Cirurgia do Aparelho Digestivo', 'Como cai na PED: Abdome Agudo Inflamatório'),
  (119, 12, 'Pediatria', 'Pediatria', 'Cirurgia do Aparelho Digestivo', 'Como cai na PED: Anemias e Hemoglobinopatias'),
  (120, 12, 'Pediatria', 'Pediatria', 'Cardiologia', 'Como cai na PED: Hipertensão Arterial Sistêmica'),
  (121, 12, 'Pediatria', 'Pediatria', 'Oncologia e Hematologia', 'Como cai na PED: Onco-Hematologia'),
  (122, 12, 'Pediatria', 'Pediatria', 'Endocrinologia', 'Como cai na PED: Síndrome Metabólica e Dislipidemia'),
  (123, 12, 'Pediatria', 'Pediatria', 'Cardiologia', 'Cardiopatias Congênitas'),
  (124, 12, 'Pediatria', 'Pediatria', 'Gastroenterologia', 'Constipação Intestinal'),
  (125, 12, 'Pediatria', 'Pediatria', 'Alergologia e Imunologia', 'Desordens do Sistema Imune'),
  (126, 12, 'Pediatria', 'Pediatria', 'Neurologia', 'Epilepsia e Síndromes Convulsivas'),
  (127, 12, 'Pediatria', 'Pediatria', 'Otorrinolaringologia', 'Nariz, Ouvido e Laringe'),
  (128, 13, 'Pediatria', 'Pediatria', 'Neonatologia', 'Período Neonatal: Doenças Hematológicas'),
  (129, 13, 'Pediatria', 'Pediatria', 'Neonatologia', 'Período Neonatal: Doenças Infecciosas'),
  (130, 13, 'Pediatria', 'Pediatria', 'Neonatologia', 'Sala de Parto'),
  (131, 13, 'Pediatria', 'Pediatria', 'Puericultura', 'Segurança e Violência na Infância'),
  (132, 13, 'Pediatria', 'Pediatria', 'Terapia Intensiva', 'Sepse, Choque Séptico e Outros Tipos de Choque'),
  (133, 13, 'Pediatria', 'Pediatria', 'Cirurgia Pediátrica', 'Como cai na PED: Cirurgia Pediátrica'),
  (134, 13, 'Pediatria', 'Pediatria', 'Endocrinologia', 'Como cai na PED: Diabetes'),
  (135, 13, 'Pediatria', 'Pediatria', 'Puericultura', 'Avaliação e Transtornos do Comportamento na Infância e Adolescência'),
  (136, 13, 'Pediatria', 'Pediatria', 'Puericultura', 'Distúrbios Estaturais e Puberais'),
  (137, 13, 'Pediatria', 'Pediatria', 'Infectologia', 'Infecção do Trato Urinário (ITU)'),
  (138, 14, 'Pediatria', 'Pediatria', 'Oncologia e Hematologia', 'Como cai na PED: Distúrbios da Hemostasia, Desordens Trombóticas e Transfusão de Hemocomponentes'),
  (139, 14, 'Pediatria', 'Pediatria', 'Infectologia', 'Como cai na PED: Infecções do Sistema Nervoso Central'),
  (140, 14, 'Pediatria', 'Pediatria', 'Toxicologia e Farmacologia', 'Como cai na PED: Intoxicações Exógenas e Acidentes por Animais Peçonhentos'),
  (141, 14, 'Pediatria', 'Pediatria', 'Trauma', 'Como cai na PED: Queimaduras'),
  (142, 14, 'Pediatria', 'Pediatria', 'Nefrologia', 'Como cai na PED: Glomerulopatias e Tubulopatias'),
  (143, 14, 'Pediatria', 'Pediatria', 'Infectologia', 'Como cai na PED: Pneumonias e Síndromes Gripais'),
  (144, 14, 'Pediatria', 'Pediatria', 'Infectologia', 'Como cai na PED: Tuberculose'),
  (145, 14, 'Pediatria', 'Pediatria', 'Cardiologia', 'Arritmias, Síncope e PCR'),
  (146, 15, 'Pediatria', 'Pediatria', 'Nutrologia', 'Distúrbios Carenciais'),
  (147, 15, 'Pediatria', 'Pediatria', 'Pneumologia', 'Distúrbios Obstrutivos'),
  (148, 15, 'Pediatria', 'Pediatria', 'Infectologia', 'Doenças Exantemáticas'),
  (149, 15, 'Pediatria', 'Pediatria', 'Infectologia', 'Imunizações'),
  (150, 15, 'Pediatria', 'Pediatria', 'Nutrologia', 'Nutrição na Pediatria'),
  (151, 15, 'Pediatria', 'Pediatria', 'Neonatologia', 'Alojamento Conjunto e Testes de Triagem Neonatal'),
  (152, 15, 'Pediatria', 'Pediatria', 'Puericultura', 'Crescimento e Desenvolvimento na Infância e Adolescência'),
  (153, 15, 'Pediatria', 'Pediatria', 'Genética', 'Desordens Genéticas e Erros Inatos do Metabolismo'),
  (154, 15, 'Pediatria', 'Pediatria', 'Infectologia', 'Parasitoses'),
  (155, 15, 'Pediatria', 'Pediatria', 'Neonatologia', 'Período Neonatal: Doenças do Metabolismo'),
  (156, 15, 'Pediatria', 'Pediatria', 'Neonatologia', 'Período Neonatal: Doenças Respiratórias'),
  (157, 16, 'Pediatria', 'Pediatria', 'Gastroenterologia', 'Síndromes Diarreicas e Disabsortivas'),
  (158, 16, 'Pediatria', 'Pediatria', 'Infectologia', 'Como cai na PED: Síndromes Febris'),
  (159, 16, 'Preventiva', 'Preventiva', 'Atuação Médica', 'Ética médica, Bioética e Documentação'),
  (160, 16, 'Preventiva', 'Preventiva', 'Sistema Único de Saúde', 'Aspectos Históricos do SUS'),
  (161, 16, 'Preventiva', 'Preventiva', 'Testes Diagnósticos', 'Estatística de Testes Diagnósticos'),
  (162, 16, 'Preventiva', 'Preventiva', 'Epidemiologia', 'Estudos Epidemiológicos (Análise Estatística e Aplicação)'),
  (163, 16, 'Preventiva', 'Preventiva', 'Medidas de Saúde Coletiva', 'Indicadores de Morbimortalidade'),
  (164, 16, 'Preventiva', 'Preventiva', 'Medidas de Saúde Coletiva', 'Perfis e Indicadores Demográficos'),
  (165, 16, 'Preventiva', 'Preventiva', 'Infectologia', 'Como cai na PREV: HIV e AIDS no Adulto Não Gestante'),
  (166, 16, 'Preventiva', 'Preventiva', 'Promoção e Prevenção da Saúde', 'Como cai na PREV: Níveis de Prevenção (Imunizações)'),
  (167, 17, 'Preventiva', 'Preventiva', 'Sistema Único de Saúde', 'A Evolução do SUS'),
  (168, 17, 'Preventiva', 'Preventiva', 'Sistema Único de Saúde', 'Atenção Primária à Saúde'),
  (169, 17, 'Preventiva', 'Preventiva', 'Vigilância em Saúde', 'Epidemias, Endemias e Pandemias'),
  (170, 17, 'Preventiva', 'Preventiva', 'Promoção e Prevenção da Saúde', 'Níveis de Prevenção'),
  (171, 17, 'Preventiva', 'Preventiva', 'Vigilância em Saúde', 'Notificação'),
  (172, 17, 'Preventiva', 'Preventiva', 'Epidemiologia', 'Estudos Epidemiológicos (Classificação)'),
  (173, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica I'),
  (174, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica II'),
  (175, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica III'),
  (176, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica IV'),
  (177, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica V'),
  (178, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica VI'),
  (179, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica VII'),
  (180, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica VIII'),
  (181, 17, 'Radiologia', 'A classificar', 'Radiologia', 'Rádio Explica IX'),
  (182, 18, 'Cirurgia Geral', 'Cirurgia', 'Módulo Bônus', 'Diferencial de Cirurgia'),
  (183, 18, 'Radiologia', 'A classificar', 'Módulo Bônus', 'Imagens Radiológicas'),
  (184, 18, 'Todas', 'A classificar', 'Curso Bônus', 'Intensivos R1');

alter table public.student_profiles
  add column calendar_sync_enabled boolean not null default false;

update public.student_profiles as profile
set calendar_sync_enabled = exists (
  select 1
  from auth.identities as identity
  where identity.user_id = profile.user_id
    and identity.provider = 'google'
);

create or replace function public.apply_profile_calendar_sync_to_blocks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.calendar_sync_enabled is distinct from old.calendar_sync_enabled then
    update public.question_blocks
    set
      calendar_sync_enabled = new.calendar_sync_enabled,
      calendar_sync_status = case
        when new.calendar_sync_enabled then 'pending'
        when calendar_event_id is not null then 'pending'
        else 'disabled'
      end,
      calendar_last_error = null
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_profile_calendar_sync_to_blocks on public.student_profiles;
create trigger apply_profile_calendar_sync_to_blocks
  after update of calendar_sync_enabled
  on public.student_profiles
  for each row
  execute function public.apply_profile_calendar_sync_to_blocks();

create or replace function public.inherit_profile_calendar_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(profile.calendar_sync_enabled, false)
  into new.calendar_sync_enabled
  from public.student_profiles as profile
  where profile.user_id = new.user_id;

  new.calendar_sync_enabled := coalesce(new.calendar_sync_enabled, false);
  new.calendar_sync_status := case
    when new.calendar_sync_enabled then 'pending'
    else 'disabled'
  end;
  new.calendar_last_error := null;

  return new;
end;
$$;

drop trigger if exists inherit_profile_calendar_sync_on_insert on public.question_blocks;
create trigger inherit_profile_calendar_sync_on_insert
  before insert
  on public.question_blocks
  for each row
  execute function public.inherit_profile_calendar_sync();

update public.question_blocks as block
set
  calendar_sync_enabled = profile.calendar_sync_enabled,
  calendar_sync_status = case
    when profile.calendar_sync_enabled then 'pending'
    when block.calendar_event_id is not null then 'pending'
    else 'disabled'
  end,
  calendar_last_error = null
from public.student_profiles as profile
where profile.user_id = block.user_id;

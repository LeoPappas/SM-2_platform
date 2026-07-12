# MetaMed Revisao

Plataforma de revisao espacada para blocos de questoes de medicina, com autenticacao via Supabase, agenda de revisoes e sincronizacao one-way com Google Calendar.

## Requisitos

- Node.js 20.9 ou superior
- npm
- Um projeto Supabase com Google OAuth habilitado

## Configuracao

Crie um arquivo `.env` na raiz do projeto com:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

As variaveis `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` devem usar o mesmo cliente Web configurado no Google OAuth/Supabase. Elas ficam apenas no servidor e permitem renovar o token do Google Calendar quando o access token expira.

O schema vigente do app esta versionado em:

```text
supabase/migrations/20260604010000_question_blocks_schema.sql
```

A migration inicial antiga criou `themes` e `study_sessions`; a migration vigente remove essas tabelas e cria `question_blocks`, `block_reviews`, `areas` e `exam_targets`.

## Desenvolvimento local

Instale as dependencias:

```bash
npm install
```

Rode o servidor de desenvolvimento:

```bash
npm run dev
```

Abra:

```text
http://localhost:3000
```

## Verificacao

```bash
npm run test
npm run lint
npm run build
npm audit --omit=dev
```

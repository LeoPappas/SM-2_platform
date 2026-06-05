# SM-2 Platform

Plataforma de repeticao espacada para estudos de medicina, com autenticacao via Supabase, agenda de revisoes e sincronizacao one-way com Google Calendar.

## Requisitos

- Node.js 20.9 ou superior
- npm
- Um projeto Supabase com Google OAuth habilitado

## Configuracao

Crie um arquivo `.env` na raiz do projeto com:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

O schema esperado pelo app esta versionado em:

```text
supabase/migrations/20260604000000_initial_schema.sql
```

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
npm run lint
npm run build
npm audit --omit=dev
```

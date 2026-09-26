-- =====================================================================
-- Família Maçônica — esquema base
-- Núcleo ─< Organização ─< Vínculo >─ Pessoa
-- Todas as escritas passam por funções (RPC) em 0003; as tabelas só
-- recebem SELECT, filtrado por RLS (0002).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists app;

create type public.tipo_organizacao as enum ('loja', 'capitulo_demolay', 'castelo_escudeiros', 'bethel', 'colmeia');
create type public.papel_vinculo    as enum ('membro', 'adulto');
create type public.tipo_evento      as enum ('reuniao', 'conjunta', 'individual', 'convite', 'evento');
create type public.status_participacao as enum ('convidada', 'aceita', 'recusada');
create type public.tipo_resposta    as enum ('confirmado', 'ausente', 'aceito', 'recusado', 'ciente', 'concluido');
create type public.faixa_etaria     as enum ('crianca', 'adolescente', 'jovem', 'adulto');

-- ---------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------
create table public.nucleo (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cidade     text,
  uf         char(2),
  criado_em  timestamptz not null default now()
);

-- Templo / sala. Duas sessões no mesmo local não podem se sobrepor.
create table public.local (
  id         uuid primary key default gen_random_uuid(),
  nucleo_id  uuid not null references public.nucleo on delete cascade,
  nome       text not null,
  endereco   text
);

create table public.organizacao (
  id              uuid primary key default gen_random_uuid(),
  nucleo_id       uuid not null references public.nucleo on delete cascade,
  tipo            public.tipo_organizacao not null,
  nome            text not null,
  numero          text,
  jurisdicao      text,               -- Potência / Grande Conselho / Supremo
  local_padrao_id uuid references public.local,
  lembretes_horas int[] not null default '{24,2}',
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pessoas (dados mínimos — LGPD)
-- ---------------------------------------------------------------------
create table public.pessoa (
  id                 uuid primary key default gen_random_uuid(),
  auth_user_id       uuid unique,     -- auth.users.id, preenchido no primeiro acesso
  nome               text not null,
  data_nascimento    date,            -- obrigatória para membros; nula = adulto (ex.: responsável)
  email              text,
  celular            text,
  id_oficial         text,            -- ID DeMolay, CIM etc. — referência ao sistema oficial
  foto_url           text,
  foto_autorizada    boolean not null default false,
  conta_aprovada_em  timestamptz,     -- menores: aprovação do responsável
  conta_aprovada_por uuid references public.pessoa,
  anonimizada_em     timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create unique index pessoa_email_unico on public.pessoa (lower(email)) where email is not null;

create table public.responsavel (
  menor_id       uuid not null references public.pessoa on delete cascade,
  responsavel_id uuid not null references public.pessoa on delete cascade,
  parentesco     text,
  criado_em      timestamptz not null default now(),
  primary key (menor_id, responsavel_id),
  check (menor_id <> responsavel_id)
);

create table public.administrador (
  pessoa_id uuid primary key references public.pessoa on delete cascade
);

-- Pessoa × organização × papel × período. Uma conta, vários vínculos.
create table public.vinculo (
  id                 uuid primary key default gen_random_uuid(),
  pessoa_id          uuid not null references public.pessoa on delete cascade,
  organizacao_id     uuid not null references public.organizacao on delete cascade,
  papel              public.papel_vinculo not null default 'membro',
  secretaria         boolean not null default false,
  ativo              boolean not null default true,
  inicio             date not null default current_date,
  fim                date,
  motivo_desativacao text,
  criado_em          timestamptz not null default now(),
  check (ativo or fim is not null),
  check (not secretaria or ativo)
);
create unique index vinculo_ativo_unico on public.vinculo (pessoa_id, organizacao_id) where ativo;
create index on public.vinculo (organizacao_id) where ativo;

create table public.consentimento (
  id                uuid primary key default gen_random_uuid(),
  titular_id        uuid not null references public.pessoa on delete cascade,
  concedido_por_id  uuid not null references public.pessoa,
  versao_termo      text not null,
  finalidade        text not null,
  forma_verificacao text not null,
  concedido_em      timestamptz not null default now(),
  revogado_em       timestamptz
);

-- ---------------------------------------------------------------------
-- Cargos e gestões
-- ---------------------------------------------------------------------
-- Catálogo por tipo de organização (organizacao_id nulo) ou específico de uma organização.
create table public.cargo (
  id               uuid primary key default gen_random_uuid(),
  tipo_organizacao public.tipo_organizacao not null,
  organizacao_id   uuid references public.organizacao on delete cascade,
  nome             text not null,
  ordem            int not null default 100,
  vagas            int not null default 1 check (vagas > 0),
  para_adulto      boolean not null default false
);

create table public.mandato (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacao on delete cascade,
  nome           text not null,
  inicio         date not null,
  fim            date not null,
  check (fim > inicio),
  constraint mandato_sem_sobreposicao
    exclude using gist (organizacao_id with =, daterange(inicio, fim, '[]') with &&)
);

-- Período [inicio, fim): fim nulo = ocupação vigente.
create table public.ocupacao_cargo (
  id          uuid primary key default gen_random_uuid(),
  mandato_id  uuid not null references public.mandato on delete cascade,
  cargo_id    uuid not null references public.cargo,
  pessoa_id   uuid not null references public.pessoa,
  inicio      date not null,
  fim         date,
  interino    boolean not null default false,
  observacao  text,
  criado_em   timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create index on public.ocupacao_cargo (pessoa_id) where fim is null;

-- ---------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------
create table public.evento (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacao on delete cascade,  -- quem criou
  tipo           public.tipo_evento not null,
  titulo         text not null,
  descricao      text,
  local_id       uuid references public.local,
  inicio         timestamptz not null,
  fim            timestamptz not null,
  publico        boolean not null default false,
  serie_id       uuid,
  cancelado_em   timestamptz,
  criado_por     uuid references public.pessoa,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (fim > inicio),
  constraint evento_sem_conflito_local
    exclude using gist (local_id with =, tstzrange(inicio, fim) with &&)
    where (cancelado_em is null and local_id is not null)
);
create index on public.evento (inicio);

-- Organizações participantes. A criadora entra como 'aceita'.
create table public.evento_organizacao (
  evento_id      uuid not null references public.evento on delete cascade,
  organizacao_id uuid not null references public.organizacao on delete cascade,
  status         public.status_participacao not null default 'convidada',
  respondido_por uuid references public.pessoa,
  respondido_em  timestamptz,
  primary key (evento_id, organizacao_id)
);

-- Destinatários específicos (atividade individual, convite pessoal).
-- Se houver linhas aqui, só essas pessoas recebem o evento.
create table public.evento_pessoa (
  evento_id uuid not null references public.evento on delete cascade,
  pessoa_id uuid not null references public.pessoa on delete cascade,
  primary key (evento_id, pessoa_id)
);

create table public.resposta (
  evento_id      uuid not null references public.evento on delete cascade,
  pessoa_id      uuid not null references public.pessoa on delete cascade,
  resposta       public.tipo_resposta not null,
  respondido_por uuid references public.pessoa,
  respondido_em  timestamptz not null default now(),
  primary key (evento_id, pessoa_id)
);

-- ---------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------
-- Sem linha = push e e-mail ligados. Reuniões e cancelamentos não podem ser silenciados.
create table public.preferencia_notificacao (
  pessoa_id   uuid not null references public.pessoa on delete cascade,
  tipo_evento public.tipo_evento not null,
  push        boolean not null default true,
  email       boolean not null default true,
  primary key (pessoa_id, tipo_evento)
);

create table public.push_inscricao (
  id         uuid primary key default gen_random_uuid(),
  pessoa_id  uuid not null references public.pessoa on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  criado_em  timestamptz not null default now()
);

create table public.notificacao (
  id              uuid primary key default gen_random_uuid(),
  pessoa_id       uuid not null references public.pessoa on delete cascade,  -- destinatário
  evento_id       uuid references public.evento on delete cascade,
  sobre_pessoa_id uuid references public.pessoa on delete cascade,           -- cópia ao responsável
  motivo          text not null,
  titulo          text not null,
  corpo           text not null,
  agendada_para   timestamptz not null default now(),
  processando_em  timestamptz,
  enviada_em      timestamptz,
  descartada_em   timestamptz,
  erro            text,
  lida_em         timestamptz,
  criado_em       timestamptz not null default now()
);
create index notificacao_pendente on public.notificacao (agendada_para)
  where enviada_em is null and descartada_em is null;
create index on public.notificacao (pessoa_id, criado_em desc);

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
create table public.log_auditoria (
  id        bigint generated always as identity primary key,
  autor_id  uuid,              -- pessoa
  autor_auth uuid,             -- auth.users
  acao      text not null,
  tabela    text not null,
  alvo_id   text,
  dados     jsonb,
  em        timestamptz not null default now()
);

create table public.tentativa_login (
  email         text primary key,
  falhas        int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);

-- =====================================================================
-- Agenda no celular: link pessoal de assinatura (iCalendar) para o Google
-- Agenda ou o calendário do iPhone acompanharem a agenda do app.
--   O link carrega um segredo aleatório; o banco guarda só o hash (SHA-256),
--   então nem quem lê o banco reconstrói o link. Gerar outro link invalida o
--   anterior; "Desligar" apaga.
--   O calendário mostra o mesmo que a agenda do app (a pessoa e seus
--   dependentes), só título, horário, local e organização: sem descrição.
--   Crianças (< 12) não têm link. Conta inativa ou anonimizada: o link para.
-- =====================================================================
create table public.assinatura_agenda (
  pessoa_id  uuid primary key references public.pessoa on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  criado_em  timestamptz not null default now(),
  usado_em   timestamptz
);
alter table public.assinatura_agenda enable row level security;
alter table public.assinatura_agenda force row level security;
revoke all on public.assinatura_agenda from anon, authenticated;

create or replace function public.criar_assinatura_agenda(p_token_hash text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_me uuid := app.exigir_login();
begin
  if app.faixa_de(v_me) = 'crianca' then
    raise exception 'A agenda no calendário do celular não está disponível para menores de 12 anos.' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Link inválido.';
  end if;
  insert into assinatura_agenda (pessoa_id, token_hash) values (v_me, p_token_hash)
  on conflict (pessoa_id) do update set token_hash = excluded.token_hash, criado_em = now(), usado_em = null;
end $$;

create or replace function public.revogar_assinatura_agenda()
returns void language sql security definer
set search_path = public, pg_temp as $$
  delete from assinatura_agenda where pessoa_id = app.exigir_login()
$$;

create or replace function public.minha_assinatura_agenda()
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select jsonb_build_object('criado_em', criado_em, 'usado_em', usado_em)
    from assinatura_agenda where pessoa_id = app.exigir_login()
$$;

-- Lida pelo servidor do app (service_role) quando o calendário busca o link.
create or replace function public.agenda_por_token(p_token_hash text)
returns table (id uuid, titulo text, inicio timestamptz, fim timestamptz, local text, organizacao text,
               cancelado boolean, atualizado_em timestamptz)
language plpgsql security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_pessoa uuid;
  v_usado  timestamptz;
begin
  select a.pessoa_id, a.usado_em into v_pessoa, v_usado
    from assinatura_agenda a join pessoa p on p.id = a.pessoa_id
   where a.token_hash = p_token_hash and p.anonimizada_em is null;
  if v_pessoa is null or not app.conta_ativa(v_pessoa) or app.faixa_de(v_pessoa) = 'crianca' then
    return;
  end if;
  -- Os calendários buscam o link várias vezes por dia: grava no máximo uma vez por hora.
  if v_usado is null or v_usado < now() - interval '1 hour' then
    update assinatura_agenda set usado_em = now() where pessoa_id = v_pessoa;
  end if;

  return query
    select e.id, e.titulo, e.inicio, e.fim, l.nome, o.nome, e.cancelado_em is not null, e.atualizado_em
      from evento e
      join organizacao o on o.id = e.organizacao_id
      left join local l on l.id = e.local_id
     where e.inicio >= now() - interval '30 days' and e.inicio < now() + interval '1 year'
       and (app.pode_ver_evento_como(e.id, v_pessoa)
            or exists (select 1 from responsavel r
                        where r.responsavel_id = v_pessoa and app.pode_ver_evento_como(e.id, r.menor_id)))
     order by e.inicio;
end $$;

-- Anonimização (pedido do titular ou limpeza) também desliga o link.
create or replace function app.apagar_assinatura_anonimizada()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  delete from assinatura_agenda where pessoa_id = new.id;
  return new;
end $$;
create trigger apagar_assinatura
  after update of anonimizada_em on public.pessoa
  for each row when (new.anonimizada_em is not null)
  execute function app.apagar_assinatura_anonimizada();

revoke all on function public.criar_assinatura_agenda(text) from public, anon, authenticated;
revoke all on function public.revogar_assinatura_agenda() from public, anon, authenticated;
revoke all on function public.minha_assinatura_agenda() from public, anon, authenticated;
revoke all on function public.agenda_por_token(text) from public, anon, authenticated;
grant execute on function public.criar_assinatura_agenda(text) to authenticated;
grant execute on function public.revogar_assinatura_agenda() to authenticated;
grant execute on function public.minha_assinatura_agenda() to authenticated;
grant execute on function public.agenda_por_token(text) to service_role;

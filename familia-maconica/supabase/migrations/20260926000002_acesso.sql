-- =====================================================================
-- Funções de acesso, auditoria e políticas RLS.
-- Quem vê o quê fica garantido no banco, mesmo se a tela errar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Faixa etária (seção 8-C do dossiê)
-- ---------------------------------------------------------------------
create or replace function app.faixa(p_nascimento date)
returns public.faixa_etaria
language sql stable
set search_path = public, pg_temp
as $$
  select case
    when p_nascimento is null                                   then 'adulto'
    when age(current_date, p_nascimento) < interval '12 years'  then 'crianca'
    when age(current_date, p_nascimento) < interval '16 years'  then 'adolescente'
    when age(current_date, p_nascimento) < interval '18 years'  then 'jovem'
    else 'adulto'
  end::public.faixa_etaria
$$;

create or replace function app.faixa_de(p_pessoa uuid)
returns public.faixa_etaria
language sql stable security definer
set search_path = public, pg_temp
as $$ select app.faixa(data_nascimento) from pessoa where id = p_pessoa $$;

-- ---------------------------------------------------------------------
-- Conta ativa: tem vínculo ativo (ou é responsável de menor ativo, ou
-- administrador) e, se menor, teve a conta aprovada pelo responsável.
-- ---------------------------------------------------------------------
create or replace function app.conta_ativa(p_pessoa uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from pessoa p
    where p.id = p_pessoa
      and p.anonimizada_em is null
      and (app.faixa(p.data_nascimento) = 'adulto' or p.conta_aprovada_em is not null)
      and (
        exists (select 1 from vinculo v where v.pessoa_id = p.id and v.ativo)
        or exists (select 1 from administrador a where a.pessoa_id = p.id)
        or exists (select 1 from responsavel r
                   join vinculo v on v.pessoa_id = r.menor_id and v.ativo
                   where r.responsavel_id = p.id)
      )
  )
$$;

-- Pessoa ligada ao login, ativa ou não (usada para auditoria).
create or replace function app.pessoa_do_login()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$ select id from pessoa where auth_user_id = auth.uid() and anonimizada_em is null $$;

-- Pessoa do login somente se a conta estiver ativa. Base de todas as regras.
create or replace function app.pessoa_atual()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id from pessoa p
  where p.auth_user_id = auth.uid() and app.conta_ativa(p.id)
$$;

create or replace function app.eh_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from administrador where pessoa_id = app.pessoa_atual()) $$;

create or replace function app.eh_secretaria(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vinculo
    where organizacao_id = p_org and pessoa_id = app.pessoa_atual() and ativo and secretaria
  )
$$;

create or replace function app.eh_membro(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vinculo
    where organizacao_id = p_org and pessoa_id = app.pessoa_atual() and ativo
  )
$$;

create or replace function app.eh_responsavel_de(p_menor uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from responsavel
    where menor_id = p_menor and responsavel_id = app.pessoa_atual()
  )
$$;

-- Secretaria de alguma organização com a qual a pessoa tem (ou teve) vínculo.
create or replace function app.eh_secretaria_de_pessoa(p_pessoa uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vinculo v
    join vinculo s on s.organizacao_id = v.organizacao_id
                  and s.pessoa_id = app.pessoa_atual() and s.ativo and s.secretaria
    where v.pessoa_id = p_pessoa
  )
$$;

create or replace function app.pode_ver_pessoa(p_pessoa uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select app.pessoa_atual() is not null and (
    p_pessoa = app.pessoa_atual()
    or app.eh_responsavel_de(p_pessoa)
    or app.eh_secretaria_de_pessoa(p_pessoa)
  )
$$;

-- ---------------------------------------------------------------------
-- Visibilidade de eventos
--  * evento com destinatários específicos: só eles (e as Secretarias);
--  * senão: membros das organizações que aceitaram;
--  * evento público: adultos e jovens do mesmo núcleo (criança não).
-- ---------------------------------------------------------------------
create or replace function app.pode_ver_evento_como(p_evento uuid, p_pessoa uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from evento e
    where e.id = p_evento and (
      exists (select 1 from evento_pessoa ep where ep.evento_id = e.id and ep.pessoa_id = p_pessoa)
      or exists (
        select 1 from evento_organizacao eo
        join vinculo v on v.organizacao_id = eo.organizacao_id and v.ativo and v.pessoa_id = p_pessoa
        where eo.evento_id = e.id
          and (
            v.secretaria
            or (eo.status = 'aceita'
                and not exists (select 1 from evento_pessoa ep2 where ep2.evento_id = e.id))
          )
      )
      or (
        e.publico
        and app.faixa_de(p_pessoa) <> 'crianca'
        and exists (
          select 1 from vinculo v
          join organizacao o  on o.id = v.organizacao_id
          join organizacao oe on oe.id = e.organizacao_id
          where v.pessoa_id = p_pessoa and v.ativo and o.nucleo_id = oe.nucleo_id
        )
      )
    )
  )
$$;

-- O usuário vê o evento por si ou por um dependente (responsável recebe cópia).
create or replace function app.pode_ver_evento(p_evento uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select app.pessoa_atual() is not null and (
    app.pode_ver_evento_como(p_evento, app.pessoa_atual())
    or exists (
      select 1 from responsavel r
      where r.responsavel_id = app.pessoa_atual()
        and app.pode_ver_evento_como(p_evento, r.menor_id)
    )
  )
$$;

create or replace function app.nucleos_do_usuario()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct o.nucleo_id
  from vinculo v join organizacao o on o.id = v.organizacao_id
  where v.ativo and (
    v.pessoa_id = app.pessoa_atual()
    or v.pessoa_id in (select menor_id from responsavel where responsavel_id = app.pessoa_atual())
  )
$$;

-- ---------------------------------------------------------------------
-- Auditoria: toda criação, alteração e exclusão com autor e hora.
-- Para a tabela pessoa, registra só os nomes das colunas alteradas
-- (o log não pode guardar cópia de dados pessoais após anonimização).
-- ---------------------------------------------------------------------
create or replace function app.auditar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_novo  jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_velho jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_dados jsonb;
  v_alvo  text  := coalesce(v_novo, v_velho) ->> 'id';
begin
  if v_alvo is null then
    v_alvo := coalesce(v_novo, v_velho)::text;
  end if;

  if tg_table_name = 'pessoa' then
    select jsonb_build_object('colunas', coalesce(jsonb_agg(k), '[]'::jsonb))
      into v_dados
      from jsonb_object_keys(coalesce(v_novo, v_velho)) k
     where v_velho is null or v_novo is null or (v_novo -> k) is distinct from (v_velho -> k);
    v_alvo := coalesce(v_novo, v_velho) ->> 'id';
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(k, v_novo -> k) into v_dados
      from jsonb_object_keys(v_novo) k
     where (v_novo -> k) is distinct from (v_velho -> k);
  else
    v_dados := coalesce(v_novo, v_velho);
  end if;

  insert into log_auditoria (autor_id, autor_auth, acao, tabela, alvo_id, dados)
  values (app.pessoa_do_login(), auth.uid(), lower(tg_op), tg_table_name, v_alvo, v_dados);

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'nucleo', 'local', 'organizacao', 'pessoa', 'responsavel', 'administrador', 'vinculo',
    'consentimento', 'cargo', 'mandato', 'ocupacao_cargo', 'evento', 'evento_organizacao',
    'evento_pessoa'
  ] loop
    execute format(
      'create trigger auditoria after insert or update or delete on public.%I
         for each row execute function app.auditar()', t);
  end loop;
end $$;

create or replace function app.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

create trigger tocar before update on public.pessoa
  for each row execute function app.tocar_atualizado_em();
create trigger tocar before update on public.evento
  for each row execute function app.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Liga o usuário do Supabase Auth à pessoa cadastrada pela Secretaria,
-- pelo e-mail do convite. A Secretaria nunca define nem vê senhas.
-- ---------------------------------------------------------------------
create or replace function app.ligar_usuario_auth()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is not null then
    update pessoa
       set auth_user_id = new.id
     where lower(email) = lower(new.email)
       and auth_user_id is null
       and anonimizada_em is null;
  end if;
  return new;
end $$;

create trigger ligar_pessoa
  after insert or update of email on auth.users
  for each row execute function app.ligar_usuario_auth();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Nada de escrita direta: só SELECT, e só para usuários autenticados.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema app to authenticated, service_role;
grant select on
  public.nucleo, public.local, public.organizacao, public.pessoa, public.responsavel,
  public.vinculo, public.consentimento, public.cargo, public.mandato, public.ocupacao_cargo,
  public.evento, public.evento_organizacao, public.evento_pessoa, public.resposta,
  public.preferencia_notificacao, public.push_inscricao, public.notificacao, public.log_auditoria
to authenticated;

create policy ver on public.nucleo for select to authenticated
  using (app.eh_admin() or id in (select app.nucleos_do_usuario()));

create policy ver on public.local for select to authenticated
  using (app.eh_admin() or nucleo_id in (select app.nucleos_do_usuario()));

create policy ver on public.organizacao for select to authenticated
  using (app.eh_admin() or nucleo_id in (select app.nucleos_do_usuario()));

-- O administrador da plataforma não vê dados de membros no dia a dia.
create policy ver on public.pessoa for select to authenticated
  using (app.pode_ver_pessoa(id));

create policy ver on public.responsavel for select to authenticated
  using (app.pode_ver_pessoa(menor_id));

create policy ver on public.vinculo for select to authenticated
  using (
    pessoa_id = (select app.pessoa_atual())
    or app.eh_secretaria(organizacao_id)
    or app.eh_responsavel_de(pessoa_id)
    or (secretaria and (select app.eh_admin()))
  );

create policy ver on public.consentimento for select to authenticated
  using (app.pode_ver_pessoa(titular_id));

create policy ver on public.cargo for select to authenticated
  using ((select app.pessoa_atual()) is not null);

create policy ver on public.mandato for select to authenticated
  using (app.eh_membro(organizacao_id));

-- Quadro com nomes sai pela função quadro_cargos(); aqui só o próprio e a Secretaria.
create policy ver on public.ocupacao_cargo for select to authenticated
  using (
    pessoa_id = (select app.pessoa_atual())
    or app.eh_secretaria((select organizacao_id from public.mandato m where m.id = mandato_id))
  );

create policy ver on public.evento for select to authenticated
  using (app.pode_ver_evento(id));

create policy ver on public.evento_organizacao for select to authenticated
  using (app.pode_ver_evento(evento_id));

create policy ver on public.evento_pessoa for select to authenticated
  using (
    pessoa_id = (select app.pessoa_atual())
    or app.eh_responsavel_de(pessoa_id)
    or app.eh_secretaria((select organizacao_id from public.evento e where e.id = evento_id))
  );

create policy ver on public.resposta for select to authenticated
  using (
    pessoa_id = (select app.pessoa_atual())
    or app.eh_responsavel_de(pessoa_id)
    or app.eh_secretaria((select organizacao_id from public.evento e where e.id = evento_id))
    or exists (
      select 1 from public.vinculo v
      where v.pessoa_id = resposta.pessoa_id and v.ativo and app.eh_secretaria(v.organizacao_id)
    )
  );

create policy ver on public.preferencia_notificacao for select to authenticated
  using (pessoa_id = (select app.pessoa_atual()));

create policy ver on public.push_inscricao for select to authenticated
  using (pessoa_id = (select app.pessoa_atual()));

create policy ver on public.notificacao for select to authenticated
  using (pessoa_id = (select app.pessoa_atual()));

create policy ver on public.log_auditoria for select to authenticated
  using ((select app.eh_admin()));

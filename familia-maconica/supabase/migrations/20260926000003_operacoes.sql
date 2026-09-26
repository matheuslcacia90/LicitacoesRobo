-- =====================================================================
-- Operações (RPC). Toda escrita passa por aqui, com as regras de negócio
-- do dossiê (seção 8) verificadas no próprio banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários internos
-- ---------------------------------------------------------------------
create or replace function app.exigir_secretaria(p_org uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not app.eh_secretaria(p_org) then
    raise exception 'Apenas a Secretaria desta organização pode fazer isso.' using errcode = '42501';
  end if;
end $$;

create or replace function app.exigir_admin()
returns void language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not app.eh_admin() then
    raise exception 'Apenas o administrador da plataforma pode fazer isso.' using errcode = '42501';
  end if;
end $$;

create or replace function app.exigir_login()
returns uuid language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v uuid := app.pessoa_atual();
begin
  if v is null then
    raise exception 'Conta inativa ou não encontrada.' using errcode = '42501';
  end if;
  return v;
end $$;

-- Menores não recebem notificações entre 22h e 7h (horário de Brasília).
create or replace function app.ajustar_silencio(p_quando timestamptz, p_pessoa uuid)
returns timestamptz language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_local timestamp := p_quando at time zone 'America/Sao_Paulo';
  v_hora  int := extract(hour from v_local);
begin
  if app.faixa_de(p_pessoa) = 'adulto' then
    return p_quando;
  elsif v_hora >= 22 then
    return ((v_local::date + 1) + time '07:00') at time zone 'America/Sao_Paulo';
  elsif v_hora < 7 then
    return (v_local::date + time '07:00') at time zone 'America/Sao_Paulo';
  end if;
  return p_quando;
end $$;

create or replace function app.data_hora(p timestamptz)
returns text language sql immutable as $$
  select to_char(p at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
$$;

-- Garante a regra de conflito com mensagem clara (a constraint
-- evento_sem_conflito_local continua sendo a garantia final).
create or replace function app.checar_conflito(p_local uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid default null)
returns void language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v record;
begin
  if p_local is null then return; end if;
  select e.inicio, e.fim, o.nome as org into v
    from evento e join organizacao o on o.id = e.organizacao_id
   where e.local_id = p_local and e.cancelado_em is null
     and tstzrange(e.inicio, e.fim) && tstzrange(p_inicio, p_fim)
     and e.id is distinct from p_ignorar
   limit 1;
  if found then
    raise exception 'Conflito de uso do local: % já reservou % até %.',
      v.org, app.data_hora(v.inicio), to_char(v.fim at time zone 'America/Sao_Paulo', 'HH24:MI')
      using errcode = '23P01';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Fila de notificações
-- Destinatários: pessoas específicas do evento, se houver; senão os
-- membros ativos das organizações que aceitaram. Menores geram cópia
-- para o responsável (16–17 anos: só fora do calendário regular).
-- ---------------------------------------------------------------------
create or replace function app.enfileirar(
  p_evento uuid, p_motivo text, p_orgs uuid[] default null,
  p_quando timestamptz default now(), p_complemento text default null)
returns int language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  e evento;
  v_org text;
  v_titulo text;
  v_corpo text;
  v_qtd int;
begin
  select * into e from evento where id = p_evento;
  select nome into v_org from organizacao where id = e.organizacao_id;

  v_titulo := case
    when p_motivo = 'criacao' then
      case e.tipo when 'reuniao' then 'Nova reunião' when 'conjunta' then 'Atividade conjunta'
                  when 'individual' then 'Nova atividade' when 'convite' then 'Convite'
                  else 'Novo evento' end
    when p_motivo = 'cancelamento' then 'Cancelado'
    when p_motivo = 'alteracao'    then 'Horário alterado'
    else 'Lembrete'
  end || ': ' || e.titulo;

  v_corpo := v_org || ' · ' || app.data_hora(e.inicio)
          || coalesce(' · ' || (select nome from local where id = e.local_id), '')
          || coalesce(' · ' || p_complemento, '');

  insert into notificacao (pessoa_id, evento_id, sobre_pessoa_id, motivo, titulo, corpo, agendada_para)
  with alvo as (
    select ep.pessoa_id
      from evento_pessoa ep
     where ep.evento_id = e.id and p_orgs is null
    union
    select v.pessoa_id
      from evento_organizacao eo
      join vinculo v on v.organizacao_id = eo.organizacao_id and v.ativo
     where eo.evento_id = e.id and eo.status = 'aceita'
       and not exists (select 1 from evento_pessoa ep where ep.evento_id = e.id)
       and (p_orgs is null or eo.organizacao_id = any (p_orgs))
  ),
  entrega as (
    select a.pessoa_id as destino, null::uuid as sobre from alvo a
    union
    select r.responsavel_id, a.pessoa_id
      from alvo a join responsavel r on r.menor_id = a.pessoa_id
     where app.faixa_de(a.pessoa_id) in ('crianca', 'adolescente')
        or (app.faixa_de(a.pessoa_id) = 'jovem' and (e.tipo <> 'reuniao' or e.serie_id is null))
  )
  select d.destino, e.id, d.sobre, p_motivo, v_titulo,
         case when d.sobre is null then v_corpo
              else split_part((select nome from pessoa where id = d.sobre), ' ', 1) || ' — ' || v_corpo end,
         case when d.sobre is null then app.ajustar_silencio(p_quando, d.destino) else p_quando end
    from entrega d
   where p_motivo in ('cancelamento', 'alteracao')
      or e.tipo = 'reuniao'
      or not exists (
        select 1 from preferencia_notificacao pn
         where pn.pessoa_id = d.destino and pn.tipo_evento = e.tipo and not pn.push and not pn.email);

  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- Lembretes automáticos (padrão 24h e 2h antes; configurável por organização).
create or replace function app.agendar_lembretes(p_evento uuid, p_orgs uuid[] default null)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  e evento;
  h int;
begin
  select * into e from evento where id = p_evento;
  for h in select unnest(lembretes_horas) from organizacao where id = e.organizacao_id loop
    if e.inicio - make_interval(hours => h) > now() then
      perform app.enfileirar(p_evento, 'lembrete_' || h || 'h', p_orgs, e.inicio - make_interval(hours => h));
    end if;
  end loop;
end $$;

create or replace function app.notificar_secretarias(p_org uuid, p_evento uuid, p_motivo text, p_titulo text, p_corpo text)
returns void language sql security definer
set search_path = public, pg_temp as $$
  insert into notificacao (pessoa_id, evento_id, motivo, titulo, corpo)
  select v.pessoa_id, p_evento, p_motivo, p_titulo, p_corpo
    from vinculo v where v.organizacao_id = p_org and v.ativo and v.secretaria
$$;

create or replace function app.descartar_pendentes(p_evento uuid, p_motivo text, p_somente_lembretes boolean)
returns void language sql security definer
set search_path = public, pg_temp as $$
  update notificacao
     set descartada_em = now(), erro = p_motivo
   where evento_id = p_evento and enviada_em is null and descartada_em is null
     and (not p_somente_lembretes or motivo like 'lembrete%')
$$;

-- =====================================================================
-- ADMINISTRADOR DA PLATAFORMA
-- =====================================================================
create or replace function public.criar_nucleo(p_nome text, p_cidade text default null, p_uf text default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v uuid;
begin
  perform app.exigir_admin();
  insert into nucleo (nome, cidade, uf) values (p_nome, p_cidade, upper(p_uf)) returning id into v;
  return v;
end $$;

create or replace function public.criar_local(p_nucleo uuid, p_nome text, p_endereco text default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v uuid;
begin
  perform app.exigir_admin();
  insert into local (nucleo_id, nome, endereco) values (p_nucleo, p_nome, p_endereco) returning id into v;
  return v;
end $$;

create or replace function public.criar_organizacao(
  p_nucleo uuid, p_tipo tipo_organizacao, p_nome text,
  p_numero text default null, p_jurisdicao text default null, p_local uuid default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v uuid;
begin
  perform app.exigir_admin();
  if p_local is not null and not exists (select 1 from local where id = p_local and nucleo_id = p_nucleo) then
    raise exception 'O local precisa pertencer ao mesmo núcleo.';
  end if;
  insert into organizacao (nucleo_id, tipo, nome, numero, jurisdicao, local_padrao_id)
  values (p_nucleo, p_tipo, p_nome, p_numero, p_jurisdicao, p_local)
  returning id into v;
  return v;
end $$;

-- Nomeia a Secretaria de uma organização (cria a pessoa, se preciso).
create or replace function public.nomear_secretaria(p_org uuid, p_nome text, p_email text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_pessoa pessoa;
  v_email text := nullif(lower(trim(p_email)), '');
begin
  perform app.exigir_admin();
  if v_email is null then raise exception 'Informe o e-mail.'; end if;
  if not exists (select 1 from organizacao where id = p_org) then
    raise exception 'Organização não encontrada.';
  end if;

  select * into v_pessoa from pessoa where lower(email) = v_email and anonimizada_em is null;
  if not found then
    insert into pessoa (nome, email) values (trim(p_nome), v_email) returning * into v_pessoa;
  end if;
  if app.faixa(v_pessoa.data_nascimento) <> 'adulto' then
    raise exception 'A Secretaria precisa ser maior de idade.';
  end if;

  update vinculo set secretaria = true
   where pessoa_id = v_pessoa.id and organizacao_id = p_org and ativo;
  if not found then
    insert into vinculo (pessoa_id, organizacao_id, papel, secretaria)
    values (v_pessoa.id, p_org, 'adulto', true);
  end if;

  return jsonb_build_object(
    'pessoa_id', v_pessoa.id,
    'convites', case when v_pessoa.auth_user_id is null then jsonb_build_array(v_email) else '[]'::jsonb end);
end $$;

create or replace function public.revogar_secretaria(p_org uuid, p_pessoa uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform app.exigir_admin();
  update vinculo set secretaria = false
   where organizacao_id = p_org and pessoa_id = p_pessoa and ativo;
end $$;

create or replace function public.listar_secretarias()
returns table (organizacao_id uuid, pessoa_id uuid, nome text, email text, primeiro_acesso_feito boolean)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  perform app.exigir_admin();
  return query
    select v.organizacao_id, p.id, p.nome, p.email, p.auth_user_id is not null
      from vinculo v join pessoa p on p.id = v.pessoa_id
     where v.ativo and v.secretaria
     order by p.nome;
end $$;

-- =====================================================================
-- SECRETARIA — cadastro e ciclo do usuário
-- =====================================================================
create or replace function public.cadastrar_membro(
  p_org uuid,
  p_nome text,
  p_nascimento date,
  p_email text default null,
  p_celular text default null,
  p_id_oficial text default null,
  p_papel papel_vinculo default 'membro',
  p_resp_nome text default null,
  p_resp_email text default null,
  p_resp_celular text default null,
  p_resp_parentesco text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_pessoa   pessoa;
  v_resp     pessoa;
  v_reuso    boolean := false;
  v_email    text := nullif(lower(trim(p_email)), '');
  v_resp_email text := nullif(lower(trim(p_resp_email)), '');
  v_convites text[] := '{}';
begin
  perform app.exigir_secretaria(p_org);
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome.'; end if;
  if p_nascimento is null then raise exception 'Informe a data de nascimento.'; end if;
  if p_nascimento > current_date then raise exception 'Data de nascimento no futuro.'; end if;

  -- Uma pessoa, uma conta: se o e-mail já existe, reaproveita o cadastro.
  if v_email is not null then
    select * into v_pessoa from pessoa where lower(email) = v_email and anonimizada_em is null;
    v_reuso := found;
  end if;
  if not v_reuso then
    insert into pessoa (nome, data_nascimento, email, celular, id_oficial)
    values (trim(p_nome), p_nascimento, v_email, nullif(trim(p_celular), ''), nullif(trim(p_id_oficial), ''))
    returning * into v_pessoa;
  end if;

  if exists (select 1 from vinculo where pessoa_id = v_pessoa.id and organizacao_id = p_org and ativo) then
    raise exception 'Esta pessoa já tem vínculo ativo com esta organização.';
  end if;

  if app.faixa(v_pessoa.data_nascimento) <> 'adulto' then
    if p_papel = 'adulto' then raise exception 'Menor de idade não pode ter papel de adulto.'; end if;
    select p.* into v_resp from responsavel r join pessoa p on p.id = r.responsavel_id
     where r.menor_id = v_pessoa.id limit 1;
    if not found then
      if v_resp_email is null or coalesce(trim(p_resp_nome), '') = '' then
        raise exception 'Menor de idade: informe nome e e-mail do responsável legal.';
      end if;
      select * into v_resp from pessoa where lower(email) = v_resp_email and anonimizada_em is null;
      if not found then
        insert into pessoa (nome, email, celular)
        values (trim(p_resp_nome), v_resp_email, nullif(trim(p_resp_celular), ''))
        returning * into v_resp;
      end if;
      if v_resp.id = v_pessoa.id or app.faixa(v_resp.data_nascimento) <> 'adulto' then
        raise exception 'O responsável legal precisa ser outra pessoa, maior de idade.';
      end if;
      insert into responsavel (menor_id, responsavel_id, parentesco)
      values (v_pessoa.id, v_resp.id, nullif(trim(p_resp_parentesco), ''));
    end if;
  end if;

  insert into vinculo (pessoa_id, organizacao_id, papel) values (v_pessoa.id, p_org, p_papel);

  if v_pessoa.email is not null and v_pessoa.auth_user_id is null then
    v_convites := v_convites || v_pessoa.email;
  end if;
  if v_resp.id is not null and v_resp.email is not null and v_resp.auth_user_id is null then
    v_convites := v_convites || v_resp.email;
  end if;

  return jsonb_build_object(
    'pessoa_id', v_pessoa.id,
    'reutilizada', v_reuso,
    'responsavel_id', v_resp.id,
    'convites', to_jsonb(v_convites));
end $$;

-- Desativar bloqueia acesso e notificações, preserva o histórico.
-- Se a pessoa ocupa cargo vigente NESTA organização, devolve a lista de
-- cargos a transferir em vez de desativar.
create or replace function public.desativar_vinculo(p_vinculo uuid, p_motivo text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v vinculo;
  v_cargos jsonb;
begin
  select * into v from vinculo where id = p_vinculo for update;
  if not found then raise exception 'Vínculo não encontrado.'; end if;
  perform app.exigir_secretaria(v.organizacao_id);
  if not v.ativo then return jsonb_build_object('ok', true); end if;

  select jsonb_agg(jsonb_build_object(
           'ocupacao_id', oc.id, 'cargo', c.nome, 'mandato', m.nome, 'interino', oc.interino)
           order by c.ordem)
    into v_cargos
    from ocupacao_cargo oc
    join mandato m on m.id = oc.mandato_id
    join cargo c   on c.id = oc.cargo_id
   where m.organizacao_id = v.organizacao_id
     and oc.pessoa_id = v.pessoa_id
     and oc.fim is null
     and m.fim >= current_date;

  if v_cargos is not null then
    return jsonb_build_object('ok', false, 'cargos', v_cargos);
  end if;

  update vinculo
     set ativo = false, secretaria = false, fim = current_date,
         motivo_desativacao = nullif(trim(p_motivo), '')
   where id = p_vinculo;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.reativar_membro(p_org uuid, p_pessoa uuid, p_papel papel_vinculo default 'membro')
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v uuid;
begin
  perform app.exigir_secretaria(p_org);
  if not exists (select 1 from vinculo where pessoa_id = p_pessoa and organizacao_id = p_org) then
    raise exception 'Esta pessoa nunca teve vínculo com esta organização. Use o cadastro.';
  end if;
  if exists (select 1 from pessoa where id = p_pessoa and anonimizada_em is not null) then
    raise exception 'Cadastro anonimizado a pedido do titular.';
  end if;
  insert into vinculo (pessoa_id, organizacao_id, papel) values (p_pessoa, p_org, p_papel)
  returning id into v;
  return v;
exception when unique_violation then
  raise exception 'Esta pessoa já tem vínculo ativo com esta organização.';
end $$;

-- =====================================================================
-- SECRETARIA — cargos e gestões
-- =====================================================================
create or replace function public.criar_mandato(p_org uuid, p_nome text, p_inicio date, p_fim date)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v uuid;
begin
  perform app.exigir_secretaria(p_org);
  insert into mandato (organizacao_id, nome, inicio, fim) values (p_org, trim(p_nome), p_inicio, p_fim)
  returning id into v;
  return v;
exception
  when exclusion_violation then raise exception 'Já existe uma gestão cadastrada nesse período.';
  when check_violation     then raise exception 'O fim da gestão precisa ser depois do início.';
end $$;

create or replace function public.criar_cargo(
  p_org uuid, p_nome text, p_ordem int default 100, p_vagas int default 1, p_para_adulto boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v uuid;
begin
  perform app.exigir_secretaria(p_org);
  insert into cargo (tipo_organizacao, organizacao_id, nome, ordem, vagas, para_adulto)
  select o.tipo, o.id, trim(p_nome), p_ordem, p_vagas, p_para_adulto from organizacao o where o.id = p_org
  returning id into v;
  return v;
end $$;

create or replace function app.validar_ocupante(p_org uuid, p_cargo cargo, p_pessoa uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from vinculo where organizacao_id = p_org and pessoa_id = p_pessoa and ativo) then
    raise exception 'A pessoa precisa ter vínculo ativo com a organização.';
  end if;
  if p_cargo.para_adulto and app.faixa_de(p_pessoa) <> 'adulto' then
    raise exception 'O cargo % é exclusivo de adultos.', p_cargo.nome;
  end if;
end $$;

create or replace function public.atribuir_cargo(
  p_mandato uuid, p_cargo uuid, p_pessoa uuid, p_inicio date default null, p_interino boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  m mandato;
  c cargo;
  o organizacao;
  v_inicio date;
  v uuid;
begin
  select * into m from mandato where id = p_mandato for update;
  if not found then raise exception 'Gestão não encontrada.'; end if;
  perform app.exigir_secretaria(m.organizacao_id);
  select * into o from organizacao where id = m.organizacao_id;
  select * into c from cargo where id = p_cargo;
  if not found or not (c.organizacao_id = o.id or (c.organizacao_id is null and c.tipo_organizacao = o.tipo)) then
    raise exception 'Cargo não pertence a esta organização.';
  end if;
  perform app.validar_ocupante(o.id, c, p_pessoa);

  v_inicio := coalesce(p_inicio, greatest(m.inicio, least(current_date, m.fim)));
  if v_inicio < m.inicio or v_inicio > m.fim then
    raise exception 'A data de início precisa estar dentro da gestão.';
  end if;
  if exists (select 1 from ocupacao_cargo
              where mandato_id = m.id and cargo_id = c.id and pessoa_id = p_pessoa and fim is null) then
    raise exception 'Esta pessoa já ocupa esse cargo.';
  end if;
  if (select count(*) from ocupacao_cargo where mandato_id = m.id and cargo_id = c.id and fim is null) >= c.vagas then
    raise exception 'O cargo % já está ocupado. Use "Transferir cargo".', c.nome;
  end if;

  insert into ocupacao_cargo (mandato_id, cargo_id, pessoa_id, inicio, interino)
  values (m.id, c.id, p_pessoa, v_inicio, p_interino)
  returning id into v;
  return v;
end $$;

-- Encerra a ocupação atual e abre a do sucessor na mesma data.
-- p_interino = true: nomeação interina (saída urgente), sinalizada no quadro.
create or replace function public.transferir_cargo(
  p_ocupacao uuid, p_sucessor uuid, p_inicio date default current_date, p_interino boolean default false)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  oc ocupacao_cargo;
  m  mandato;
  c  cargo;
  v  uuid;
begin
  select * into oc from ocupacao_cargo where id = p_ocupacao for update;
  if not found then raise exception 'Ocupação não encontrada.'; end if;
  select * into m from mandato where id = oc.mandato_id;
  perform app.exigir_secretaria(m.organizacao_id);
  select * into c from cargo where id = oc.cargo_id;

  if oc.fim is not null then raise exception 'Esta ocupação já foi encerrada.'; end if;
  if p_sucessor = oc.pessoa_id then raise exception 'Escolha outra pessoa como sucessora.'; end if;
  if p_inicio < oc.inicio or p_inicio > m.fim then
    raise exception 'A data da transferência precisa estar entre o início da ocupação e o fim da gestão.';
  end if;
  perform app.validar_ocupante(m.organizacao_id, c, p_sucessor);
  if exists (select 1 from ocupacao_cargo
              where mandato_id = m.id and cargo_id = c.id and pessoa_id = p_sucessor and fim is null) then
    raise exception 'O sucessor já ocupa esse cargo.';
  end if;

  update ocupacao_cargo set fim = p_inicio where id = oc.id;
  insert into ocupacao_cargo (mandato_id, cargo_id, pessoa_id, inicio, interino, observacao)
  values (m.id, c.id, p_sucessor, p_inicio, p_interino,
          case when p_interino then 'Interino — aguardando nomeação definitiva' end)
  returning id into v;
  return v;
end $$;

create or replace function public.efetivar_interino(p_ocupacao uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select m.organizacao_id into v_org
    from ocupacao_cargo oc join mandato m on m.id = oc.mandato_id
   where oc.id = p_ocupacao and oc.fim is null and oc.interino;
  if not found then raise exception 'Ocupação interina vigente não encontrada.'; end if;
  perform app.exigir_secretaria(v_org);
  update ocupacao_cargo set interino = false, observacao = null where id = p_ocupacao;
end $$;

-- =====================================================================
-- SECRETARIA — agenda
-- =====================================================================
create or replace function public.criar_evento(
  p_org uuid,
  p_tipo tipo_evento,
  p_titulo text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_local uuid default null,
  p_descricao text default null,
  p_publico boolean default false,
  p_orgs_convidadas uuid[] default '{}',
  p_pessoas uuid[] default '{}',
  p_repetir_semanas int default 0)
returns uuid[] language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_nucleo uuid;
  v_orgs   uuid[] := coalesce(p_orgs_convidadas, '{}');
  v_pess   uuid[] := coalesce(p_pessoas, '{}');
  v_ids    uuid[] := '{}';
  v_serie  uuid;
  v_id     uuid;
  v_org_nome text;
  i int;
  v_ini timestamptz;
  v_fim timestamptz;
  v_convidada uuid;
begin
  perform app.exigir_secretaria(p_org);
  select nucleo_id, nome into v_nucleo, v_org_nome from organizacao where id = p_org;

  if coalesce(trim(p_titulo), '') = '' then raise exception 'Informe o título.'; end if;
  if p_fim <= p_inicio then raise exception 'O término precisa ser depois do início.'; end if;
  if p_repetir_semanas not between 0 and 52 then raise exception 'Repetição entre 0 e 52 semanas.'; end if;
  v_orgs := array(select distinct x from unnest(v_orgs) x where x <> p_org);
  v_pess := array(select distinct x from unnest(v_pess) x);

  if cardinality(v_orgs) > 0 and cardinality(v_pess) > 0 then
    raise exception 'Convide organizações ou pessoas, não os dois no mesmo evento.';
  end if;
  if p_tipo = 'conjunta' and cardinality(v_orgs) = 0 then
    raise exception 'Atividade conjunta precisa de ao menos uma organização convidada.';
  end if;
  if p_tipo = 'individual' and cardinality(v_pess) = 0 then
    raise exception 'Atividade individual precisa de ao menos uma pessoa.';
  end if;
  if p_tipo in ('reuniao', 'individual', 'evento') and cardinality(v_orgs) > 0 then
    raise exception 'Somente atividades conjuntas e convites envolvem outras organizações.';
  end if;
  if exists (select 1 from unnest(v_orgs) x
              where not exists (select 1 from organizacao o where o.id = x and o.nucleo_id = v_nucleo)) then
    raise exception 'Organização convidada fora do núcleo.';
  end if;
  -- Nenhuma Secretaria dispara notificação para membros de outra organização.
  if exists (select 1 from unnest(v_pess) x
              where not exists (select 1 from vinculo v where v.pessoa_id = x and v.organizacao_id = p_org and v.ativo)) then
    raise exception 'Só é possível endereçar membros ativos da própria organização.';
  end if;
  if p_local is not null and not exists (select 1 from local where id = p_local and nucleo_id = v_nucleo) then
    raise exception 'Local fora do núcleo.';
  end if;

  for i in 0 .. p_repetir_semanas loop
    v_ini := p_inicio + make_interval(weeks => i);
    v_fim := p_fim    + make_interval(weeks => i);
    perform app.checar_conflito(p_local, v_ini, v_fim);

    insert into evento (organizacao_id, tipo, titulo, descricao, local_id, inicio, fim, publico, serie_id, criado_por)
    values (p_org, p_tipo, trim(p_titulo), nullif(trim(p_descricao), ''), p_local, v_ini, v_fim,
            coalesce(p_publico, false), v_serie, app.pessoa_atual())
    returning id into v_id;
    if p_repetir_semanas > 0 and v_serie is null then
      v_serie := v_id;
      update evento set serie_id = v_id where id = v_id;
    end if;
    v_ids := v_ids || v_id;

    insert into evento_organizacao (evento_id, organizacao_id, status, respondido_por, respondido_em)
    values (v_id, p_org, 'aceita', app.pessoa_atual(), now());
    insert into evento_organizacao (evento_id, organizacao_id)
    select v_id, x from unnest(v_orgs) x;
    insert into evento_pessoa (evento_id, pessoa_id)
    select v_id, x from unnest(v_pess) x;

    -- Série: só a primeira data gera o aviso de criação; todas têm lembretes.
    if i = 0 then
      perform app.enfileirar(v_id, 'criacao', null, now(),
        case when p_repetir_semanas > 0 then 'semanal, ' || (p_repetir_semanas + 1) || ' datas' end);
      foreach v_convidada in array v_orgs loop
        perform app.notificar_secretarias(v_convidada, v_id, 'convite_organizacao',
          'Convite de ' || v_org_nome || ': ' || trim(p_titulo),
          app.data_hora(v_ini) || ' · aceite para avisar seus membros');
      end loop;
    end if;
    perform app.agendar_lembretes(v_id);
  end loop;

  return v_ids;
end $$;

-- Atividade conjunta, etapa 2: a Secretaria convidada aceita (e só então
-- seus membros são notificados) ou recusa.
create or replace function public.responder_participacao(p_evento uuid, p_org uuid, p_aceitar boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  e evento;
  v_nome text;
begin
  perform app.exigir_secretaria(p_org);
  select * into e from evento where id = p_evento;
  if e.cancelado_em is not null then raise exception 'Evento cancelado.'; end if;

  update evento_organizacao
     set status = case when p_aceitar then 'aceita' else 'recusada' end::status_participacao,
         respondido_por = app.pessoa_atual(), respondido_em = now()
   where evento_id = p_evento and organizacao_id = p_org and status = 'convidada';
  if not found then raise exception 'Não há convite pendente para esta organização.'; end if;

  select nome into v_nome from organizacao where id = p_org;
  perform app.notificar_secretarias(e.organizacao_id, p_evento, 'resposta_organizacao',
    v_nome || case when p_aceitar then ' aceitou: ' else ' recusou: ' end || e.titulo,
    app.data_hora(e.inicio));

  if p_aceitar then
    perform app.enfileirar(p_evento, 'criacao', array[p_org]);
    perform app.agendar_lembretes(p_evento, array[p_org]);
  end if;
end $$;

create or replace function public.cancelar_evento(p_evento uuid, p_serie boolean default false)
returns int language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  e evento;
  alvo record;
  v_qtd int := 0;
begin
  select * into e from evento where id = p_evento;
  if not found then raise exception 'Evento não encontrado.'; end if;
  perform app.exigir_secretaria(e.organizacao_id);

  for alvo in
    select id from evento
     where cancelado_em is null
       and (id = p_evento or (p_serie and e.serie_id is not null and serie_id = e.serie_id and inicio >= e.inicio))
  loop
    update evento set cancelado_em = now() where id = alvo.id;
    perform app.descartar_pendentes(alvo.id, 'evento cancelado', false);
    perform app.enfileirar(alvo.id, 'cancelamento');
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end $$;

create or replace function public.reagendar_evento(
  p_evento uuid, p_inicio timestamptz, p_fim timestamptz, p_local uuid default null)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  e evento;
  v_local uuid;
begin
  select * into e from evento where id = p_evento for update;
  if not found then raise exception 'Evento não encontrado.'; end if;
  perform app.exigir_secretaria(e.organizacao_id);
  if e.cancelado_em is not null then raise exception 'Evento cancelado.'; end if;
  if p_fim <= p_inicio then raise exception 'O término precisa ser depois do início.'; end if;
  v_local := coalesce(p_local, e.local_id);
  if v_local is not null and not exists (
       select 1 from local l join organizacao o on o.nucleo_id = l.nucleo_id
        where l.id = v_local and o.id = e.organizacao_id) then
    raise exception 'Local fora do núcleo.';
  end if;
  perform app.checar_conflito(v_local, p_inicio, p_fim, p_evento);

  update evento set inicio = p_inicio, fim = p_fim, local_id = v_local where id = p_evento;
  perform app.descartar_pendentes(p_evento, 'evento reagendado', true);
  perform app.enfileirar(p_evento, 'alteracao');
  perform app.agendar_lembretes(p_evento);
end $$;

-- Ocupação do local (para evitar conflito). Títulos de outras
-- organizações só aparecem se o evento for público.
create or replace function public.ocupacao_local(p_local uuid, p_de timestamptz, p_ate timestamptz)
returns table (evento_id uuid, inicio timestamptz, fim timestamptz, organizacao text, titulo text)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from local l
      join organizacao o on o.nucleo_id = l.nucleo_id
      join vinculo v on v.organizacao_id = o.id and v.ativo and v.secretaria
     where l.id = p_local and v.pessoa_id = app.pessoa_atual()) then
    raise exception 'Apenas Secretarias do núcleo consultam a ocupação do local.' using errcode = '42501';
  end if;
  return query
    select e.id, e.inicio, e.fim, o.nome,
           case when e.publico or app.eh_secretaria(e.organizacao_id) then e.titulo end
      from evento e join organizacao o on o.id = e.organizacao_id
     where e.local_id = p_local and e.cancelado_em is null
       and e.inicio < p_ate and e.fim > p_de
     order by e.inicio;
end $$;

-- Presenças dos membros das organizações em que o usuário é Secretaria.
create or replace function public.presencas_do_evento(p_evento uuid)
returns table (pessoa_id uuid, nome text, organizacao text, resposta tipo_resposta, respondido_em timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from evento_organizacao eo
     where eo.evento_id = p_evento and app.eh_secretaria(eo.organizacao_id)) then
    raise exception 'Sem acesso às presenças deste evento.' using errcode = '42501';
  end if;
  return query
    select distinct on (p.id) p.id, p.nome, o.nome, r.resposta, r.respondido_em
      from evento_organizacao eo
      join organizacao o on o.id = eo.organizacao_id
      join vinculo v on v.organizacao_id = eo.organizacao_id and v.ativo
      join pessoa p on p.id = v.pessoa_id
      left join resposta r on r.evento_id = p_evento and r.pessoa_id = p.id
     where eo.evento_id = p_evento
       and eo.status = 'aceita'
       and app.eh_secretaria(eo.organizacao_id)
       and app.pode_ver_evento_como(p_evento, p.id)
     order by p.id, o.nome;
end $$;

-- =====================================================================
-- CONSULTAS DO MEMBRO
-- =====================================================================
create or replace function public.meu_perfil()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_login uuid := app.pessoa_do_login();
  v_me    uuid := app.pessoa_atual();
  p       pessoa;
begin
  if v_login is null then return null; end if;
  select * into p from pessoa where id = v_login;

  return jsonb_build_object(
    'pessoa', jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'email', p.email, 'celular', p.celular,
      'faixa', app.faixa(p.data_nascimento),
      'conta_ativa', v_me is not null,
      'aguardando_aprovacao', app.faixa(p.data_nascimento) <> 'adulto' and p.conta_aprovada_em is null),
    'admin', v_me is not null and app.eh_admin(),
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'vinculo_id', v.id, 'organizacao_id', o.id, 'organizacao', o.nome, 'tipo', o.tipo,
               'nucleo_id', o.nucleo_id, 'papel', v.papel, 'secretaria', v.secretaria)
               order by o.nome)
        from vinculo v join organizacao o on o.id = v.organizacao_id
       where v.pessoa_id = v_me and v.ativo), '[]'::jsonb),
    'dependentes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pessoa_id', d.id, 'nome', d.nome, 'faixa', app.faixa(d.data_nascimento),
               'email', d.email,
               'conta_aprovada_em', d.conta_aprovada_em, 'foto_autorizada', d.foto_autorizada,
               'organizacoes', (select coalesce(jsonb_agg(o.nome order by o.nome), '[]'::jsonb)
                                  from vinculo v join organizacao o on o.id = v.organizacao_id
                                 where v.pessoa_id = d.id and v.ativo))
               order by d.nome)
        from responsavel r join pessoa d on d.id = r.menor_id
       where r.responsavel_id = v_me and d.anonimizada_em is null), '[]'::jsonb),
    'preferencias', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo_evento, 'push', push, 'email', email))
        from preferencia_notificacao where pessoa_id = v_me), '[]'::jsonb),
    'nao_lidas', (select count(*) from notificacao
                   where pessoa_id = v_me and enviada_em is not null and lida_em is null)
  );
end $$;

create or replace function public.agenda(p_de timestamptz, p_ate timestamptz)
returns table (
  id uuid, tipo tipo_evento, titulo text, descricao text, inicio timestamptz, fim timestamptz,
  local text, organizacao_id uuid, organizacao text, organizacoes text[], publico boolean,
  cancelado boolean, serie_id uuid, eh_secretaria boolean, respostas jsonb)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_me uuid := app.exigir_login();
begin
  return query
    select e.id, e.tipo, e.titulo, e.descricao, e.inicio, e.fim, l.nome, o.id, o.nome,
           array(select o2.nome from evento_organizacao eo join organizacao o2 on o2.id = eo.organizacao_id
                  where eo.evento_id = e.id and eo.status = 'aceita' order by o2.nome),
           e.publico, e.cancelado_em is not null, e.serie_id, app.eh_secretaria(o.id),
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'pessoa_id', q.id, 'nome', q.nome, 'eu', q.eu, 'resposta', r.resposta)
                     order by q.eu desc, q.nome), '[]'::jsonb)
              from (select p.id, p.nome, p.id = v_me as eu
                      from pessoa p
                     where (p.id = v_me or p.id in (select menor_id from responsavel where responsavel_id = v_me))
                       and app.pode_ver_evento_como(e.id, p.id)) q
              left join resposta r on r.evento_id = e.id and r.pessoa_id = q.id)
      from evento e
      join organizacao o on o.id = e.organizacao_id
      left join local l on l.id = e.local_id
     where e.inicio < p_ate and e.fim > p_de
       and app.pode_ver_evento(e.id)
     order by e.inicio;
end $$;

-- Quadro de cargos da gestão (vigente, ou a informada), com vagas em aberto.
-- Criança (<12) não vê o quadro; adolescentes e adultos veem o da própria organização.
create or replace function public.quadro_cargos(p_org uuid, p_mandato uuid default null)
returns table (
  mandato_id uuid, mandato text, cargo_id uuid, cargo text, ordem int, para_adulto boolean,
  ocupacao_id uuid, pessoa_id uuid, pessoa text, inicio date, fim date, interino boolean)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_me uuid := app.exigir_login();
  m mandato;
begin
  if not (app.eh_secretaria(p_org) or (app.eh_membro(p_org) and app.faixa_de(v_me) <> 'crianca')) then
    raise exception 'Sem acesso ao quadro de cargos desta organização.' using errcode = '42501';
  end if;

  if p_mandato is null then
    select * into m from mandato
     where organizacao_id = p_org and current_date between inicio and fim;
    if not found then
      select * into m from mandato where organizacao_id = p_org order by inicio desc limit 1;
    end if;
  else
    select * into m from mandato where id = p_mandato and organizacao_id = p_org;
  end if;
  if m.id is null then return; end if;

  return query
    select m.id, m.nome, c.id, c.nome, c.ordem, c.para_adulto,
           oc.id, p.id, p.nome, oc.inicio, oc.fim, oc.interino
      from cargo c
      join organizacao o on o.id = p_org
      left join ocupacao_cargo oc on oc.cargo_id = c.id and oc.mandato_id = m.id
                                  and (oc.fim is null or p_mandato is not null)
      left join pessoa p on p.id = oc.pessoa_id
     where c.organizacao_id = p_org or (c.organizacao_id is null and c.tipo_organizacao = o.tipo)
     order by c.ordem, c.nome, oc.inicio;
end $$;

-- Lista de membros. Secretaria: todos os vínculos, com contatos.
-- Adultos e jovens (16–17): só nomes dos ativos. Abaixo de 16: sem lista.
create or replace function public.membros_da_organizacao(p_org uuid)
returns table (
  vinculo_id uuid, pessoa_id uuid, nome text, papel papel_vinculo, faixa faixa_etaria,
  secretaria boolean, ativo boolean, inicio date, fim date, email text, celular text,
  id_oficial text, primeiro_acesso_feito boolean, conta_aprovada boolean,
  cargos text[], responsaveis text[])
language plpgsql stable security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_me uuid := app.exigir_login();
begin
  if app.eh_secretaria(p_org) then
    return query
      select v.id, p.id, p.nome, v.papel, app.faixa(p.data_nascimento), v.secretaria, v.ativo,
             v.inicio, v.fim, p.email, p.celular, p.id_oficial, p.auth_user_id is not null,
             app.faixa(p.data_nascimento) = 'adulto' or p.conta_aprovada_em is not null,
             array(select c.nome || case when oc.interino then ' (interino)' else '' end
                     from ocupacao_cargo oc join mandato m on m.id = oc.mandato_id join cargo c on c.id = oc.cargo_id
                    where oc.pessoa_id = p.id and m.organizacao_id = p_org and oc.fim is null and m.fim >= current_date
                    order by c.ordem),
             array(select rp.nome || coalesce(' <' || rp.email || '>', '')
                     from responsavel r join pessoa rp on rp.id = r.responsavel_id where r.menor_id = p.id)
        from vinculo v join pessoa p on p.id = v.pessoa_id
       where v.organizacao_id = p_org
         and (v.ativo or not exists (select 1 from vinculo v2
                                      where v2.pessoa_id = v.pessoa_id and v2.organizacao_id = p_org
                                        and (v2.ativo or v2.criado_em > v.criado_em)))
       order by v.ativo desc, p.nome;
  elsif app.eh_membro(p_org) and app.faixa_de(v_me) in ('adulto', 'jovem') then
    return query
      select null::uuid, p.id, p.nome, v.papel, null::faixa_etaria, v.secretaria, true,
             null::date, null::date, null::text, null::text, null::text, null::boolean, null::boolean,
             '{}'::text[], '{}'::text[]
        from vinculo v join pessoa p on p.id = v.pessoa_id
       where v.organizacao_id = p_org and v.ativo
       order by p.nome;
  else
    raise exception 'Sem acesso à lista de membros.' using errcode = '42501';
  end if;
end $$;

-- =====================================================================
-- AÇÕES DO MEMBRO E DO RESPONSÁVEL
-- =====================================================================
create or replace function public.responder_evento(p_evento uuid, p_resposta tipo_resposta, p_pessoa uuid default null)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_me   uuid := app.exigir_login();
  v_alvo uuid := coalesce(p_pessoa, v_me);
  e evento;
begin
  if v_alvo <> v_me and not app.eh_responsavel_de(v_alvo) then
    raise exception 'Só o próprio membro ou seu responsável podem responder.' using errcode = '42501';
  end if;
  select * into e from evento where id = p_evento;
  if not found or not app.pode_ver_evento_como(p_evento, v_alvo) then
    raise exception 'Evento não encontrado.';
  end if;
  if e.cancelado_em is not null then raise exception 'Evento cancelado.'; end if;
  if not (
       (e.tipo in ('reuniao', 'conjunta', 'evento') and p_resposta in ('confirmado', 'ausente'))
    or (e.tipo = 'individual' and p_resposta in ('ciente', 'concluido'))
    or (e.tipo = 'convite'    and p_resposta in ('aceito', 'recusado'))) then
    raise exception 'Resposta % não se aplica a este tipo de evento.', p_resposta;
  end if;

  insert into resposta (evento_id, pessoa_id, resposta, respondido_por)
  values (p_evento, v_alvo, p_resposta, v_me)
  on conflict (evento_id, pessoa_id)
  do update set resposta = excluded.resposta, respondido_por = excluded.respondido_por, respondido_em = now();
end $$;

-- Ativação da conta do menor: somente após aprovação do responsável,
-- com registro do consentimento (data, versão do termo, forma de verificação).
create or replace function public.aprovar_conta_menor(p_menor uuid, p_versao_termo text, p_forma_verificacao text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_me uuid := app.exigir_login();
begin
  if not app.eh_responsavel_de(p_menor) then
    raise exception 'Apenas o responsável legal pode aprovar esta conta.' using errcode = '42501';
  end if;
  if coalesce(trim(p_versao_termo), '') = '' or coalesce(trim(p_forma_verificacao), '') = '' then
    raise exception 'Informe a versão do termo e a forma de verificação.';
  end if;
  insert into consentimento (titular_id, concedido_por_id, versao_termo, finalidade, forma_verificacao)
  values (p_menor, v_me, trim(p_versao_termo),
          'Cadastro, agenda, cargos e notificações no app do núcleo', trim(p_forma_verificacao));
  update pessoa set conta_aprovada_em = now(), conta_aprovada_por = v_me where id = p_menor;
end $$;

create or replace function public.revogar_consentimento(p_menor uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform app.exigir_login();
  if not app.eh_responsavel_de(p_menor) then
    raise exception 'Apenas o responsável legal pode revogar.' using errcode = '42501';
  end if;
  update consentimento set revogado_em = now() where titular_id = p_menor and revogado_em is null;
  update pessoa set conta_aprovada_em = null, conta_aprovada_por = null where id = p_menor;
  delete from push_inscricao where pessoa_id = p_menor;
end $$;

create or replace function public.autorizar_foto(p_menor uuid, p_autorizada boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform app.exigir_login();
  if not app.eh_responsavel_de(p_menor) then
    raise exception 'Apenas o responsável legal pode autorizar.' using errcode = '42501';
  end if;
  update pessoa
     set foto_autorizada = p_autorizada,
         foto_url = case when p_autorizada then foto_url end
   where id = p_menor;
end $$;

create or replace function public.atualizar_meu_celular(p_celular text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  update pessoa set celular = nullif(trim(p_celular), '') where id = app.exigir_login();
end $$;

create or replace function public.salvar_preferencia(p_tipo tipo_evento, p_push boolean, p_email boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_me uuid := app.exigir_login();
begin
  if p_tipo = 'reuniao' and not p_push and not p_email then
    raise exception 'Reuniões não podem ser silenciadas.';
  end if;
  insert into preferencia_notificacao (pessoa_id, tipo_evento, push, email)
  values (v_me, p_tipo, p_push, p_email)
  on conflict (pessoa_id, tipo_evento) do update set push = excluded.push, email = excluded.email;
end $$;

create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_me uuid := app.exigir_login();
begin
  insert into push_inscricao (pessoa_id, endpoint, p256dh, auth)
  values (v_me, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set pessoa_id = v_me, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.remover_push(p_endpoint text)
returns void language sql security definer
set search_path = public, pg_temp as $$
  delete from push_inscricao where endpoint = p_endpoint and pessoa_id = app.pessoa_atual()
$$;

create or replace function public.minhas_notificacoes(p_limite int default 50)
returns table (id uuid, titulo text, corpo text, evento_id uuid, enviada_em timestamptz, lida boolean)
language sql stable security definer
set search_path = public, pg_temp as $$
  select n.id, n.titulo, n.corpo, n.evento_id, n.enviada_em, n.lida_em is not null
    from notificacao n
   where n.pessoa_id = app.pessoa_atual() and n.enviada_em is not null
   order by n.enviada_em desc
   limit least(p_limite, 200)
$$;

create or replace function public.marcar_notificacoes_lidas()
returns void language sql security definer
set search_path = public, pg_temp as $$
  update notificacao set lida_em = now()
   where pessoa_id = app.pessoa_atual() and enviada_em is not null and lida_em is null
$$;

-- Exclusão definitiva a pedido do titular ou do responsável (LGPD):
-- anonimiza o cadastro e preserva o histórico (cargos, presenças).
-- Devolve o id do usuário de autenticação, que o servidor remove.
create or replace function public.anonimizar_pessoa(p_pessoa uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  p pessoa;
  v_cargos text;
begin
  if not (p_pessoa = app.pessoa_do_login() or app.eh_responsavel_de(p_pessoa)) then
    raise exception 'Apenas o titular ou seu responsável legal podem pedir a exclusão.' using errcode = '42501';
  end if;
  select * into p from pessoa where id = p_pessoa for update;
  if p.anonimizada_em is not null then return null; end if;

  select string_agg(c.nome || ' (' || o.nome || ')', ', ') into v_cargos
    from ocupacao_cargo oc
    join mandato m on m.id = oc.mandato_id
    join cargo c on c.id = oc.cargo_id
    join organizacao o on o.id = m.organizacao_id
   where oc.pessoa_id = p_pessoa and oc.fim is null and m.fim >= current_date;
  if v_cargos is not null then
    raise exception 'Antes da exclusão, a Secretaria precisa transferir: %.', v_cargos;
  end if;
  if exists (select 1 from responsavel r join vinculo v on v.pessoa_id = r.menor_id and v.ativo
              where r.responsavel_id = p_pessoa
                and not exists (select 1 from responsavel r2
                                 where r2.menor_id = r.menor_id and r2.responsavel_id <> p_pessoa)) then
    raise exception 'Você é o único responsável por um menor ativo. Indique outro responsável antes.';
  end if;

  update vinculo set ativo = false, secretaria = false, fim = current_date,
                     motivo_desativacao = 'Exclusão a pedido do titular'
   where pessoa_id = p_pessoa and ativo;
  delete from administrador where pessoa_id = p_pessoa;
  delete from push_inscricao where pessoa_id = p_pessoa;
  delete from preferencia_notificacao where pessoa_id = p_pessoa;
  delete from notificacao where pessoa_id = p_pessoa or sobre_pessoa_id = p_pessoa;
  delete from responsavel where menor_id = p_pessoa;

  update pessoa set
    nome = 'Titular anonimizado', data_nascimento = null, email = null, celular = null,
    id_oficial = null, foto_url = null, foto_autorizada = false,
    auth_user_id = null, anonimizada_em = now()
  where id = p_pessoa;

  return p.auth_user_id;
end $$;

-- =====================================================================
-- PÚBLICO (sem login): link de evento aberto (filantropia, cerimônia pública)
-- =====================================================================
create or replace function public.evento_publico(p_evento uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select jsonb_build_object(
           'titulo', e.titulo, 'descricao', e.descricao, 'inicio', e.inicio, 'fim', e.fim,
           'local', l.nome, 'endereco', l.endereco, 'organizacao', o.nome,
           'organizacoes', array(select o2.nome from evento_organizacao eo
                                   join organizacao o2 on o2.id = eo.organizacao_id
                                  where eo.evento_id = e.id and eo.status = 'aceita' order by o2.nome))
    from evento e
    join organizacao o on o.id = e.organizacao_id
    left join local l on l.id = e.local_id
   where e.id = p_evento and e.publico and e.cancelado_em is null
$$;

-- =====================================================================
-- SERVIÇO (somente service_role — servidor da aplicação)
-- =====================================================================
create or replace function public.login_bloqueado(p_email text)
returns timestamptz language sql stable security definer
set search_path = public, pg_temp as $$
  select bloqueado_ate from tentativa_login
   where email = lower(trim(p_email)) and bloqueado_ate > now()
$$;

-- 5 tentativas erradas em 15 minutos bloqueiam por 15 minutos.
create or replace function public.registrar_falha_login(p_email text)
returns timestamptz language plpgsql security definer
set search_path = public, pg_temp as $$
declare r tentativa_login;
begin
  insert into tentativa_login as t (email, falhas, atualizado_em)
  values (lower(trim(p_email)), 1, now())
  on conflict (email) do update set
    falhas = case when t.atualizado_em < now() - interval '15 minutes' then 1 else t.falhas + 1 end,
    atualizado_em = now()
  returning * into r;
  if r.falhas >= 5 then
    update tentativa_login set bloqueado_ate = now() + interval '15 minutes', falhas = 0
     where email = r.email returning * into r;
  end if;
  return r.bloqueado_ate;
end $$;

create or replace function public.limpar_falhas_login(p_email text)
returns void language sql security definer
set search_path = public, pg_temp as $$
  delete from tentativa_login where email = lower(trim(p_email))
$$;

-- Lote de notificações a enviar. Antes, descarta as que perderam sentido
-- (conta desativada, lembrete de evento cancelado ou já iniciado, perda de acesso).
create or replace function public.notificacoes_para_envio(p_limite int default 100)
returns table (
  id uuid, pessoa_id uuid, email text, titulo text, corpo text, evento_id uuid,
  usar_push boolean, usar_email boolean, inscricoes jsonb)
language plpgsql security definer
set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  update notificacao n
     set descartada_em = now(), erro = 'descartada: destinatário sem acesso ou evento encerrado'
   where n.enviada_em is null and n.descartada_em is null and n.agendada_para <= now()
     and (
       not app.conta_ativa(n.pessoa_id)
       or (n.motivo like 'lembrete%' and exists (
             select 1 from evento e where e.id = n.evento_id and (e.cancelado_em is not null or e.inicio <= now())))
       or (n.evento_id is not null
           and n.motivo not in ('convite_organizacao', 'resposta_organizacao')
           and not app.pode_ver_evento_como(n.evento_id, coalesce(n.sobre_pessoa_id, n.pessoa_id)))
     );

  return query
    with lote as (
      select n.id from notificacao n
       where n.enviada_em is null and n.descartada_em is null and n.agendada_para <= now()
         and (n.processando_em is null or n.processando_em < now() - interval '10 minutes')
       order by n.agendada_para
       limit p_limite
       for update skip locked
    ), marcadas as (
      update notificacao n set processando_em = now()
        from lote where n.id = lote.id
      returning n.*
    )
    select m.id, m.pessoa_id, p.email, m.titulo, m.corpo, m.evento_id,
           coalesce(pf.push, true), coalesce(pf.email, true),
           coalesce((select jsonb_agg(jsonb_build_object('endpoint', pi.endpoint, 'p256dh', pi.p256dh, 'auth', pi.auth))
                       from push_inscricao pi where pi.pessoa_id = m.pessoa_id), '[]'::jsonb)
      from marcadas m
      join pessoa p on p.id = m.pessoa_id
      left join evento e on e.id = m.evento_id
      left join preferencia_notificacao pf on pf.pessoa_id = m.pessoa_id and pf.tipo_evento = e.tipo;
end $$;

create or replace function public.concluir_notificacao(p_id uuid, p_erro text default null)
returns void language sql security definer
set search_path = public, pg_temp as $$
  update notificacao set enviada_em = now(), processando_em = null, erro = p_erro where id = p_id
$$;

create or replace function public.remover_push_expirada(p_endpoint text)
returns void language sql security definer
set search_path = public, pg_temp as $$
  delete from push_inscricao where endpoint = p_endpoint
$$;

-- =====================================================================
-- Permissões de execução
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app    from public, anon, authenticated;

-- Funções chamadas pelas políticas RLS (rodam com o papel do usuário).
grant execute on function
  app.faixa(date), app.faixa_de(uuid), app.conta_ativa(uuid), app.pessoa_do_login(), app.pessoa_atual(),
  app.eh_admin(), app.eh_secretaria(uuid), app.eh_membro(uuid), app.eh_responsavel_de(uuid),
  app.eh_secretaria_de_pessoa(uuid), app.pode_ver_pessoa(uuid), app.pode_ver_evento_como(uuid, uuid),
  app.pode_ver_evento(uuid), app.nucleos_do_usuario()
to authenticated;

grant execute on function
  public.criar_nucleo(text, text, text),
  public.criar_local(uuid, text, text),
  public.criar_organizacao(uuid, tipo_organizacao, text, text, text, uuid),
  public.nomear_secretaria(uuid, text, text),
  public.revogar_secretaria(uuid, uuid),
  public.listar_secretarias(),
  public.cadastrar_membro(uuid, text, date, text, text, text, papel_vinculo, text, text, text, text),
  public.desativar_vinculo(uuid, text),
  public.reativar_membro(uuid, uuid, papel_vinculo),
  public.criar_mandato(uuid, text, date, date),
  public.criar_cargo(uuid, text, int, int, boolean),
  public.atribuir_cargo(uuid, uuid, uuid, date, boolean),
  public.transferir_cargo(uuid, uuid, date, boolean),
  public.efetivar_interino(uuid),
  public.criar_evento(uuid, tipo_evento, text, timestamptz, timestamptz, uuid, text, boolean, uuid[], uuid[], int),
  public.responder_participacao(uuid, uuid, boolean),
  public.cancelar_evento(uuid, boolean),
  public.reagendar_evento(uuid, timestamptz, timestamptz, uuid),
  public.ocupacao_local(uuid, timestamptz, timestamptz),
  public.presencas_do_evento(uuid),
  public.meu_perfil(),
  public.agenda(timestamptz, timestamptz),
  public.quadro_cargos(uuid, uuid),
  public.membros_da_organizacao(uuid),
  public.responder_evento(uuid, tipo_resposta, uuid),
  public.aprovar_conta_menor(uuid, text, text),
  public.revogar_consentimento(uuid),
  public.autorizar_foto(uuid, boolean),
  public.atualizar_meu_celular(text),
  public.salvar_preferencia(tipo_evento, boolean, boolean),
  public.registrar_push(text, text, text),
  public.remover_push(text),
  public.minhas_notificacoes(int),
  public.marcar_notificacoes_lidas(),
  public.anonimizar_pessoa(uuid)
to authenticated;

grant execute on function public.evento_publico(uuid) to anon, authenticated;

grant execute on function
  public.login_bloqueado(text), public.registrar_falha_login(text), public.limpar_falhas_login(text),
  public.notificacoes_para_envio(int), public.concluir_notificacao(uuid, text),
  public.remover_push_expirada(text)
to service_role;

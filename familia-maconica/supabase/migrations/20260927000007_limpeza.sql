-- =====================================================================
-- Limpeza periódica (LGPD art. 15 e 16: guardar só pelo tempo necessário).
-- Roda uma vez por dia pelo pg_cron (supabase/agendar-despacho.sql).
--   Sempre: avisos já enviados/descartados há mais de 90 dias e tentativas de
--   login encerradas.
--   Só quando o prazo for definido (parecer jurídico; nulo = desligado):
--   anonimizar contas sem vínculo ativo há X meses e apagar auditoria antiga.
-- =====================================================================

-- A parte que apaga e anonimiza sai de anonimizar_pessoa para ser usada
-- também pela limpeza. Quem chama confere permissões e bloqueios.
create or replace function app.anonimizar(p_pessoa uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_auth uuid;
begin
  select auth_user_id into v_auth from pessoa where id = p_pessoa and anonimizada_em is null for update;
  if not found then return null; end if;

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

  return v_auth;
end $$;
revoke all on function app.anonimizar(uuid) from public, anon, authenticated;

create or replace function public.anonimizar_pessoa(p_pessoa uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_cargos text;
begin
  if not (p_pessoa = app.pessoa_do_login() or app.eh_responsavel_de(p_pessoa)) then
    raise exception 'Apenas o titular ou seu responsável legal podem pedir a exclusão.' using errcode = '42501';
  end if;
  if exists (select 1 from pessoa where id = p_pessoa and anonimizada_em is not null) then return null; end if;

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

  return app.anonimizar(p_pessoa);
end $$;

create or replace function public.limpar_dados_antigos(
  p_dias_notificacao int default 90,
  p_meses_inativo    int default null,
  p_meses_auditoria  int default null
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_notif  int;
  v_login  int;
  v_anon   int := 0;
  v_audit  int := 0;
  v_pessoa uuid;
  v_auth   uuid;
begin
  delete from notificacao
   where coalesce(enviada_em, descartada_em) < now() - make_interval(days => p_dias_notificacao);
  get diagnostics v_notif = row_count;

  delete from tentativa_login
   where atualizado_em < now() - interval '1 day'
     and (bloqueado_ate is null or bloqueado_ate < now());
  get diagnostics v_login = row_count;

  if p_meses_inativo is not null then
    for v_pessoa in
      select p.id from pessoa p
       where p.anonimizada_em is null
         and not exists (select 1 from administrador a where a.pessoa_id = p.id)
         -- sem vínculo ativo e o último vínculo terminou antes do prazo
         and exists (select 1 from vinculo v where v.pessoa_id = p.id)
         and not exists (select 1 from vinculo v where v.pessoa_id = p.id and v.ativo)
         and (select max(v.fim) from vinculo v where v.pessoa_id = p.id)
             < current_date - make_interval(months => p_meses_inativo)
         -- nunca apaga o responsável de um dependente ainda cadastrado
         and not exists (select 1 from responsavel r join pessoa m on m.id = r.menor_id
                          where r.responsavel_id = p.id and m.anonimizada_em is null)
         and not exists (select 1 from ocupacao_cargo oc join mandato m on m.id = oc.mandato_id
                          where oc.pessoa_id = p.id and oc.fim is null and m.fim >= current_date)
    loop
      v_auth := app.anonimizar(v_pessoa);
      if v_auth is not null then
        delete from auth.users where id = v_auth;
      end if;
      v_anon := v_anon + 1;
    end loop;
  end if;

  if p_meses_auditoria is not null then
    delete from log_auditoria where em < now() - make_interval(months => p_meses_auditoria);
    get diagnostics v_audit = row_count;
  end if;

  return jsonb_build_object('notificacoes', v_notif, 'tentativas_login', v_login,
                            'contas_anonimizadas', v_anon, 'registros_auditoria', v_audit);
end $$;

revoke all on function public.limpar_dados_antigos(int, int, int) from public, anon, authenticated;
grant execute on function public.limpar_dados_antigos(int, int, int) to service_role;

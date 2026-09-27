-- =====================================================================
-- Testes das regras de negócio e de acesso (seção 8 do dossiê).
-- Rodam como os papéis reais (authenticated / anon / service_role),
-- trocando o usuário logado com teste.como(email).
-- =====================================================================
\set QUIET on
create schema teste;

create function teste.como(p_email text) returns void
language plpgsql security definer as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'usuário de teste % não existe', p_email; end if;
  perform set_config('request.jwt.claim.sub', v::text, false);
end $$;

create function teste.ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok — %', p_msg;
end $$;

create function teste.erro(p_sql text, p_trecho text, p_msg text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALHOU: % (esperava erro "%")', p_msg, p_trecho;
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  if position(lower(p_trecho) in lower(sqlerrm)) = 0 then
    raise exception 'FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
  end if;
  raise notice 'ok — %', p_msg;
end $$;

-- Usuário de auth criado quando a pessoa aceita o convite.
create function teste.aceitar_convite(p_email text) returns void
language sql security definer as $$ insert into auth.users (email) values (p_email) $$;

grant usage on schema teste to anon, authenticated, service_role;
grant execute on all functions in schema teste to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Bootstrap do primeiro administrador (feito por SQL, uma única vez)
-- ---------------------------------------------------------------------
insert into public.pessoa (nome, email) values ('Admin', 'admin@teste.com');
insert into public.administrador select id from public.pessoa where email = 'admin@teste.com';
select teste.aceitar_convite('admin@teste.com');
select teste.ok((select auth_user_id is not null from public.pessoa where email = 'admin@teste.com'),
                'convite aceito liga auth.users à pessoa pelo e-mail');

-- ---------------------------------------------------------------------
-- Administrador cria o núcleo e nomeia as Secretarias
-- ---------------------------------------------------------------------
set role authenticated;
select teste.como('admin@teste.com');
select criar_nucleo('Núcleo Exemplo', 'Curitiba', 'pr') as nucleo \gset
select criar_local(:'nucleo', 'Templo', 'Rua do Templo, 1') as templo \gset
select criar_organizacao(:'nucleo', 'loja', 'Loja Exemplo', '101', 'GOB', :'templo') as loja \gset
select criar_organizacao(:'nucleo', 'capitulo_demolay', 'Capítulo Exemplo', '202', 'SCDB', :'templo') as cap \gset
select criar_organizacao(:'nucleo', 'bethel', 'Bethel Exemplo', '7', 'GCFJ', :'templo') as bethel \gset
select nomear_secretaria(:'loja', 'Secretário da Loja', 'sec.loja@teste.com');
select nomear_secretaria(:'cap', 'Escrivão Adulto', 'sec.cap@teste.com');
select nomear_secretaria(:'bethel', 'Secretária do Bethel', 'sec.bethel@teste.com');
select teste.ok((select count(*) = 3 from listar_secretarias()), 'admin lista as 3 Secretarias');
select teste.ok((select count(*) = 1 from pessoa), 'admin não vê dados de membros (só o próprio cadastro)');
reset role;
select teste.aceitar_convite('sec.loja@teste.com');
select teste.aceitar_convite('sec.cap@teste.com');
select teste.aceitar_convite('sec.bethel@teste.com');

-- ---------------------------------------------------------------------
-- Cadastro pela Secretaria (menores exigem responsável)
-- ---------------------------------------------------------------------
set role authenticated;
select teste.como('sec.cap@teste.com');
select teste.erro(format($$select cadastrar_membro(%L, 'Sem Resp', (current_date - interval '15 years')::date)$$, :'cap'),
                  'responsável legal', 'menor sem responsável é recusado');
select cadastrar_membro(:'cap', 'João DeMolay', (current_date - interval '15 years')::date, 'joao@teste.com',
                        p_resp_nome => 'Carlos Pai', p_resp_email => 'pai.joao@teste.com', p_resp_parentesco => 'pai') as r_joao \gset
select teste.ok((:'r_joao'::jsonb -> 'convites') @> '["joao@teste.com","pai.joao@teste.com"]', 'convites para o menor e o responsável');
select cadastrar_membro(:'cap', 'Lucas Sênior', (current_date - interval '17 years')::date, 'lucas@teste.com',
                        p_resp_nome => 'Marta Mãe', p_resp_email => 'mae.lucas@teste.com');
select cadastrar_membro(:'cap', 'Pedro Consultor', '1980-05-10', 'pedro@teste.com', p_papel => 'adulto');
select teste.erro(format($$select cadastrar_membro(%L, 'Pedro de novo', '1980-05-10', 'PEDRO@teste.com')$$, :'cap'),
                  'já tem vínculo ativo', 'mesmo e-mail na mesma organização é recusado');
select teste.erro(format($$select cadastrar_membro(%L, 'Invasor', '1990-01-01', 'x@teste.com')$$, :'loja'),
                  'Apenas a Secretaria', 'Secretaria não cadastra em outra organização');

select teste.como('sec.loja@teste.com');
select cadastrar_membro(:'loja', 'Carlos Pai (maçom)', '1975-03-03', 'pai.joao@teste.com') as r_pai \gset
select teste.ok((:'r_pai'::jsonb ->> 'reutilizada')::boolean, 'mesma pessoa em duas organizações = uma conta');

select teste.como('sec.bethel@teste.com');
select cadastrar_membro(:'bethel', 'Ana Filha', (current_date - interval '11 years')::date, 'ana@teste.com',
                        p_resp_nome => 'Beatriz Mãe', p_resp_email => 'mae.ana@teste.com') as r_ana \gset
reset role;
select teste.aceitar_convite(e) from unnest(array['joao@teste.com','pai.joao@teste.com','lucas@teste.com',
  'mae.lucas@teste.com','pedro@teste.com','ana@teste.com','mae.ana@teste.com']) e;

-- ---------------------------------------------------------------------
-- Contas de menores: só ativas após aprovação do responsável
-- ---------------------------------------------------------------------
set role authenticated;
select teste.como('joao@teste.com');
select teste.ok(not (meu_perfil() -> 'pessoa' ->> 'conta_ativa')::boolean, 'menor sem aprovação: conta inativa');
select teste.ok((meu_perfil() -> 'pessoa' ->> 'aguardando_aprovacao')::boolean, 'menor vê que aguarda aprovação');
select teste.erro($$select * from agenda(now(), now() + interval '1 day')$$, 'Conta inativa', 'menor sem aprovação não acessa a agenda');
select teste.ok((select count(*) = 0 from pessoa), 'menor sem aprovação não lê nenhuma pessoa');

select teste.como('sec.cap@teste.com');
select teste.erro(format($$select aprovar_conta_menor(%L, 'v1', 'e-mail')$$, :'r_joao'::jsonb ->> 'pessoa_id'),
                  'Apenas o responsável', 'Secretaria não aprova conta de menor');

select teste.como('pai.joao@teste.com');
select aprovar_conta_menor((:'r_joao'::jsonb ->> 'pessoa_id')::uuid, 'termo-v1', 'e-mail do responsável confirmado');
select teste.como('mae.lucas@teste.com');
select aprovar_conta_menor(id, 'termo-v1', 'e-mail') from pessoa where email = 'lucas@teste.com';
select teste.como('mae.ana@teste.com');
select aprovar_conta_menor((:'r_ana'::jsonb ->> 'pessoa_id')::uuid, 'termo-v1', 'e-mail');
select teste.como('joao@teste.com');
select teste.ok((meu_perfil() -> 'pessoa' ->> 'conta_ativa')::boolean, 'após aprovação a conta do menor fica ativa');
select teste.ok(exists (select 1 from consentimento), 'consentimento registrado e visível ao titular');

-- ---------------------------------------------------------------------
-- Isolamento entre organizações
-- ---------------------------------------------------------------------
select teste.como('sec.loja@teste.com');
select teste.ok((select count(*) = 0 from pessoa where email = 'joao@teste.com'), 'Secretaria da Loja não vê menor do Capítulo');
select teste.ok((select count(*) = 1 from pessoa where email = 'pai.joao@teste.com'), 'Secretaria da Loja vê seu membro');
select teste.como('sec.cap@teste.com');
select teste.ok((select count(*) = 1 from pessoa where email = 'joao@teste.com'), 'Secretaria do Capítulo vê seu membro menor');
select teste.ok((select count(*) = 0 from pessoa where email = 'ana@teste.com'), 'Secretaria do Capítulo não vê a Filha de Jó');
select teste.erro($$insert into evento (organizacao_id, tipo, titulo, inicio, fim) select id, 'reuniao', 'x', now(), now() + interval '1h' from organizacao limit 1$$,
                  'permission denied', 'escrita direta nas tabelas é negada');

-- ---------------------------------------------------------------------
-- Agenda: série semanal, conflito de templo, notificações
-- ---------------------------------------------------------------------
select criar_evento(:'cap', 'reuniao', 'Reunião ordinária',
                    ((current_date + 3) + time '19:30') at time zone 'America/Sao_Paulo',
                    ((current_date + 3) + time '21:30') at time zone 'America/Sao_Paulo',
                    :'templo', p_repetir_semanas => 3) as serie \gset
select (:'serie'::uuid[])[1] as reuniao1 \gset
select teste.ok(cardinality(:'serie'::uuid[]) = 4, 'série semanal cria 4 datas');

select teste.como('sec.loja@teste.com');
select teste.erro(format($$select criar_evento(%L, 'reuniao', 'Sessão', %L, %L, %L)$$, :'loja',
                    ((current_date + 3) + time '20:00') at time zone 'America/Sao_Paulo',
                    ((current_date + 3) + time '22:00') at time zone 'America/Sao_Paulo', :'templo'),
                  'Conflito de uso do local: Capítulo Exemplo', 'conflito de templo é bloqueado e informa quem ocupa');
select teste.ok((select count(*) = 1 from ocupacao_local(:'templo', now(), now() + interval '4 days') where titulo is null),
                'ocupação do templo mostra horário de outra organização sem o título');
reset role;

-- Destinatários da criação: sec.cap, João (15), Lucas (17), Pedro + cópia ao pai do João (<16)
select teste.ok((select count(*) = 5 from notificacao where evento_id = :'reuniao1' and motivo = 'criacao'),
                'criação notifica membros ativos + cópia ao responsável do menor de 16');
select teste.ok((select count(*) = 0 from notificacao n join pessoa p on p.id = n.pessoa_id
                  where n.evento_id = :'reuniao1' and p.email = 'mae.lucas@teste.com'),
                '16–17 anos: reunião regular não gera cópia ao responsável');
select teste.ok((select count(*) = 0 from notificacao where evento_id = (:'serie'::uuid[])[2] and motivo = 'criacao'),
                'série não repete aviso de criação');
select teste.ok((select count(*) > 0 from notificacao where evento_id = (:'serie'::uuid[])[4] and motivo like 'lembrete%'),
                'lembretes agendados para cada data da série');
select teste.ok(app.ajustar_silencio('2026-10-01 23:30-03', p.id) = '2026-10-02 07:00-03'::timestamptz
                and app.ajustar_silencio('2026-10-01 05:00-03', p.id) = '2026-10-01 07:00-03'::timestamptz
                and app.ajustar_silencio('2026-10-01 15:00-03', p.id) = '2026-10-01 15:00-03'::timestamptz,
                'menores: sem notificações entre 22h e 7h')
  from pessoa p where p.email = 'joao@teste.com';

-- ---------------------------------------------------------------------
-- Atividade conjunta em duas etapas
-- ---------------------------------------------------------------------
set role authenticated;
select teste.como('sec.loja@teste.com');
select (criar_evento(:'loja', 'conjunta', 'Sessão pública de filantropia',
                     ((current_date + 5) + time '15:00') at time zone 'America/Sao_Paulo',
                     ((current_date + 5) + time '17:00') at time zone 'America/Sao_Paulo',
                     :'templo', 'Arrecadação de alimentos', true, array[:'bethel']::uuid[]))[1] as conj \gset
reset role;
select teste.ok((select count(*) = 0 from notificacao n join pessoa p on p.id = n.pessoa_id
                  where n.evento_id = :'conj' and p.email in ('ana@teste.com', 'mae.ana@teste.com')),
                'membros da organização convidada não são notificados antes do aceite');
select teste.ok((select count(*) = 1 from notificacao n join pessoa p on p.id = n.pessoa_id
                  where n.evento_id = :'conj' and p.email = 'sec.bethel@teste.com' and n.motivo = 'convite_organizacao'),
                'Secretaria convidada recebe o convite');

set role authenticated;
select teste.como('ana@teste.com');
select teste.ok((select count(*) = 0 from agenda(now(), now() + interval '30 days') where id = :'conj'),
                'criança não vê evento público de outra organização antes do aceite');
select teste.como('sec.bethel@teste.com');
select responder_participacao(:'conj', :'bethel', true);
select teste.como('ana@teste.com');
select teste.ok((select count(*) = 1 from agenda(now(), now() + interval '30 days') where id = :'conj'),
                'após o aceite, a Filha de Jó vê a atividade conjunta');
select teste.ok((select count(*) = 0 from agenda(now(), now() + interval '30 days') where id = :'reuniao1'),
                'criança não vê reuniões de outras organizações');
reset role;
select teste.ok((select count(*) = 1 from notificacao n join pessoa p on p.id = n.pessoa_id
                  where n.evento_id = :'conj' and p.email = 'mae.ana@teste.com' and n.motivo = 'criacao'),
                'após o aceite, responsável da criança recebe cópia');

set role anon;
select teste.ok(evento_publico(:'conj') ->> 'titulo' = 'Sessão pública de filantropia', 'evento público acessível por link sem login');
select teste.ok(evento_publico(:'reuniao1') is null, 'reunião não é exposta pelo link público');
select teste.erro('select * from pessoa', 'permission denied', 'anônimo não lê tabelas');
reset role;

-- ---------------------------------------------------------------------
-- Cargos: faixa etária, vagas, bloqueio na desativação, transferência, interino
-- ---------------------------------------------------------------------
set role authenticated;
select teste.como('sec.cap@teste.com');
select criar_mandato(:'cap', 'Gestão 2026/2', current_date - 30, current_date + 150) as mandato \gset
select teste.erro(format($$select criar_mandato(%L, 'Sobreposta', current_date, current_date + 10)$$, :'cap'),
                  'Já existe uma gestão', 'gestões não se sobrepõem');
select id as mc from cargo where tipo_organizacao = 'capitulo_demolay' and nome = 'Mestre Conselheiro' \gset
select id as pcc from cargo where tipo_organizacao = 'capitulo_demolay' and nome = 'Presidente do Conselho Consultivo' \gset
select id as consultor from cargo where tipo_organizacao = 'capitulo_demolay' and nome = 'Consultor' \gset
select id as joao from pessoa where email = 'joao@teste.com' \gset
select id as lucas from pessoa where email = 'lucas@teste.com' \gset
select id as pedro from pessoa where email = 'pedro@teste.com' \gset
select atribuir_cargo(:'mandato', :'mc', :'joao') as ocup_mc \gset
select atribuir_cargo(:'mandato', :'consultor', :'pedro');
select teste.erro(format('select atribuir_cargo(%L, %L, %L)', :'mandato', :'pcc', :'joao'),
                  'exclusivo de adultos', 'cargo de adulto recusa menor');
select teste.erro(format('select atribuir_cargo(%L, %L, %L)', :'mandato', :'mc', :'lucas'),
                  'já está ocupado', 'cargo de vaga única não aceita segundo ocupante');

select id as vinc_joao from vinculo where pessoa_id = :'joao' and organizacao_id = :'cap' and ativo \gset
select desativar_vinculo(:'vinc_joao') as tentativa \gset
select teste.ok(not (:'tentativa'::jsonb ->> 'ok')::boolean
                and :'tentativa'::jsonb -> 'cargos' -> 0 ->> 'cargo' = 'Mestre Conselheiro',
                'desativação bloqueada por cargo ativo, indicando qual transferir');
select transferir_cargo(:'ocup_mc', :'lucas', current_date, true) as ocup_lucas \gset
select teste.ok((select interino from quadro_cargos(:'cap') where ocupacao_id = :'ocup_lucas'), 'interino sinalizado no quadro');
select teste.ok((desativar_vinculo(:'vinc_joao') ->> 'ok')::boolean, 'após transferência, desativação liberada');
select efetivar_interino(:'ocup_lucas');
select teste.ok((select not interino from quadro_cargos(:'cap') where ocupacao_id = :'ocup_lucas'), 'nomeação definitiva');
select teste.ok((select count(*) = 1 from ocupacao_cargo where pessoa_id = :'joao' and fim is not null),
                'histórico do cargo exercido preservado');

select teste.como('pai.joao@teste.com');
select teste.ok((meu_perfil() -> 'pessoa' ->> 'conta_ativa')::boolean, 'pai continua ativo pelo vínculo com a Loja');
select teste.como('joao@teste.com');
select teste.ok(not (meu_perfil() -> 'pessoa' ->> 'conta_ativa')::boolean, 'sem vínculo ativo, conta fica inativa');

-- Visibilidade por faixa etária
select teste.como('ana@teste.com');
select teste.erro(format('select * from quadro_cargos(%L)', :'bethel'), 'Sem acesso', 'criança não vê o quadro de cargos');
select teste.erro(format('select * from membros_da_organizacao(%L)', :'bethel'), 'Sem acesso', 'criança não vê lista de membros');
select teste.como('lucas@teste.com');
select teste.ok((select count(*) > 0 from quadro_cargos(:'cap')), 'jovem vê o quadro da própria organização');
select teste.ok((select bool_and(email is null) from membros_da_organizacao(:'cap')), 'membro vê a lista sem contatos');
select teste.erro(format('select * from quadro_cargos(%L)', :'loja'), 'Sem acesso', 'jovem não vê quadro de outra organização');

-- ---------------------------------------------------------------------
-- Respostas e preferências
-- ---------------------------------------------------------------------
select responder_evento(:'reuniao1', 'confirmado');
select teste.erro(format($$select responder_evento(%L, 'aceito')$$, :'reuniao1'), 'não se aplica', 'resposta incompatível com o tipo');
select teste.erro($$select salvar_preferencia('reuniao', false, false)$$, 'não podem ser silenciadas', 'reuniões não podem ser silenciadas');
select salvar_preferencia('evento', true, false);
select teste.como('mae.lucas@teste.com');
select responder_evento(:'reuniao1', 'ausente', :'lucas');
select teste.ok((select resposta = 'ausente' from resposta where evento_id = :'reuniao1' and pessoa_id = :'lucas'),
                'responsável responde pelo menor');
select teste.como('sec.loja@teste.com');
select teste.erro(format($$select responder_evento(%L, 'ausente', %L)$$, :'reuniao1', :'lucas'),
                  'Só o próprio membro', 'terceiro não responde por outra pessoa');

-- ---------------------------------------------------------------------
-- Cancelamento e fila de envio
-- ---------------------------------------------------------------------
select teste.como('sec.cap@teste.com');
select teste.ok(cancelar_evento(:'reuniao1', true) = 4, 'cancelar série cancela as 4 datas');
reset role;
select teste.ok((select count(*) = 0 from notificacao
                  where evento_id = any (:'serie'::uuid[]) and motivo like 'lembrete%' and descartada_em is null),
                'lembretes pendentes descartados no cancelamento');
select teste.ok((select count(*) > 0 from notificacao where evento_id = :'reuniao1' and motivo = 'cancelamento'),
                'cancelamento gera aviso imediato');

set role service_role;
create temp table lote as select * from notificacoes_para_envio(1000);
select teste.ok((select count(*) > 0 from lote), 'despacho devolve notificações vencidas');
select teste.ok((select count(*) = 0 from lote where pessoa_id = :'joao'), 'conta desativada não recebe notificações');
select concluir_notificacao(id) from lote;
select teste.ok((select count(*) = 0 from notificacoes_para_envio(1000)), 'nada é enviado duas vezes');

select registrar_falha_login('Alguem@teste.com') from generate_series(1, 4);
select teste.ok(login_bloqueado('alguem@teste.com') is null, '4 falhas ainda não bloqueiam');
select registrar_falha_login('alguem@teste.com');
select teste.ok(login_bloqueado('alguem@teste.com') > now(), '5 falhas bloqueiam temporariamente');
reset role;

set role authenticated;
select teste.como('joao@teste.com');
select teste.erro($$select registrar_falha_login('x')$$, 'permission denied', 'funções de serviço fechadas para usuários');

-- ---------------------------------------------------------------------
-- Exclusão (anonimização) a pedido do titular
-- ---------------------------------------------------------------------
select teste.como('pedro@teste.com');
select teste.erro(format('select anonimizar_pessoa(%L)', :'pedro'), 'transferir', 'exclusão bloqueada enquanto ocupa cargo');
select teste.como('mae.ana@teste.com');
select teste.erro('select anonimizar_pessoa(id) from pessoa where email = ''mae.ana@teste.com''',
                  'único responsável', 'único responsável de menor ativo não pode ser excluído');
select teste.como('joao@teste.com');
select teste.ok(anonimizar_pessoa(:'joao') is not null, 'titular pede exclusão e recebe id de auth para remoção');
reset role;
select teste.ok((select nome = 'Titular anonimizado' and email is null and data_nascimento is null
                   from pessoa where id = :'joao'), 'cadastro anonimizado');
select teste.ok((select count(*) = 1 from ocupacao_cargo where pessoa_id = :'joao'), 'histórico mantido após anonimização');

-- ---------------------------------------------------------------------
-- Catálogo de cargos do Castelo de Escudeiros (migração 0005)
-- ---------------------------------------------------------------------
select teste.ok((select count(*) = 0 from cargo
                  where tipo_organizacao = 'castelo_escudeiros'
                    and nome in ('Escudeiro-Líder', 'Vice-Líder', 'Responsável adulto', 'Conselheiro adulto')),
                'Escudeiros: nomes provisórios substituídos');
select teste.ok((select array_agg(nome order by ordem) from cargo
                  where tipo_organizacao = 'castelo_escudeiros' and organizacao_id is null)
                = array['Mestre Escudeiro','Primeiro Escudeiro','Segundo Escudeiro','Capelão Escudeiro',
                        'Mestre de Cerimônias Escudeiro','Escrivão Escudeiro','Tesoureiro Escudeiro',
                        'Sentinela','Organista','Preceptor','Nobre Cavaleiro','Consultor'],
                'Escudeiros: 12 cargos na ordem do quadro');
select teste.ok((select bool_and(para_adulto) from cargo
                  where tipo_organizacao = 'castelo_escudeiros' and nome in ('Nobre Cavaleiro', 'Consultor')),
                'Escudeiros: Nobre Cavaleiro e Consultor exclusivos de adultos');

-- ---------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------
select teste.ok((select count(*) > 0 from log_auditoria where tabela = 'vinculo' and acao = 'update' and autor_id is not null),
                'desativação auditada com autor');
select teste.ok((select bool_and(dados ? 'colunas' and not dados ? 'nome') from log_auditoria where tabela = 'pessoa'),
                'log de pessoa guarda só nomes de colunas, sem dados pessoais');

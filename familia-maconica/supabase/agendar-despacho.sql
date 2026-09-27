-- Agenda o despacho de notificações a cada 5 minutos pelo próprio Supabase
-- (pg_cron + pg_net). Necessário no plano gratuito da Vercel, que só permite
-- cron diário. Rode no SQL Editor depois do deploy, trocando os dois valores:
--   <URL_DO_APP>     ex.: https://familia-maconica.vercel.app
--   <CRON_SECRET>    o mesmo valor da variável CRON_SECRET na Vercel
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('despachar-notificacoes')
 where exists (select 1 from cron.job where jobname = 'despachar-notificacoes');

select cron.schedule(
  'despachar-notificacoes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := '<URL_DO_APP>/api/notificacoes/despachar',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
  $$
);

-- Limpeza diária de dados antigos (migração 20260927000007), às 03h17 de Brasília.
-- Para ligar a anonimização de contas inativas e a limpeza da auditoria depois do
-- parecer jurídico, passe os prazos em meses: limpar_dados_antigos(90, <meses>, <meses>).
select cron.unschedule('limpar-dados-antigos')
 where exists (select 1 from cron.job where jobname = 'limpar-dados-antigos');

select cron.schedule('limpar-dados-antigos', '17 6 * * *', $$ select public.limpar_dados_antigos() $$);

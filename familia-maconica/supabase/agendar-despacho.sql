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

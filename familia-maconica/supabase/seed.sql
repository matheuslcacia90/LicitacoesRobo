-- Somente para desenvolvimento local (supabase start / db reset).
-- Cria o primeiro administrador; o acesso é ativado quando ele recebe o
-- convite (ver README → "Primeiro administrador").
insert into public.pessoa (nome, email) values ('Administrador Local', 'admin@exemplo.org.br');
insert into public.administrador (pessoa_id) select id from public.pessoa where email = 'admin@exemplo.org.br';

# Supabase — MCode Space

## Projeto preparado

O aplicativo usa `qecqwakscvyenxbfzbdu` (região us-east-2), reativado em 30/10/2026. O schema legado `onefoot` e seus dados foram excluídos após confirmação explícita do usuário. Não há contas ou dados de demonstração permanentes.

- `mcode_profiles`: nome, usuário único, stack e caminho da foto.
- `mcode_clients`, `mcode_fixed_expenses`, `mcode_transactions`: financeiro compartilhado entre todas as contas autenticadas.
- `avatars`: bucket privado; cada usuário só acessa a própria pasta.
- `mcode_todos`: lista de tarefas compartilhada entre contas autenticadas.
- Migrações em `supabase/migrations`. RLS habilitada em todas as tabelas do app; funções internas não são executáveis por anon/authenticated.

O SDK oficial roda no processo principal. URL e publishable key são públicas, embarcadas em `electron/supabase-config.json`. Nunca usar service_role, chave secret ou secrets de Google/GitHub nesse arquivo. A sessão é criptografada em `supabase-session.bin` no userData do aplicativo. A API do preload devolve apenas usuário/perfil, sem tokens.

## Autenticação

O cadastro por email exige confirmação. O usuário pode confirmar pelo link e depois entrar no app, ou usar o código se o template de confirmação incluir `{{ .Token }}`. Não desative a confirmação para contornar problemas de envio. Para uso público, configure SMTP no painel Supabase; o serviço de email padrão é destinado a testes e tem limites e restrições de destinatários.

### Endereço de retorno do desktop

Em Authentication → URL Configuration → Redirect URLs, foi cadastrado:

```
http://127.0.0.1:47831/auth/callback/*
```

A porta é fixa para restringir a allowlist; cada tentativa usa um caminho aleatório e o fluxo PKCE do SDK. Só Google e GitHub são aceitos. Fechar a janela de conta cancela a espera. Em caso de porta ocupada, encerre o outro login antes de tentar novamente.

### Google

1. Crie um cliente OAuth de aplicação Web no Google Cloud e configure a tela de consentimento.
2. Use como URI de redirecionamento autorizado:
   `https://qecqwakscvyenxbfzbdu.supabase.co/auth/v1/callback`
3. Em Supabase → Authentication → Sign In / Providers → Google, habilite o provedor e preencha Client ID e Client Secret diretamente no painel.
4. Durante testes, inclua as contas permitidas na configuração de audiência do Google. Para distribuir publicamente, conclua as exigências de publicação do provedor.

O cliente desktop usado na antiga integração Google Sheets não é utilizado aqui.

### GitHub

1. Em GitHub → Settings → Developer settings → OAuth Apps, crie um aplicativo chamado MCode Space.
2. Use como Authorization callback URL:
   `https://qecqwakscvyenxbfzbdu.supabase.co/auth/v1/callback`
3. Em Supabase → Authentication → Sign In / Providers → GitHub, habilite o provedor e preencha Client ID e Client Secret diretamente no painel.
4. Gere e salve secrets pelo próprio painel; não os envie pelo chat nem os coloque no repositório.

## Perfil e financeiro

O usuário escolhe um nome de usuário exclusivo, com 3 a 24 letras minúsculas, números ou `_`. A stack aceita até 20 tecnologias de até 30 caracteres. A foto é escolhida pelo diálogo nativo, limitada a 8 MB na entrada, convertida para PNG e reduzida antes de ir ao bucket privado. O app solicita um endereço temporário, carrega a imagem no processo principal e entrega somente os bytes da imagem ao renderer.

Lançamentos, clientes, gastos fixos e tarefas são compartilhados entre TODAS as contas autenticadas. As políticas RLS permitem leitura e alteração colaborativa; anon não tem permissão. owner_id e created_by identificam o criador e não filtram a leitura. O código do cliente é único no caixa compartilhado, e uma conta pode associar movimentos a clientes criados por outra. Os dados compartilhados são mantidos se o autor for removido.

Marcar recebido/pago ou editar/concluir/excluir tarefas exige a mesma versão updated_at, evitando sobrescrever alterações simultâneas. Os painéis atualizam automaticamente a cada cinco segundos enquanto visíveis. Ao sair ou trocar de conta, a interface limpa os dados em memória e descarta respostas antigas. Arquivos e terminais locais não são enviados ao Supabase. Perfis e fotos continuam privados por usuário.

## Validação

`npm test` verifica validação de conta/perfil, PKCE/configuração, armazenamento de sessão, consultas financeiras compartilhadas e autoria de tarefas e controle de versão. O smoke Electron usa respostas simuladas para exercitar formulários sem criar usuários reais. A migração foi aplicada e o compartilhamento autenticado, a privacidade dos perfis e o bloqueio anônimo foram testados no banco com duas contas temporárias dentro de uma transação revertida. A checagem de segurança do Supabase ficou sem alertas após restringir as funções internas.

Referências: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

A checagem mais recente de segurança sinalizou proteção contra senhas vazadas desativada (configuração de Auth preexistente, fora desta alteração): [orientação do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

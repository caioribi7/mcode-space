# MCode Space

Aplicativo desktop para organizar terminais e editar arquivos, com a identidade visual MCode.

## Baixar e instalar

[**Baixar a versão mais recente**](https://github.com/caioribi7/mcode-space/releases/latest) (Windows 10/11, 64 bits)

| Arquivo | Para quê |
| --- | --- |
| `MCode-Space-Setup-<versão>.exe` | **Instalador recomendado.** Cria atalhos e recebe atualizações pelo app |
| `MCode-Space-<versão>.exe` | Portátil: roda sem instalar e não se atualiza sozinho |

1. Baixe o **Setup** na página da release.
2. Abra o arquivo. Como o instalador não tem assinatura digital, o Windows SmartScreen pode avisar: clique em **Mais informações → Executar assim mesmo**.
3. Escolha a pasta de instalação e conclua. O instalador cria o atalho **MCode Space** na Área de Trabalho e no Menu Iniciar.
4. Para fixar: botão direito no atalho (ou no ícone na barra de tarefas com o app aberto) → **Fixar na barra de tarefas** / **Fixar em Iniciar**.

Se o atalho da Área de Trabalho não aparecer, abra o Menu Iniciar, procure "MCode Space", clique com o botão direito → **Abrir local do arquivo** e arraste o atalho para a Área de Trabalho segurando **Alt**.

Atualizações: com o app instalado, **Atualizações** na barra inferior verifica, baixa e instala novas versões após sua confirmação. Seus dados e configurações são preservados. Para desinstalar, use Configurações do Windows → Aplicativos → MCode Space.

## Executar a partir do código

No Windows 10/11, com Node.js 22 ou superior:

```powershell
npm ci
npm start
```

Para gerar instalador e portátil:

```powershell
npm run dist
```

Os arquivos ficam em `release/` (`MCode-Space-Setup-<versão>.exe`, blockmap, `latest.yml` e o portátil). O pacote não tem assinatura digital. Para publicar, envie instalador, blockmap e `latest.yml` juntos numa release `v<versão>` do GitHub.

O visual da versão 0.2 herda a composição de pôster tecnológico da referência fornecida: tipografia Anton, recortes diagonais, linhas finas, símbolo oficial amostrado em ASCII e halftone discreto. A paleta continua sendo a da MCode. A textura fica na apresentação e na assinatura lateral; editor e terminais mantêm fundos planos.

## Trabalhar

- Abra uma pasta com `Ctrl+O` ou o botão de pasta com +. Cada pasta ganha sua própria aba, preservando arquivos, rascunhos e shells ao alternar. Até oito pastas podem ficar abertas.
- No menu do botão direito de uma subpasta, escolha **Abrir em nova aba** ou **Novo terminal aqui**.
- Crie até 12 terminais no total: PowerShell, PowerShell 7 (quando instalado) ou Prompt de Comando. Cada terminal é um processo real, com entrada, saída, cores e redimensionamento.
- Organize em abas, lado a lado ou grade. Arraste as abas para reordenar, use as setas de cada aba ou `Ctrl+Shift+←/→`.
- Em **Mosaico**, selecione: equilibrado, duas colunas, três colunas, empilhados, uma linha, destaque à esquerda ou destaque no topo. Painéis maiores usam rolagem interna; o modelo é salvo por aba de pasta.
- Clique duas vezes no nome da aba ou use seu lápis para renomear e escolher uma cor. Enter salva; Cancelar e Esc mantêm o nome anterior. F2 funciona com o nome da aba em foco.
- Clique em arquivos para editar; `Ctrl+S` salva. Vários arquivos podem ficar abertos em abas.
- Em arquivos `.md` ou `.markdown`, use o ícone **código** para editar e o **olho** para visualizar o rascunho atual. A prévia mostra títulos, listas, tabelas, código, links e imagens raster locais de até 8 MB. Scripts, HTML ativo e imagens externas não são carregados. Links HTTP/HTTPS abrem no navegador somente quando clicados.
- Arraste arquivos do explorador para o editor ou um painel para abri-los. Arraste pastas para um painel para criar um terminal nessa pasta. O botão direito numa pasta também inicia um terminal nela.
- Para mover itens no disco, arraste-os para uma pasta na própria lateral, ou para o nome da pasta raiz acima da árvore. O destino recebe contorno tracejado, o rótulo “Mover aqui” e a indicação do caminho. O explorador atualiza o arquivo aberto sem perder seu rascunho. Nomes já existentes no destino não são substituídos; links e pastas que contêm repositórios Git não podem ser movidos.
- Arraste os divisores para ajustar a largura do explorador e a altura do editor. As setas do teclado também funcionam quando o divisor está em foco.
- O explorador verifica mudanças automaticamente a cada **750 ms** com a janela visível. Lê somente a raiz e as pastas expandidas; a árvore só é redesenhada se a estrutura mudou. O filtro atua nos arquivos já visíveis.
- Recolha o explorador pelo botão no cabeçalho lateral; o botão ao lado da marca ou `Ctrl+B` permite mostrá-lo novamente. O outro botão lateral recolhe os diretórios expandidos.
- A barra inferior mostra a branch e a quantidade de alterações do Git quando a pasta está em um repositório. O app apenas consulta o Git; commits e outras operações podem ser feitos nos terminais.

## Atalhos

| Atalho | Ação |
| --- | --- |
| Ctrl+O | Abrir pasta |
| Ctrl+S | Salvar arquivo ativo |
| Ctrl+B | Mostrar/ocultar explorador |
| Ctrl+Shift+T | Novo terminal |
| Ctrl+Shift+W | Encerrar terminal ativo, com confirmação |
| Ctrl+Shift+G | Alternar grade/abas |
| Ctrl+Shift+←/→ | Reordenar terminal ativo |

## Organização e arquivos

As pastas abertas, a aba ativa, nomes, cores, shells, ordem dos terminais, mosaico e largura do explorador são salvos no perfil local do aplicativo (`%APPDATA%/mcode-space/workspace.json` em desenvolvimento). O formato anterior de uma única pasta é importado automaticamente. Na próxima abertura, novos processos são iniciados nas pastas iniciais salvas. Comandos, histórico visual e processos anteriores não são restaurados. Durante o uso, trocar abas preserva processos e rascunhos. Rascunhos não são persistidos ao encerrar o aplicativo; fechar uma aba de pasta ou o app pede confirmação quando há alterações ou processos.

O editor aceita arquivos UTF-8 de até 2 MB, preserva BOM e o padrão LF/CRLF e impede salvamento quando o conteúdo mudou no disco. Para resolver um conflito, feche a aba descartando a versão local e abra novamente o arquivo; copie primeiro qualquer trecho que queira manter. Arquivos binários e metadados internos `.git` não são editáveis. Links que saem da pasta aberta são recusados pelo explorador/editor.

Os shells têm as permissões do usuário e podem acessar o sistema e executar comandos normalmente. A pasta aberta limita o explorador/editor; ela não é uma sandbox para comandos. Arrastar entre pastas da lateral move o item no disco; arrastar ao editor ou aos terminais abre o item. Pastas em uso por processos podem ter a movimentação bloqueada pelo Windows. Fechar um terminal encerra seus processos. Fechar o app ou uma aba de pasta pede confirmação se há sessões abertas.

Uma pasta que esteja aberta em outra aba precisa ser fechada antes de ser movida. Cada operação de arquivo informa sua raiz autorizada, para que uma troca de aba não redirecione salvamentos ou terminais a outro projeto.

## Desenvolvimento

- `electron/`: processo principal, acesso a arquivos, PTY e ponte IPC isolada.
- `src/`: interface sem framework, xterm.js e editor de texto com abas e numeração de linhas.
- `src/icons.js`: seleção de ícones do [Lucide](https://lucide.dev), sem SVGs funcionais desenhados manualmente.
- `src/layouts.mjs`: sete organizações do mosaico.
- `src/markdown.js`: renderização com Marked e sanitização DOMPurify.
- `assets/`: cópias dos logos oficiais e fontes locais com licenças OFL.
- `scripts/build.mjs`: bundle com esbuild.
- `tests/`: testes de arquivos e limites de acesso.
- `electron/smoke.cjs`: teste integrado com Electron, shell, editor e capturas.

```powershell
npm test
npm run test:smoke
```

O smoke usa uma pasta temporária e um perfil separado em `test-results/`, sem alterar a pasta de trabalho do usuário. Gera `desktop.png` e `compact.png`. Os binários N-API Windows de node-pty são usados diretamente; o empacotador não recompila a dependência. Plataformas sem binários compatíveis podem exigir ferramentas nativas. Windows é a plataforma validada desta versão.

O build limpa somente `dist/`, minifica a interface e incorpora suas bibliotecas. Fontes são emitidas uma única vez, licenças são preservadas e o portátil exclui source maps, símbolos de depuração e binários de outras plataformas. `node_modules/` fica local para desenvolvimento e não entra no Git.

A sincronização com o Supabase atende às contas, perfis e financeiro. Não há sincronização de arquivos, gerenciamento de extensões, análise de linguagem, autocomplete ou depurador nesta versão. O editor é de texto simples com prévia Markdown.

## Repositório

Este projeto mantém seu próprio Git. Não modificar, mover ou inicializar repositórios nas pastas pai ou nos outros projetos da MCode. Veja `AGENTS.md`, `PRODUCT.md` e `DESIGN.md` antes de alterar a implementação.

## Editor expandido e financeiro

Ao recolher o explorador, o botão inverso permanece na faixa esquerda para reabri-lo. **Expandir editor** ocupa toda a altura do espaço de trabalho, tanto na edição quanto na prévia Markdown. **Voltar aos terminais** restaura a divisão e mantém os shells em execução.

O botão **Financeiro** alterna a lateral esquerda entre arquivos e um menu próprio MCode. Resumo mensal, movimentos, gastos fixos e clientes usam formulários nativos e dados compartilhados entre todas as contas autenticadas no Supabase. O mês selecionado filtra os movimentos. O painel consulta os dados a cada 5 segundos enquanto visível e permite atualização manual. Trocar de conta limpa os dados e rascunhos financeiros em memória; respostas antigas são descartadas. Pagamentos usam ID estável e versão para evitar sobrescrever alterações simultâneas.

## Conta e perfil

**Minha conta** oferece criação e login por email/senha, Google e GitHub. Os logins sociais abrem no navegador do sistema com PKCE e retornam por `http://127.0.0.1:47831/auth/callback/*`. Fechar a janela da conta cancela um login pendente. Email exige confirmação; o app aceita o código do email quando o template contém `{{ .Token }}`. A conta pode editar nome, usuário único e stack (até 20 tecnologias), além de enviar uma foto PNG/JPG/WebP de até 8 MB, convertida para PNG e reduzida antes do envio.

A chave pública do projeto vem em `electron/supabase-config.json`; ela depende das políticas RLS e não é uma chave administrativa. Para usar o próprio backend, informe em **Conexão Supabase** a URL (Supabase Cloud, auto-hospedado em HTTPS ou `http://127.0.0.1:54321` local) e a chave publishable/anon. Tokens ficam criptografados no perfil do Windows e nunca são expostos ao renderer. As fotos ficam em um bucket privado, por pasta de usuário. Caixa, clientes, gastos fixos e tarefas pertencem a uma **equipe**. As migrações em `supabase/migrations` criam as tabelas e políticas.

Google e GitHub precisam estar habilitados no painel do Supabase com seus respectivos Client ID e Client Secret. Veja [Configuração do Supabase](docs/SUPABASE.md).

## Equipes (organizações)

Qualquer empresa ou time pode usar o Space. Em **Minha conta → Equipes**:

- **Criar equipe**: quem cria vira dono.
- **Convidar**: dono ou administrador gera um código de 32 caracteres com papel (membro ou administrador), validade (1 a 30 dias) e número de usos. O código aparece uma única vez; o banco guarda apenas o hash. Convites ativos podem ser revogados.
- **Entrar com convite**: cole o código recebido.
- **Equipe ativa**: o seletor define de qual equipe são o caixa e as tarefas exibidos. O nome aparece no botão da conta. Uma conta pode participar de várias equipes.
- **Papéis**: o dono altera papéis, renomeia, remove qualquer membro e exclui a equipe; o administrador renomeia, convida membros e remove membros comuns; o membro usa caixa e tarefas. Todos podem sair, menos o último dono.

O isolamento é feito por RLS no banco: quem não é membro não lê nem grava dados da equipe, mesmo usando a chave pública diretamente.

## Personalizar terminais

Em modo Abas, os controles ficam na aba. Em Colunas e Mosaico, ficam no cabeçalho de cada painel, sem a barra de abas. Clique no lápis para alterar nome, cor e ícone Lucide (terminal, código, Git, pasta, servidor, banco de dados ou projeto). A configuração é restaurada ao abrir o aplicativo. As setas do cabeçalho reordenam os painéis. O terminal selecionado tem contorno verde com pulso suave; o movimento é desativado quando o sistema prefere movimento reduzido. O nome fica no cabeçalho somente nos modos de painéis.

## Tarefas da equipe

**Tarefas** abre a mesma lateral usada pelo explorador e pelo financeiro. A lista pertence à equipe ativa. Crie tarefas com título, notas, prioridade e prazo, edite pelo lápis, marque como concluídas ou reabra pelo checkbox. Os filtros mostram pendentes, concluídas ou todas; prazos vencidos são destacados. Excluir pede confirmação e remove a tarefa para toda a equipe.

O painel ativo consulta o Supabase a cada cinco segundos e oferece sincronização manual. Não há gravação offline. Edições usam id e updated_at para impedir que uma conta sobrescreva silenciosamente a alteração feita por outra. As colunas de autor são registradas pelo usuário autenticado, mas não limitam a visibilidade. Registros compartilhados sobrevivem à remoção do autor. Contas novas acessam caixa e tarefas ao criar uma equipe ou entrar por convite.

## Agentes e monitor de uso (0.7)

No seletor de novo terminal, escolha **Codex**, **Hermes Agent**, **OpenCode** ou **Claude**. O aplicativo detecta CLIs instalados no PATH e nos diretórios usuais do Windows; opções ausentes ficam identificadas e desabilitadas. Instale e autentique o CLI separadamente e reinicie o Space após instalar. Cada agente abre diretamente na pasta ativa, com suas permissões e confirmações normais. Nenhum prompt é enviado automaticamente.

Ao iniciar um agente, surge **Monitor de uso** ao lado de Explorador, Financeiro e Tarefas. O painel usa o mesmo visual MCode e mostra entrada, saída, cache, sessões abertas e encerradas e atalho para voltar ao terminal. Atualiza a cada 3 segundos quando visível. Os números são agrupados por agente e pasta, considerando sessões locais novas desde a primeira abertura desse agente no Space; sessões externas nessa mesma pasta também entram na contagem. O cache pode estar incluído nos tokens de entrada e não é somado a um total artificial.

- **Codex:** contadores cumulativos e limites registrados nos eventos `token_count` do histórico JSONL; barras mostram percentuais e renovação de cada janela. Os limites são o último registro do CLI, não uma consulta em tempo real ao faturamento.
- **Hermes:** contadores de sessões CLI em `state.db`, somente leitura.
- **OpenCode:** contadores por sessão em `opencode.db`, somente leitura.
- **Claude:** uso das mensagens do histórico JSONL, deduplicado por ID. O CLI não está instalado nesta máquina, portanto a abertura real não foi validada aqui.

Hermes, OpenCode e Claude não fornecem limites de assinatura nesses históricos: o painel informa a indisponibilidade, sem inferir cotas a partir de tokens. Formatos de versões incompatíveis e históricos ausentes mostram um aviso. A leitura de logs é limitada para evitar travar a interface; quando o limite é excedido, a contagem aparece como parcial. Nenhuma credencial ou conversa é enviada à nuvem ou ao renderer; somente metadados locais de sessão e métricas numéricas são retornados. Não é necessário entrar na conta Supabase para usar agentes ou monitor.

A organização salva restaura agentes como shells comuns, sem repetir comandos nem reiniciar agentes automaticamente.

## Contratos (0.8)

Abra **Contratos**, preencha os dados das partes, escopo, valores e prazos, confira a prévia e salve o PDF pelo diálogo nativo. O modelo traz três meses de assistência gratuita após entrega e aceite; prestador, marca (opcional), preço do site e mensalidade do domínio são preenchidos por quem usa. Há espaços de assinatura para as partes e duas testemunhas. A assinatura será feita em plataforma externa; o aplicativo gera o PDF sem assinar ou enviar dados. O formulário permanece somente na memória durante esta abertura do Space.

O monitor foi simplificado para barras percentuais das duas janelas disponíveis. Codex informa 5 horas e semana; o aplicativo usa os períodos reais em vez de chamar a janela de 5h de diária.

## Auto-work com Telegram

A lateral **Auto-work** mantém agentes trabalhando no projeto até você mandar parar. Cada ciclo:

1. O orquestrador analisa o projeto e propõe **5 próximas tarefas**.
2. **Modo "Eu escolho"**: as opções chegam no Telegram (e no painel) com botões 1–5, "Decida você" e "Parar". **Modo "Decide sozinho"**: o orquestrador escolhe a recomendada.
3. Um agente mais barato implementa num **worktree isolado da branch `autowork`** (em `%APPDATA%/mcode-space/autowork/worktrees`). A pasta aberta e a `main` não são tocadas.
4. `npm test` roda no worktree; o orquestrador revisa o diff. Aprovado e com testes passando, vira **commit na branch `autowork`**. Reprovado, há uma segunda tentativa com o feedback (com o próximo executor) e depois o ciclo é descartado.
5. O Telegram recebe um resumo curto (`✅ #3 a1b2c3d · título · +84 −12 · testes ok`). Ao parar, chega o resumo final com todos os commits e tokens por provedor.

Para economizar o plano do Claude:

| Papel | Ordem dos provedores |
| --- | --- |
| Orquestrar (planejar, detalhar, revisar) | Claude CLI pelo seu plano → API NVIDIA → OpenCode grátis (agente `plan`, só leitura) |
| Implementar | OpenCode com modelo NVIDIA → OpenCode com modelo grátis → Claude |

O Claude usa só leitura para planejar e revisar. Se atingir o limite do plano, é pausado por 30 minutos e a NVIDIA assume. O modelo NVIDIA é escolhido automaticamente entre os de código disponíveis na sua chave (MiniMax M3, Qwen3 Coder, Nemotron 3 Ultra, Kimi…), ou pode ser fixado na configuração. O modelo grátis do OpenCode vem de `opencode models opencode`.

**Configurar:** crie um bot no @BotFather, cole o token em Auto-work → Configuração, clique em **Gerar código de pareamento** e envie `/parear 123456` ao bot em conversa privada. Opcional: chave da NVIDIA (build.nvidia.com, começa com `nvapi-`) e instalação do OpenCode (`npm i -g opencode-ai`). Defina limites de ciclos e horas por sessão.

**Comandos:** `/iniciar` (você escolhe), `/iniciar sozinho`, `/sozinho`, `/manual`, `/ideia texto`, `/status`, `/pular`, `/parar` (termina a etapa atual), `/abortar` (encerra já e descarta o que não foi commitado), `/ajuda`. A primeira sessão é iniciada pelo app (define a pasta); depois `/iniciar` usa a mesma pasta, se ela estiver aberta numa aba.

**Segurança:** só o chat pareado controla o bot e não há comando de shell arbitrário. Token e chave ficam criptografados no Windows. O Claude roda com `dontAsk` e lista fixa de ferramentas; o OpenCode, com bash negado exceto testes e git de leitura. Mudanças em `.git`, `.env` ou chaves descartam o ciclo. Commit feito pelo próprio agente volta para revisão. Não há push automático. O app impede a suspensão do Windows enquanto trabalha. Fechar o app aborta o auto-work. O código do projeto é enviado aos provedores escolhidos (Anthropic, NVIDIA, OpenCode); o Telegram recebe apenas resumos.

Revise a branch `autowork` e faça o merge quando quiser (`git log main..autowork`).

## Instalação e atualizações (0.9)

Baixe `MCode-Space-Setup-<versão>.exe` na [release mais recente](https://github.com/caioribi7/mcode-space/releases/latest). O instalador permite escolher o diretório e preserva os dados do aplicativo. O portátil continua disponível, mas exige instalação manual para migrar ao canal de atualização.

Versões instaladas verificam releases estáveis do GitHub ao iniciar e a cada seis horas. **Atualizações** na barra inferior permite verificar manualmente, baixar com progresso e instalar/reiniciar após confirmação. O download não começa automaticamente; encerrar o app não instala uma atualização pendente. Salve seus arquivos antes de confirmar: os terminais serão encerrados.

Versões anteriores à 0.9 não possuem esta função e precisam da instalação inicial manual. O repositório de distribuição é público; nenhum token GitHub é incluído no aplicativo. Electron Updater verifica o SHA-512 dos arquivos conforme `latest.yml`. Os instaladores ainda não têm assinatura digital de editor.

Para publicar outra versão: aumente a versão em package.json e package-lock.json, execute os testes e `npm run dist`, faça commit/push e publique uma release estável no GitHub anexando `MCode-Space-Setup-VERSAO.exe`, seu `.blockmap`, `latest.yml` e o portátil opcional. Preserve os nomes gerados e publique todos os assets antes de tornar a release pública.

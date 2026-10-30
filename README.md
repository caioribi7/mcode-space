# MCode Space

Aplicativo desktop para organizar terminais e editar arquivos, com a identidade visual MCode.

## Executar

No Windows 10/11, com Node.js 22 ou superior:

```powershell
npm ci
npm start
```

Para distribuir uma versão portátil:

```powershell
npm run dist
```

O executável fica em `release/MCode-Space-0.1.0.exe`. O pacote não tem assinatura digital.

## Trabalhar

- Abra uma pasta com `Ctrl+O`.
- Crie até 12 terminais PowerShell, PowerShell 7 (quando instalado) ou Prompt de Comando. Cada terminal é um processo real, com entrada, saída, cores e redimensionamento.
- Organize em abas, lado a lado ou grade. Arraste as abas para reordenar, use as setas de cada aba ou `Ctrl+Shift+←/→`.
- Clique duas vezes na aba ou no lápis do painel para renomear e escolher uma cor.
- Clique em arquivos para editar; `Ctrl+S` salva. Vários arquivos podem ficar abertos em abas.
- Arraste arquivos do explorador para o editor ou um painel para abri-los. Arraste pastas para um painel para criar um terminal nessa pasta. O botão direito numa pasta também inicia um terminal nela.
- Arraste os divisores para ajustar a largura do explorador e a altura do editor. As setas do teclado também funcionam quando o divisor está em foco.
- Atualize o explorador pelo botão de recarregar depois de criar ou remover arquivos nos shells. O filtro atua nos arquivos já visíveis; expanda as pastas para incluir seus arquivos.
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

A pasta aberta, os nomes, cores, shells, ordem dos terminais, layout e largura do explorador são salvos no perfil local do aplicativo (`%APPDATA%/mcode-space/workspace.json` em desenvolvimento). Na próxima abertura, novos processos são iniciados nas pastas iniciais salvas. Comandos, histórico visual e processos anteriores não são restaurados. O conteúdo não salvo do editor não é persistido; o aplicativo pede confirmação antes de sair com alterações.

O editor aceita arquivos UTF-8 de até 2 MB, preserva BOM e o padrão LF/CRLF e impede salvamento quando o conteúdo mudou no disco. Para resolver um conflito, feche a aba descartando a versão local e abra novamente o arquivo; copie primeiro qualquer trecho que queira manter. Arquivos binários e metadados internos `.git` não são editáveis. Links que saem da pasta aberta são recusados pelo explorador/editor.

Os shells têm as permissões do usuário e podem acessar o sistema e executar comandos normalmente. A pasta aberta limita o explorador/editor; ela não é uma sandbox para comandos. Arrastar itens não move nem apaga arquivos no disco. Fechar um terminal encerra seus processos. Fechar o app ou trocar de pasta pede confirmação se há sessões abertas.

## Desenvolvimento

- `electron/`: processo principal, acesso a arquivos, PTY e ponte IPC isolada.
- `src/`: interface sem framework, xterm.js e editor de texto com abas e numeração de linhas.
- `assets/`: cópias dos logos oficiais e fontes locais com licenças OFL.
- `scripts/build.mjs`: bundle com esbuild.
- `tests/`: testes de arquivos e limites de acesso.
- `electron/smoke.cjs`: teste integrado com Electron, shell, editor e capturas.

```powershell
npm test
npm run test:smoke
```

O smoke usa uma pasta temporária e um perfil separado em `test-results/`, sem alterar a pasta de trabalho do usuário. Gera `desktop.png` e `compact.png`. Os binários N-API Windows de node-pty são usados diretamente; o empacotador não recompila a dependência. Plataformas sem binários compatíveis podem exigir ferramentas nativas. Windows é a plataforma validada desta versão.

Não há sincronização em nuvem, gerenciamento de extensões, análise de linguagem, autocomplete ou depurador nesta versão. O editor é de texto simples.

## Repositório

Este projeto mantém seu próprio Git. Não modificar, mover ou inicializar repositórios nas pastas pai ou nos outros projetos da MCode. Veja `AGENTS.md`, `PRODUCT.md` e `DESIGN.md` antes de alterar a implementação.

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

O executável fica em `release/MCode-Space-0.3.0.exe`. O pacote não tem assinatura digital.

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

Não há sincronização em nuvem, gerenciamento de extensões, análise de linguagem, autocomplete ou depurador nesta versão. O editor é de texto simples com prévia Markdown.

## Repositório

Este projeto mantém seu próprio Git. Não modificar, mover ou inicializar repositórios nas pastas pai ou nos outros projetos da MCode. Veja `AGENTS.md`, `PRODUCT.md` e `DESIGN.md` antes de alterar a implementação.

# MCode Space

## Platform

Desktop Windows, implementado em Electron. A interface usa a mesma linguagem visual em toda a janela.

## Stack

Electron, JavaScript nativo, esbuild, xterm.js e node-pty. Escolha de implementação para disponibilizar shells reais no Windows sem exigir um backend remoto.

Lucide fornece todos os ícones funcionais. Marked e DOMPurify compõem a prévia de Markdown, com imagens raster locais carregadas pela API de arquivos validada.

## Users

Quem desenvolve projetos locais e quer organizar vários shells junto da estrutura de arquivos.

## Product Purpose

Abrir uma pasta, executar múltiplos shells, organizá-los e editar arquivos no mesmo espaço.

## Capabilities and Constraints

O usuário solicitou explorador semelhante ao VS Code, múltiplos shells organizáveis, edição de arquivos, arrastar elementos e um repositório próprio. A versão inicial oferece abas/grade/colunas, renomeação, cores, reordenação, editor de texto com abas, divisores ajustáveis e salvamento da organização.

Até 12 terminais. O editor trabalha com UTF-8 até 2 MB. Não pretende reproduzir todos os recursos de uma IDE. Comandos são executados com as permissões do usuário. A restauração recria sessões, sem repetir comandos anteriores.

O explorador permite mover arquivos e pastas por arraste para diretórios ou para a raiz aberta, identificando o destino e recusando colisões, links e pastas com repositórios Git. Arquivos abertos acompanham o novo caminho e preservam rascunhos. O nome do terminal aparece apenas na aba; o painel mostra a pasta inicial. Renomeação aceita clique duplo, lápis, F2 e confirmação por Enter.

Até oito abas de pastas preservam seus arquivos, rascunhos e shells ao alternar projetos; o limite de 12 terminais é global. Abrir pasta adiciona uma aba; o menu de contexto de uma subpasta também oferece abrir em nova aba. Fechar uma aba pede confirmação se há processos ou alterações não salvas. Pastas abertas em outras abas não podem ser movidas até serem fechadas.

O explorador atualiza a estrutura a cada 750ms quando a janela está visível, verificando somente a raiz e as pastas expandidas e preservando o DOM quando não há mudança. Há botões para recolher/mostrar o explorador e recolher os diretórios.

Mosaicos oferecem sete modelos: equilibrado, duas ou três colunas, empilhados, linha única, destaque à esquerda e destaque no topo. O modelo escolhido é salvo por aba de pasta.

Arquivos .md e .markdown alternam entre edição e prévia pelos ícones de código e olho. A prévia usa o rascunho atual, renderiza títulos/listas/tabelas/código/links e imagens raster locais de até 8MB; não executa scripts ou carrega imagens externas. SVG embutido e HTML ativo são bloqueados.

## Brand Commitments

Usar os logos oficiais da MCode sem deformação e a paleta escura com verde neon. Português na interface. Os outros repositórios da MCode devem permanecer intactos.

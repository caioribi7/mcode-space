# MCode Space

## Platform

Desktop Windows, implementado em Electron. A interface usa a mesma linguagem visual em toda a janela.

## Stack

Electron, JavaScript nativo, esbuild, xterm.js e node-pty. Escolha de implementação para disponibilizar shells reais no Windows sem exigir um backend remoto.

## Users

Quem desenvolve projetos locais e quer organizar vários shells junto da estrutura de arquivos.

## Product Purpose

Abrir uma pasta, executar múltiplos shells, organizá-los e editar arquivos no mesmo espaço.

## Capabilities and Constraints

O usuário solicitou explorador semelhante ao VS Code, múltiplos shells organizáveis, edição de arquivos, arrastar elementos e um repositório próprio. A versão inicial oferece abas/grade/colunas, renomeação, cores, reordenação, editor de texto com abas, divisores ajustáveis e salvamento da organização.

Até 12 terminais. O editor trabalha com UTF-8 até 2 MB. Não pretende reproduzir todos os recursos de uma IDE. Comandos são executados com as permissões do usuário. A restauração recria sessões, sem repetir comandos anteriores.

## Brand Commitments

Usar os logos oficiais da MCode sem deformação e a paleta escura com verde neon. Português na interface. Os outros repositórios da MCode devem permanecer intactos.

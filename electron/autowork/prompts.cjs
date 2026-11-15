'use strict';
// Divisão de custo: modelos baratos exploram o repositório e organizam o contexto (mapa e especificação);
// o Claude recebe só texto compacto, sem ferramentas, para planejar e revisar.
const { TASK_FILE } = require('./sandbox.cjs');

const list = items => items.length ? items.map(i => '- ' + i).join('\n') : '- (nenhum)';

// Executado por OpenCode/NVIDIA (com ferramentas de leitura). Resultado reaproveitado por vários ciclos.
function digest(ctx) {
  return `Explore este repositório com as ferramentas de leitura (sem alterar nada) e escreva um MAPA DO PROJETO compacto, em português, com no máximo 450 palavras:
1. Propósito e stack.
2. Como rodar e testar (comandos reais).
3. Estrutura: arquivos/pastas principais, uma linha cada.
4. Convenções e regras importantes (de AGENTS.md/CLAUDE.md/README).
5. Pontos frágeis, TODOs, lacunas de teste ou bugs prováveis que você notar.
Texto puro, sem introdução.

Commits recentes:
${ctx.log || '(nenhum)'}

Arquivos (parcial):
${ctx.files.split('\n').slice(0, 200).join('\n')}`;
}

function plan(ctx, state) {
  return `Você é o orquestrador do modo auto-work. Não tem ferramentas: decida apenas pelo contexto abaixo, preparado por outros agentes.

## Mapa do projeto
${state.digest || ctx.product || '(indisponível)'}

## Regras do projeto (trecho)
${(ctx.agents || '(sem AGENTS.md)').slice(0, 2500)}

## Commits recentes
${ctx.log || '(nenhum)'}

## Já feito nesta sessão
${list(state.commits.map(c => c.title))}

## Falhou nesta sessão (não repetir igual)
${list(state.failures.map(f => `${f.title} — ${f.reason}`))}

## Ideias enviadas pelo usuário (priorize)
${list(state.ideas)}

Proponha as 5 próximas tarefas mais valiosas. Cada uma deve caber num commit revisável (< 300 linhas), ser verificável por testes e respeitar as regras. Prefira correções, robustez, testes e pedidos do usuário antes de grandes features. Indique arquivos prováveis.
Responda SOMENTE com JSON:
{"options":[{"title":"até 70 caracteres","why":"até 140 caracteres","files":["caminho"],"size":"P|M|G"}],"recommended":0}`;
}

// Executado por OpenCode/NVIDIA: lê o código e entrega ao implementador um pacote de contexto pronto.
function spec(task, ctx, state) {
  return `Prepare o pacote de trabalho para um agente de código implementar a tarefa abaixo. Use as ferramentas de leitura para abrir SOMENTE os arquivos relevantes (não altere nada).
Tarefa: ${task.title}
Motivo: ${task.why || '-'}
Arquivos prováveis: ${(task.files || []).join(', ') || '(descubra)'}

Mapa do projeto:
${(state.digest || '').slice(0, 3000)}

Entregue em português, texto puro, até 450 palavras:
- Arquivos a alterar e por quê.
- Trechos atuais relevantes (curtos, com o caminho).
- Passos concretos.
- Testes a criar/ajustar e critérios de aceite.
- Regras do projeto que se aplicam.`;
}

function taskFile(task, specText, feedback) {
  return `# Tarefa auto-work
${task.title}

${specText}
${feedback ? `\n## Correções pedidas na tentativa anterior\n${feedback}\n` : ''}
## Regras obrigatórias
- Trabalhe somente nesta pasta. Não faça commit, push, rebase nem troque de branch.
- Não leia nem edite .git, .env, chaves ou credenciais. Não instale dependências novas.
- Siga AGENTS.md / CLAUDE.md quando existirem.
- Se existir script de teste, rode \`npm test\` e corrija falhas causadas pela sua mudança.
- Não edite nem apague este arquivo (${TASK_FILE}).
- Ao terminar, responda com um resumo de uma linha.`;
}

function review(task, diff, tests, specText) {
  return `Revise a implementação abaixo, feita por outro agente. Você não tem ferramentas: avalie pelo diff.
Tarefa: ${task.title}
Plano entregue ao implementador (resumo):
${String(specText || '').slice(0, 1500)}

Testes: ${tests.ran ? 'passaram' : 'sem script de teste'}
Resumo: ${diff.stat}

Diff:
${diff.text}

Aprove somente se a tarefa foi cumprida, sem regressão, problema de segurança ou violação das regras.
Responda SOMENTE com JSON:
{"approve":true|false,"feedback":"o que corrigir, até 400 caracteres","commit":"mensagem de commit convencional em pt-BR, até 72 caracteres"}`;
}

module.exports = { digest, plan, spec, taskFile, review };

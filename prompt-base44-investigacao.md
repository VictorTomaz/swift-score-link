Preciso de ajuda para investigar um comportamento na infraestrutura de deploy de functions do meu app (app_id: 69bb019558d96a11fbfbddce, domínio: swift-score-link.base44.app). Por favor, apenas investiguem e expliquem — não façam nenhuma alteração no app.

## O problema

O endpoint `POST https://swift-score-link.base44.app/api/functions/validateAppleReceipt` está retornando, de forma intermitente, uma resposta que corresponde a uma versão MUITO ANTIGA do código dessa function — uma versão que já não existe mais no meu repositório há vários deploys.

Erro retornado (HTTP 400):
```json
{"error":"receiptData and productId required"}
```

Confirmei via `git log -S` que essa string exata só existe no meu commit inicial do projeto (a implementação original, pré-StoreKit-2, que nunca fez log de erros). O código atualmente deployado (confirmado via `base44 functions pull` e via chamada autenticada direta) usa mensagens diferentes: `"productId is required"` e `"receiptData or jwsTransaction is required"`.

## O que já testei e descartei do meu lado

1. **Não é cache do cliente**: uso `cache: 'no-store'`, headers anti-cache, e um nonce único (`?_cb=`) em cada chamada. Também limpo `URLCache` e `WKWebsiteDataStore` (disk/memory/fetch cache) a cada launch do app nativo iOS. Nada disso mudou o comportamento — o bug já existe há vários dias e builds mesmo com essa limpeza.

2. **Não é o usuário autenticado**: testei com 3 contas de usuário completamente diferentes (uma delas nunca usada antes) — todas reproduziram o erro antigo de forma 100% determinística a partir do mesmo dispositivo/rede.

3. **Não é a rede local**: confirmei que o dispositivo de teste está sempre na mesma rede Wi-Fi, inclusive num teste anterior (ontem à noite) que funcionou perfeitamente com o código atual.

4. **Não é um "functions_version" pinado no cliente**: meu app não envia o header `Base44-Functions-Version` (removi isso do client), e confirmei via log que `localStorage` não tinha nenhum valor de versão fixado.

5. **O código atual está acessível**: fazendo uma chamada autenticada como outro usuário (via `base44 exec`, a partir de uma rede diferente — meu computador, não o dispositivo de teste), para o mesmo endpoint, no mesmo minuto, recebo a resposta correta do código atual (`"Failed to process JWS: Invalid JWS token structure"`, consistente com a implementação viva).

## O padrão observado

- Mesmo dispositivo físico (iPhone via TestFlight), mesma rede Wi-Fi: SEMPRE recebe o código antigo nesse endpoint, em builds diferentes (testei 3 builds distintos ao longo de vários dias).
- Chamada externa (meu Mac, rede diferente, mesmo endpoint, mesmo app_id, no mesmo horário): SEMPRE recebe o código atual.
- Esse mesmo padrão já foi observado há alguns dias também via Sauce Labs (outro dispositivo/rede), sugerindo que não é exclusivo desse aparelho específico.

## Dado concreto: mesmo dispositivo/rede, funcionou ontem à noite

No dia 2026-09-12, por volta de 23:44 UTC (20:44 no horário de Brasília), o mesmo dispositivo físico, na mesma rede Wi-Fi, rodando a mesma versão do app (build 13), fez uma chamada bem-sucedida para esse mesmo endpoint:

```
Subscription criada com sucesso:
  created_date: 2026-09-12T23:43:56
  apple_transaction_id: 2000001235200466
  status: trialing
  IapErrorLog: zero entradas de erro (chamada processada normalmente pelo código atual)
```

A partir de 2026-09-13 por volta de 15:40 UTC (poucas horas depois), o MESMO dispositivo, MESMA rede, passou a receber consistentemente o erro antigo (`"receiptData and productId required"`) em toda tentativa, e continua reproduzindo até agora, em builds mais recentes (14 e 15) também.

Ou seja: entre 2026-09-12T23:44Z e 2026-09-13T15:40Z (aproximadamente), algo mudou do lado da infraestrutura que fez esse dispositivo/rede específico passar a bater numa versão antiga da function, sem nenhuma mudança de rede ou dispositivo do meu lado nesse intervalo. Vocês conseguem verificar nos logs de deploy/infraestrutura de vocês se algo aconteceu nesse app (app_id: 69bb019558d96a11fbfbddce) nesse intervalo de tempo — um deploy, rollback, ou qualquer evento de rotação/cache de instância?

## O que gostaria de entender

- Existe algum mecanismo de deploy de functions (canary, rollout gradual, cache de edge/CDN, múltiplas instâncias/regiões) que poderia fazer com que requisições de uma origem específica (IP, rede, ou alguma outra chave de roteamento) continuem batendo em uma versão obsoleta de uma function, por dias, mesmo após múltiplos deploys?
- Se sim, como faço para forçar a invalidação completa/propagação total de um deploy de function para todas as instâncias/edges?
- Vocês conseguem, do lado de vocês, confirmar se há alguma instância "presa" numa versão antiga desse app específico?

## Sobre o "workspace" divergente (achado da consulta anterior)

Numa consulta anterior, apontaram que o "workspace" interno de vocês (o que a IA builder de vocês edita) para este app ainda tem a versão legada de `validateAppleReceipt`, enquanto meu repositório local (o que eu deployo via `base44 functions deploy` pela CLI) está na versão atual — e confirmaram que o deploy ao vivo reflete a versão atual, não a do workspace.

Isso levanta uma dúvida específica: **qual é a relação entre esse "workspace" e o que a CLI publica?** Minha suspeita é que sejam dois armazenamentos distintos (o workspace ligado ao editor/builder web de vocês, e o deploy via CLI publicando direto pra produção sem passar por ali) — mas preciso confirmar, porque se em algum momento alguém abrir esse app no editor web de vocês e salvar/publicar por lá, isso poderia sobrescrever a versão atual com a legada do workspace, regredindo o app pra todo mundo.

Tenho outro app na mesma conta (Water Rest) que usa esse mesmo fluxo (CLI + repositório local, sem editor web). Vocês conseguem confirmar se ele tem a mesma divergência entre workspace e deploy? E, de forma geral, qual é a maneira correta de manter as duas coisas sincronizadas quando o fluxo de trabalho é 100% via CLI/repositório git, nunca pelo editor web de vocês?

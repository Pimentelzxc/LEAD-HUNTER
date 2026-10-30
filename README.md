# VORKA Lead Hunter

Ferramenta interna da VORKA Brasil para encontrar empresas e acompanhar oportunidades. React/Vite no `frontend/`, API Node.js no `backend/`, regras comuns em `shared/`, autenticação e PostgreSQL no Supabase.

A busca usa dados OpenStreetMap via **Geoapify Free** quando a chave está configurada. Sem chave, o modo `auto` usa o Overpass público. Não há chamadas Google ou contratação automática de plano pago.

## Resolver os timeouts do Overpass com Geoapify Free

1. Crie uma conta **Free**, sem cartão, em [Geoapify](https://myprojects.geoapify.com/) e gere uma chave de projeto.
2. Adicione a chave em `backend/.env.local` como `GEOAPIFY_API_KEY=sua-chave`. Não use prefixo `VITE_` e não envie a chave pelo chat.
3. Aplique `backend/supabase/migrations/202610300001_geoapify.sql` no SQL Editor do Supabase, depois das duas migrações anteriores. Não reaplique SQL já executado.
4. Reinicie `npm run dev`. O modo `auto` escolhe Geoapify quando a chave existe. Para exigir essa fonte, use `MAPS_PROVIDER=geoapify`.
5. Execute `npm run diagnose:maps`. Com Geoapify selecionada, o comando valida a chave com uma consulta de município, consumindo até um crédito.

O plano Free oferece **3.000 créditos por dia**, sem cartão, e permite uso comercial dentro dos limites e com atribuição. Uma busca pode usar mais de um crédito. Mantenha a conta no Free e monitore o uso total dos seus projetos. [Plano oficial](https://www.geoapify.com/pricing/), [consumo por API](https://www.geoapify.com/pricing-details/).

## Executar localmente

Requisitos: Node.js 22.12+ e npm (validado com Node 24). Na raiz:

```powershell
npm ci
# Execute as cópias apenas se os arquivos locais ainda não existirem:
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env.local
```

Preencha os ambientes e execute:

```powershell
npm run dev
```

Front: `http://127.0.0.1:5173`. Back: `http://127.0.0.1:3001/api/health`. O Vite encaminha `/api` ao back local. Para executar separadamente, use `npm run dev:front` e `npm run dev:back` em dois terminais.

Encerre servidores da versão anterior se as portas estiverem ocupadas. O projeto não mata processos externos. Após alterar variáveis de ambiente, reinicie o servidor.

## Ambientes

### `frontend/.env.local` — valores públicos

```dotenv
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
VITE_API_URL=
```

Localmente, deixe `VITE_API_URL` vazio. Na Vercel, use o domínio do back-end, sem `/api` no final. Variáveis VITE são incorporadas no build; recompile/republique após alterá-las.

### `backend/.env.local` — servidor

```dotenv
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
MAPS_PROVIDER=auto
GEOAPIFY_API_KEY=
OVERPASS_API_URL=https://overpass.private.coffee/api/interpreter
APP_URL=
PORT=3001
```

- `MAPS_PROVIDER`: `auto`, `geoapify` ou `overpass`. `auto` escolhe pela presença da chave ao iniciar; não alterna após erro ou limite.
- `GEOAPIFY_API_KEY`: chave privada do projeto Geoapify, exclusiva do servidor. Não aparece no navegador, snapshots ou CSV.
- `APP_URL`: identificação pública completa do projeto, usada no User-Agent Overpass. Sem ela, o código identifica o repositório público configurado do projeto. Parâmetros e fragmentos são removidos.
- `OVERPASS_API_URL`: alternativa configurada pelo administrador, obrigatoriamente HTTPS. O usuário não fornece URLs arbitrárias; os endpoints Geoapify são fixos no servidor.

A chave publicável/`anon` do Supabase é apropriada para o cliente. Nunca use `service_role` ou `sb_secret_*` no front. O back também usa a chave pública junto ao JWT do usuário, com RLS. Os arquivos `.env.local` são ignorados pelo Git em todas as pastas.

Se havia `.env.local` na raiz antes da separação, seus valores foram preservados em `frontend/.env.local` e os valores públicos do Supabase foram reaproveitados no ambiente do back.

## Supabase e migrações

No SQL Editor, aplique apenas as migrações ainda não executadas, nesta ordem:

1. `backend/supabase/migrations/202610290001_initial.sql` — perfis, carteira, notas, RLS e privilégios.
2. `backend/supabase/migrations/202610290002_openstreetmap.sql` — fonte OSM, pontuação e quotas globais/individuais.
3. `backend/supabase/migrations/202610300001_geoapify.sql` — registros Geoapify e atualização explícita dos dados da fonte.

A terceira migração preserva dados e políticas existentes. A segunda impede o RPC necessário ao endpoint Google antigo antes da chamada paga. A Edge Function antiga não é usada pelo front atual.

Desative cadastro público e acesso anônimo no Supabase Auth. Crie/confirme os usuários em **Authentication → Users** e configure a Site URL/redirecionamentos do front. Não existe login padrão; um trigger cria o perfil.

Com CLI já vinculada, é possível usar `npx supabase db push --workdir backend`. Se executou SQL manualmente, sincronize o histórico de migrações antes de utilizar esse comando; não execute a migração inicial novamente.

Cada vendedor acessa somente sua carteira, favoritos e notas. O usuário não pode alterar o próprio cargo ou o proprietário de um lead. Identificadores do mesmo provedor são únicos por vendedor; registros de provedores diferentes não são mesclados automaticamente.

## Publicar front e back na Vercel

Envie o repositório **inteiro**, sem ambientes locais, para o Git e importe duas vezes. São npm workspaces com lock único na raiz; mantenha `shared/` e habilite acesso a arquivos fora do Root Directory nos dois projetos.

| Configuração | Back-end | Front-end |
| --- | --- | --- |
| Root Directory | `backend` | `frontend` |
| Framework Preset | Other | Vite |
| Build Command | vazio, conforme vercel.json | `npm run build` |
| Output Directory | `public` | `dist` |
| Arquivos fora do Root Directory | habilitado | habilitado |

Deixe a instalação npm automática, usando o lock da raiz. Não crie locks separados nas subpastas.

1. Publique o back com as variáveis do servidor. Para Geoapify, configure `GEOAPIFY_API_KEY` e `MAPS_PROVIDER=geoapify`.
2. Verifique `/api/health`: informa o provedor selecionado e se a chave está presente; não comprova sua validade ou a disponibilidade do serviço.
3. Publique o front com as variáveis públicas e `VITE_API_URL=https://seu-backend.vercel.app`.
4. Configure o domínio exato do front em `ALLOWED_ORIGINS` no back, sem barra final. Outras origens podem ser separadas por vírgula; não use `*`. Republique após alterar variáveis.
5. Cadastre o domínio do front no Supabase Auth e teste login, busca, detalhes, salvamento, status, favoritos e CSV.

A CSP em `frontend/vercel.json` permite conexões a `*.supabase.co` e `*.vercel.app`. Atualize `connect-src` se usar domínios personalizados ou outra hospedagem.

O plano gratuito Hobby da Vercel é destinado a uso pessoal, não comercial; não se assume que cobre a operação da empresa. Nenhum plano pago foi contratado pelo código. É possível desenvolver e testar localmente sem contratar hospedagem. [Regra oficial](https://vercel.com/docs/plans/hobby).

## Busca, detalhes e orçamento

- Busca somente ao clicar em **Buscar leads**. Sem autocomplete remoto, pesquisas recorrentes, enriquecimento em massa ou consulta ao navegar.
- Com Geoapify, uma chamada Geocoding identifica o município por país, UF, nome e tipo. Places pesquisa dentro do limite retornado. Uma correspondência incompatível não é ampliada silenciosamente para outra cidade.
- Até 100 resultados por operação. “Mostrar mais 20” usa a lista já recebida, sem outra chamada ao provedor. Ao atingir o limite, refine segmento/bairro.
- A busca Geoapify não consulta detalhes de cada empresa. Abra o painel e clique em **Consultar contatos e canais** para pedir site/telefone, quando disponíveis. Antes disso, campos ausentes permanecem **Não verificado**, sem afirmar que não existem.
- Uma consulta posterior não altera automaticamente o banco. Para um lead já salvo, use **Salvar atualização da fonte**; os dados comerciais próprios ficam separados.
- O bairro é aplicado a tags de endereço no Overpass e aos campos de bairro dos até 100 resultados Geoapify. Cadastros incompletos podem ficar de fora.
- Segmentos sugeridos usam categorias/tagueamento. Geoapify agrupa barbearias e cabeleireiros; essa abrangência é informada na tela. Segmentos personalizados procuram o texto no nome da empresa.
- Geoapify Free requer atribuição; não há garantia contratual de disponibilidade no plano gratuito. [Termos](https://www.geoapify.com/terms-and-conditions/).
- Sem chave, Overpass usa [Private.coffee](https://overpass.private.coffee/), cuja instância pública pode não responder até a consultas mínimas. Não se promete cobertura completa ou busca por raio.
- Cache em memória por até 15 minutos; municípios Geoapify podem ser reutilizados por uma hora. Cada provedor mantém até 50 respostas por instância e compartilha chamadas simultâneas iguais. Em serverless, o cache é oportunístico.
- Quotas atômicas: **3 operações/minuto e 30/dia UTC por vendedor**, mais **6/minuto e 100/dia UTC no workspace**. Elas incluem busca e detalhes de ambos os provedores. Cache hits também contam como operações.
- Uma busca Geoapify usa até duas requisições, sem fanout de contatos. Com 100 resultados, estime conservadoramente até 7 créditos por busca, ou até 700 para 100 buscas do app. Monitore também o uso de outros projetos na mesma conta; o limite de operações não substitui o painel do provedor.
- Timeouts e limites geram erros explícitos. Não há fallback automático após quota nem contratação/upgrade de plano. Respeite `Retry-After`; não distribua consultas entre contas para contornar limites.

**Dados ausentes não são inventados.** Não há notas ou avaliações Google. Site não identificado não comprova inexistência. Perfil Instagram cadastrado não comprova titularidade oficial. Número informado como WhatsApp não libera contato direto até confirmação manual com fonte própria.

## Pontuação e CRM

| Critério | Peso padrão | Significado |
| --- | ---: | --- |
| Site cadastrado | 20 | Canal utilizável disponível; não é auditoria de qualidade |
| Instagram cadastrado | 20 | Perfil informado; titularidade depende de verificação |
| Telefone disponível | 20 | Número utilizável para contato; não implica WhatsApp |
| Oportunidade confirmada | 40 | Necessidade concreta com evidência registrada pelo vendedor |

Pesos inteiros somam 100 e são configuráveis por vendedor, também validados no banco. A prioridade mede condições para conversar; ausência de dados não adiciona pontos. Sem sinais, mostramos “Dados insuficientes”. Alta: 80–100, média: 50–79, baixa: 0–49. Nos pesos padrão, alta prioridade depende de confirmação comercial.

CRM simples: favorito, status, notas e dados próprios com fonte. Dashboard usa apenas os leads salvos e suas datas/status. Não persiste histórico completo de buscas para estatísticas.

## Dados e atribuição

- **© OpenStreetMap contributors, ODbL 1.0**. [Licença](https://www.openstreetmap.org/copyright).
- Quando a consulta usa Geoapify, a exibição e o CSV preservam também **Powered by Geoapify**, com link do provedor.
- Apenas o cadastro normalizado selecionado pelo usuário é salvo, sem resposta completa da API ou chave. Geoapify mantém seu identificador próprio, sem inventar um ID OSM.
- Campos próprios confirmados ficam separados do snapshot da fonte e requerem origem e permissão de armazenamento/exportação.
- CSV inclui dados abertos e próprios permitidos, atribuição em cada registro, UTF-8/BOM, separador `;` e proteção contra fórmulas em planilhas.
- Redistribuições de bases derivadas devem respeitar as obrigações da ODbL. A licença de dados não obriga por si só a publicar o código do aplicativo.
- Referências Google antigas são preservadas por Place ID; conteúdo Google não é atualizado via API ou exportado.
- Complete identificação, contato e retenção da organização em `/termos` e `/privacidade` antes da operação comercial.

## Segurança e testes

O back valida JWT com `auth.getUser()` e exige perfil. Consultas de carteira usam o JWT e RLS; nunca são retornadas notas de outro vendedor. CORS usa origens exatas. Detalhes públicos Geoapify podem ser consultados antes de salvar, mediante autenticação, ID validado e quota. Referências OSM da carteira exigem propriedade.

Os endpoints são definidos no servidor. Não há crawler de sites externos. A chave Geoapify é enviada somente entre o back-end e `api.geoapify.com`; erros do provedor não expõem a URL com chave ou o corpo original.

```powershell
npm test
npm run check:backend
npm run build
```

Os testes cobrem migrações, RLS, quotas, autenticação, identificação da cidade, normalização, ausência de dados, contatos explícitos, cache, erros, snapshots, pontuação e CSV. Fixtures existem apenas nos testes. Mocks não substituem uma busca real com suas credenciais.

## Diagnóstico

```powershell
npm run diagnose:maps
```

Overpass: uma consulta mínima, sem empresas. Geoapify: valida a chave com uma consulta de município, até um crédito. Não usa Supabase ou modifica o banco; não imprime credenciais ou URLs com chave. Se a consulta mínima falhar, não altere SQL ou a chave Supabase por causa desse resultado. Se receber 429, respeite a espera e verifique o consumo/identificação no provedor.

Ao trocar de ambiente, faça o teste também a partir do servidor de destino; uma conexão local não comprova a conectividade da hospedagem.

import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Crosshair, Globe2, ShieldCheck } from 'lucide-react';
import { Brand } from '../components/Layout.jsx';
import { ExternalLink, Notice, PageHeader } from '../components/ui.jsx';

export function HelpPage() {
  return <div className="page info-page"><PageHeader eyebrow="CENTRAL DE AJUDA" title={<>Uma prospecção mais <span>consciente.</span></>} description="Entenda a fonte gratuita, a pontuação e o caminho até o primeiro contato." />
    <div className="help-grid">
      <article className="panel"><Crosshair size={24} /><h2>1. Encontre oportunidades</h2><p>Escolha estado, cidade e uma categoria sugerida. A busca é feita no município cadastrado no OpenStreetMap, com até 100 resultados por consulta. Segmentos personalizados procuram o texto no nome dos estabelecimentos.</p></article>
      <article className="panel"><Globe2 size={24} /><h2>2. Investigue com contexto</h2><p>A base é colaborativa e a cobertura varia por região. Site não identificado não significa site inexistente. Perfis sociais informados na fonte não garantem titularidade ou atualização.</p></article>
      <article className="panel"><ShieldCheck size={24} /><h2>3. Construa sua carteira</h2><p>Salve um cadastro OSM com sua atribuição, registre informações confirmadas e acompanhe o status da conversa. WhatsApp só recebe um botão de contato após sua confirmação explícita.</p></article>
    </div>
    <section className="panel prose-panel"><h2>Como funciona a pontuação?</h2><p>São considerados site cadastrado, Instagram cadastrado, telefone disponível e uma necessidade comercial confirmada pelo vendedor. Os pesos padrão são 20, 20, 20 e 40 pontos. A pontuação indica prioridade para contato; não avalia a qualidade digital da empresa.</p><p>Informação ausente não adiciona pontos. Sem sinais utilizáveis, mostramos “Dados insuficientes”. A fonte não fornece notas ou avaliações Google, e esses critérios não são usados.</p>
      <h2>Como evitar consultas desnecessárias?</h2><p>A consulta só começa quando você clica em Buscar leads. Mostrar mais resultados usa os dados já recebidos. Na Geoapify, telefone e site podem exigir o botão Consultar contatos e canais no painel de detalhes. Para manter esses dados na carteira, use Salvar atualização da fonte.</p><p>O workspace permite 6 operações por minuto e 100 por dia UTC, com limite adicional de 3 por minuto e 30 por dia por vendedor. Uma operação pode usar mais de um crédito da Geoapify. Não há enriquecimento em massa ou mudança automática para um plano pago.</p>
      <h2>Quais são as limitações?</h2><p>Bairro filtra apenas cadastros com a informação de bairro preenchida. Não há busca por raio, cobertura completa, auditoria automática de sites ou garantia de disponibilidade do servidor público. Referências Google antigas continuam acessíveis por link, mas não são consultadas pela API.</p>
      <ExternalLink href="https://www.geoapify.com/pricing/">Conheça o plano gratuito Geoapify</ExternalLink><h2>Precisa preparar o deploy?</h2><p>Front-end e back-end ficam em pastas separadas. Os comandos, variáveis e configurações para dois projetos na Vercel estão no README do repositório.</p><Link className="text-btn" to="/configuracoes">Abrir configurações<ArrowRight size={15} /></Link>
    </section>
  </div>;
}

export function LegalPage({ kind }) {
  const terms = kind === 'terms';
  return <div className="legal-page"><div className="legal-top"><Brand /><Link className="text-btn" to="/buscar"><ArrowLeft size={15} />Voltar ao workspace</Link></div>
    <article className="panel prose-panel"><div className="eyebrow">VORKA BRASIL · USO INTERNO</div><h1>{terms ? 'Termos de uso' : 'Privacidade'}</h1>
      <Notice>Documento inicial. A organização deve completar sua identificação, contato e política de retenção antes de operar o serviço em produção.</Notice>
      {terms ? <>
        <h2>Uso do workspace</h2><p>O VORKA Lead Hunter é uma ferramenta interna para usuários autorizados. Cada vendedor deve registrar informações de origem permitida, conferir os canais de contato e respeitar as condições das fontes e os direitos das pessoas contatadas.</p>
        <h2>Dados abertos e licença</h2><p>As buscas usam dados abertos do OpenStreetMap via Geoapify ou Overpass/Private.coffee, conforme a configuração do administrador. © OpenStreetMap contributors. Os dados são disponibilizados sob a <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Open Database License (ODbL)</a>. As consultas Geoapify também estão sujeitas aos <a href="https://www.geoapify.com/terms-and-conditions/" target="_blank" rel="noopener noreferrer">termos Geoapify</a> e mantêm a atribuição Powered by Geoapify.</p>
        <p>A fonte é colaborativa. Os cadastros podem estar incompletos ou desatualizados. Ausência de site ou perfil não comprova inexistência. Instagram cadastrado não comprova perfil oficial; WhatsApp exige confirmação antes do contato direto.</p>
        <h2>Salvamento e exportação</h2><p>Um cadastro OSM é salvo somente após a seleção explícita do usuário e mantém sua origem e atribuição. Dados comerciais confirmados diretamente com a empresa ficam separados. A exportação preserva a atribuição e a licença OSM; redistribuições de bases devem respeitar as obrigações da ODbL.</p>
        <h2>Disponibilidade e custos</h2><p>A Geoapify oferece plano Free com chave e limites de créditos. O Overpass público dispensa chave, mas sua disponibilidade varia. Hospedagem e banco têm seus próprios limites. O aplicativo não contrata nem altera planos pagos e não tenta outro provedor automaticamente após atingir uma quota.</p>
      </> : <>
        <h2>Dados tratados</h2><p>O Supabase Auth gerencia e-mail, credenciais e sessão. O banco armazena perfil, cadastros selecionados, dados comerciais próprios, favoritos, status e observações. As políticas RLS limitam cada carteira ao seu proprietário.</p>
        <h2>Consultas e terceiros</h2><p>Ao solicitar uma busca, o back-end envia o município, UF e a categoria ao provedor configurado. O Overpass também pode receber o bairro; na Geoapify, esse filtro é aplicado aos resultados recebidos. Não são enviados sua senha, token de sessão ou e-mail. Não inclua informações pessoais nos campos de busca.</p><p>Consulte as políticas de <a href="https://www.geoapify.com/privacy-policy/" target="_blank" rel="noopener noreferrer">Geoapify</a> e <a href="https://overpass.private.coffee/#privacy-policy" target="_blank" rel="noopener noreferrer">Private.coffee</a>. Os provedores podem registrar metadados técnicos de acesso. Supabase e a hospedagem também processam os dados necessários à operação.</p>
        <h2>Retenção</h2><p>Os resultados ficam em memória no navegador e, por até 15 minutos, no cache limitado do back-end. O cache de limites municipais da Geoapify pode durar uma hora. Apenas oportunidades selecionadas ou atualizadas explicitamente são gravadas no banco. Contadores limitam consultas sem guardar os termos pesquisados. A sessão fica no navegador até sair ou expirar.</p>
        <h2>Direitos e contato</h2><p>Para acesso, correção ou exclusão de dados comerciais e de conta, contate o administrador do workspace. A organização deve definir seu canal oficial e os prazos de retenção antes da operação em produção.</p>
      </>}
      <p className="muted">Versão 1.2 · 30 de outubro de 2026</p>
    </article>
  </div>;
}

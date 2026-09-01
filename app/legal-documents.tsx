"use client";

import { ArrowLeft, BookOpenCheck, Check, ChevronDown, Clock3, ExternalLink, FileCheck2, FileText, LockKeyhole, Printer, Scale, ShieldCheck, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export const TERMS_VERSION = "2026.08";
export const PRIVACY_VERSION = "2026.08";
export const LEGAL_EFFECTIVE_DATE = "25 de agosto de 2026";
export type LegalDocumentKind = "terms" | "privacy";

export function legalDocumentUrl(kind: LegalDocumentKind) {
  return `#document=${kind}`;
}

export function legalDocumentFromHash(hash: string): LegalDocumentKind | null {
  const document = new URLSearchParams(hash.replace(/^#/, "")).get("document");
  return document === "terms" || document === "privacy" ? document : null;
}

export function LegalConsent() {
  return <section className="legal-consent" aria-labelledby="legal-consent-title">
    <div className="legal-consent-head">
      <span><ShieldCheck /></span>
      <div><strong id="legal-consent-title">Transparência antes de continuar</strong><small>Consulte os documentos vigentes do MeetFlow.</small></div>
    </div>
    <div className="legal-consent-documents">
      <a href={legalDocumentUrl("terms")} target="_blank" rel="noreferrer"><FileText /><span><strong>Termos de Uso</strong><small>Regras e responsabilidades</small></span><ExternalLink /></a>
      <a href={legalDocumentUrl("privacy")} target="_blank" rel="noreferrer"><ShieldCheck /><span><strong>Política de Privacidade</strong><small>Dados, LGPD e direitos</small></span><ExternalLink /></a>
    </div>
    <label className="legal-consent-check">
      <input name="acceptTerms" type="checkbox" required />
      <span className="legal-checkmark"><Check /></span>
      <span>Li e aceito os <a href={legalDocumentUrl("terms")} target="_blank" rel="noreferrer">Termos de Uso</a> e a <a href={legalDocumentUrl("privacy")} target="_blank" rel="noreferrer">Política de Privacidade</a>, versão {TERMS_VERSION}, vigente desde {LEGAL_EFFECTIVE_DATE}.</span>
    </label>
  </section>;
}

const officialReferences = [
  { label: "Lei Geral de Proteção de Dados Pessoais — LGPD", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm" },
  { label: "Direitos dos titulares — ANPD", url: "https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares" },
  { label: "Comunicação de incidentes de segurança — ANPD", url: "https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis" },
  { label: "Cookies e proteção de dados pessoais — ANPD", url: "https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais" },
];

const TERMS_SECTIONS = ["Escopo e aceitação", "Definições", "Contas e credenciais", "Administração", "Uso permitido", "Conteúdo", "Comunicações", "Fornecedores", "Disponibilidade", "Segurança", "Encerramento", "Responsabilidades", "Alterações", "Lei aplicável", "Contato"];
const PRIVACY_SECTIONS = ["Objetivo", "Papéis LGPD", "Dados tratados", "Origem", "Finalidades", "Compartilhamento", "Transferência", "Cookies", "Retenção", "Segurança", "Direitos", "Menores", "Automação", "Incidentes", "Atualizações", "Referências"];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="legal-section"><h2>{title}</h2>{children}</section>;
}

function LegalList({ children }: { children: ReactNode }) {
  return <ul className="legal-list">{children}</ul>;
}

function TermsContent() {
  return <>
    <div className="legal-summary"><Scale /><div><strong>Resumo executivo</strong><p>Estes Termos disciplinam o acesso ao MeetFlow por empresas, administradores, colaboradores e convidados. A organização controla quem entra no workspace e responde pelo uso e pelo conteúdo da sua equipe.</p></div></div>
    <Section id="terms-1" title="1. Escopo e aceitação"><p>Estes Termos de Uso regulam o acesso e a utilização do MeetFlow Empresarial, plataforma de colaboração que reúne contas empresariais, agenda, reuniões, convites, lembretes por e-mail, chat, status, perfis e gestão de equipe.</p><p>Ao criar uma empresa, aceitar um convite ou utilizar o serviço, o usuário confirma que leu estes Termos e a Política de Privacidade, possui capacidade legal e, quando agir em nome de uma organização, tem autorização para vinculá-la às regras aplicáveis.</p></Section>
    <Section id="terms-2" title="2. Definições"><LegalList><li><strong>MeetFlow:</strong> o software e seus componentes de interface, API, banco de dados e envio de comunicações.</li><li><strong>Organização ou empresa:</strong> o workspace criado e administrado pelo cliente.</li><li><strong>Proprietário e administradores:</strong> pessoas autorizadas a gerir membros, permissões e configurações.</li><li><strong>Usuário:</strong> qualquer pessoa com conta ativa, inclusive gestores e colaboradores.</li><li><strong>Convidado ou participante:</strong> pessoa incluída em reunião ou comunicação, mesmo sem conta completa.</li><li><strong>Conteúdo do cliente:</strong> dados, textos, mensagens, arquivos, fotos, vídeos, reuniões e demais materiais inseridos no serviço.</li></LegalList></Section>
    <Section id="terms-3" title="3. Cadastro, contas e credenciais"><p>As informações de cadastro devem ser verdadeiras, completas e atualizadas. Cada conta é individual; credenciais não podem ser compartilhadas. O usuário deve proteger sua senha, encerrar sessões em dispositivos não confiáveis e comunicar suspeitas de acesso indevido.</p><p>O primeiro usuário da organização recebe o papel de proprietário. Convites são pessoais, expiram e podem ser cancelados ou reenviados. O convidado cria sua própria senha; o administrador não recebe a senha do colaborador.</p></Section>
    <Section id="terms-4" title="4. Administração do workspace"><p>A organização define finalidades, perfis de acesso e pessoas autorizadas a tratar o conteúdo empresarial. Proprietários e administradores podem convidar, alterar papéis, revogar convites e desativar contas, observados os limites técnicos e a hierarquia de permissões.</p><p>A organização é responsável por obter autorizações e fornecer avisos aos colaboradores, participantes e terceiros cujos dados inserir no MeetFlow, inclusive nomes e e-mails usados em reuniões e lembretes.</p></Section>
    <Section id="terms-5" title="5. Uso permitido e condutas proibidas"><p>O serviço deve ser utilizado para finalidades empresariais lícitas e compatíveis com colaboração, comunicação e organização de reuniões.</p><LegalList><li>É proibido publicar conteúdo ilícito, discriminatório, fraudulento, abusivo ou que viole direitos de terceiros.</li><li>É proibido enviar spam, malware, conteúdo que explore vulnerabilidades ou comunicações sem base legítima.</li><li>É proibido tentar acessar outra organização, contornar permissões, testar segurança sem autorização ou sobrecarregar deliberadamente a infraestrutura.</li><li>É proibido utilizar o serviço para dados cuja lei exija controles especiais não disponibilizados pelo MeetFlow, salvo acordo específico.</li></LegalList></Section>
    <Section id="terms-6" title="6. Conteúdo e propriedade intelectual"><p>O cliente mantém os direitos sobre seu conteúdo e concede ao MeetFlow autorização limitada para armazená-lo, processá-lo, transmiti-lo e exibi-lo somente na medida necessária para operar, proteger e melhorar o serviço.</p><p>A marca, o código, o design, a documentação e os demais elementos próprios do MeetFlow permanecem protegidos pela legislação aplicável. Nenhuma disposição transfere propriedade intelectual entre as partes.</p></Section>
    <Section id="terms-7" title="7. Reuniões, mensagens, status e e-mails"><p>O organizador é responsável por participantes, horários, links, locais, descrições e conteúdos cadastrados. Lembretes e convites por e-mail dependem de endereço válido, configuração do remetente e disponibilidade do provedor. O envio não garante leitura, entrega na caixa principal ou comparecimento.</p><p>Status são temporários e, na configuração atual, expiram após 24 horas. Mensagens e histórico do workspace permanecem disponíveis conforme a operação do serviço e as ações de exclusão aplicáveis.</p></Section>
    <Section id="terms-8" title="8. Fornecedores e integrações"><p>O MeetFlow depende de fornecedores de infraestrutura e comunicação, atualmente incluindo Vercel para hospedagem e funções, Neon para PostgreSQL e Brevo para e-mails transacionais. A sincronização em tempo real por Ably é opcional e pode estar desativada. Mudanças de fornecedores podem ocorrer por razões técnicas, de segurança ou continuidade.</p><p>Serviços de terceiros possuem termos e políticas próprios. O MeetFlow não controla falhas externas, filtros antispam, redes, dispositivos ou serviços adicionados pelo cliente.</p></Section>
    <Section id="terms-9" title="9. Disponibilidade e fase de validação"><p>O MeetFlow encontra-se em fase de validação. Não há, nesta versão, compromisso formal de nível de serviço (SLA), suporte 24 horas, recuperação instantânea ou disponibilidade ininterrupta. Manutenções, limites de planos de infraestrutura e eventos fora do controle razoável podem causar indisponibilidade.</p><p>O serviço não deve ser o único repositório de informações críticas. A organização deve manter seus próprios procedimentos de continuidade, exportação e backup quando exigidos por sua atividade.</p></Section>
    <Section id="terms-10" title="10. Segurança"><p>São adotadas medidas compatíveis com a fase do produto, incluindo isolamento lógico por organização, controle de acesso por papéis, senhas com hash, tokens temporários protegidos, validação de sessão e conexões seguras fornecidas pela infraestrutura. Nenhum ambiente digital é totalmente imune a incidentes.</p></Section>
    <Section id="terms-11" title="11. Suspensão e encerramento"><p>Contas ou organizações podem ser limitadas ou suspensas para conter risco de segurança, fraude, violação destes Termos, ordem legal ou impacto à infraestrutura. Sempre que razoável, a parte afetada será informada e terá oportunidade de corrigir a situação.</p><p>O proprietário pode solicitar exclusão, sujeito a verificações de autoridade, dependências entre usuários e retenções legais ou técnicas descritas na Política de Privacidade.</p></Section>
    <Section id="terms-12" title="12. Responsabilidades"><p>Cada parte responde por seus atos, obrigações legais e pessoas sob sua gestão. Na extensão permitida pela lei, o MeetFlow não responde por decisões empresariais tomadas com base no sistema, conteúdo do cliente, perda decorrente de credenciais compartilhadas, falha de terceiros ou eventos fora do controle razoável.</p><p>Nada nestes Termos exclui direitos ou responsabilidades que não possam ser limitados pela legislação aplicável.</p></Section>
    <Section id="terms-13" title="13. Alterações"><p>Os documentos possuem versão e data de vigência. Mudanças materiais serão destacadas por meio adequado. Quando a lei ou a natureza da alteração exigir, será solicitado novo aceite. O uso continuado após aviso não substitui consentimento quando este for juridicamente necessário.</p></Section>
    <Section id="terms-14" title="14. Lei aplicável e solução de conflitos"><p>Aplicam-se as leis da República Federativa do Brasil. As partes buscarão solução cooperativa antes de medidas formais. Permanecem preservadas as regras obrigatórias de competência, defesa do consumidor e proteção de dados.</p></Section>
    <Section id="terms-15" title="15. Informações institucionais e contato"><p>Esta é a versão vigente para a fase de validação do MeetFlow Empresarial. Antes de contratação comercial, proposta ou uso corporativo crítico, o instrumento específico deverá identificar o fornecedor responsável, seus dados cadastrais, canal de suporte, encarregado ou canal de privacidade, níveis de serviço e condições comerciais.</p><p>Dúvidas operacionais devem ser encaminhadas ao administrador do workspace. Questões contratuais e de privacidade devem utilizar o canal oficial indicado na aplicação ou no instrumento comercial aplicável.</p></Section>
  </>;
}

function PrivacyContent() {
  return <>
    <div className="legal-summary"><ShieldCheck /><div><strong>Resumo executivo</strong><p>O MeetFlow trata dados para criar contas, separar workspaces, organizar reuniões, permitir comunicação e proteger o ambiente. Não vende dados e, na versão atual, não utiliza publicidade comportamental.</p></div></div>
    <Section id="privacy-1" title="1. Objetivo e alcance"><p>Esta Política explica como dados pessoais são tratados no MeetFlow Empresarial, inclusive de titulares que criam contas, recebem convites, participam de reuniões, integram equipes ou aparecem em conteúdos inseridos por uma organização.</p><p>Ela deve ser lida em conjunto com os Termos de Uso e com os avisos próprios fornecidos pela empresa contratante aos seus colaboradores e contatos.</p></Section>
    <Section id="privacy-2" title="2. Papéis de proteção de dados"><p>Para dados que a organização insere e administra — como colaboradores, participantes, reuniões, mensagens e status — a organização normalmente decide as finalidades e atua como controladora; o MeetFlow atua como operador, seguindo instruções compatíveis com o serviço.</p><p>O MeetFlow pode atuar como controlador quanto a dados necessários para cadastro, autenticação, segurança, prevenção a abuso, administração do serviço e cumprimento de obrigações próprias. A qualificação final depende do tratamento concreto e da legislação aplicável.</p></Section>
    <Section id="privacy-3" title="3. Dados tratados"><LegalList><li><strong>Conta e perfil:</strong> nome, e-mail profissional, empresa, cargo, foto opcional, papel de acesso e registros de aceite.</li><li><strong>Autenticação e segurança:</strong> hash da senha, tokens protegidos, versão de autenticação, tentativas de login, datas, identificadores técnicos e registros de auditoria.</li><li><strong>Equipe:</strong> convites, e-mail, cargo, nível de acesso, remetente, expiração e situação do convite.</li><li><strong>Reuniões:</strong> título, horários, modo, local ou link, observações, organizador, nomes e e-mails dos participantes, confirmação e cancelamento.</li><li><strong>Comunicação:</strong> canais, mensagens, respostas, edições, exclusões, notificações e estado de leitura.</li><li><strong>Mídias:</strong> foto de perfil e arquivos publicados em status, incluindo metadados técnicos básicos.</li><li><strong>Operação:</strong> informações necessárias para diagnóstico, disponibilidade, envio de e-mails e prevenção de abuso.</li></LegalList></Section>
    <Section id="privacy-4" title="4. Origem dos dados"><p>Os dados são fornecidos diretamente pelo titular, pela organização que cria ou administra o workspace, por usuários que incluem participantes em reuniões e pelos sistemas utilizados para operar e proteger o serviço. A empresa deve assegurar que possui fundamento para inserir dados de terceiros.</p></Section>
    <Section id="privacy-5" title="5. Finalidades e bases legais"><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Finalidade</th><th>Dados principais</th><th>Base jurídica possível</th></tr></thead><tbody><tr><td data-label="Finalidade">Criar conta, workspace e executar funções solicitadas</td><td data-label="Dados principais">Cadastro, perfil, empresa e conteúdo</td><td data-label="Base jurídica possível">Execução de contrato ou procedimentos preliminares</td></tr><tr><td data-label="Finalidade">Autenticar, controlar acesso e prevenir abuso</td><td data-label="Dados principais">Credenciais protegidas, sessão, tentativas e auditoria</td><td data-label="Base jurídica possível">Execução do serviço e legítimo interesse em segurança</td></tr><tr><td data-label="Finalidade">Enviar convites, confirmações e lembretes</td><td data-label="Dados principais">Nome, e-mail e dados da reunião</td><td data-label="Base jurídica possível">Execução do serviço solicitado pela organização</td></tr><tr><td data-label="Finalidade">Cumprir deveres legais e responder autoridades</td><td data-label="Dados principais">Registros pertinentes ao pedido</td><td data-label="Base jurídica possível">Cumprimento de obrigação legal ou exercício de direitos</td></tr><tr><td data-label="Finalidade">Tratar foto e mídia opcional</td><td data-label="Dados principais">Arquivo escolhido pelo usuário</td><td data-label="Base jurídica possível">Execução da funcionalidade e escolha ativa do usuário</td></tr></tbody></table></div><p>A base aplicável pode variar conforme o papel exercido e o contexto. O aceite contratual dos documentos não transforma todo tratamento em consentimento.</p></Section>
    <Section id="privacy-6" title="6. Compartilhamento e operadores"><p>Dados são compartilhados somente na medida necessária com pessoas autorizadas da mesma organização e com fornecedores que sustentam o serviço. Atualmente, isso inclui Vercel (hospedagem e execução), Neon (PostgreSQL), Brevo (e-mails transacionais) e, se ativada, Ably (comunicação em tempo real).</p><p>Também pode haver compartilhamento para cumprir ordem válida, proteger direitos, investigar abuso, responder a incidente ou realizar operação societária legítima com salvaguardas adequadas. O MeetFlow não vende dados pessoais.</p></Section>
    <Section id="privacy-7" title="7. Transferência internacional"><p>Fornecedores de tecnologia podem armazenar ou processar dados fora do Brasil. Quando houver transferência internacional, devem ser observados os mecanismos e salvaguardas previstos na LGPD e na regulamentação da ANPD, além de medidas contratuais e de segurança compatíveis.</p></Section>
    <Section id="privacy-8" title="8. Cookies e armazenamento no dispositivo"><p>Na versão atual, o MeetFlow utiliza armazenamento local ou de sessão estritamente necessário para manter a autenticação conforme a escolha “Manter conectado”. Não há publicidade comportamental nem cookies de marketing próprios informados nesta versão.</p><p>Fornecedores de infraestrutura podem utilizar mecanismos estritamente necessários à segurança, entrega e funcionamento. Caso analytics, marketing ou novas categorias sejam adicionados, esta Política e os controles correspondentes deverão ser atualizados antes da ativação.</p></Section>
    <Section id="privacy-9" title="9. Retenção e exclusão"><LegalList><li>Dados de conta e workspace permanecem enquanto a conta estiver ativa e pelo tempo necessário para prestação do serviço.</li><li>Status expiram, na configuração atual, após 24 horas.</li><li>Convites de equipe são válidos por 7 dias; reenvio invalida o link anterior.</li><li>Links de recuperação de senha são de uso único e expiram após 60 minutos.</li><li>Registros de segurança, auditoria, e-mail e incidentes podem ser mantidos por período compatível com prevenção a fraude, exercício de direitos, obrigações legais e investigação.</li><li>Após solicitação válida de exclusão, os dados serão eliminados ou anonimizados dentro dos limites técnicos, ressalvadas hipóteses legais de conservação e ciclos de backup.</li></LegalList></Section>
    <Section id="privacy-10" title="10. Segurança"><p>As medidas incluem separação lógica por organização, acesso por papéis, senhas armazenadas por hash, tokens aleatórios mantidos em forma protegida, expiração de links, invalidação de sessões, conexões HTTPS e registros administrativos. A organização também deve aplicar menor privilégio, revisar membros e proteger seus dispositivos e e-mails.</p></Section>
    <Section id="privacy-11" title="11. Direitos dos titulares"><p>Nos termos da LGPD e conforme o tratamento, o titular pode solicitar confirmação, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio ou eliminação de dados inadequados, portabilidade quando regulamentada, oposição, revisão de decisões automatizadas e revogação do consentimento quando esta for a base aplicável.</p><p>Pedidos relacionados a conteúdo controlado pela empresa devem ser dirigidos primeiro ao administrador do workspace. Quando o MeetFlow atuar como operador, auxiliará a organização controladora. A identidade e a legitimidade do solicitante poderão ser verificadas para evitar divulgação indevida.</p></Section>
    <Section id="privacy-12" title="12. Crianças e adolescentes"><p>O serviço é destinado ao ambiente profissional e não é direcionado a crianças. Organizações não devem cadastrar menores sem necessidade, base jurídica, transparência e controles adequados. Se houver tratamento envolvendo menores, a organização deve observar o melhor interesse e os requisitos legais específicos.</p></Section>
    <Section id="privacy-13" title="13. Decisões automatizadas"><p>O MeetFlow não utiliza, nesta versão, decisões exclusivamente automatizadas destinadas a produzir efeitos jurídicos ou impacto relevante sobre titulares. Automações de lembrete, expiração e ordenação apenas executam regras operacionais do serviço.</p></Section>
    <Section id="privacy-14" title="14. Incidentes de segurança"><p>Suspeitas de incidente devem ser comunicadas imediatamente pelo canal oficial. O evento será avaliado, contido, registrado e, quando puder ocasionar risco ou dano relevante, comunicado pelo controlador à ANPD e aos titulares nos prazos e condições regulamentares. O MeetFlow, quando operador, fornecerá sem demora injustificada as informações necessárias ao controlador.</p></Section>
    <Section id="privacy-15" title="15. Atualizações e contato"><p>Esta Política poderá ser atualizada para refletir mudanças técnicas, jurídicas ou de fornecedores. A versão e a data de vigência permanecem visíveis. Alterações relevantes serão destacadas e poderão exigir novo aceite.</p><p>Na fase de validação, o administrador do workspace é o primeiro canal para pedidos sobre dados controlados pela empresa. Antes de operação comercial, o instrumento aplicável deverá identificar o fornecedor, o canal próprio de privacidade e o encarregado ou responsável pelo atendimento, quando exigido.</p></Section>
    <Section id="privacy-16" title="16. Referências oficiais"><div className="legal-references">{officialReferences.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.label}<ExternalLink /></a>)}</div></Section>
  </>;
}

export function LegalDocumentPage({ kind }: { kind: LegalDocumentKind }) {
  const terms = kind === "terms";
  const title = terms ? "Termos de Uso" : "Política de Privacidade";
  const version = terms ? TERMS_VERSION : PRIVACY_VERSION;
  const sections = terms ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const prefix = terms ? "terms" : "privacy";
  const [activeSection, setActiveSection] = useState(`${prefix}-1`);
  const [readingProgress, setReadingProgress] = useState(0);
  const [mobileIndexOpen, setMobileIndexOpen] = useState(false);
  const activeSectionIndex = Math.max(0, sections.findIndex((_, index) => activeSection === `${prefix}-${index + 1}`));

  useEffect(() => {
    if (!mobileIndexOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileIndexOpen]);

  useEffect(() => {
    const updateProgress = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setReadingProgress(height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 100);
    };
    const observed = sections.map((_, index) => document.getElementById(`${prefix}-${index + 1}`)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-18% 0px -68%", threshold: [0, .2, .6] });
    observed.forEach((section) => observer.observe(section));
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateProgress);
    };
  }, [prefix, sections]);

  const goToSection = (index: number) => {
    setMobileIndexOpen(false);
    document.getElementById(`${prefix}-${index + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <main className="legal-page">
    <div className="legal-progress" aria-hidden="true"><span style={{ width: `${readingProgress}%` }} /></div>
    <header className="legal-topbar">
      <button type="button" className="brand legal-home" onClick={() => window.location.assign("/")} aria-label="Voltar ao MeetFlow"><span className="brand-mark"><Sparkles /></span><span>MeetFlow<small>Central jurídica</small></span></button>
      <nav aria-label="Documentos jurídicos"><a href={legalDocumentUrl("terms")} className={terms ? "active" : ""}>Termos de Uso</a><a href={legalDocumentUrl("privacy")} className={!terms ? "active" : ""}>Privacidade</a></nav>
      <button type="button" className="legal-print" onClick={() => window.print()} aria-label="Imprimir ou salvar documento em PDF" title="Imprimir ou salvar em PDF"><Printer /> <span>Imprimir</span></button>
    </header>
    <div className="legal-hero">
      <div className="legal-hero-inner">
        <span className="legal-eyebrow"><BookOpenCheck /> DOCUMENTO PÚBLICO E VERSIONADO</span>
        <h1>{title}</h1>
        <p>Informações claras para empresas, administradores, usuários e profissionais responsáveis por conformidade.</p>
        <div className="legal-metadata">
          <span><FileCheck2 /><small>Versão</small><strong>{version}</strong></span>
          <span><Clock3 /><small>Vigência</small><strong>{LEGAL_EFFECTIVE_DATE}</strong></span>
          <span><ShieldCheck /><small>Status</small><strong>Documento vigente</strong></span>
        </div>
      </div>
      <div className="legal-hero-seal" aria-hidden="true"><span><Scale /></span><strong>Clareza<br />e confiança</strong><small>MeetFlow Empresarial</small></div>
    </div>
    <button type="button" className="legal-mobile-index" onClick={() => setMobileIndexOpen(true)} aria-expanded={mobileIndexOpen} aria-label="Abrir sumário do documento"><span className="legal-mobile-index-main"><FileText /><span><strong>{sections[activeSectionIndex]}</strong><small>Seção {activeSectionIndex + 1} de {sections.length}</small></span></span><span className="legal-mobile-index-progress"><small>{Math.round(readingProgress)}% lido</small><ChevronDown /></span></button>
    {mobileIndexOpen && <div className="legal-index-overlay" role="presentation" onClick={() => setMobileIndexOpen(false)}><nav className="legal-mobile-sheet" aria-label="Sumário do documento" onClick={(event) => event.stopPropagation()}><header><div><small>SUMÁRIO</small><strong>{title}</strong></div><button type="button" onClick={() => setMobileIndexOpen(false)} aria-label="Fechar sumário"><X /></button></header>{sections.map((section, index) => { const id = `${prefix}-${index + 1}`; return <button type="button" key={section} className={activeSection === id ? "active" : ""} onClick={() => goToSection(index)}><span>{String(index + 1).padStart(2, "0")}</span>{section}</button>; })}</nav></div>}
    <div className="legal-layout">
      <aside aria-label="Sumário do documento"><div className="legal-aside-head"><small>SUMÁRIO</small><strong>Neste documento</strong><span>{Math.round(readingProgress)}% lido</span></div><div className="legal-aside-progress"><span style={{ width: `${readingProgress}%` }} /></div><nav>{sections.map((section, index) => { const id = `${prefix}-${index + 1}`; return <button type="button" key={section} className={activeSection === id ? "active" : ""} onClick={() => goToSection(index)} aria-current={activeSection === id ? "location" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{section}</button>; })}</nav></aside>
      <article>
        <div className="legal-document-intro"><div className="legal-document-icon"><FileText /></div><div><span>LEITURA IMPORTANTE</span><h2>Antes de utilizar o MeetFlow</h2><p>Leia este documento com atenção. Ele explica direitos, deveres e como o serviço funciona na versão atual.</p></div></div>
        <div className="legal-beta-notice"><LockKeyhole /><p><strong>Fase de validação.</strong> Este documento descreve a operação atual do produto. Antes de contratação comercial ou uso crítico, os dados cadastrais do fornecedor, canais formais, SLA e condições comerciais devem constar em instrumento específico revisado por profissional jurídico.</p></div>
        {terms ? <TermsContent /> : <PrivacyContent />}
        <footer><p><strong>MeetFlow Empresarial</strong><br />{title} · Versão {version}<br />Vigente desde {LEGAL_EFFECTIVE_DATE}</p><div><button type="button" className="legal-footer-print" onClick={() => window.print()}><Printer /> Imprimir documento</button><button type="button" className="button button-dark" onClick={() => window.location.assign("/")}><ArrowLeft /> Voltar ao MeetFlow</button></div></footer>
      </article>
    </div>
  </main>;
}

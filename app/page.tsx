import { ArrowRight, CalendarCheck2, MessagesSquare, ShieldCheck, Sparkles, Video } from "lucide-react";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getChatGPTUser();
  if (user) return <DashboardClient identity={user} />;

  const signIn = chatGPTSignInPath("/");
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <a className="brand" href="#inicio"><span className="brand-mark"><Sparkles size={18} /></span>MeetFlow</a>
        <div><a className="button button-ghost" href={signIn}>Entrar</a><a className="button button-dark" href={signIn}>Criar conta</a></div>
      </nav>
      <section className="hero" id="inicio">
        <div className="hero-copy">
          <span className="hero-pill"><span /> O trabalho flui melhor em equipe</span>
          <h1>Reuniões, conversas e pessoas em um só lugar.</h1>
          <p>Organize a agenda da empresa, converse com colaboradores e compartilhe atualizações em foto ou vídeo — com dados reais e privados por workspace.</p>
          <div className="hero-actions"><a className="button button-primary" href={signIn}>Começar gratuitamente <ArrowRight size={18} /></a><a className="button button-soft" href="#recursos">Conhecer recursos</a></div>
          <div className="trust-row"><ShieldCheck size={18} /><span>Login seguro</span><i /><span>Dados isolados por empresa</span><i /><span>Sem cartão</span></div>
        </div>
        <div className="hero-product" aria-label="Prévia do painel MeetFlow">
          <div className="product-window">
            <header><div><i className="dot red" /><i className="dot yellow" /><i className="dot green" /></div><span>meetflow.app/workspace</span></header>
            <div className="product-body">
              <aside><span className="mini-logo">MF</span>{[1,2,3,4].map((item)=><i key={item} />)}</aside>
              <section><small>QUARTA-FEIRA, 19 DE AGOSTO</small><h3>Boa tarde, equipe 👋</h3><div className="mini-stats"><article><CalendarCheck2/><span><b>4</b> reuniões</span></article><article><MessagesSquare/><span><b>12</b> mensagens</span></article></div><div className="mini-meeting"><time>09:30</time><div><small>TIME DE PRODUTO</small><strong>Alinhamento semanal</strong><span><Video size={13}/> Sala online</span></div></div><div className="mini-meeting"><time>14:00</time><div><small>COMERCIAL</small><strong>Demonstração para cliente</strong><span><Video size={13}/> Videoconferência</span></div></div></section>
            </div>
          </div>
          <div className="floating-card floating-chat"><span>AL</span><div><strong>Ana Lima</strong><small>Atualizei o projeto agora ✨</small></div></div>
          <div className="floating-card floating-status"><i /><div><strong>Novo status</strong><small>Vídeo publicado • 24h</small></div></div>
        </div>
      </section>
      <section className="features" id="recursos">
        <div><span className="section-kicker">Uma plataforma completa</span><h2>Menos ferramentas. Mais contexto.</h2></div>
        <div className="feature-grid">
          <article><span><CalendarCheck2 /></span><h3>Agenda empresarial</h3><p>Agendamentos persistentes, controle de conflitos e cancelamentos.</p></article>
          <article><span><MessagesSquare /></span><h3>Chat da equipe</h3><p>Canais compartilhados para todos os colaboradores do workspace.</p></article>
          <article><span><Video /></span><h3>Status em foto e vídeo</h3><p>Atualizações rápidas em um carrossel que expira após 24 horas.</p></article>
        </div>
      </section>
      <footer className="landing-footer"><a className="brand" href="#inicio"><span className="brand-mark"><Sparkles size={16} /></span>MeetFlow</a><span>Feito para empresas que valorizam o tempo.</span></footer>
    </main>
  );
}

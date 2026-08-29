"use client";

import { Bot, Eraser, LockKeyhole, RefreshCw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { AiConversationMessage, MeetFlowApi } from "./lib/meetflow-api";

function welcomeMessage(firstName: string): AiConversationMessage {
  return {
    role: "assistant",
    content: `Olá, ${firstName}! Eu sou a MeetFlow IA. Pode conversar comigo normalmente: tire dúvidas, desenvolva ideias, revise textos ou peça uma explicação. Como posso ajudar?`,
  };
}

export default function AiAssistant({ api, firstName }: { api: MeetFlowApi; firstName: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiConversationMessage[]>(() => [welcomeMessage(firstName)]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const scrollArea = useRef<HTMLDivElement>(null);
  const inputArea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => inputArea.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function clearConversation() {
    setMessages([welcomeMessage(firstName)]);
    setInput("");
    setError("");
    setRemaining(null);
    setSources([]);
    window.requestAnimationFrame(() => inputArea.current?.focus());
  }

  async function requestAnswer(temporaryContext: AiConversationMessage[]) {
    setError("");
    setSources([]);
    setBusy(true);
    try {
      const answer = await api.askAi(temporaryContext);
      setMessages((current) => [...current, { role: "assistant", content: answer.message }]);
      setRemaining(answer.remaining);
      setSources(answer.sources || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível falar com a IA.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || busy) return;
    if (content.length > 4_000) {
      setError("Sua mensagem deve ter no máximo 4.000 caracteres.");
      return;
    }

    const userMessage: AiConversationMessage = { role: "user", content };
    const temporaryContext = [...messages.slice(1), userMessage].slice(-12);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    await requestAnswer(temporaryContext);
  }

  function retryAnswer() {
    if (busy) return;
    const temporaryContext = messages.slice(1).slice(-12);
    if (temporaryContext.at(-1)?.role === "user") void requestAnswer(temporaryContext);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function keyboardSend(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const suggestions = ["Quais são as próximas reuniões?", "Resuma os status da equipe", "Explique um assunto"];

  return <>
    <button className={`ai-fab${open ? " open" : ""}`} type="button" onClick={() => setOpen(true)} aria-label="Abrir conversa com a MeetFlow IA" aria-haspopup="dialog" aria-expanded={open}>
      <span className="ai-fab-orbit" aria-hidden="true" />
      <Sparkles aria-hidden="true" />
      <small>IA</small>
    </button>

    {open && <div className="ai-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="ai-dialog" role="dialog" aria-modal="true" aria-label="Conversa temporária com a MeetFlow IA" aria-busy={busy}>
        <header className="ai-dialog-head">
          <span className="ai-avatar"><Sparkles /></span>
          <div><strong>MeetFlow IA</strong><small><i /> Online · conversa temporária</small></div>
          {remaining !== null && <em>{remaining} restantes</em>}
          <button className="ai-head-action" type="button" onClick={clearConversation} disabled={busy || messages.length === 1} aria-label="Limpar conversa" title="Limpar conversa"><Eraser /></button>
          <button className="ai-head-action close" type="button" onClick={() => setOpen(false)} aria-label="Fechar conversa"><X /></button>
        </header>

        <div className="ai-privacy-note"><LockKeyhole /><p><strong>Privacidade por padrão.</strong> O MeetFlow não salva estas mensagens. Quando você pergunta sobre a empresa, a IA consulta temporariamente apenas os dados que sua conta pode acessar.</p><ShieldCheck /></div>

        <div className="ai-messages" ref={scrollArea} role="log" aria-live="polite">
          {messages.map((message, index) => <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
            <span>{message.role === "assistant" ? <Bot /> : firstName.slice(0, 1).toUpperCase()}</span>
            <div><strong>{message.role === "assistant" ? "MeetFlow IA" : firstName}</strong><p>{message.content}</p></div>
          </div>)}
          {busy && <div className="ai-message assistant"><span><Bot /></span><div><strong>MeetFlow IA</strong><p className="ai-thinking"><i /><i /><i /></p></div></div>}
        </div>

        {messages.length === 1 && <div className="ai-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setInput(suggestion); window.requestAnimationFrame(() => inputArea.current?.focus()); }}>{suggestion}</button>)}</div>}
        {sources.length > 0 && <div className="ai-context-sources"><ShieldCheck /><span><strong>Consulta interna protegida</strong>{sources.join(" · ")}</span></div>}
        {error && <div className="ai-error" role="alert"><span>{error}</span>{messages.at(-1)?.role === "user" && <button type="button" onClick={retryAnswer} disabled={busy}><RefreshCw /> Tentar novamente</button>}</div>}

        <form className="ai-composer" onSubmit={submit}>
          <div><textarea ref={inputArea} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyboardSend} maxLength={4_000} rows={1} placeholder="Converse com a MeetFlow IA..." aria-label="Mensagem para a MeetFlow IA" disabled={busy} /><small><span>Enter envia · Shift + Enter quebra a linha</span><em>{input.length.toLocaleString("pt-BR")}/4.000</em></small></div>
          <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar mensagem"><Send /></button>
        </form>
        <footer>A IA pode cometer erros. Confirme informações importantes.</footer>
      </section>
    </div>}
  </>;
}

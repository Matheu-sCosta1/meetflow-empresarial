"use client";

import { Bot, Eraser, LockKeyhole, RefreshCw, Send, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { AiConversationMessage, MeetFlowApi } from "./lib/meetflow-api";

const welcomeMessage: AiConversationMessage = {
  role: "assistant",
  content: "Olá! Eu sou a MeetFlow IA. Posso ajudar com dúvidas, ideias, explicações, textos e muitos outros assuntos. O que você gostaria de conversar?",
};

export default function AiAssistant({ api, firstName }: { api: MeetFlowApi; firstName: string }) {
  const [messages, setMessages] = useState<AiConversationMessage[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const inputArea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function clearConversation() {
    setMessages([welcomeMessage]);
    setInput("");
    setError("");
    window.requestAnimationFrame(() => inputArea.current?.focus());
  }

  async function requestAnswer(temporaryContext: AiConversationMessage[]) {
    setError("");
    setBusy(true);
    try {
      const answer = await api.askAi(temporaryContext);
      setMessages((current) => [...current, { role: "assistant", content: answer.message }]);
      setRemaining(answer.remaining);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível falar com a IA.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || busy) return;
    if (content.length > 4_000) { setError("Sua mensagem deve ter no máximo 4.000 caracteres."); return; }

    const userMessage: AiConversationMessage = { role: "user", content };
    const temporaryContext = [...messages.filter((message) => message !== welcomeMessage), userMessage].slice(-12);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    await requestAnswer(temporaryContext);
  }

  function retryAnswer() {
    if (busy) return;
    const temporaryContext = messages.filter((message) => message !== welcomeMessage).slice(-12);
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

  const suggestions = ["Explique um assunto para mim", "Ajude a melhorar um texto", "Vamos desenvolver uma ideia"];

  return <section className="ai-page">
    <header className="ai-page-head">
      <div><span className="section-kicker">ASSISTENTE PARTICULAR</span><h2>MeetFlow IA</h2><p>Converse naturalmente, tire dúvidas e desenvolva ideias sem criar um histórico permanente.</p></div>
      <button className="button button-soft ai-clear" onClick={clearConversation} disabled={busy || messages.length === 1}><Eraser /> Limpar conversa</button>
    </header>

    <div className="ai-privacy-banner"><span><LockKeyhole /></span><div><strong>Conversa temporária e privada</strong><p>O MeetFlow não salva estas mensagens no banco. Ao atualizar a página, sair da conta ou limpar a conversa, o conteúdo desaparece.</p></div><ShieldCheck /></div>

    <article className="ai-chat-card" aria-busy={busy}>
      <header><span className="ai-avatar"><Sparkles /></span><div><strong>MeetFlow IA</strong><small><i /> pronta para conversar com {firstName}</small></div>{remaining !== null && <em>{remaining} perguntas restantes hoje</em>}</header>
      <div className="ai-messages" ref={scrollArea} role="log" aria-live="polite" aria-label="Conversa temporária com a MeetFlow IA">
        {messages.map((message, index) => <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
          <span>{message.role === "assistant" ? <Bot /> : firstName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{message.role === "assistant" ? "MeetFlow IA" : firstName}</strong><p>{message.content}</p></div>
        </div>)}
        {busy && <div className="ai-message assistant"><span><Bot /></span><div><strong>MeetFlow IA</strong><p className="ai-thinking"><i /><i /><i /></p></div></div>}
      </div>
      {messages.length === 1 && <div className="ai-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>)}</div>}
      {error && <div className="ai-error" role="alert"><span>{error}</span>{messages.at(-1)?.role === "user" && <button type="button" onClick={retryAnswer} disabled={busy}><RefreshCw /> Tentar novamente</button>}</div>}
      <form className="ai-composer" onSubmit={submit}>
        <div><textarea ref={inputArea} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyboardSend} maxLength={4_000} rows={1} placeholder="Converse com a MeetFlow IA..." aria-label="Mensagem para a MeetFlow IA" disabled={busy} /><small><span>Enter para enviar · Shift + Enter para nova linha</span><em>{input.length.toLocaleString("pt-BR")}/4.000</em></small></div>
        <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar para a IA"><Send /></button>
      </form>
      <footer>A IA pode cometer erros. Confirme informações importantes. Nenhuma mensagem desta conversa é adicionada ao chat da empresa.</footer>
    </article>
  </section>;
}

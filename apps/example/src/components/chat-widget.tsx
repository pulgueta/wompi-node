import { useEffect, useRef, useState } from "react";

import { useUIMessages, useSmoothText } from "@convex-dev/agent/react";
import { useMutation } from "convex/react";
import { MessageSquare, SendHorizontal, X } from "lucide-react";
import { Streamdown } from "streamdown";

import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Input } from "#/components/ui/input";
import { Marker, MarkerContent } from "#/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "#/components/ui/message";
import { cn } from "#/lib/utils";

const STARTER_QUESTIONS = [
  "¿Cómo firmo la transacción?",
  "Llaves Bre-B de prueba",
  "¿Qué es transaction.updated?",
  "Autofill del checkout",
];

const THREAD_KEY = "panabarbero:chat-thread";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(THREAD_KEY),
  );
  const createThread = useMutation(api.chat.createThread);

  useEffect(() => {
    if (!isOpen || threadId) return;
    void createThread({}).then((id) => {
      window.localStorage.setItem(THREAD_KEY, id);
      setThreadId(id);
    });
  }, [isOpen, threadId, createThread]);

  return (
    <>
      {isOpen && threadId && (
        <ChatPanel threadId={threadId} onClose={() => setIsOpen(false)} />
      )}
      {!isOpen && (
        <button
          type="button"
          aria-label="Abrir asistente Wompi"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[60px] right-5 z-40 flex size-[52px] items-center justify-center bg-primary text-primary-foreground shadow-md transition-colors hover:bg-brand-600 active:bg-brand-700"
        >
          <MessageSquare aria-hidden className="size-[22px]" />
        </button>
      )}
    </>
  );
}

function ChatPanel({
  threadId,
  onClose,
}: {
  threadId: string;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const sendMessage = useMutation(api.chat.sendMessage);

  const { results: messages, status } = useUIMessages(
    api.chat.listMessages,
    { threadId },
    { initialNumItems: 30, stream: true },
  );

  const isStreaming = messages.some((m) => m.status === "streaming");
  const isPending =
    messages.length > 0 && messages[messages.length - 1].role === "user";
  // Tool-call/reasoning steps arrive as assistant messages without text;
  // hide them and keep the typing marker until visible text streams in.
  const visibleMessages = messages.filter(
    (m) => m.role === "user" || m.text.trim().length > 0,
  );
  const hasStreamingText = messages.some(
    (m) => m.status === "streaming" && m.text.trim().length > 0,
  );

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const ask = (text: string) => {
    const prompt = text.trim();
    if (!prompt || isPending || isStreaming) return;
    setInput("");
    void sendMessage({ threadId, prompt });
  };

  return (
    <section
      aria-label="Asistente Wompi"
      className="fixed bottom-5 right-5 z-40 flex h-[500px] max-h-[70vh] w-[370px] max-w-[92vw] flex-col border bg-background shadow-lg"
    >
      <header className="flex items-center gap-2.5 bg-foreground py-3 pl-4 pr-2 text-background">
        <span aria-hidden className="size-2 bg-primary" />
        <div>
          <p className="mb-0 text-[13px] font-extrabold tracking-[0.06em]">
            ASISTENTE WOMPI
          </p>
          <p className="mb-0 text-[10px] opacity-60">
            docs.wompi.co + SDK · RAG sobre Convex
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar asistente"
          onClick={onClose}
          className="ml-auto flex size-10 cursor-pointer items-center justify-center transition-colors hover:bg-background/15"
        >
          <X aria-hidden className="size-[18px]" />
        </button>
      </header>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5"
      >
        <AgentMessage text="Hola, soy el asistente de Wompi. Pregúntame sobre la integración: llaves, checkout, firma de integridad, webhooks o payouts Bre-B." />
        {messages.length === 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {STARTER_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => ask(question)}
                className="min-h-10 border px-2.5 py-2 text-left text-[11px] text-neutral-900 transition-colors hover:border-primary hover:text-brand-700"
              >
                {question}
              </button>
            ))}
          </div>
        )}
        {visibleMessages.map((message) =>
          message.role === "user" ? (
            <Message key={message.key} align="end">
              <MessageContent>
                <Bubble align="end">
                  <BubbleContent className="text-[12.5px]">
                    {message.text}
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          ) : (
            <StreamingAgentMessage key={message.key} message={message} />
          ),
        )}
        {(isPending || isStreaming || status === "LoadingFirstPage") &&
          !hasStreamingText && (
            <Marker role="status">
              <MarkerContent className="flex items-center gap-1.5 text-[11px]">
                <TypingDot />
                <TypingDot className="[animation-delay:200ms]" />
                <TypingDot className="[animation-delay:400ms]" />
                Consultando la documentación…
              </MarkerContent>
            </Marker>
          )}
      </div>

      <form
        className="flex gap-2 border-t-2 px-3.5 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Pregunta sobre Wompi…"
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Enviar pregunta"
          className="size-11 shrink-0"
          disabled={isPending || isStreaming || input.trim().length === 0}
        >
          <SendHorizontal aria-hidden className="size-[15px]" />
        </Button>
      </form>
    </section>
  );
}

function StreamingAgentMessage({
  message,
}: {
  message: { text: string; status?: string };
}) {
  const [visibleText] = useSmoothText(message.text, {
    startStreaming: message.status === "streaming",
  });
  return (
    <AgentMessage
      text={visibleText}
      isStreaming={message.status === "streaming"}
    />
  );
}

function AgentMessage({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  return (
    <Message>
      <MessageContent>
        <MessageHeader className="px-0 text-[10px] font-semibold tracking-[0.08em] text-neutral-700">
          ASISTENTE
        </MessageHeader>
        <Bubble variant="muted" className="max-w-[88%]">
          <BubbleContent className="w-full min-w-0 border-border bg-card text-[12.5px] [&_*]:rounded-none">
            <Streamdown
              mode={isStreaming ? "streaming" : "static"}
              isAnimating={isStreaming}
              caret={isStreaming ? "block" : undefined}
              className="min-w-0 max-w-full [&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-[15px] [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-[14px] [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-[13px] [&_h3]:font-bold [&_h4]:mb-1 [&_h4]:mt-2.5 [&_h4]:text-[13px] [&_h4]:font-bold [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-[11px]"
            >
              {text}
            </Streamdown>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

function TypingDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 animate-blink bg-neutral-700", className)}
    />
  );
}

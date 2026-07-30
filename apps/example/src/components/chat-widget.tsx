import { useCallback, useEffect, useRef, useState } from "react";

import { useUIMessages, useSmoothText } from "@convex-dev/agent/react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  History,
  MessageSquare,
  SendHorizontal,
  SquarePen,
  X,
} from "lucide-react";
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

const MAX_PROMPT_CHARS = 4000; // keep in sync with convex/chat.ts
const STORAGE_SCOPE = import.meta.env.VITE_CONVEX_URL ?? "local";
const THREADS_KEY = `panabarbero:chat-threads:${STORAGE_SCOPE}`;
const OLD_THREAD_KEY = `panabarbero:chat-thread:${STORAGE_SCOPE}`;
const MAX_STORED_THREADS = 15;

function normalizeThreadIds(threadIds: string[]) {
  return [...new Set(threadIds)].slice(0, MAX_STORED_THREADS);
}

function storeThreadIds(threadIds: string[]) {
  const normalized = normalizeThreadIds(threadIds);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function readThreadIds() {
  if (typeof window === "undefined") return [];

  let threadIds: string[] = [];
  try {
    const stored = window.localStorage.getItem(THREADS_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (Array.isArray(parsed)) {
      threadIds = parsed.filter(
        (threadId): threadId is string => typeof threadId === "string",
      );
    }
  } catch {
    threadIds = [];
  }

  const oldThreadId = window.localStorage.getItem(OLD_THREAD_KEY);
  if (oldThreadId) {
    threadIds = storeThreadIds([oldThreadId, ...threadIds]);
    window.localStorage.removeItem(OLD_THREAD_KEY);
  }

  return normalizeThreadIds(threadIds);
}

function createThreadErrorMessage(error: unknown) {
  return error instanceof ConvexError && error.data?.kind === "RateLimited"
    ? "Límite de conversaciones alcanzado. Espera un momento."
    : "No se pudo crear la conversación. Intenta de nuevo.";
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [threadIds, setThreadIds] = useState<string[]>(readThreadIds);
  const [threadId, setThreadId] = useState<string | null>(
    () => threadIds[0] ?? null,
  );
  const [threadError, setThreadError] = useState<string | null>(null);
  const createInFlight = useRef(false);
  const createThread = useMutation(api.chat.createThread);

  const selectThread = useCallback((id: string) => {
    setThreadId(id);
    setThreadError(null);
  }, []);

  const rememberThread = useCallback((id: string) => {
    setThreadIds((current) => storeThreadIds([id, ...current]));
    setThreadId(id);
  }, []);

  const startNewThread = useCallback(async () => {
    // Synchronous lock: a double click must not create two threads.
    if (createInFlight.current) return false;
    createInFlight.current = true;
    setThreadError(null);
    try {
      const id = await createThread({});
      rememberThread(id);
      return true;
    } catch (error) {
      console.error("Failed to create chat thread", error);
      setThreadError(createThreadErrorMessage(error));
      return false;
    } finally {
      createInFlight.current = false;
    }
  }, [createThread, rememberThread]);

  useEffect(() => {
    if (!isOpen || threadId) return;
    void createThread({})
      .then((id) => {
        rememberThread(id);
      })
      .catch((error) => {
        console.error("Failed to create chat thread", error);
        setIsOpen(false);
      });
  }, [isOpen, threadId, createThread, rememberThread]);

  return (
    <>
      {isOpen && threadId && (
        <ChatPanel
          key={threadId}
          threadId={threadId}
          threadIds={threadIds}
          threadError={threadError}
          onClearThreadError={() => setThreadError(null)}
          onClose={() => setIsOpen(false)}
          onNewThread={startNewThread}
          onSelectThread={selectThread}
        />
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
  threadIds,
  threadError,
  onClearThreadError,
  onClose,
  onNewThread,
  onSelectThread,
}: {
  threadId: string;
  threadIds: string[];
  threadError: string | null;
  onClearThreadError: () => void;
  onClose: () => void;
  onNewThread: () => Promise<boolean>;
  onSelectThread: (threadId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isThreadsOpen, setIsThreadsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Synchronous lock: `isPending` comes from the subscription and lags, so a
  // fast double submit could persist the prompt (and bill a reply) twice.
  const sendInFlight = useRef(false);
  const sendMessage = useMutation(api.chat.sendMessage);
  const threads = useQuery(
    api.chat.listThreads,
    isThreadsOpen ? { threadIds } : "skip",
  );

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
    if (isThreadsOpen) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isThreadsOpen]);

  const ask = (text: string) => {
    const prompt = text.trim();
    if (!prompt || isPending || isStreaming || sendInFlight.current) return;
    if (prompt.length > MAX_PROMPT_CHARS) {
      setSendError(
        `El mensaje no puede superar los ${MAX_PROMPT_CHARS} caracteres.`,
      );
      return;
    }
    sendInFlight.current = true;
    setIsSending(true);
    setSendError(null);
    onClearThreadError();
    setInput("");
    void sendMessage({ threadId, prompt })
      .catch((error) => {
        console.error("Failed to send chat message", error);
        setInput(text);
        setSendError(
          error instanceof ConvexError && error.data?.kind === "RateLimited"
            ? "Límite de mensajes alcanzado. Espera un momento e intenta de nuevo."
            : "No se pudo enviar el mensaje. Intenta de nuevo.",
        );
      })
      .finally(() => {
        sendInFlight.current = false;
        setIsSending(false);
      });
  };

  return (
    <section
      aria-label="Asistente Wompi"
      className="fixed bottom-5 right-5 z-40 flex h-[500px] max-h-[70vh] w-[370px] max-w-[92vw] flex-col border bg-background shadow-lg"
    >
      <header className="flex items-center gap-1 bg-foreground py-3 pl-4 pr-2 text-background">
        <span aria-hidden className="mr-1.5 size-2 shrink-0 bg-primary" />
        <div className="min-w-0 flex-1">
          <p className="mb-0 truncate text-[13px] font-extrabold tracking-[0.06em]">
            ASISTENTE WOMPI
          </p>
          <p className="mb-0 truncate text-[10px] opacity-60">
            docs.wompi.co + SDK · RAG sobre Convex
          </p>
        </div>
        <button
          type="button"
          aria-label="Ver conversaciones"
          aria-pressed={isThreadsOpen}
          onClick={() => setIsThreadsOpen((open) => !open)}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-background/15"
        >
          <History aria-hidden className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Nueva conversación"
          onClick={() => {
            void onNewThread().then((created) => {
              if (created) setIsThreadsOpen(false);
            });
          }}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-background/15"
        >
          <SquarePen aria-hidden className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Cerrar asistente"
          onClick={onClose}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-background/15"
        >
          <X aria-hidden className="size-[18px]" />
        </button>
      </header>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5"
      >
        {isThreadsOpen ? (
          <>
            <p className="mb-0 border-b pb-2 text-[10px] font-semibold tracking-[0.08em] text-neutral-700">
              CONVERSACIONES
            </p>
            {threads === undefined ? (
              <p className="mb-0 py-3 text-[11px] text-neutral-700">
                Cargando conversaciones…
              </p>
            ) : threads.length === 0 ? (
              <p className="mb-0 py-3 text-[11px] text-neutral-700">
                Aún no tienes conversaciones.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {threads.map((thread) => {
                  const isActive = thread.threadId === threadId;
                  return (
                    <button
                      key={thread.threadId}
                      type="button"
                      onClick={() => {
                        onSelectThread(thread.threadId);
                        setIsThreadsOpen(false);
                      }}
                      className={cn(
                        "w-full border px-2.5 py-2 text-left transition-colors hover:border-primary",
                        isActive && "border-l-4 border-l-primary",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[12.5px]",
                            isActive && "font-semibold",
                          )}
                        >
                          {thread.title}
                        </span>
                        {isActive && (
                          <span className="shrink-0 bg-primary px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] text-primary-foreground">
                            ACTUAL
                          </span>
                        )}
                      </span>
                      {thread.createdAt > 0 && (
                        <span className="mt-1 block text-[10px] text-neutral-700">
                          {new Date(thread.createdAt).toLocaleDateString(
                            "es-CO",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {(sendError ?? threadError) && (
        <p
          role="alert"
          className="mb-0 border-t px-3.5 py-2 text-[11px] text-brand-700"
        >
          {sendError ?? threadError}
        </p>
      )}
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
          disabled={
            isPending || isStreaming || isSending || input.trim().length === 0
          }
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

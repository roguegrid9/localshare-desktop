// src/components/channels/TextChannel.tsx
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Hash, Send, Paperclip, Smile, ChevronDown, Loader2, X } from "lucide-react";
import { cx } from "../../utils/cx";
import { useMessages } from "../../hooks/useMessages";
import { useTypingIndicators } from "../../hooks/useTypingIndicators";

interface TextChannelProps {
  channelId: string;
}

/** ---------- Tiny UI bits ---------- */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="relative my-5 flex items-center justify-center">
      <div className="h-px w-full bg-white/10" />
      <span className="absolute px-3 py-1 text-xs rounded-full bg-[#0D0F14] border border-white/10 text-white/60 shadow-sm">
        {label}
      </span>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="sr-only">typing</span>
      <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-bounce" />
      <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-bounce [animation-delay:0.2s]" />
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🔥", "🙏", "😅"];

/** Click-popover for reactions */
function ReactionTray({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div
      ref={boxRef}
      className="z-20 rounded-xl border border-white/10 bg-[#0E1117] shadow-xl px-2 py-1.5 flex flex-wrap gap-1.5"
      role="dialog"
      aria-label="Add reaction"
    >
      {QUICK_EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onPick(e)}
          className="text-base leading-none px-2 py-1 rounded-md hover:bg-white/10"
        >
          {e}
        </button>
      ))}
      <button
        onClick={onClose}
        className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-white/10 hover:bg-white/10"
        aria-label="Close"
        title="Close"
      >
        <X className="h-3.5 w-3.5" />
        Close
      </button>
    </div>
  );
}

/** ---------- Text Channel ---------- */
export default function TextChannel({ channelId }: TextChannelProps) {
  const [draft, setDraft] = useState("");
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [openReactionFor, setOpenReactionFor] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, loading, sendMessage, getReactionCounts, addReaction, removeReaction } =
    useMessages(channelId);

  const { typingUsers, startTyping, stopTyping } = useTypingIndicators(channelId);

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (isNearBottom) scrollToEnd();
  }, [messages, isNearBottom, scrollToEnd]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 120;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom < threshold);
  }, []);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);
  
  useEffect(() => {
    autoGrow();
  }, [draft, autoGrow]);

  const handleSend = async () => {
    const value = draft.trim();
    if (!value) return;
    
    const originalDraft = draft;
    setDraft("");
    stopTyping();
    
    try {
      await sendMessage(value);
    } catch (e) {
      console.error("Failed to send message:", e);
      
      // Show user-friendly error message
      const errorMessage = e instanceof Error ? e.message : String(e);
      
      // You might want to add a toast notification here
      // For now, just log and restore the draft
      alert(`Failed to send message: ${errorMessage}`);
      
      // Restore the draft so user doesn't lose their message
      setDraft(originalDraft);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (v && !draft) startTyping();
    if (!v && draft) stopTyping();
    setDraft(v);
  };

  const toggleReact = async (
    messageId: string,
    emoji: string,
    hasReacted: boolean = false
  ) => {
    try {
      if (hasReacted) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    } catch (e) {
      console.error("Failed to toggle reaction:", e);
    }
  };

  // Helper function to determine if message should show header (username + timestamp)
  const shouldShowHeader = (index: number, messages: any[]) => {
    if (index === 0) return true;
    
    const current = messages[index];
    const previous = messages[index - 1];
    
    if (!current || !previous) return true;
    
    // Show header if different user
    const currentUserId = current.username || current.user_id;
    const previousUserId = previous.username || previous.user_id;
    if (currentUserId !== previousUserId) return true;
    
    // Show header if more than 7 minutes apart
    const currentTime = new Date(current.created_at).getTime();
    const previousTime = new Date(previous.created_at).getTime();
    const timeDiff = currentTime - previousTime;
    if (timeDiff > 7 * 60 * 1000) return true; // 7 minutes
    
    return false;
  };

  const grouped = useMemo(() => {
    const byDay: Record<string, typeof messages> = {};
    for (const m of messages) {
      if (!m || !m.id) continue;
      const d = new Date(m.created_at);
      const key = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      (byDay[key] ||= []).push(m);
    }
    return byDay;
  }, [messages]);

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="w-40 h-3 rounded bg-white/10 animate-pulse" />
                  <div className="w-full max-w-lg h-10 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-2 opacity-70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-white/70">Loading messages…</span>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col relative">
      {/* Message list */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto p-4 sm:p-6 space-y-2"
        role="log"
        aria-live="polite"
      >
        {isEmpty ? (
          <div className="text-center text-white/60 mt-10">
            <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-400/20 to-red-500/20 grid place-items-center border border-white/10">
              <Hash className="h-7 w-7 text-white/40" />
            </div>
            <div className="font-medium mb-1">Be the first to say something</div>
            <div className="text-sm text-white/40">
              Start a conversation in this channel.
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <DayDivider label={day} />
              <div className="space-y-4">
                {items.map((message, idx) => {
                  const reactionCounts = getReactionCounts(message.id);
                  const hasReactions = Object.keys(reactionCounts).length > 0;
                  const when = new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                  const isTrayOpen = openReactionFor === message.id;
                  const name = message.username || message.user_id;
                  const showHeader = shouldShowHeader(idx, items);

                  return (
                    <div key={message.id} className="group/message grid grid-cols-[40px_1fr] gap-3">
                      {/* Avatar (hidden for compact stack when same author) */}
                      <div className="pt-0.5">
                        {showHeader ? (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-white grid place-items-center text-sm font-medium">
                            {name[0]?.toUpperCase?.() || "?"}
                          </div>
                        ) : (
                          <div className="w-10" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0">
                        {/* header line like Discord */}
                        {showHeader && (
                          <div className="flex items-baseline gap-2 leading-none">
                            <span className="font-medium text-white text-[13px]">{name}</span>
                            <time className="text-[11px] text-white/40 tabular-nums">{when}</time>
                          </div>
                        )}

                        {/* text (no bubble) */}
                        <div className={showHeader ? "mt-1" : "mt-0.5"}>
                          {message.is_deleted ? (
                            <div className="text-white/45 text-sm italic select-none">This message was deleted</div>
                          ) : (
                            <div className="text-[14px] leading-6 text-white/90 whitespace-pre-wrap break-words">
                              {message.content}
                            </div>
                          )}
                        </div>

                        {/* reactions row — single line, horizontal scroll if many */}
                        {hasReactions && (
                          <div className="mt-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar pr-2">
                            {Object.entries(reactionCounts).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReact(message.id, emoji, false)}
                                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 px-2 py-[3px] text-xs"
                                title={`${emoji} ${count}`}
                                aria-label={`${emoji} ${count}`}
                              >
                                <span>{emoji}</span>
                                <span className="text-white/60">{count}</span>
                              </button>
                            ))}

                            {/* add reaction (shows on hover like Discord) */}
                            {!message.is_deleted && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenReactionFor(isTrayOpen ? null : message.id);
                                }}
                                className="opacity-0 group-hover/message:opacity-100 transition-opacity shrink-0 inline-flex items-center gap-1 rounded-md border border-white/10 bg-[#10131a]/90 px-2 py-[3px] text-[11px] text-white/70 hover:text-white hover:border-white/20"
                                aria-label="Add reaction"
                              >
                                +
                              </button>
                            )}
                          </div>
                        )}

                        {/* reaction picker popover */}
                        {isTrayOpen && (
                          <div className="relative h-0">
                            <div className="absolute mt-2">
                              <ReactionTray
                                onPick={(emoji) => {
                                  toggleReact(message.id, emoji, false);
                                  setOpenReactionFor(null);
                                }}
                                onClose={() => setOpenReactionFor(null)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="mt-3 ml-11 text-xs text-white/70 flex items-center gap-2">
            <TypingDots />
            {typingUsers.length === 1
              ? `${typingUsers[0].user_id} is typing…`
              : `${typingUsers.length} people are typing…`}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Scroll to latest */}
      {!isNearBottom && !loading && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <button
            onClick={scrollToEnd}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#10131a]/90 backdrop-blur px-3 py-1.5 text-xs text-white/80 hover:text-white hover:border-white/20 shadow-lg"
          >
            <ChevronDown className="h-4 w-4" />
            New messages
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-white/10 p-3 sm:p-4 bg-[#0D0F14]/80 backdrop-blur">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-white/20 transition-colors">
          <div className="flex items-end">
            <button
              className="p-3 sm:p-3.5 text-white/70 hover:text-white"
              aria-label="Attach file"
              title="Attach file"
              type="button"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onInput={autoGrow}
              rows={1}
              placeholder="Message the channel…"
              aria-label="Message input"
              className="flex-1 resize-none bg-transparent outline-none placeholder:text-white/40 text-white text-sm p-3 sm:p-3.5 leading-5 max-h-40"
            />

            <button
              className="p-3 sm:p-3.5 text-white/70 hover:text-white"
              aria-label="Add emoji"
              title="Add emoji"
              type="button"
            >
              <Smile className="h-5 w-5" />
            </button>

            <button
              onClick={handleSend}
              disabled={!draft.trim()}
              className={cx(
                "m-2 mr-2 sm:mr-2 rounded-lg px-3 py-2 inline-flex items-center gap-2 text-sm font-medium transition-opacity",
                draft.trim()
                  ? "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white hover:opacity-90"
                  : "bg-white/10 text-white/60 cursor-not-allowed"
              )}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
        <div className="mt-1.5 pl-12 text-[11px] text-white/40">
          Press <kbd className="px-1.5 py-0.5 rounded border border-white/20 text-white/70">Enter</kbd> to send •{" "}
          <kbd className="px-1.5 py-0.5 rounded border border-white/20 text-white/70">Shift</kbd>+<kbd className="px-1.5 py-0.5 rounded border border-white/20 text-white/70">Enter</kbd> for a new line
        </div>
      </div>
    </div>
  );
}
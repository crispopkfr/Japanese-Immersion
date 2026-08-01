import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { MangaDB } from "../db";
import {
  AnkiTemplate,
  AnkiCard,
  DEFAULT_CARD_TEMPLATE,
  exportCardsToApkg,
} from "../ankiUtils";
import { resolveMediaSrc, fetchAndCacheMedia, saveMedia } from "../mediaStore";
import { AudioPreviewPlayer } from "./AudioPreviewPlayer";

interface CardCreationPanelProps {
  initialWord?: string;
  initialSentence?: string;
}

export const CardCreationPanel: React.FC<CardCreationPanelProps> = ({
  initialWord = "",
  initialSentence = "",
}) => {
  const [cards, setCards] = useState<AnkiCard[]>([]);

  // Form state for creating / editing a card
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Status and delete states
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<"SUCCESSFUL!" | "FAILED!" | null>(null);

  // Telegram bot configuration state
  const [isConfiguringBot, setIsConfiguringBot] = useState<boolean>(false);
  const [telegramToken, setTelegramToken] = useState<string>(() => {
    return localStorage.getItem("subminer_telegram_token") || "";
  });
  const [telegramChatId, setTelegramChatId] = useState<string>(() => {
    return localStorage.getItem("subminer_telegram_chat_id") || "";
  });

  const isBotConfigured = Boolean(telegramToken.trim() && telegramChatId.trim());

  useEffect(() => {
    loadData();
    const handleCardCreated = () => loadData();
    window.addEventListener("subminer_card_created", handleCardCreated);
    return () => window.removeEventListener("subminer_card_created", handleCardCreated);
  }, []);

  const loadData = async () => {
    try {
      const loadedCards = await MangaDB.getCreatedCards();
      setCards(loadedCards);
    } catch (err) {
      console.error("Failed to load cards data:", err);
    }
  };

  const sortedCards = React.useMemo(() => {
    return [...cards].sort((a, b) => {
      let timeA = a.createdAt;
      if (!timeA && a.id) {
        const match = String(a.id).match(/(\d+)/);
        if (match) timeA = parseInt(match[1], 10);
      }
      let timeB = b.createdAt;
      if (!timeB && b.id) {
        const match = String(b.id).match(/(\d+)/);
        if (match) timeB = parseInt(match[1], 10);
      }
      if ((timeB || 0) !== (timeA || 0)) {
        return (timeB || 0) - (timeA || 0);
      }
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  }, [cards]);

  // Open editor for a new card
  const handleOpenNewCardForm = () => {
    const initialValues: Record<string, string> = {};
    DEFAULT_CARD_TEMPLATE.fields.forEach((fieldName) => {
      if (fieldName === "Word") {
        initialValues[fieldName] = initialWord;
      } else {
        initialValues[fieldName] = "";
      }
    });

    setFieldValues(initialValues);
    setEditingCardId(null);
    setIsEditing(true);
  };

  // Open editor for an existing card
  const handleEditCard = (card: AnkiCard) => {
    setEditingCardId(card.id);
    const existingValues: Record<string, string> = {};
    DEFAULT_CARD_TEMPLATE.fields.forEach((fieldName) => {
      existingValues[fieldName] = card.fields[fieldName] || "";
    });
    setFieldValues(existingValues);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingCardId(null);
    setFieldValues({});
  };

  const handleSaveCard = async () => {
    try {
      const cardToSave: AnkiCard = {
        id: editingCardId || `card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        templateId: DEFAULT_CARD_TEMPLATE.id,
        templateName: DEFAULT_CARD_TEMPLATE.name,
        fields: { ...fieldValues },
        createdAt: editingCardId ? cards.find((c) => c.id === editingCardId)?.createdAt || Date.now() : Date.now(),
      };

      await MangaDB.saveCreatedCard(cardToSave);
      setIsEditing(false);
      setEditingCardId(null);
      setFieldValues({});
      await loadData();
    } catch (err) {
      console.error("Failed to save card:", err);
      setErrorMessage("Failed to save card.");
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await MangaDB.deleteCreatedCard(cardId);
      setConfirmingDeleteId(null);
      await loadData();
    } catch (err) {
      console.error("Failed to delete card:", err);
    }
  };

  const handleToggleHideCard = async (cardId: string) => {
    try {
      await MangaDB.toggleCardHidden(cardId);
      await loadData();
    } catch (err) {
      console.error("Failed to toggle card hidden status:", err);
    }
  };

  // Clipboard paste handler for images
  const handleFieldPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, fieldName: string) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              const imgTag = `<img src="${dataUrl}">`;
              setFieldValues((prev) => ({
                ...prev,
                [fieldName]: prev[fieldName] ? `${prev[fieldName]}\n${imgTag}` : imgTag,
              }));
            };
            reader.readAsDataURL(blob);
          }
          return;
        }
      }
    }
  };

  // Helper to upload generated .apkg file to Telegram (Direct Telegram API first, fallback to server proxy)
  const sendToTelegram = async (blob: Blob, cardCount: number): Promise<{ success: boolean; error?: string }> => {
    const token = telegramToken.trim();
    const chatId = telegramChatId.trim();

    if (!token || !chatId) {
      return { success: false, error: "Bot Token or Chat ID is missing. Click 'CONFIGURE BOT' to set them up." };
    }

    const now = new Date();
    const exportedOn = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const exportTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const caption = `Deck Name: Immersion\nCards Exported: ${cardCount}\nExported On: ${exportedOn}\nExport Time: ${exportTime}`;

    // 1. Direct client-side upload to Telegram Bot API (works everywhere outside AI Studio, in PWAs, mobile, static hosts)
    try {
      const directFormData = new FormData();
      directFormData.append("chat_id", chatId);
      directFormData.append("caption", caption);
      directFormData.append("document", blob, "Immersion.apkg");

      const directUrl = `https://api.telegram.org/bot${token}/sendDocument`;
      const directRes = await fetch(directUrl, {
        method: "POST",
        body: directFormData,
      });

      if (directRes.ok) {
        return { success: true };
      }

      const errJson = await directRes.json().catch(() => ({}));
      const desc = errJson?.description || `Telegram API returned HTTP ${directRes.status}`;
      return { success: false, error: desc };
    } catch (directErr: any) {
      console.warn("Direct Telegram API call encountered network error, attempting fallback server proxy:", directErr);
    }

    // 2. Fallback path via backend proxy endpoint /api/send-telegram
    try {
      const serverFormData = new FormData();
      serverFormData.append("document", blob, "Immersion.apkg");
      serverFormData.append("deckName", "Immersion");
      serverFormData.append("cardCount", String(cardCount));
      serverFormData.append("exportedOn", exportedOn);
      serverFormData.append("exportTime", exportTime);
      serverFormData.append("caption", caption);
      serverFormData.append("botToken", token);
      serverFormData.append("chatId", chatId);

      const response = await fetch("/api/send-telegram", {
        method: "POST",
        body: serverFormData,
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errJson = await response.json().catch(() => ({}));
        const desc = errJson?.error || errJson?.details || `Server endpoint returned status ${response.status}`;
        console.error("Telegram endpoint error:", response.status, errJson);
        return { success: false, error: desc };
      }
    } catch (err: any) {
      console.error("Failed to send deck to Telegram via server proxy:", err);
      return { success: false, error: "Network error: Unable to connect to Telegram or server proxy." };
    }
  };

  // Handle exporting cards to .apkg file (Download locally ONLY)
  const handleExportApkg = async () => {
    const exportableCards = cards.filter((c) => !c.hidden);
    if (exportableCards.length === 0) {
      setErrorMessage(cards.length > 0 ? "All cards are hidden. Nothing to export." : "No cards created to export yet.");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    try {
      setIsExporting(true);
      const deckBlob = await exportCardsToApkg("Immersion", DEFAULT_CARD_TEMPLATE, exportableCards);

      // Download file locally
      const url = URL.createObjectURL(deckBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Immersion.apkg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Export failed:", err);
      setErrorMessage(err.message || "Failed to export .apkg file.");
    } finally {
      setIsExporting(false);
    }
  };

  // Handle sending cards to Telegram (Send via Telegram ONLY, no local download)
  const handleSendTelegram = async () => {
    const exportableCards = cards.filter((c) => !c.hidden);
    if (exportableCards.length === 0) {
      setErrorMessage(cards.length > 0 ? "All cards are hidden. Nothing to send." : "No cards created to send yet.");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    if (!isBotConfigured) {
      setIsConfiguringBot(true);
      setErrorMessage("Please configure your Telegram Bot Token and Chat ID first.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    try {
      setIsSending(true);
      setSendResult(null);
      setErrorMessage(null);

      const deckBlob = await exportCardsToApkg("Immersion", DEFAULT_CARD_TEMPLATE, exportableCards);
      const result = await sendToTelegram(deckBlob, exportableCards.length);

      if (result.success) {
        setSendResult("SUCCESSFUL!");
      } else {
        setSendResult("FAILED!");
        let errorHint = result.error || "Failed to send deck to Telegram.";
        const lower = errorHint.toLowerCase();
        if (lower.includes("chat not found")) {
          errorHint += " (Make sure you sent a message like /start to your bot in Telegram first!)";
        } else if (lower.includes("unauthorized")) {
          errorHint += " (Please check that your Telegram Bot Token is correct)";
        }
        setErrorMessage(`Telegram Error: ${errorHint}`);
      }
    } catch (err: any) {
      console.error("Telegram send failed:", err);
      setSendResult("FAILED!");
      setErrorMessage(`Telegram Send Error: ${err?.message || String(err)}`);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        setSendResult(null);
      }, 3500);
    }
  };

  return (
    <div className="bg-zinc-800 rounded-xl p-5 shadow-none text-zinc-300">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
            Cards {cards.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleExportApkg}
            disabled={cards.filter((c) => !c.hidden).length === 0 || isExporting || isSending}
            className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export created cards to .apkg for Anki"
          >
            <span>{isExporting ? "EXPORTING..." : "EXPORT"}</span>
          </button>

          {isBotConfigured && (
            <button
              onClick={handleSendTelegram}
              disabled={cards.filter((c) => !c.hidden).length === 0 || isExporting || isSending}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              title="Send created cards directly to Telegram bot"
            >
              <span>{isSending ? "SENDING..." : sendResult ? sendResult : "SEND"}</span>
            </button>
          )}

          <button
            onClick={() => setIsConfiguringBot((prev) => !prev)}
            className={`px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer font-bold font-mono text-xs border-none outline-none shrink-0 ${
              isConfiguringBot ? "text-white" : "text-zinc-400 hover:text-white"
            }`}
            title="Configure Telegram Bot Token & Chat ID"
          >
            <span>CONFIGURE BOT</span>
          </button>

          <button
            onClick={handleOpenNewCardForm}
            className="p-2 bg-zinc-900/50 hover:bg-zinc-700/30 border-none outline-none text-zinc-400 hover:text-white rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer h-9 w-9"
            title="Create New Card"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-2.5 mb-3 bg-red-950/50 border border-red-800/40 text-red-300 rounded text-xs font-mono">
          {errorMessage}
        </div>
      )}

      {/* Bot Configuration Panel */}
      {isConfiguringBot && (
        <div className="space-y-1.5 mb-3">
          <div className="w-full p-3 rounded-md bg-zinc-900/50 text-zinc-300 flex flex-col gap-1 border-none outline-none">
            <label className="text-[11px] font-mono font-bold text-zinc-400">
              TOKEN
            </label>
            <input
              type="text"
              value={telegramToken}
              onChange={(e) => {
                const val = e.target.value;
                setTelegramToken(val);
                localStorage.setItem("subminer_telegram_token", val);
              }}
              className="w-full bg-transparent text-xs text-zinc-200 font-sans border-none outline-none focus:outline-none focus:ring-0 transition-colors"
            />
          </div>
          <div className="w-full p-3 rounded-md bg-zinc-900/50 text-zinc-300 flex flex-col gap-1 border-none outline-none">
            <label className="text-[11px] font-mono font-bold text-zinc-400">
              ID
            </label>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => {
                const val = e.target.value;
                setTelegramChatId(val);
                localStorage.setItem("subminer_telegram_chat_id", val);
              }}
              className="w-full bg-transparent text-xs text-zinc-200 font-sans border-none outline-none focus:outline-none focus:ring-0 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Card Creation / Editing Form */}
      {isEditing && (
        <div className="p-4 mb-4 bg-zinc-900/50 rounded-lg space-y-3 border-none outline-none shadow-none">

          {/* Media Preview (only if media exists, no box or outlines or placeholders) */}
          {(() => {
            const picSrc = resolveMediaSrc(fieldValues["Picture"]);
            const wordAudioSrc = resolveMediaSrc(fieldValues["Word Audio"]);
            const sentenceAudioSrc = resolveMediaSrc(fieldValues["Sentence Audio"]);

            if (!picSrc && !wordAudioSrc && !sentenceAudioSrc) return null;

            return (
              <div className="flex flex-col gap-2 mb-3 shrink-0">
                {picSrc && (
                  <div className="relative w-full overflow-hidden rounded-lg flex items-center justify-center">
                    <img src={picSrc} alt="Captured frame preview" className="max-h-48 w-full object-contain rounded-lg" />
                  </div>
                )}
                {wordAudioSrc && (
                  <AudioPreviewPlayer src={wordAudioSrc} label="Word Audio" />
                )}
                {sentenceAudioSrc && (
                  <AudioPreviewPlayer src={sentenceAudioSrc} />
                )}
              </div>
            );
          })()}

          {/* Render all 14 fields in exact order */}
          <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
            {DEFAULT_CARD_TEMPLATE.fields.map((fieldName) => {
              const fieldValue = fieldValues[fieldName] || "";

              return (
                <div
                  key={fieldName}
                  className="flex flex-col gap-1"
                >
                  <label className="text-[11px] font-mono font-bold text-zinc-400">
                    {fieldName}
                  </label>
                  <div className="relative w-full">
                    <textarea
                      ref={(el) => {
                        if (el) {
                          el.style.height = "auto";
                          el.style.height = `${Math.max(32, el.scrollHeight)}px`;
                        }
                      }}
                      value={fieldValue}
                      onChange={(e) => {
                        setFieldValues((prev) => ({
                          ...prev,
                          [fieldName]: e.target.value,
                        }));
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.max(32, e.target.scrollHeight)}px`;
                      }}
                      onPaste={(e) => handleFieldPaste(e, fieldName)}
                      rows={1}
                      className="w-full bg-zinc-900/50 rounded-md px-3 py-2 text-xs text-zinc-200 font-sans leading-normal border-none outline-none focus:outline-none focus:ring-0 transition-colors resize-none overflow-hidden"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              <span>CANCEL</span>
            </button>
            <button
              onClick={handleSaveCard}
              className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
            >
              <span>SAVE</span>
            </button>
          </div>
        </div>
      )}

      {/* List of Created Cards (styled just like Dictionaries list) */}
      {sortedCards.length > 0 && (
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
          {sortedCards
            .filter((card) => card.id !== editingCardId)
            .map((card) => {
            const isConfirming = confirmingDeleteId === card.id;
            const wordVal = card.fields["Word"] || "Untitled Card";
            const isHidden = !!card.hidden;

            return (
              <div
                key={card.id}
                className={`w-full text-left p-3 rounded-md bg-zinc-900/50 hover:bg-zinc-900 text-zinc-300 transition-all flex items-center justify-between gap-3 border-none outline-none relative overflow-hidden ${
                  isHidden ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <p className={`text-sm font-sans font-semibold leading-relaxed truncate text-zinc-400 ${isHidden ? "line-through" : ""}`}>
                    {wordVal}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleHideCard(card.id)}
                    className="p-1.5 text-center transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 flex items-center justify-center border-none outline-none"
                    title={isHidden ? "Show card" : "Hide card"}
                  >
                    <span className="material-symbols-rounded !text-[18px] !w-[18px] !h-[18px] !leading-[18px]">
                      {isHidden ? "visibility_off" : "visibility"}
                    </span>
                  </button>

                  {!isConfirming ? (
                    <>
                      <button
                        onClick={() => handleEditCard(card)}
                        className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                      >
                        <span>EDIT</span>
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(card.id)}
                        className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                      >
                        <span>DELETE</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                      >
                        <span>YES</span>
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(null)}
                        className="px-3 py-1.5 text-center uppercase transition-all rounded-md cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-700/30 font-bold font-mono text-xs border-none outline-none"
                      >
                        <span>NO</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


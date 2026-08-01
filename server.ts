import "dotenv/config";
import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";

const upload = multer({
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max limit
  },
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API endpoint for uploading generated Anki deck (.apkg) to Telegram
  app.post("/api/send-telegram", upload.single("document"), async (req: express.Request, res: express.Response) => {
    try {
      const botToken = req.body.botToken || process.env.TELEGRAM_BOT_TOKEN;
      const chatId = req.body.chatId || process.env.TELEGRAM_CHAT_ID;

      if (!botToken || !chatId) {
        console.error("Missing Telegram botToken or chatId.");
        return res.status(400).json({ error: "Telegram Bot Token or Chat ID was not provided." });
      }

      let fileBuffer: Buffer | null = null;
      let fileName = "deck.apkg";

      // Handle file received via multipart/form-data
      if (req.file && req.file.buffer) {
        fileBuffer = req.file.buffer;
        fileName = req.file.originalname || fileName;
      }
      // Handle file received via JSON base64 fallback
      else if (req.body && req.body.fileBase64) {
        fileBuffer = Buffer.from(req.body.fileBase64, "base64");
        fileName = req.body.fileName || fileName;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: "Invalid or empty document file provided." });
      }

      const deckName = req.body.deckName || "Immersion";
      const cardCount = req.body.cardCount || "0";
      const now = new Date();
      const exportedOn = req.body.exportedOn || now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const exportTime = req.body.exportTime || now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

      const caption = req.body.caption || `Deck Name: ${deckName}\nCards Exported: ${cardCount}\nExported On: ${exportedOn}\nExport Time: ${exportTime}`;

      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;

      const telegramFormData = new FormData();
      telegramFormData.append("chat_id", chatId);
      telegramFormData.append("caption", caption);

      const file = new File([fileBuffer], fileName, { type: "application/octet-stream" });
      telegramFormData.append("document", file);

      const telegramResponse = await fetch(telegramUrl, {
        method: "POST",
        body: telegramFormData,
      });

      if (!telegramResponse.ok) {
        const errorDetails = await telegramResponse.text();
        let parsedDesc = "";
        try {
          const parsed = JSON.parse(errorDetails);
          parsedDesc = parsed?.description || "";
        } catch (_) {}

        console.error("Telegram API Error response received:", telegramResponse.status, errorDetails);
        return res.status(telegramResponse.status).json({
          error: parsedDesc || "Telegram API failed to accept document",
          status: telegramResponse.status,
          details: errorDetails,
        });
      }

      const responseData = await telegramResponse.json();
      return res.json({
        success: true,
        message: "Deck successfully sent to Telegram!",
        telegramResponse: responseData,
      });
    } catch (err: any) {
      console.error("Error sending document to Telegram:", err?.message || err);
      return res.status(500).json({
        error: "Unexpected server error during Telegram upload.",
        details: err?.message || String(err),
      });
    }
  });

  // Ensure Service Worker is not cached aggressively and has root scope permissions
  app.get("/sw.js", (req, res, next) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
    next();
  });

  // Ensure manifest has correct content-type header for strict browsers
  app.get(["/manifest.webmanifest", "/manifest.json"], (req, res, next) => {
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    next();
  });


  // Vite middleware for dev mode vs static serving in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

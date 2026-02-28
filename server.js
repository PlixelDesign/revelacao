const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const GUESSES_FILE = path.join(ROOT, "palpites_bebe.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function normalizeGuessesStore(parsed) {
  if (parsed && Array.isArray(parsed.submissions)) {
    return {
      updatedAt: parsed.updatedAt || null,
      submissions: parsed.submissions,
    };
  }

  if (parsed && Array.isArray(parsed.players)) {
    const shouldKeepLegacyEntry = Boolean(parsed.savedAt) || parsed.players.length > 0;

    return {
      updatedAt: parsed.savedAt || null,
      submissions: shouldKeepLegacyEntry
        ? [
            {
              savedAt: parsed.savedAt || null,
              players: parsed.players,
            },
          ]
        : [],
    };
  }

  return {
    updatedAt: null,
    submissions: [],
  };
}

function readGuessesStore(callback) {
  fs.readFile(GUESSES_FILE, "utf8", (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        callback(null, {
          updatedAt: null,
          submissions: [],
        });
        return;
      }

      callback(error);
      return;
    }

    try {
      const parsed = JSON.parse(content);
      callback(null, normalizeGuessesStore(parsed));
    } catch (parseError) {
      callback(parseError);
    }
  });
}

function getSafePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const targetPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const resolvedPath = path.normalize(path.join(ROOT, targetPath));

  if (!resolvedPath.startsWith(ROOT)) {
    return null;
  }

  return resolvedPath;
}

function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Arquivo nao encontrado." });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

function handleSaveGuesses(req, res) {
  let rawBody = "";

  req.on("data", (chunk) => {
    rawBody += chunk;

    if (rawBody.length > 1024 * 1024) {
      req.destroy();
    }
  });

  req.on("end", () => {
    let players;

    try {
      players = JSON.parse(rawBody || "[]");
    } catch {
      sendJson(res, 400, { error: "JSON invalido." });
      return;
    }

    if (!Array.isArray(players)) {
      sendJson(res, 400, { error: "O corpo deve ser uma lista de palpites." });
      return;
    }

    readGuessesStore((readError, store) => {
      if (readError) {
        sendJson(res, 500, { error: "Nao foi possivel ler o arquivo JSON." });
        return;
      }

      const savedAt = new Date().toISOString();
      const nextStore = {
        updatedAt: savedAt,
        submissions: [
          ...store.submissions,
          {
            savedAt,
            players,
          },
        ],
      };

      fs.writeFile(GUESSES_FILE, JSON.stringify(nextStore, null, 2), "utf8", (writeError) => {
        if (writeError) {
          sendJson(res, 500, { error: "Nao foi possivel salvar o arquivo JSON." });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          file: path.basename(GUESSES_FILE),
          submissions: nextStore.submissions.length,
        });
      });
    });
  });
}

function handleReadGuesses(res) {
  readGuessesStore((error, store) => {
    if (error) {
      sendJson(res, 500, { error: "Nao foi possivel ler o arquivo JSON." });
      return;
    }

    sendJson(res, 200, store);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && requestUrl.pathname === "/api/palpites") {
    handleSaveGuesses(req, res);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/palpites") {
    handleReadGuesses(res);
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Metodo nao permitido." });
    return;
  }

  const filePath = getSafePath(requestUrl.pathname);

  if (!filePath) {
    sendJson(res, 403, { error: "Acesso negado." });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { error: "Arquivo nao encontrado." });
      return;
    }

    serveStaticFile(filePath, res);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
  console.log(`Salvando palpites em: ${GUESSES_FILE}`);
});

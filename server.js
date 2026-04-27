const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
    console.error("Erro: defina GROQ_API_KEY como variável de ambiente.");
    process.exit(1);
}

const contentTypeMap = {
    ".html": "text/html; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".js": "text/javascript; charset=UTF-8",
};

function sendFile(res, filePath) {
    const ext = path.extname(filePath);
    const contentType = contentTypeMap[ext] || "application/octet-stream";
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
            return res.end("Arquivo não encontrado");
        }
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    });
}

function proxyOpenAi(req, res) {
    let body = "";
    req.on("data", chunk => {
        body += chunk;
    });
    req.on("end", () => {
        if (!body) {
            res.writeHead(400, { "Content-Type": "application/json; charset=UTF-8" });
            return res.end(JSON.stringify({ error: "Requisição sem corpo" }));
        }

        const options = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Length": Buffer.byteLength(body),
            },
        };

        const proxyReq = https.request("https://api.groq.com/openai/v1/chat/completions", options, proxyRes => {
            const headers = { ...proxyRes.headers };
            res.writeHead(proxyRes.statusCode || 500, headers);
            proxyRes.pipe(res);
        });

        proxyReq.on("error", error => {
            res.writeHead(500, { "Content-Type": "application/json; charset=UTF-8" });
            res.end(JSON.stringify({ error: error.message }));
        });

        proxyReq.write(body);
        proxyReq.end();
    });
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);

    if (req.method === "POST" && parsedUrl.pathname === "/api/chat/completions") {
        return proxyOpenAi(req, res);
    }

    if (req.method === "GET") {
        const routeMap = {
            "/": "index.html",
            "/index.html": "index.html",
            "/styles.css": "styles.css",
            "/scripts.js": "scripts.js",
        };

        const fileName = routeMap[parsedUrl.pathname];
        if (fileName) {
            return sendFile(res, path.join(__dirname, fileName));
        }
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("Rota não encontrada");
});

server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

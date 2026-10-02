// Auth flow OAuth2 pour google-drive-enhanced MCP
// Usage : node auth-drive.mjs
// Prerequis : deposer le JSON client OAuth (type "Application de bureau")
//             telecharge depuis console.cloud.google.com sous gcp-oauth.keys.json
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import http from "http";
import { exec } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_PATH = path.join(__dirname, "gcp-oauth.keys.json");
const CRED_PATH = path.join(__dirname, ".gdrive-server-credentials.json");
const ENV_PATH = path.join(__dirname, ".env");
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
];

if (!fs.existsSync(KEYS_PATH)) {
  console.error(`Fichier manquant : ${KEYS_PATH}`);
  console.error("Telecharge le client OAuth (type Desktop) depuis console.cloud.google.com");
  process.exit(1);
}

const keys = JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
const inst = keys.installed || keys.web;
const PORT = 3847;
const oauth2 = new google.auth.OAuth2(
  inst.client_id,
  inst.client_secret,
  `http://localhost:${PORT}/callback`
);

const authUrl = oauth2.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") return res.end("ok");
  const code = url.searchParams.get("code");
  if (!code) return res.end("Pas de code recu.");
  try {
    const { tokens } = await oauth2.getToken(code);
    fs.writeFileSync(CRED_PATH, JSON.stringify(tokens, null, 2));
    const env = [
      `GOOGLE_CLIENT_ID=${inst.client_id}`,
      `GOOGLE_CLIENT_SECRET=${inst.client_secret}`,
      `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token || ""}`,
    ].join("\n");
    fs.writeFileSync(ENV_PATH, env + "\n");
    res.end("Authentification reussie ! Tu peux fermer cet onglet.");
    console.log("OK - credentials sauvegardes :", CRED_PATH);
    console.log("Scopes accordes:", tokens.scope);
    server.close();
    process.exit(0);
  } catch (e) {
    res.end("Erreur: " + e.message);
    console.error("Echec echange token:", e.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`En attente de l'autorisation sur http://localhost:${PORT}`);
  console.log("Ouverture du navigateur...");
  exec(`start "" "${authUrl}"`);
});
setTimeout(() => { console.error("Timeout 5min"); process.exit(1); }, 300000);

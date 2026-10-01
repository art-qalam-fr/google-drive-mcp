#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, ".gdrive-server-credentials.json");
const ENV_PATH = path.join(__dirname, ".env");
const KEYS_PATH = path.join(__dirname, "gcp-oauth.keys.json");

// Chargement de la configuration (chemin absolu : le cwd du parent peut differer)
dotenv.config({ path: ENV_PATH });

// Récupération des identifiants
let clientId = process.env.GOOGLE_CLIENT_ID;
let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
let refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

// Fallback sur le fichier de cles OAuth (client_id / client_secret)
if ((!clientId || !clientSecret) && fs.existsSync(KEYS_PATH)) {
  try {
    const k = JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
    const inst = k.installed || k.web || k;
    clientId = clientId || inst.client_id;
    clientSecret = clientSecret || inst.client_secret;
  } catch (e) {
    console.error("Erreur lecture gcp-oauth.keys.json:", e);
  }
}

// Essai de lecture depuis le fichier JSON si les variables d'env manquent
if (!clientId || !clientSecret || !refreshToken) {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
      clientId = clientId || creds.client_id || (process.env.GOOGLE_CLIENT_ID); 
      clientSecret = clientSecret || creds.client_secret || (process.env.GOOGLE_CLIENT_SECRET);
      refreshToken = refreshToken || creds.refresh_token;
      
      // Cas particulier où le JSON a une structure différente
      if (!refreshToken && creds.access_token) {
         refreshToken = creds.refresh_token;
      }
    }
  } catch (error) {
    console.error("Erreur lecture credentials:", error);
  }
}

if (!clientId || !clientSecret || !refreshToken) {
  console.error("Erreur: Identifiants Google manquants (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN).");
  process.exit(1);
}

// googleapis est charge a la demande (import ~13s) pour un handshake MCP instantane
let _drive;
async function getDrive() {
  if (_drive) return _drive;
  const { google } = await import("googleapis");
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  _drive = google.drive({ version: "v3", auth });
  return _drive;
}

const server = new Server(
  {
    name: "google-drive-enhanced",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Définition des Outils ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_files",
        description: "Lister les fichiers et dossiers dans un répertoire Google Drive (par défaut 'root')",
        inputSchema: {
          type: "object",
          properties: {
            folder_id: { type: "string", description: "ID du dossier (optionnel, défaut: root)" },
            page_size: { type: "number", description: "Nombre max de résultats (défaut: 20)" },
          },
        },
      },
      {
        name: "search_files",
        description: "Rechercher des fichiers par nom",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Terme de recherche" },
          },
          required: ["query"],
        },
      },
      {
        name: "read_file",
        description: "Lire le contenu textuel d'un fichier Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            file_id: { type: "string", description: "ID du fichier à lire" },
          },
          required: ["file_id"],
        },
      },
      {
        name: "write_file",
        description: "Créer ou mettre à jour un fichier texte sur Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nom du fichier" },
            content: { type: "string", description: "Contenu texte du fichier" },
            parent_id: { type: "string", description: "ID du dossier parent (optionnel, pour création)" },
            file_id: { type: "string", description: "ID du fichier (optionnel, pour mise à jour)" },
            mime_type: { type: "string", description: "Type MIME (défaut: text/plain)" }
          },
          required: ["name", "content"],
        },
      },
      {
        name: "create_folder",
        description: "Créer un nouveau dossier",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nom du dossier" },
            parent_id: { type: "string", description: "ID du dossier parent (optionnel, défaut: root)" },
          },
          required: ["name"],
        },
      },
      {
        name: "upload_file",
        description: "Uploader un fichier local vers Google Drive (binaires supportés : .pth, .onnx, .zip...)",
        inputSchema: {
          type: "object",
          properties: {
            local_path: { type: "string", description: "Chemin local du fichier à uploader" },
            name: { type: "string", description: "Nom sur Drive (optionnel, défaut: nom du fichier)" },
            parent_id: { type: "string", description: "ID du dossier parent (optionnel)" },
            mime_type: { type: "string", description: "Type MIME (optionnel, défaut: octet-stream)" },
            file_id: { type: "string", description: "ID d'un fichier existant pour mise à jour (optionnel)" },
          },
          required: ["local_path"],
        },
      },
      {
        name: "download_file",
        description: "Télécharger un fichier Drive vers un chemin local (binaires supportés)",
        inputSchema: {
          type: "object",
          properties: {
            file_id: { type: "string", description: "ID du fichier Drive à télécharger" },
            local_path: { type: "string", description: "Chemin local de destination" },
          },
          required: ["file_id", "local_path"],
        },
      },
      {
        name: "delete_file",
        description: "Supprimer un fichier ou un dossier (envoyer à la corbeille)",
        inputSchema: {
          type: "object",
          properties: {
            file_id: { type: "string", description: "ID du fichier/dossier à supprimer" },
          },
          required: ["file_id"],
        },
      },
    ],
  };
});

// --- Implémentation des Outils ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const drive = await getDrive();

    if (name === "list_files") {
      const folderId = args.folder_id || "root";
      const pageSize = args.page_size || 20;
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: pageSize,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data.files, null, 2) }],
      };
    }

    if (name === "search_files") {
      const query = args.query;
      const res = await drive.files.list({
        q: `name contains '${query}' and trashed = false`,
        pageSize: 20,
        fields: "files(id, name, mimeType, parents)",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data.files, null, 2) }],
      };
    }

    if (name === "read_file") {
      const fileId = args.file_id;
      const meta = await drive.files.get({ fileId, fields: "mimeType, name" });
      
      let content = "";
      if (meta.data.mimeType.startsWith("application/vnd.google-apps.")) {
        if (meta.data.mimeType === "application/vnd.google-apps.document") {
            const res = await drive.files.export({ fileId, mimeType: "text/plain" });
            content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        } else if (meta.data.mimeType === "application/vnd.google-apps.spreadsheet") {
            const res = await drive.files.export({ fileId, mimeType: "text/csv" });
            content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        } else {
            return { isError: true, content: [{ type: "text", text: `Type de fichier Google non supporté pour la lecture directe: ${meta.data.mimeType}` }] };
        }
      } else {
        const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
        const chunks = [];
        for await (const chunk of res.data) {
            chunks.push(chunk);
        }
        content = Buffer.concat(chunks).toString("utf8");
      }

      return {
        content: [{ type: "text", text: content }],
      };
    }

    if (name === "write_file") {
      const { name, content, parent_id, file_id, mime_type } = args;
      const fileMetadata = {
        name: name,
        mimeType: mime_type || "text/plain",
      };
      if (parent_id) {
        fileMetadata.parents = [parent_id];
      }

      const media = {
        mimeType: mime_type || "text/plain",
        body: content,
      };

      let res;
      if (file_id) {
        res = await drive.files.update({
          fileId: file_id,
          resource: fileMetadata,
          media: media,
          fields: "id, name",
        });
      } else {
        res = await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: "id, name",
        });
      }

      return {
        content: [{ type: "text", text: `Fichier ${file_id ? 'mis à jour' : 'créé'} avec succès: ID ${res.data.id}` }],
      };
    }

    if (name === "create_folder") {
      const { name, parent_id } = args;
      const fileMetadata = {
        name: name,
        mimeType: "application/vnd.google-apps.folder",
      };
      if (parent_id) {
        fileMetadata.parents = [parent_id];
      }
      const res = await drive.files.create({
        resource: fileMetadata,
        fields: "id",
      });
      return {
        content: [{ type: "text", text: `Dossier créé: ID ${res.data.id}` }],
      };
    }

    if (name === "upload_file") {
      const { local_path, name: fname, parent_id, mime_type, file_id } = args;
      const fileMetadata = { name: fname || path.basename(local_path) };
      if (parent_id) fileMetadata.parents = [parent_id];
      const media = {
        mimeType: mime_type || "application/octet-stream",
        body: fs.createReadStream(local_path),
      };
      let res;
      if (file_id) {
        res = await drive.files.update({ fileId: file_id, resource: fileMetadata, media, fields: "id, name, size" });
      } else {
        res = await drive.files.create({ resource: fileMetadata, media, fields: "id, name, size" });
      }
      return {
        content: [{ type: "text", text: `Fichier ${file_id ? 'mis à jour' : 'uploadé'}: ${res.data.name} (ID ${res.data.id}, ${res.data.size || '?'} octets)` }],
      };
    }

    if (name === "download_file") {
      const { file_id, local_path } = args;
      const { pipeline } = await import("stream/promises");
      const res = await drive.files.get({ fileId: file_id, alt: "media" }, { responseType: "stream" });
      const parent = path.dirname(local_path);
      if (parent && !fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      await pipeline(res.data, fs.createWriteStream(local_path));
      const size = fs.statSync(local_path).size;
      return {
        content: [{ type: "text", text: `Téléchargé: ${local_path} (${size} octets)` }],
      };
    }

    if (name === "delete_file") {
      const { file_id } = args;
      await drive.files.update({
        fileId: file_id,
        resource: { trashed: true },
      });
      return {
        content: [{ type: "text", text: `Fichier/Dossier ${file_id} déplacé vers la corbeille.` }],
      };
    }

    throw new Error(`Outil inconnu: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Erreur Google Drive API: ${error.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Serveur Google Drive MCP Enrichi démarré sur STDIO");

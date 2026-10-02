<p align="center">
  <img src="https://raw.githubusercontent.com/art-qalam-fr/Hephaistos-Kit/main/logo/hephaistos-kit_banderole.jfif" alt="Hephaistos-Kit" width="640"/>
</p>

> Ce dépôt est un **composant MCP du [Hephaistos-Kit](https://github.com/art-qalam-fr/Hephaistos-Kit)** —
> utilisable seul, mais conçu pour être cloné en sous-module et installé via `mcp/install.ps1`.
>
> ✍️ Élaboré par **art-qalam-fr**.

---

# google-drive-mcp

Serveur MCP **Google Drive enrichi** : lister, lire, rechercher et envoyer
des fichiers sur Drive depuis un agent.

## Installation

```bash
npm install
```

## Configuration (setup manuel requis)

1. `gcp-oauth.keys.json` — credentials OAuth créés dans la console GCP
   (Drive API activée), placé à la racine du serveur.
2. `get-refresh-token.ps1` — exécuter pour obtenir le refresh token et
   générer `.gdrive-server-credentials.json`.

> ⚠️ Ces deux fichiers sont des **secrets** : ils sont gitignorés et ne
> doivent jamais être commités.

## Outils exposés

- Recherche et listing de fichiers Drive
- Lecture de contenu (docs, sheets, pdf…)
- Upload de fichiers

Licence MIT.

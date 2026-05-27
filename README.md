<div align="center">

<img src="assets/icon.png" width="96" height="96" style="border-radius:20px" alt="Papillon Logo">

# Papillon Desktop — Windows

**L'application scolaire Papillon, version native Windows.**  
Notes, cours, devoirs, cantine et vie scolaire — tout en un seul endroit.

[![Version](https://img.shields.io/badge/version-1.0.0-22c55e?style=flat-square&logo=github)](https://github.com/nathbu92/papillon-desktop/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078d4?style=flat-square&logo=windows)](https://github.com/nathbu92/papillon-desktop/releases/latest)
[![Electron](https://img.shields.io/badge/Electron-31-47848f?style=flat-square&logo=electron)](https://www.electronjs.org)
[![License](https://img.shields.io/badge/license-MIT-f0f7f1?style=flat-square)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/nathbu92/papillon-desktop/build-windows.yml?style=flat-square&label=build&logo=github-actions)](https://github.com/nathbu92/papillon-desktop/actions)

[**⬇️ Télécharger**](https://github.com/nathbu92/papillon-desktop/releases/latest) · [**🐛 Signaler un bug**](https://github.com/nathbu92/papillon-desktop/issues) · [**💡 Suggérer une fonctionnalité**](https://github.com/nathbu92/papillon-desktop/issues/new)

---

![Screenshot de l'interface Papillon Desktop](https://raw.githubusercontent.com/nathbu92/papillon-desktop/main/assets/screenshot.png)

</div>

---

## ✨ Fonctionnalités

| Page | Contenu |
|---|---|
| 🏠 **Accueil** | Résumé du jour — cours, devoirs en attente, dernières notes, absences |
| 📅 **Emploi du temps** | Cours semaine par semaine, statuts (annulé, prof. absent, évaluation…) |
| 📝 **Tâches** | Devoirs groupés par date de rendu, cochage synchronisé avec Pronote |
| 📊 **Notes** | Groupées par matière, moyenne générale + classe, toutes les périodes |
| 📣 **Actualités** | Grille de cartes, badge non-lu, contenu complet, pièces jointes |
| 📋 **Vie scolaire** | Absences, retards, punitions, observations — par période |
| 🍽️ **Cantine** | Menu de la semaine, déjeuner + dîner, allergènes |
| ⚙️ **Paramètres** | Thèmes, taille de texte, auto-refresh, mise à jour |

### 🎨 Personnalisation
- **8 couleurs d'accentuation** — vert, bleu, violet, ambre, rouge, rose, teal, orange
- **4 tailles de texte** — S / M / L / XL
- **Sidebar compacte** — mode icônes uniquement
- **Auto-refresh configurable** — 5, 10, 15 ou 30 minutes

### 🔄 Mises à jour automatiques
- Vérification au démarrage et toutes les 30 minutes
- Popup de mise à jour avec barre de progression de téléchargement
- Installation en un clic directement depuis l'app

---

## 📥 Installation

### Option 1 — Installateur (recommandé)
1. Télécharge **`Papillon-Setup-1.0.0.exe`** depuis les [Releases](https://github.com/nathbu92/papillon-desktop/releases/latest)
2. Lance l'installateur et suis les étapes
3. Papillon apparaît dans le menu Démarrer et sur le bureau

### Option 2 — Portable
1. Télécharge **`Papillon-1.0.0-portable.exe`**
2. Lance directement — aucune installation requise

> ⚠️ **Windows SmartScreen** peut afficher un avertissement car le `.exe` n'est pas signé.  
> Clique **"Informations complémentaires"** → **"Exécuter quand même"** pour continuer.

---

## 🔐 Connexion

### PRONOTE (recommandé)

L'app se connecte **directement au serveur Pronote de ton établissement** — tes identifiants ne transitent jamais par un serveur tiers.

1. Lance Papillon → écran de connexion → **PRONOTE**
2. **Recherche ton établissement** par ville, code postal, ou 📍 géolocalisation
3. Sélectionne ton lycée dans la liste
4. Une **fenêtre de connexion Pronote** s'ouvre — connecte-toi normalement avec tes identifiants habituels (ENT, identifiant/mot de passe)
5. La connexion est **détectée automatiquement** — la fenêtre se ferme et l'app se charge

> 💡 La session est sauvegardée localement. Tu n'as pas besoin de te reconnecter à chaque lancement.

### Services supportés
| Service | Statut |
|---|---|
| ![Pronote](https://img.shields.io/badge/PRONOTE-✅%20Disponible-22c55e?style=flat-square) | Connexion via ENT ou URL directe |
| ![EcoleDirecte](https://img.shields.io/badge/ÉcoleDirecte-🚧%20Bientôt-fb923c?style=flat-square) | Prochaine version |
| ![Skolengo](https://img.shields.io/badge/Skolengo-📱%20Mobile%20uniquement-60a5fa?style=flat-square) | Disponible sur [Papillon Mobile](https://getpapillon.xyz) |

---

## 🛠️ Build local

### Prérequis
- **Node.js 20+**
- **npm**
- Windows 10/11 (ou cross-compile depuis Linux/macOS)

### Installation
```bash
git clone https://github.com/nathbu92/papillon-desktop.git
cd papillon-desktop
npm install
```

### Lancer en développement
```bash
npm start
```

### Construire le `.exe`
```bash
npm run build
```

Les fichiers générés se trouvent dans `dist/` :
- `Papillon Setup 1.0.0.exe` — installateur NSIS
- `Papillon-1.0.0-portable.exe` — version portable

---

## 🚀 CI/CD — GitHub Actions

Le workflow [`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml) se déclenche automatiquement sur :
- **Push sur `main`** — build et upload des artefacts
- **Tag `v*`** — build + création d'une Release GitHub avec les `.exe`

### Créer une release
```bash
# Met à jour la version dans package.json, puis :
git add package.json
git commit -m "chore: bump version to 1.0.1"
git tag v1.0.1
git push origin main --tags
```

GitHub Actions construit le `.exe` et crée la Release automatiquement.  
Les utilisateurs qui ont l'app installée reçoivent une **notification de mise à jour** au prochain démarrage.

---

## 📁 Structure du projet

```
papillon-desktop/
├── src/
│   ├── main.js              # Processus principal Electron
│   ├── preload.js           # Bridge sécurisé renderer ↔ main
│   ├── preload-update.js    # Bridge pour la fenêtre de MAJ
│   ├── index.html           # Interface principale (HTML/CSS/JS)
│   └── update.html          # Popup de mise à jour
├── assets/
│   ├── icon.ico             # Icône Windows
│   ├── icon.png             # Icône app
│   ├── service_pronote.png  # Logo Pronote
│   ├── service_ed.png       # Logo ÉcoleDirecte
│   └── service_skolengo.png # Logo Skolengo
├── .github/
│   └── workflows/
│       └── build-windows.yml # CI/CD GitHub Actions
└── package.json
```

---

## 🔧 Stack technique

| Composant | Technologie |
|---|---|
| Framework desktop | [Electron 31](https://www.electronjs.org) |
| API Pronote | [Pawnote](https://github.com/LiterateInk/Pawnote.js) |
| Recherche établissement | Pawnote `geolocation` + Nominatim |
| Build | [electron-builder 24](https://www.electron.build) |
| CI/CD | GitHub Actions |
| Interface | HTML / CSS / JS vanilla |

---

## 🔒 Confidentialité & Sécurité

- ✅ **Aucune donnée collectée** — tout reste sur ton appareil
- ✅ **Connexion directe** au serveur Pronote de ton établissement
- ✅ **Token stocké localement** dans `localStorage` (chiffré par Electron)
- ✅ **Aucun serveur intermédiaire** — l'app est un client Pronote natif
- ✅ **Open-source** — le code est entièrement auditable

---

## 📄 Licence

Distribué sous licence **MIT**. Voir [`LICENSE`](LICENSE) pour plus d'informations.

---

## 🙏 Crédits

- [**Papillon**](https://getpapillon.xyz) — Le projet original open-source (iOS / Android)
- [**Pawnote**](https://github.com/LiterateInk/Pawnote.js) — Client Pronote en JavaScript
- [**LiterateInk**](https://github.com/LiterateInk) — Mainteneurs de Pawnote

---

<div align="center">

Fait avec 💚 par [nathbu92](https://github.com/nathbu92)  
Inspiré par le projet [Papillon](https://getpapillon.xyz) — open-source & libre

</div>

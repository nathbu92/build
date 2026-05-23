# Papillon — Version Windows (Electron)

Cette branche ajoute le support **Windows desktop** via Electron au projet Papillon (React Native / Expo).

## 🪟 Téléchargement

Les fichiers `.exe` sont générés automatiquement par GitHub Actions à chaque push sur `main` ou lors d'un tag `v*`.

👉 **[Télécharger la dernière version](../../releases/latest)**

Deux formats disponibles :
- `Papillon-Setup.exe` — Installateur NSIS (recommandé)
- `Papillon-*-portable.exe` — Version portable, sans installation

---

## 🛠 Build local

### Prérequis
- Node.js 20+
- npm

### Installation
```bash
npm install --legacy-peer-deps
```

### Lancer en développement
```bash
# Lance expo web + electron en parallèle
npm run electron:dev
```

### Construire le .exe
```bash
# 1. Build l'app web
# 2. Package avec electron-builder
npm run electron:build
```

Le `.exe` sera dans le dossier `dist-electron/`.

---

## 🔄 GitHub Actions

Le workflow `.github/workflows/build-windows.yml` :

1. Se déclenche sur push `main` ou tag `v*`
2. Lance `expo export --platform web` pour générer le build web statique
3. Lance `electron-builder --win --x64` pour créer le `.exe`
4. Upload les artefacts dans l'onglet **Actions** → **Artifacts**
5. Crée une **Release GitHub** automatique si le commit est un tag `vX.X.X`

### Créer une release

```bash
git tag v8.4.2
git push origin v8.4.2
```

---

## 📁 Structure ajoutée

```
electron/
  main.js        # Processus principal Electron
  preload.js     # Script preload sécurisé
.github/
  workflows/
    build-windows.yml   # CI/CD GitHub Actions
```

---

## ⚠️ Notes

- L'app tourne sur le **build web d'Expo** (expo export web), pas en React Native natif
- Certaines APIs natives (notifications push, caméra, etc.) peuvent ne pas fonctionner en version desktop
- Windows peut afficher un avertissement SmartScreen sur les `.exe` non signés — cliquer "Informations complémentaires" → "Exécuter quand même"

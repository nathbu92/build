# PARKOUR-PRO — Desktop

Application Electron de gestion de compétitions de parkour.

---

## Lancer en développement

```bash
npm install
npm start
```

---

## Compiler (Windows)

```bash
npm run build:win
```

---

## Personnalisation du logo / icône

Avant de compiler, place tes fichiers dans `src/assets/` :

| Fichier                        | Usage                                               | Dimensions requises        |
|-------------------------------|-----------------------------------------------------|----------------------------|
| `icon.ico`                    | Icône exécutable + barre des tâches + raccourci    | Multi-tailles (256×256 min)|
| `icon.png`                    | Icône runtime (affiché par Electron au démarrage)  | 256×256 px (PNG)           |
| `installer-sidebar.bmp`       | Panneau latéral gauche dans l'installateur NSIS    | **164×314 px** (BMP 24bit) |
| `installer-header.bmp`        | Bandeau en haut de chaque page NSIS               | **150×57 px** (BMP 24bit)  |

### Comment créer ces fichiers

**icon.ico** — Utilise convertico.com ou Inkscape.
Le .ico doit contenir les tailles : 16, 32, 48, 64, 128, 256 px.

**icon.png** — Export carré de ton logo, fond transparent recommandé.

**installer-sidebar.bmp** (164×314) :
- Fond sombre (#0a0a0f ou similaire)
- Ton logo en haut, texte PARKOUR-PRO en dessous
- BMP 24bit sans alpha

**installer-header.bmp** (150×57) :
- Format paysage, bandeau fin
- Logo + nom de l'app

Avec ImageMagick :
```bash
magick logo.png -resize 164x314 -background "#0a0a0f" -gravity north -extent 164x314 installer-sidebar.bmp
magick logo.png -resize 80x57  -background "#0a0a0f" -gravity west   -extent 150x57  installer-header.bmp
```

---

## Splash screen

Le splash s'affiche automatiquement au démarrage (src/splash.html).
Il se ferme dès que la fenêtre principale est prête, avec un minimum de 2,5 secondes.

Pour changer la durée minimum, modifie dans main.js :
```js
const remaining = Math.max(0, 2500 - elapsed); // ← durée en ms
```

---

## Structure

```
parkour-pro-desktop/
├── main.js              ← Process principal Electron
├── preload.js           ← Bridge IPC sécurisé
├── package.json         ← Config build (electron-builder)
└── src/
    ├── index.html       ← App principale
    ├── scores.html      ← Fenêtre scores live
    ├── splash.html      ← Splash screen au démarrage
    └── assets/
        ├── icon.ico              ← À fournir (build)
        ├── icon.png              ← À fournir (runtime)
        ├── installer-sidebar.bmp ← À fournir (NSIS, 164x314)
        └── installer-header.bmp  ← À fournir (NSIS, 150x57)
```

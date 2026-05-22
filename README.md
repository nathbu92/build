# PARKOUR-PRO — Build en ligne (sans droits admin)

## 🚀 Compiler l'application depuis GitHub Actions

Tu peux générer l'installateur `.exe` directement depuis GitHub, **sans rien installer sur ton PC**.

---

## 📋 Étapes

### 1. Pousser le code sur GitHub
Si ce n'est pas déjà fait :
```bash
git init
git remote add origin https://github.com/nathbu92/chronoapp.git
git add .
git commit -m "feat: version avec GitHub Actions"
git push origin main
```

---

### 2. Option A — Build manuel (n'importe quand)

1. Va sur **https://github.com/nathbu92/chronoapp**
2. Clique sur l'onglet **Actions**
3. Dans la liste à gauche, clique sur **"Build PARKOUR-PRO Windows"**
4. Clique sur le bouton **"Run workflow"** → **"Run workflow"**
5. Attends ~5 minutes ⏳
6. Clique sur le build terminé → section **Artifacts** → télécharge **PARKOUR-PRO-Windows.zip**
7. Dézippe → tu as ton `.exe` 🎉

---

### 3. Option B — Release automatique (recommandé pour les mises à jour)

À chaque nouvelle version, crée un tag Git :
```bash
git tag v2.1.0
git push origin v2.1.0
```

GitHub Actions va automatiquement :
- ✅ Builder l'`.exe`
- ✅ Créer une **Release GitHub** avec l'installateur joint
- ✅ La **mise à jour automatique** dans l'app détectera cette release et proposera la mise à jour aux utilisateurs

---

## 🔄 Mise à jour automatique

La MAJ auto est configurée dans `main.js` pour pointer sur :
```
https://github.com/nathbu92/chronoapp/releases/latest
```

**Workflow complet :**
1. Tu modifies le code
2. Tu bumpes la version dans `package.json` (ex: `"version": "2.1.0"`)
3. Tu crées le tag : `git tag v2.1.0 && git push origin v2.1.0`
4. GitHub Actions build et publie la release automatiquement
5. Les utilisateurs qui ont l'app reçoivent la notif de mise à jour au démarrage ✅

---

## ⚙️ Structure du workflow

Le fichier `.github/workflows/build.yml` :
- Tourne sur `windows-latest` (runner GitHub gratuit)
- Installe Node.js 20
- Lance `npm ci` puis `npm run build:win`
- Upload l'`.exe` comme artifact (disponible 30 jours)
- Si déclenché par un tag → crée une Release GitHub avec l'`.exe`

# Utiliser l'image officielle Playwright avec Node.js
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances Node.js
RUN npm ci --only=production

# Copier tout le code source
COPY . .

# Exposer le port (Render assigne automatiquement le PORT)
EXPOSE 3000

# Démarrer le service
CMD ["node", "server.js"]

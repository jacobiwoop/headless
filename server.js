const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration Multer pour recevoir des fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/javascript' || 
        file.mimetype === 'text/javascript' ||
        file.originalname.endsWith('.js')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers .js sont acceptés'));
    }
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Route de santé
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'Headless Browser API',
    endpoints: [
      { path: '/run', method: 'POST', description: 'Exécuter un script (JSON)' },
      { path: '/run-file', method: 'POST', description: 'Exécuter un fichier .js' },
      { path: '/health', method: 'GET', description: 'Vérifier le statut' }
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route principale pour exécuter les scripts
app.post('/run', async (req, res) => {
  const { script, timeout = 60000 } = req.body;

  if (!script) {
    return res.status(400).json({
      status: 'error',
      error: { message: 'Le champ "script" est requis' }
    });
  }

  await executeScript(script, timeout, res);
});

// Nouvelle route pour recevoir un fichier .js
app.post('/run-file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      error: { message: 'Aucun fichier reçu. Utilisez le champ "file" pour envoyer un .js' }
    });
  }

  const script = req.file.buffer.toString('utf-8');
  const timeout = parseInt(req.body.timeout) || 60000;

  await executeScript(script, timeout, res);
});

// Fonction commune d'exécution
async function executeScript(script, timeout, res) {
  let browser = null;

  try {
    // Lancer le navigateur headless
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // Créer un environnement d'exécution sécurisé
    const executionEnv = {
      page,
      context,
      browser,
      console: {
        log: (...args) => console.log('[Script]', ...args)
      }
    };

    // Exécuter le script avec timeout
    const executeScript = new Promise(async (resolve, reject) => {
      try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const userFunction = new AsyncFunction('page', 'context', 'browser', script);
        const result = await userFunction(page, context, browser);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout dépassé')), timeout)
    );

    const result = await Promise.race([executeScript, timeoutPromise]);

    await browser.close();

    res.json({
      status: 'success',
      data: result || { message: 'Script exécuté avec succès' }
    });

  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }

    console.error('Erreur:', error);

    res.status(500).json({
      status: 'error',
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
}

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({
    status: 'error',
    error: { message: 'Erreur interne du serveur' }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Service Headless Browser démarré sur le port ${PORT}`);
  console.log(`📡 Endpoint principal: POST /run`);
});

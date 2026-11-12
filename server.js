const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');
const AdmZip = require('adm-zip');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const BOTS_DIR = path.join(__dirname, 'bots_workspace');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'mia_bots_data.json');

if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR });

// טעינת הבוטים השמורים
let bots = [];
if (fs.existsSync(DATA_FILE)) {
    try {
        bots = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        bots = [];
    }
}

const runningProcesses = {};

function saveBots() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(bots, null, 2));
}

function addLog(botId, msg) {
    const bot = bots.find(b => b.id === botId);
    if (!bot) return;
    const time = new Date().toLocaleTimeString();
    bot.logs.push(`[${time}] ${msg}`);
    if (bot.logs.length > 100) bot.logs.shift();
}

// קוד בוט ברירת מחדל (כולל פקודת סלאש, פאנל טיקטים וכפתורים שעובדים מיד!)
const DEFAULT_BOT_CODE = `require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    ChannelType, 
    PermissionFlagsBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', async () => {
    console.log('✅ הבוט מחובר לשרת Node.js אמיתי בתור: ' + client.user.tag);
    console.log('💡 שלחי !panel בצ\\'אט או השתמשי בפקודה /panel כדי לשלוח פאנל טיקטים!');

    // רישום פקודת סלאש /panel אוטומטית
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('panel')
                .setDescription('שליחת פאנל פתיחת טיקט עם כפתור עובד')
                .toJSON()
        ];
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) {
        console.error('שגיאה ברישום סלאש:', err.message);
    }
});

// שליחת פאנל הטיקטים דרך הודעה רגילה (!panel)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!panel') {
        const embed = new EmbedBuilder()
            .setTitle('🎫 מרכז תמיכה - פתיחת טיקט')
            .setDescription('לחצו על הכפתור האדום למטה כדי לפתוח טיקט תמיכה חדש!')
            .setColor(0xed4245)
            .setFooter({ text: 'MiaHost Real Node.js Server' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('פתיחת טיקט')
                .setStyle(ButtonStyle.Danger)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// טיפול אמיתי ומהיר (פחות מ-3 שניות!) בכפתורים ופקודות סלאש
client.on('interactionCreate', async (interaction) => {
    try {
        // 1. אם השתמשו בפקודת הסלאש /panel
        if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('🎫 מרכז תמיכה - פתיחת טיקט')
                .setDescription('לחצו על הכפתור האדום למטה כדי לפתוח טיקט תמיכה חדש!')
                .setColor(0xed4245);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('פתיחת טיקט')
                    .setStyle(ButtonStyle.Danger)
            );

            return await interaction.reply({ embeds: [embed], components: [row] });
        }

        // 2. אם לחצו על כפתור!
        if (interaction.isButton()) {
            // כפתור פתיחת טיקט
            if (interaction.customId === 'open_ticket') {
                // מאשר לדיסקורד מיד (תוך 0.1 שניות) כדי שלא תהיה שגיאת Timeout!
                await interaction.deferReply({ ephemeral: true });

                const ticketChannel = await interaction.guild.channels.create({
                    name: \`ticket-\${interaction.user.username}\`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        }
                    ]
                });

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 סגירת טיקט')
                        .setStyle(ButtonStyle.Secondary)
                );

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎫 טיקט תמיכה נפתח!')
                    .setDescription(\`שלום <@\${interaction.user.id}>, צוות התמיכה יתפנה אליך בהקדם.\\nלסגירת הטיקט לחץ על הכפתור למטה.\`)
                    .setColor(0x3ba55c);

                await ticketChannel.send({
                    content: \`<@\${interaction.user.id}>\`,
                    embeds: [ticketEmbed],
                    components: [closeRow]
                });

                return await interaction.editReply({
                    content: \`✅ הטיקט שלך נפתח בהצלחה! לחץ כאן: <#\${ticketChannel.id}>\`
                });
            }

            // כפתור סגירת טיקט
            if (interaction.customId === 'close_ticket') {
                await interaction.reply({ content: '🔒 סוגר ומוחק את הטיקט בעוד 3 שניות...' });
                setTimeout(() => {
                    interaction.channel.delete().catch(() => {});
                }, 3000);
            }
        }
    } catch (err) {
        console.error('שגיאה בלחיצה על כפתור:', err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ אירעה שגיאה (וודאי שלבוט יש הרשאת Administrator בשרת).', ephemeral: true }).catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);`;

// חיפוש קובץ ראשי בתיקייה (גם אם חולץ מתוך תיקייה פנימית ב-ZIP)
function findBotWorkDir(baseDir, preferredFile) {
    if (fs.existsSync(path.join(baseDir, preferredFile))) {
        return { workDir: baseDir, mainFile: preferredFile };
    }
    const items = fs.readdirSync(baseDir);
    for (const item of items) {
        const fullPath = path.join(baseDir, item);
        if (fs.statSync(fullPath).isDirectory() && item !== 'node_modules') {
            if (fs.existsSync(path.join(fullPath, preferredFile))) {
                return { workDir: fullPath, mainFile: preferredFile };
            }
            const subFiles = fs.readdirSync(fullPath);
            const jsFile = subFiles.find(f => f === 'index.js' || f === 'bot.js' || f === 'main.js') || subFiles.find(f => f.endsWith('.js'));
            if (jsFile) return { workDir: fullPath, mainFile: jsFile };
        }
    }
    const rootJs = items.find(f => f.endsWith('.js'));
    return { workDir: baseDir, mainFile: rootJs || 'index.js' };
}

// הפעלת הבוט האמיתית על שרת ה-Node.js
async function startBotOnServer(botId) {
    const bot = bots.find(b => b.id === botId);
    if (!bot || !bot.token) {
        addLog(botId, '❌ שגיאה: חובה להכניס טוקן תקין!');
        return;
    }

    stopBotOnServer(botId);

    const botRootFolder = path.join(BOTS_DIR, bot.id);
    if (!fs.existsSync(botRootFolder)) fs.mkdirSync(botRootFolder, { recursive: true });

    // בדיקת הטוקן מול דיסקורד ומשיכת שם ותמונה
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': `Bot ${bot.token}` }
        });
        if (!res.ok) {
            addLog(botId, '❌ שגיאה: הטוקן שהכנסת לא תקין! בדקי אותו ב-Developer Portal.');
            bot.isRunning = false;
            saveBots();
            return;
        }
        const userData = await res.json();
        bot.name = userData.username;
        if (userData.avatar) {
            bot.avatar = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`;
        }
    } catch (err) {
        addLog(botId, '⚠️ אזהרת רשת בבדיקת הטוקן, ממשיך בהפעלה...');
    }

    const { workDir, mainFile } = findBotWorkDir(botRootFolder, bot.mainFile || 'index.js');
    bot.mainFile = mainFile;
    const mainFilePath = path.join(workDir, mainFile);

    // שמירת הקוד מהעורך לקובץ
    let codeToWrite = bot.code || DEFAULT_BOT_CODE;
    fs.writeFileSync(mainFilePath, codeToWrite, 'utf8');

    // יצירת קובץ .env אוטומטי עם הטוקן עבור בוטים שמשתמשים ב-dotenv
    fs.writeFileSync(path.join(workDir, '.env'), `TOKEN=${bot.token}\nDISCORD_TOKEN=${bot.token}\nBOT_TOKEN=${bot.token}\n`, 'utf8');

    // עדכון config.json אוטומטי אם קיים ב-ZIP של הבוט
    const configPath = path.join(workDir, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            cfg.token = bot.token;
            cfg.TOKEN = bot.token;
            fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
        } catch (e) {}
    }

    bot.isRunning = true;
    saveBots();
    addLog(botId, `🚀 מפעיל תהליך Node.js אמיתי עבור ${mainFile}...`);

    // הרצת הבוט עם גישה ישירה ל-node_modules של השרת (כך ש-discord.js ו-dotenv עובדים מיד!)
    const child = spawn('node', [mainFilePath], {
        cwd: workDir,
        env: {
            ...process.env,
            TOKEN: bot.token,
            DISCORD_TOKEN: bot.token,
            BOT_TOKEN: bot.token,
            NODE_PATH: path.join(__dirname, 'node_modules')
        }
    });

    runningProcesses[botId] = child;

    child.stdout.on('data', (data) => {
        data.toString().split('\n').filter(Boolean).forEach(line => {
            addLog(botId, line.trim());
        });
    });

    child.stderr.on('data', (data) => {
        data.toString().split('\n').filter(Boolean).forEach(line => {
            addLog(botId, `⚠️ ${line.trim()}`);
        });
    });

    child.on('close', (code) => {
        addLog(botId, `🛑 הבוט נעצר (קוד יציאה: ${code})`);
        bot.isRunning = false;
        delete runningProcesses[botId];
        saveBots();
    });
}

function stopBotOnServer(botId) {
    if (runningProcesses[botId]) {
        runningProcesses[botId].kill();
        delete runningProcesses[botId];
    }
    const bot = bots.find(b => b.id === botId);
    if (bot) {
        bot.isRunning = false;
        saveBots();
    }
}

// הדלקה אוטומטית של כל הבוטים שהיו דלוקים כשהשרת עולה
bots.forEach(bot => {
    if (bot.isRunning && bot.token) {
        startBotOnServer(bot.id);
    }
});

// ================= נתיבי API של הפאנל =================
app.get('/api/bots', (req, res) => {
    res.json(bots);
});

app.post('/api/bots/create', (req, res) => {
    const newBot = {
        id: 'bot_' + Date.now(),
        name: 'בוט חדש #' + (bots.length + 1),
        token: '',
        mainFile: 'index.js',
        avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
        isRunning: false,
        code: DEFAULT_BOT_CODE,
        logs: ['[System] שרת הבוט נוצר! הדביקי טוקן ולחצי על "הפעל בוט".']
    };
    bots.push(newBot);
    saveBots();
    res.json(newBot);
});

app.post('/api/bots/:id/save', (req, res) => {
    const bot = bots.find(b => b.id === req.params.id);
    if (!bot) return res.status(404).send();
    bot.token = (req.body.token || '').trim();
    bot.code = req.body.code || '';
    saveBots();
    res.json({ success: true });
});

app.post('/api/bots/:id/start', async (req, res) => {
    await startBotOnServer(req.params.id);
    res.json({ success: true });
});

app.post('/api/bots/:id/stop', (req, res) => {
    stopBotOnServer(req.params.id);
    addLog(req.params.id, '🛑 הבוט כובה ידנית.');
    res.json({ success: true });
});

app.delete('/api/bots/:id', (req, res) => {
    stopBotOnServer(req.params.id);
    const botFolder = path.join(BOTS_DIR, req.params.id);
    if (fs.existsSync(botFolder)) {
        fs.rmSync(botFolder, { recursive: true, force: true });
    }
    bots = bots.filter(b => b.id !== req.params.id);
    saveBots();
    res.json({ success: true });
});

// העלאת קובץ JS או ZIP וחילוץ מלא לשרת
app.post('/api/bots/:id/upload', upload.single('file'), (req, res) => {
    const bot = bots.find(b => b.id === req.params.id);
    const file = req.file;
    if (!bot || !file) return res.status(400).send();

    const botFolder = path.join(BOTS_DIR, bot.id);
    if (fs.existsSync(botFolder)) {
        fs.rmSync(botFolder, { recursive: true, force: true });
    }
    fs.mkdirSync(botFolder, { recursive: true });

    if (file.originalname.endsWith('.zip')) {
        addLog(bot.id, `📦 מחלץ קובץ ZIP (${file.originalname}) בשרת...`);
        const zip = new AdmZip(file.path);
        zip.extractAllTo(botFolder, true);

        const { workDir, mainFile } = findBotWorkDir(botFolder, 'index.js');
        bot.mainFile = mainFile;
        const fullMainPath = path.join(workDir, mainFile);

        if (fs.existsSync(fullMainPath)) {
            bot.code = fs.readFileSync(fullMainPath, 'utf8');
            addLog(bot.id, `✅ ה-ZIP חולץ בהצלחה! קובץ ראשי: ${mainFile}`);
        }
    } else {
        bot.mainFile = file.originalname;
        const content = fs.readFileSync(file.path, 'utf8');
        bot.code = content;
        fs.writeFileSync(path.join(botFolder, file.originalname), content, 'utf8');
        addLog(bot.id, `📄 הקובץ ${file.originalname} נשמר בשרת!`);
    }

    fs.unlinkSync(file.path);
    saveBots();
    res.json(bot);
});

// ================= עמוד הפאנל (HTML) =================
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MiaHost - שרת אחסון בוטים אמיתי (Node.js)</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #36393f; color: #fff; margin: 0; }
        #login-screen { display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #23272a, #5865F2); }
        .login-box { background: #2f3136; padding: 40px; border-radius: 12px; text-align: center; width: 350px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .login-input { width: 100%; padding: 12px; margin: 10px 0; background: #202225; border: 1px solid #4f545c; color: white; border-radius: 5px; }
        .btn { padding: 12px 20px; border: none; border-radius: 5px; font-size: 15px; font-weight: bold; cursor: pointer; color: white; transition: 0.2s; }
        .btn-primary { background: #5865F2; width: 100%; margin-top: 10px; }
        .btn-success { background: #3ba55c; }
        .btn-danger { background: #ed4245; }
        .btn-secondary { background: #4f545c; }
        #app-screen { display: none; padding: 20px; max-width: 1100px; margin: auto; }
        .navbar { display: flex; justify-content: space-between; align-items: center; background: #202225; padding: 15px 25px; border-radius: 10px; margin-bottom: 25px; }
        .bots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
        .bot-card { background: #2f3136; border-radius: 10px; padding: 20px; display: flex; align-items: center; cursor: pointer; border: 2px solid transparent; transition: 0.2s; }
        .bot-card:hover { border-color: #5865F2; transform: translateY(-3px); }
        .bot-card img { width: 60px; height: 60px; border-radius: 50%; margin-left: 15px; border: 3px solid #ed4245; }
        .bot-card img.online { border-color: #3ba55c; }
        .add-bot-card { background: rgba(88, 101, 242, 0.1); border: 2px dashed #5865F2; justify-content: center; color: #5865F2; font-size: 18px; font-weight: bold; min-height: 106px; }
        #bot-panel-view { display: none; background: #2f3136; padding: 25px; border-radius: 12px; }
        .panel-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #202225; padding-bottom: 15px; margin-bottom: 20px; }
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .box { background: #202225; padding: 15px; border-radius: 8px; }
        .input-text { width: 100%; padding: 10px; background: #1e1f22; border: 1px solid #4f545c; color: white; border-radius: 5px; direction: ltr; }
        textarea { width: 100%; height: 250px; background: #1e1f22; color: #00ff88; border: 1px solid #4f545c; border-radius: 8px; padding: 12px; font-family: Consolas, monospace; font-size: 14px; direction: ltr; }
        .console { background: #000; color: #ccc; height: 190px; border-radius: 8px; padding: 12px; font-family: Consolas, monospace; font-size: 13px; overflow-y: auto; direction: ltr; }
        .file-upload-btn { background: #5865F2; color: white; padding: 10px 15px; border-radius: 5px; cursor: pointer; display: inline-block; font-weight: bold; }
    </style>
</head>
<body>
    <div id="login-screen">
        <div class="login-box">
            <h2>🔒 התחברות ל-MiaHost</h2>
            <p style="color:#b9bbbe; font-size:14px;">שרת Node.js אמיתי (ללא שגיאות כפתורים!)</p>
            <input type="text" id="username" class="login-input" placeholder="שם משתמש">
            <input type="password" id="password" class="login-input" placeholder="סיסמה">
            <button class="btn btn-primary" onclick="login()">התחברי</button>
            <p id="login-error" style="color: #ed4245; display: none;">פרטים שגויים!</p>
        </div>
    </div>

    <div id="app-screen">
        <div class="navbar">
            <h1 style="margin:0; color:#5865F2;">👑 הפאנל של מיה (Node.js Backend)</h1>
            <div>
                <span style="margin-left:15px;">משתמשת: <b>mia</b></span>
                <button class="btn btn-danger" onclick="logout()">התנתקי</button>
            </div>
        </div>

        <div id="dashboard-view">
            <h2>🤖 הבוטים שלי (רצים על השרת 24/7):</h2>
            <div class="bots-grid" id="bots-container"></div>
        </div>

        <div id="bot-panel-view">
            <div class="panel-header">
                <div style="display:flex; align-items:center;">
                    <button class="btn btn-secondary" onclick="showDashboard()" style="margin-left:15px;">⬅ חזרה</button>
                    <img src="" id="current-bot-avatar" style="width:50px; height:50px; border-radius:50%; margin-left:12px;">
                    <div>
                        <h2 id="current-bot-name" style="margin:0;"></h2>
                        <span id="current-bot-status"></span>
                    </div>
                </div>
                <div>
                    <button class="btn btn-success" onclick="startBot()">▶ הפעל בוט</button>
                    <button class="btn btn-danger" onclick="stopBot()">⏹ עצור</button>
                    <button class="btn btn-secondary" onclick="deleteBot()" style="background:#202225; color:#ed4245; margin-right:10px;">🗑️ מחק</button>
                </div>
            </div>

            <div class="settings-grid">
                <div class="box">
                    <h4 style="margin-top:0;">🔑 טוקן של הבוט (Token):</h4>
                    <input type="password" id="bot-token" class="input-text" placeholder="הדביקי כאן את הטוקן..." oninput="saveChanges()">
                </div>
                <div class="box">
                    <h4 style="margin-top:0;">📦 העלאת קובץ בוט או ZIP שלם:</h4>
                    <label class="file-upload-btn">
                        בחרי קובץ (ZIP / JS)
                        <input type="file" style="display:none;" accept=".zip,.js" onchange="uploadFile(event)">
                    </label>
                    <span id="file-label" style="margin-right:10px; color:#b9bbbe;"></span>
                </div>
            </div>

            <h4>📝 קוד הבוט (נשמר ומורץ על השרת):</h4>
            <textarea id="bot-code" oninput="saveChanges()"></textarea>

            <h4>💻 קונסול שרת חי (Live Logs):</h4>
            <div class="console" id="console-box"></div>
        </div>
    </div>

<script>
    let bots = [];
    let currentBotId = null;

    if (localStorage.getItem('mia_auth') === 'true') unlock();

    function login() {
        if (document.getElementById('username').value.trim() === 'mia' && document.getElementById('password').value.trim() === '2234') {
            localStorage.setItem('mia_auth', 'true');
            unlock();
        } else {
            document.getElementById('login-error').style.display = 'block';
        }
    }
    function logout() { localStorage.setItem('mia_auth', 'false'); location.reload(); }

    function unlock() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        loadBots();
        setInterval(loadBots, 2000);
    }

    async function loadBots() {
        const res = await fetch('/api/bots');
        bots = await res.json();
        if (!currentBotId) renderDashboard();
        else updatePanelUI();
    }

    function renderDashboard() {
        const container = document.getElementById('bots-container');
        container.innerHTML = '';
        bots.forEach(bot => {
            container.innerHTML += \`
                <div class="bot-card" onclick="openBot('\${bot.id}')">
                    <img src="\${bot.avatar}" class="\${bot.isRunning ? 'online' : ''}">
                    <div>
                        <h3 style="margin:0 0 5px 0;">\${bot.name}</h3>
                        <p style="margin:0; font-size:13px; color:#b9bbbe;">\${bot.isRunning ? '🟢 פועל בשרת' : '🔴 כבוי'}</p>
                    </div>
                </div>\`;
        });
        container.innerHTML += '<div class="bot-card add-bot-card" onclick="createBot()">+ יצירת בוט חדש</div>';
    }

    async function createBot() {
        const res = await fetch('/api/bots/create', { method: 'POST' });
        const newBot = await res.json();
        await loadBots();
        openBot(newBot.id);
    }

    function openBot(id) {
        currentBotId = id;
        const bot = bots.find(b => b.id === id);
        document.getElementById('dashboard-view').style.display = 'none';
        document.getElementById('bot-panel-view').style.display = 'block';
        document.getElementById('bot-token').value = bot.token;
        document.getElementById('bot-code').value = bot.code;
        updatePanelUI();
    }

    function updatePanelUI() {
        const bot = bots.find(b => b.id === currentBotId);
        if (!bot) return;
        document.getElementById('current-bot-name').innerText = bot.name;
        document.getElementById('current-bot-avatar').src = bot.avatar;
        document.getElementById('file-label').innerText = bot.mainFile;
        document.getElementById('current-bot-status').innerHTML = bot.isRunning 
            ? '<span style="color:#3ba55c;">🟢 פועל על שרת Node.js (כפתורים וטיקטים פעילים!)</span>' 
            : '<span style="color:#ed4245;">🔴 כבוי</span>';
        
        const box = document.getElementById('console-box');
        box.innerHTML = bot.logs.map(l => \`<div>\${l}</div>\`).join('');
        box.scrollTop = box.scrollHeight;
    }

    function showDashboard() {
        currentBotId = null;
        document.getElementById('bot-panel-view').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';
        renderDashboard();
    }

    async function saveChanges() {
        if (!currentBotId) return;
        await fetch(\`/api/bots/\${currentBotId}/save\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: document.getElementById('bot-token').value,
                code: document.getElementById('bot-code').value
            })
        });
    }

    async function startBot() {
        await saveChanges();
        await fetch(\`/api/bots/\${currentBotId}/start\`, { method: 'POST' });
        loadBots();
    }

    async function stopBot() {
        await fetch(\`/api/bots/\${currentBotId}/stop\`, { method: 'POST' });
        loadBots();
    }

    async function deleteBot() {
        if (!confirm('למחוק את הבוט?')) return;
        await fetch(\`/api/bots/\${currentBotId}\`, { method: 'DELETE' });
        showDashboard();
    }

    async function uploadFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(\`/api/bots/\${currentBotId}/upload\`, { method: 'POST', body: formData });
        const updatedBot = await res.json();
        document.getElementById('bot-code').value = updatedBot.code;
        loadBots();
    }
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`👑 MiaHost Real Server is running on port ${PORT}`);
    console.log(`🌐 Open in browser: http://localhost:${PORT}`);
    console.log('====================================================');
});
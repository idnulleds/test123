const express = require('express');
const fs = require('fs');
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

const router = express.Router();
const SESSION_PATH = "/tmp/session"; // Ubah penyimpanan sesi ke /tmp

// Pastikan folder session ada
if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true });
}

// Fungsi hapus file
function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

// API untuk pairing
router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number is required" });

    async function EypzPair() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

            let EypzPairWeb = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            if (!EypzPairWeb.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await EypzPairWeb.requestPairingCode(num);
                
                if (!res.headersSent) {
                    return res.json({ code });
                }
            }

            EypzPairWeb.ev.on('creds.update', saveCreds);

            EypzPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(10000);
                        const user_jid = jidNormalizedUser(EypzPairWeb.user.id);
                        const mega_url = await upload(fs.createReadStream(`${SESSION_PATH}/creds.json`), `${user_jid}.json`);
                        const string_session = mega_url.replace('https://mega.nz/file/', '');

                        await EypzPairWeb.sendMessage(user_jid, { text: string_session });

                        removeFile(SESSION_PATH);
                    } catch (error) {
                        console.error("Error sending session link:", error);
                    }
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log("Reconnecting...");
                    await delay(10000);
                    EypzPair();
                }
            });
        } catch (error) {
            console.error("Service error:", error);
            if (!res.headersSent) {
                res.status(503).json({ error: "Service Unavailable" });
            }
        }
    }

    EypzPair();
});

// Tangani error global
process.on('uncaughtException', (err) => {
    console.error('Unhandled Exception:', err);
});

module.exports = router;

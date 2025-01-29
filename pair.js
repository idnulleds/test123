const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
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

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number is required" });

    async function EypzPair() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(`./session`);

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
                    res.json({ code });
                }
                return;
            }

            EypzPairWeb.ev.on('creds.update', saveCreds);

            EypzPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(10000);
                        const auth_path = './session/';
                        const user_jid = jidNormalizedUser(EypzPairWeb.user.id);

                        const mega_url = await upload(fs.createReadStream(auth_path + 'creds.json'), `${user_jid}.json`);
                        const string_session = mega_url.replace('https://mega.nz/file/', '');

                        await EypzPairWeb.sendMessage(user_jid, { text: string_session });

                        removeFile('./session');
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

process.on('uncaughtException', (err) => {
    console.error('Unhandled Exception:', err);
});

module.exports = router;

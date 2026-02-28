const express = require('express');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

app.get('/code', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.json({ error: "No number provided" });

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
    });

    if (!sock.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(num);
        res.json({ code: code });
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (s) => {
        const { connection } = s;
        if (connection === "open") {
            const session = Buffer.from(JSON.stringify(sock.authState.creds)).toString('base64');
            await sock.sendMessage(sock.user.id, { text: "GEMINI-SESSION-ID:" + session });
            // Clean up after connecting
            setTimeout(() => { fs.rmSync('./auth_info', { recursive: true, force: true }); }, 5000);
        }
    });
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

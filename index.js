import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { db } from './db.js';
import bodyParser from 'body-parser';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcrypt';
import shortid from 'shortid';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
const OWNER_EMAILS = [
    'infinitecodehs@gmail.com'
];
const pfpDir = path.join(__dirname, 'public', 'pfps');
if (!fs.existsSync(pfpDir)) {
    fs.mkdirSync(pfpDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, pfpDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const upload = multer({ storage });
app.post('/signup', async (req, res) => {
    const { email, password, displayName } = req.body;
    await db.read();
    if (db.data.users.find(u => u.email === email)) {
        return res.json({ ok: false, message: 'Email Already Exists' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
        id: db.data.users.length,
        email,
        displayName,
        password: hashed,
        color: '#ffffff',
        profilePic: '/pfps/1.jpeg',
        bio: '',
        role: 'user'
    };
    db.data.users.push(newUser);
    await db.write();
    res.json({ ok: true, user: newUser });
});
app.post('/set-role', async (req, res) => {
    const { requesterId, targetUserId, role } = req.body;
    await db.read();
    const requester = db.data.users.find(u => u.id == requesterId);
    const target = db.data.users.find(u => u.id == targetUserId);
    if (!requester || !target) {
        return res.json({ ok: false });
    }
    if (!OWNER_EMAILS.includes(requester.email)) {
        return res.json({ ok: false, message: 'Not Authorized' });
    }
    target.role = role;
    await db.write();
    res.json({ ok: true });
});
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    await db.read();
    const user = db.data.users.find(u => u.email === email);
    if (!user) return res.json({ ok: false, message: 'User Not Found' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ ok: false, message: 'Incorrect Password' });
    res.json({ ok: true, user });
});
app.post('/update-profile', upload.single('pfp'), async (req, res) => {
    const { id, color } = req.body;
    await db.read();
    const user = db.data.users.find(u => u.id == id);
    if (!user) return res.json({ ok: false });
    if (color) user.color = color;
    if (req.file) {
        user.profilePic = `/pfps/${req.file.filename}`;
    }
    await db.write();
    res.json({ ok: true, user });
});
io.on('connection', socket => {
    console.log('A User Connected');
    socket.emit('init', (db.data.messages || []).map(m => {
        const user = db.data.users.find(u => u.id === m.userId);
        return {
            ...m,
            username: user?.displayName || 'Unknown',
            color: user?.color || '#000',
            profilePic: user?.profilePic || '',
            role: user?.role || 'user'
        };
    }));
    socket.on('message', async msg => {
        const message = {
            id: shortid.generate(),
            userId: msg.userId,
            content: msg.content,
            timestamp: new Date(),
            edited: false
        };
        db.data.messages.push(message);
        await db.write();
        const user = db.data.users.find(u => u.id === msg.userId);
        io.emit('message', {
            ...message,
            username: user?.displayName || 'Unknown',
            color: user?.color || '#000',
            profilePic: user?.profilePic || '',
            role: user?.role || 'user'
        });
    });
    socket.on('edit', async ({ messageId, userId, newContent }) => {
        await db.read();
        const msg = db.data.messages.find(m => m.id === messageId);
        const user = db.data.users.find(u => u.id === userId);
        if (!msg || (!user || (msg.userId !== userId && user.role !== 'owner'))) return;
        msg.content = newContent;
        msg.edited = true;
        await db.write();
        io.emit('edit', msg);
    });
    socket.on('delete', async ({ messageId, userId }) => {
        await db.read();
        const user = db.data.users.find(u => u.id === userId);
        const index = db.data.messages.findIndex(m =>
            m.id === messageId &&
            (m.userId === userId || user?.role === 'owner')
        );
        if (index === -1) return;
        const [removed] = db.data.messages.splice(index, 1);
        await db.write();
        io.emit('delete', { id: removed.id });
    });
    socket.on('disconnect', () => {
        console.log('A User Disconnected');
    });
});
httpServer.listen(3000, () => {
    console.log('Server Running On http://localhost:3000');
});

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const USERS_FILE = path.join(__dirname, 'users.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const FRIENDS_FILE = path.join(__dirname, 'friends.json');
const REQUESTS_FILE = path.join(__dirname, 'friendRequests.json');
const GROUP_REQUESTS_FILE = path.join(__dirname, 'groupRequests.json');
const UNREAD_FILE = path.join(__dirname, 'unread.json');

let users = {};
let globalChats = [];
let messages = {};
let friends = {};
let friendRequests = {};
let groupRequests = {};
let unreadCounts = {};

if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE));
if (fs.existsSync(CHATS_FILE)) globalChats = JSON.parse(fs.readFileSync(CHATS_FILE));
if (fs.existsSync(MESSAGES_FILE)) messages = JSON.parse(fs.readFileSync(MESSAGES_FILE));
if (fs.existsSync(FRIENDS_FILE)) friends = JSON.parse(fs.readFileSync(FRIENDS_FILE));
if (fs.existsSync(REQUESTS_FILE)) friendRequests = JSON.parse(fs.readFileSync(REQUESTS_FILE));
if (fs.existsSync(GROUP_REQUESTS_FILE)) groupRequests = JSON.parse(fs.readFileSync(GROUP_REQUESTS_FILE));
if (fs.existsSync(UNREAD_FILE)) unreadCounts = JSON.parse(fs.readFileSync(UNREAD_FILE));

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveChats() { fs.writeFileSync(CHATS_FILE, JSON.stringify(globalChats, null, 2)); }
function saveMessages() { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2)); }
function saveFriends() { fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2)); }
function saveRequests() { fs.writeFileSync(REQUESTS_FILE, JSON.stringify(friendRequests, null, 2)); }
function saveGroupRequests() { fs.writeFileSync(GROUP_REQUESTS_FILE, JSON.stringify(groupRequests, null, 2)); }
function saveUnread() { fs.writeFileSync(UNREAD_FILE, JSON.stringify(unreadCounts, null, 2)); }

app.post('/register', async (req, res) => {
    const { login, password, name, surname, birthdate, about } = req.body;
    if (users[login]) return res.json({ error: 'Логин занят' });
    users[login] = {
        password: await bcrypt.hash(password, 10),
        name: name || login,
        surname: surname || '',
        birthdate: birthdate || '',
        about: about || '',
        avatar: null,
        token: require('crypto').randomBytes(64).toString('hex')
    };
    saveUsers();
    res.json({ success: true, token: users[login].token });
});

app.post('/login', async (req, res) => {
    const { login, password } = req.body;
    const user = users[login];
    if (!user) return res.json({ error: 'Пользователь не найден' });
    if (!await bcrypt.compare(password, user.password)) return res.json({ error: 'Неверный пароль' });
    res.json({ success: true, login, user: { name: user.name, login, surname: user.surname, birthdate: user.birthdate, about: user.about, token: user.token } });
});

app.post('/auto-login', (req, res) => {
    const { token } = req.body;
    const login = Object.keys(users).find(l => users[l].token === token);
    if (login) {
        const user = users[login];
        res.json({ success: true, login, user: { name: user.name, login, surname: user.surname, birthdate: user.birthdate, about: user.about } });
    } else res.json({ error: 'Неверный токен' });
});

app.post('/update-profile', (req, res) => {
    const { login, name, surname, birthdate, about } = req.body;
    if (users[login]) {
        if (name !== undefined) users[login].name = name;
        if (surname !== undefined) users[login].surname = surname;
        if (birthdate !== undefined) users[login].birthdate = birthdate;
        if (about !== undefined) users[login].about = about;
        saveUsers();
        res.json({ success: true });
    } else res.json({ error: 'Пользователь не найден' });
});

app.post('/create-chat', (req, res) => {
    const { name, avatar, theme, creator, members, isGroup, isChannel, login } = req.body;
    const chatId = `chat_${Date.now()}`;
    const newChat = {
        id: chatId,
        name: name,
        avatar: avatar || (isChannel ? '📢' : '👥'),
        theme: theme || '',
        login: login || '',
        creator: creator,
        members: members || [],
        isGroup: isGroup || false,
        isChannel: isChannel || false
    };
    if (isChannel && !newChat.members.includes(creator)) newChat.members.push(creator);
    globalChats.push(newChat);
    messages[chatId] = [];
    if (!unreadCounts[creator]) unreadCounts[creator] = {};
    unreadCounts[creator][chatId] = 0;
    saveChats();
    saveMessages();
    saveUnread();
    res.json({ chatId });
});

app.post('/add-member', (req, res) => {
    const { chatId, memberLogin } = req.body;
    const chat = globalChats.find(c => c.id === chatId);
    if (chat && !chat.members.includes(memberLogin)) {
        chat.members.push(memberLogin);
        if (!unreadCounts[memberLogin]) unreadCounts[memberLogin] = {};
        unreadCounts[memberLogin][chatId] = 0;
        saveChats();
        saveUnread();
        res.json({ success: true });
    } else res.json({ error: 'Чат не найден или участник уже добавлен' });
});

app.post('/request-group-join', (req, res) => {
    const { groupId, fromUser, toUser } = req.body;
    if (!groupRequests[toUser]) groupRequests[toUser] = [];
    groupRequests[toUser].push({ groupId, fromUser });
    saveGroupRequests();
    io.emit('groupRequest', { groupId, fromUser, toUser });
    res.json({ success: true });
});

app.post('/respond-group-request', (req, res) => {
    const { groupId, fromUser, toUser, accept } = req.body;
    if (accept) {
        const chat = globalChats.find(c => c.id === groupId);
        if (chat && !chat.members.includes(fromUser)) {
            chat.members.push(fromUser);
            if (!unreadCounts[fromUser]) unreadCounts[fromUser] = {};
            unreadCounts[fromUser][groupId] = 0;
            saveChats();
            saveUnread();
        }
    }
    if (groupRequests[toUser]) {
        groupRequests[toUser] = groupRequests[toUser].filter(r => !(r.groupId === groupId && r.fromUser === fromUser));
        saveGroupRequests();
    }
    res.json({ success: true });
});

app.get('/chats', (req, res) => res.json(globalChats));
app.get('/users', (req, res) => {
    const list = Object.keys(users).map(login => ({ login, name: users[login].name }));
    res.json(list);
});

app.post('/search-user', (req, res) => {
    const { login } = req.body;
    const user = users[login];
    if (user) {
        res.json({ found: true, login, name: user.name, surname: user.surname, birthdate: user.birthdate, about: user.about });
    } else res.json({ found: false });
});

app.get('/messages/:chatId', (req, res) => res.json(messages[req.params.chatId] || []));

app.post('/add-friend', (req, res) => {
    const { from, to } = req.body;
    if (!friendRequests[to]) friendRequests[to] = [];
    if (!friendRequests[to].includes(from)) friendRequests[to].push(from);
    saveRequests();
    io.emit('friendRequest', { from, to });
    res.json({ success: true });
});

app.post('/accept-friend', (req, res) => {
    const { from, to } = req.body;
    if (!friends[to]) friends[to] = [];
    if (!friends[to].includes(from)) friends[to].push(from);
    if (!friends[from]) friends[from] = [];
    if (!friends[from].includes(to)) friends[from].push(to);
    if (friendRequests[to]) friendRequests[to] = friendRequests[to].filter(f => f !== from);
    saveFriends();
    saveRequests();
    res.json({ success: true });
});

app.post('/decline-friend', (req, res) => {
    const { from, to } = req.body;
    if (friendRequests[to]) friendRequests[to] = friendRequests[to].filter(f => f !== from);
    saveRequests();
    res.json({ success: true });
});

app.get('/friends/:login', (req, res) => {
    res.json({ friends: friends[req.params.login] || [] });
});

app.get('/friend-requests/:login', (req, res) => {
    res.json({ requests: friendRequests[req.params.login] || [] });
});

app.get('/group-requests/:login', (req, res) => {
    res.json({ requests: groupRequests[req.params.login] || [] });
});

app.post('/delete-chat', (req, res) => {
    const { chatId, userId } = req.body;
    const chatIndex = globalChats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
        const chat = globalChats[chatIndex];
        if (chat.creator === userId || !chat.isGroup) {
            globalChats.splice(chatIndex, 1);
            delete messages[chatId];
            for (let u in unreadCounts) delete unreadCounts[u][chatId];
            saveChats();
            saveMessages();
            saveUnread();
            res.json({ success: true });
        } else res.json({ error: 'Только создатель может удалить чат' });
    } else res.json({ error: 'Чат не найден' });
});

app.get('/unread/:login', (req, res) => {
    res.json({ unread: unreadCounts[req.params.login] || {} });
});

io.on('connection', (socket) => {
    console.log('✅ Пользователь подключился');
    socket.on('join', (chatId) => { socket.join(chatId); });
    socket.on('sendMessage', ({ chatId, from, text, time }) => {
        const chat = globalChats.find(c => c.id === chatId);
        if (chat && chat.isChannel && chat.creator !== from) {
            socket.emit('error', 'Только создатель канала может писать');
            return;
        }
        const msg = { from, text, time: time || new Date().toLocaleTimeString() };
        if (!messages[chatId]) messages[chatId] = [];
        messages[chatId].push(msg);
        saveMessages();
        if (chat) {
            const recipients = chat.members || [];
            recipients.forEach(recipient => {
                if (recipient !== from) {
                    if (!unreadCounts[recipient]) unreadCounts[recipient] = {};
                    unreadCounts[recipient][chatId] = (unreadCounts[recipient][chatId] || 0) + 1;
                }
            });
            saveUnread();
        }
        io.to(chatId).emit('newMessage', msg);
        io.emit('updateUnread', { chatId });
    });
    socket.on('deleteMessage', ({ chatId, messageIndex }) => {
        if (messages[chatId] && messages[chatId][messageIndex]) {
            messages[chatId].splice(messageIndex, 1);
            saveMessages();
            io.to(chatId).emit('messageDeleted', { chatId, messageIndex });
        }
    });
    socket.on('markRead', ({ chatId, user }) => {
        if (unreadCounts[user] && unreadCounts[user][chatId]) {
            unreadCounts[user][chatId] = 0;
            saveUnread();
            io.emit('updateUnread', { chatId });
        }
    });
    socket.on('disconnect', () => console.log('❌ Пользователь отключился'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));

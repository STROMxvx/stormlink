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

// Файлы данных
const USERS_FILE = path.join(__dirname, 'users.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const FRIENDS_FILE = path.join(__dirname, 'friends.json');
const REQUESTS_FILE = path.join(__dirname, 'friendRequests.json');

let users = {};
let globalChats = [];
let messages = {};
let friends = {};
let friendRequests = {};

if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE));
if (fs.existsSync(CHATS_FILE)) globalChats = JSON.parse(fs.readFileSync(CHATS_FILE));
if (fs.existsSync(MESSAGES_FILE)) messages = JSON.parse(fs.readFileSync(MESSAGES_FILE));
if (fs.existsSync(FRIENDS_FILE)) friends = JSON.parse(fs.readFileSync(FRIENDS_FILE));
if (fs.existsSync(REQUESTS_FILE)) friendRequests = JSON.parse(fs.readFileSync(REQUESTS_FILE));

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveChats() { fs.writeFileSync(CHATS_FILE, JSON.stringify(globalChats, null, 2)); }
function saveMessages() { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2)); }
function saveFriends() { fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2)); }
function saveRequests() { fs.writeFileSync(REQUESTS_FILE, JSON.stringify(friendRequests, null, 2)); }

// Регистрация
app.post('/register', async (req, res) => {
    const { login, password, name, surname, birthdate, about } = req.body;
    if (users[login]) return res.json({ error: 'Логин занят' });
    users[login] = {
        password: await bcrypt.hash(password, 10),
        name: name || login,
        surname: surname || '',
        birthdate: birthdate || '',
        about: about || '',
        avatar: null
    };
    saveUsers();
    res.json({ success: true });
});

// Логин
app.post('/login', async (req, res) => {
    const { login, password } = req.body;
    const user = users[login];
    if (!user) return res.json({ error: 'Пользователь не найден' });
    if (!await bcrypt.compare(password, user.password)) return res.json({ error: 'Неверный пароль' });
    res.json({ success: true, login, user: { name: user.name, login, surname: user.surname, birthdate: user.birthdate, about: user.about } });
});

// Обновление профиля
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

// Создание чата (личный, группа, канал)
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
        members: members || (isChannel ? [] : [creator]),
        isGroup: isGroup || false,
        isChannel: isChannel || false
    };
    globalChats.push(newChat);
    messages[chatId] = [];
    saveChats();
    saveMessages();
    res.json({ chatId });
});

// Получить все чаты
app.get('/chats', (req, res) => res.json(globalChats));

// Получить всех пользователей
app.get('/users', (req, res) => {
    const list = Object.keys(users).map(login => ({ login, name: users[login].name }));
    res.json(list);
});

// Поиск пользователя
app.post('/search-user', (req, res) => {
    const { login } = req.body;
    const user = users[login];
    if (user) {
        res.json({ found: true, login, name: user.name, surname: user.surname, birthdate: user.birthdate, about: user.about });
    } else res.json({ found: false });
});

// Получить сообщения чата
app.get('/messages/:chatId', (req, res) => res.json(messages[req.params.chatId] || []));

// Друзья
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

// Socket.io
io.on('connection', (socket) => {
    console.log('✅ Пользователь подключился');
    socket.on('join', (chatId) => { socket.join(chatId); });
    socket.on('sendMessage', ({ chatId, from, text, time }) => {
        const msg = { from, text, time: time || new Date().toLocaleTimeString() };
        if (!messages[chatId]) messages[chatId] = [];
        messages[chatId].push(msg);
        saveMessages();
        io.to(chatId).emit('newMessage', msg);
    });
    socket.on('deleteMessage', ({ chatId, messageIndex }) => {
        if (messages[chatId] && messages[chatId][messageIndex]) {
            messages[chatId].splice(messageIndex, 1);
            saveMessages();
            io.to(chatId).emit('messageDeleted', { chatId, messageIndex });
        }
    });
    socket.on('disconnect', () => console.log('❌ Пользователь отключился'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));

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

// Файлы для хранения данных
const USERS_FILE = path.join(__dirname, 'users.json');
const CHATS_FILE = path.join(__dirname, 'chats.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

let users = {};
let globalChats = [];
let messages = {};

if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE));
if (fs.existsSync(CHATS_FILE)) globalChats = JSON.parse(fs.readFileSync(CHATS_FILE));
if (fs.existsSync(MESSAGES_FILE)) messages = JSON.parse(fs.readFileSync(MESSAGES_FILE));

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveChats() { fs.writeFileSync(CHATS_FILE, JSON.stringify(globalChats, null, 2)); }
function saveMessages() { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2)); }

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
        favoriteGames: [],
        avatar: null,
        chats: ['favorites']
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
    res.json({ success: true, login, user: { name: user.name, login: login, surname: user.surname, birthdate: user.birthdate, about: user.about } });
});

// Обновление профиля
app.post('/update-profile', async (req, res) => {
    const { login, name, surname, birthdate, about } = req.body;
    if (users[login]) {
        if (name !== undefined) users[login].name = name;
        if (surname !== undefined) users[login].surname = surname;
        if (birthdate !== undefined) users[login].birthdate = birthdate;
        if (about !== undefined) users[login].about = about;
        saveUsers();
        res.json({ success: true });
    } else {
        res.json({ error: 'Пользователь не найден' });
    }
});

// Создание чата (канал или группа)
app.post('/create-chat', (req, res) => {
    const { name, avatar, theme, creator, isChannel, isGroup, login, members } = req.body;
    const chatId = 'chat_' + Date.now();
    const newChat = {
        id: chatId,
        name: name,
        avatar: avatar || (isChannel ? '📢' : '👥'),
        theme: theme || '',
        login: login || '',
        creator: creator,
        members: members || (isChannel ? [] : [creator]),
        isChannel: isChannel || false,
        isGroup: isGroup || false
    };
    globalChats.push(newChat);
    messages[chatId] = [];
    saveChats();
    res.json({ chatId });
});

// Получить все чаты
app.get('/chats', (req, res) => res.json(globalChats));

// Получить всех пользователей
app.get('/users', (req, res) => {
    const usersList = Object.keys(users).map(login => ({ login, name: users[login].name }));
    res.json(usersList);
});

// Поиск пользователя
app.post('/search-user', (req, res) => {
    const { login } = req.body;
    const user = users[login];
    if (user) {
        res.json({ found: true, login: login, name: user.name, surname: user.surname, birthdate: user.birthdate, about: user.about });
    } else {
        res.json({ found: false });
    }
});

// Получить сообщения
app.get('/messages/:chatId', (req, res) => res.json(messages[req.params.chatId] || []));

// Socket.IO
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

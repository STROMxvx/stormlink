const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('../frontend'));

let users = {};
let messages = {};
let globalChats = [
    { id: 'favorites', name: 'Избранное', avatar: '⭐', theme: 'личное', members: [] }
];

app.post('/register', async (req, res) => {
    const { login, password, name, surname, birthdate, about, favoriteGames } = req.body;
    if (users[login]) return res.json({ error: 'Логин занят' });
    users[login] = {
        password: await bcrypt.hash(password, 10),
        name: name || '',
        surname: surname || '',
        birthdate: birthdate || '',
        about: about || '',
        favoriteGames: favoriteGames || [],
        avatar: null,
        chats: ['favorites']
    };
    res.json({ success: true });
});

app.post('/login', async (req, res) => {
    const { login, password } = req.body;
    const user = users[login];
    if (!user) return res.json({ error: 'Пользователь не найден' });
    if (!await bcrypt.compare(password, user.password)) return res.json({ error: 'Неверный пароль' });
    res.json({ success: true, login, user: { 
        name: user.name, 
        login: login, 
        surname: user.surname, 
        birthdate: user.birthdate, 
        about: user.about 
    }});
});

app.post('/update-profile', async (req, res) => {
    const { login, name, surname, birthdate, about } = req.body;
    if (users[login]) {
        if (name !== undefined) users[login].name = name;
        if (surname !== undefined) users[login].surname = surname;
        if (birthdate !== undefined) users[login].birthdate = birthdate;
        if (about !== undefined) users[login].about = about;
        res.json({ success: true });
    } else {
        res.json({ error: 'Пользователь не найден' });
    }
});

app.post('/create-chat', (req, res) => {
    const { name, avatar, theme, creator, members } = req.body;
    const chatId = 'chat_' + Date.now();
    const newChat = { 
        id: chatId, 
        name: name, 
        avatar: avatar || '💬', 
        theme: theme || 'общение', 
        members: members || [creator],
        creator: creator
    };
    globalChats.push(newChat);
    messages[chatId] = [];
    if (users[creator]) {
        if (!users[creator].chats.includes(chatId)) {
            users[creator].chats.push(chatId);
        }
    }
    res.json({ chatId });
});

app.post('/add-member', (req, res) => {
    const { chatId, memberLogin } = req.body;
    const chat = globalChats.find(c => c.id === chatId);
    if (chat && !chat.members.includes(memberLogin)) {
        chat.members.push(memberLogin);
        if (users[memberLogin] && !users[memberLogin].chats.includes(chatId)) {
            users[memberLogin].chats.push(chatId);
        }
        res.json({ success: true });
    } else {
        res.json({ error: 'Чат не найден или участник уже добавлен' });
    }
});

app.get('/chats', (req, res) => res.json(globalChats));
app.get('/messages/:chatId', (req, res) => res.json(messages[req.params.chatId] || []));

app.post('/search-user', (req, res) => {
    const { login } = req.body;
    const user = users[login];
    if (user) {
        res.json({ found: true, login: login, name: user.name, surname: user.surname, birthdate: user.birthdate, about: user.about });
    } else {
        res.json({ found: false });
    }
});

app.post('/chat-info', (req, res) => {
    const { chatId } = req.body;
    const chat = globalChats.find(c => c.id === chatId);
    if (chat) {
        res.json({ success: true, chat: { id: chat.id, name: chat.name, avatar: chat.avatar, theme: chat.theme, members: chat.members || [], creator: chat.creator } });
    } else {
        res.json({ error: 'Чат не найден' });
    }
});

io.on('connection', (socket) => {
    console.log('Пользователь подключился');
    socket.on('join', (chatId) => { socket.join(chatId); });
    socket.on('sendMessage', ({ chatId, from, text }) => {
        const msg = { from, text, time: new Date().toLocaleTimeString() };
        if (!messages[chatId]) messages[chatId] = [];
        messages[chatId].push(msg);
        io.to(chatId).emit('newMessage', msg);
    });
    socket.on('disconnect', () => console.log('Пользователь отключился'));
});

server.listen(3000, () => console.log('Сервер запущен на http://localhost:3000'));
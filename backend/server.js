    // ========== ОТПРАВКА СООБЩЕНИЙ И ФАЙЛОВ ==========
    function sendMessage() {
        const input = document.getElementById('msgInput');
        let text = input.value.trim();
        if (replyTo) {
            text = `↩️ Ответ ${replyTo.from}: "${replyTo.text.substring(0,40)}"\n${text}`;
            replyTo = null;
            document.getElementById('replyIndicator').innerHTML = '<span></span><button id="cancelReplyBtn" style="display:none;">✖ Отмена</button>';
        }
        if (text) {
            if (currentChat === 'favorites') saveFavoriteMessage(text);
            else socket.emit('sendMessage', { chatId: currentChat, from: currentUser, text, time: getFormattedTime() });
            input.value = '';
        }
    }

    function sendFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            let html = '';
            if (file.type.startsWith('image/')) html = `<img src="${content}" class="media-content" onclick="viewMedia('${content}', 'image')" style="max-width:200px; border-radius:12px; cursor:pointer;">`;
            else if (file.type.startsWith('video/')) html = `<video src="${content}" class="media-content" controls style="max-width:200px; border-radius:12px;"></video>`;
            else html = `<div class="file-content" style="display:inline-flex; align-items:center; gap:8px; background:rgba(0,0,0,0.3); padding:6px 12px; border-radius:20px;">📎 ${file.name} (${(file.size/1024/1024).toFixed(2)} МБ)</div>`;
            socket.emit('sendMessage', { chatId: currentChat, from: currentUser, text: html, time: getFormattedTime() });
        };
        reader.readAsDataURL(file);
    }

    window.viewMedia = (src, type) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        if (type === 'image') modal.innerHTML = `<img src="${src}" style="max-width:90%; max-height:80%; border-radius:16px;">`;
        else modal.innerHTML = `<video src="${src}" controls style="max-width:90%; max-height:80%;"></video>`;
        modal.onclick = () => modal.remove();
        document.body.appendChild(modal);
    };

    // ========== ГОЛОСОВЫЕ СООБЩЕНИЯ ==========
    function startVoiceRecording() {
        if (isRecording) {
            if (mediaRecorder) {
                mediaRecorder.stop();
                isRecording = false;
                document.getElementById('voiceRecBar').style.display = 'none';
                document.getElementById('msgInput').style.display = 'block';
            }
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = e => {
                        socket.emit('sendMessage', { chatId: currentChat, from: currentUser, text: `<audio src="${e.target.result}" controls style="max-width:200px;"></audio>`, time: getFormattedTime() });
                    };
                    reader.readAsDataURL(audioBlob);
                    stream.getTracks().forEach(track => track.stop());
                };
                mediaRecorder.start();
                isRecording = true;
                document.getElementById('msgInput').style.display = 'none';
                document.getElementById('voiceRecBar').style.display = 'flex';
                let elapsed = 0;
                const interval = setInterval(() => {
                    if (!isRecording) { clearInterval(interval); return; }
                    elapsed += 0.1;
                    document.getElementById('voiceWaveFill').style.width = Math.min(100, (elapsed / 60) * 100) + '%';
                }, 100);
            })
            .catch(() => showToast('Нет доступа к микрофону'));
    }

    function cancelVoiceRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            document.getElementById('voiceRecBar').style.display = 'none';
            document.getElementById('msgInput').style.display = 'block';
        }
    }

    // ========== ЭМОДЗИ ==========
    function showEmojiPicker() {
        const emojis = ['😀','😂','😍','😎','🔥','⭐','🎮','⚡','💀','❤️','👍','🙈','✨','🎉','💔','✅','❌'];
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-box"><h3>Эмодзи</h3><div class="emoji-picker" id="emojiGrid"></div><button id="closeEmoji" class="auth-btn" style="margin-top:16px;">Закрыть</button></div>`;
        document.body.appendChild(modal);
        const grid = modal.querySelector('#emojiGrid');
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji-option';
            span.innerText = emoji;
            span.onclick = () => {
                document.getElementById('msgInput').value += emoji;
                modal.remove();
            };
            grid.appendChild(span);
        });
        modal.querySelector('#closeEmoji').onclick = () => modal.remove();
    }

    // ========== РЕНДЕР СООБЩЕНИЙ ==========
    function renderMessages() {
        const container = document.getElementById('messagesList');
        if (!container) return;
        const msgs = messagesData[currentChat] || [];
        if (msgs.length === 0) {
            container.innerHTML = '<div style="text-align:center; opacity:0.5;">💬 Начните общение</div>';
            return;
        }
        container.innerHTML = msgs.map((msg, idx) => {
            const avatarHtml = getAvatarForUser(msg.from);
            return `
                <div class="message ${msg.from === currentUser ? 'my-message' : ''}" data-idx="${idx}">
                    <div class="message-avatar" onclick="showUserProfile('${msg.from}')">${avatarHtml}</div>
                    <div class="message-content">
                        <strong>${msg.from}:</strong> ${msg.text}<br>
                        <small>${msg.time}</small>
                        <div class="message-actions">
                            <span class="reply-action">↩️ Ответить</span>
                            <span class="forward-action">📤 Переслать</span>
                            ${msg.from === currentUser ? '<span class="delete-action">🗑️ Удалить</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        document.querySelectorAll('.reply-action').forEach(el => {
            el.onclick = () => {
                const idx = el.closest('.message').dataset.idx;
                const msg = messagesData[currentChat][idx];
                replyTo = { text: msg.text, from: msg.from };
                document.getElementById('msgInput').focus();
                document.getElementById('replyIndicator').innerHTML = `<span>↩️ Ответ ${replyTo.from}: "${replyTo.text.substring(0,40)}"</span><button id="cancelReplyBtn" style="background:none; border:none; color:cyan; cursor:pointer;">✖ Отмена</button>`;
                document.getElementById('cancelReplyBtn').style.display = 'inline-block';
                document.getElementById('cancelReplyBtn').onclick = () => {
                    replyTo = null;
                    document.getElementById('replyIndicator').innerHTML = '<span></span><button id="cancelReplyBtn" style="display:none;">✖ Отмена</button>';
                };
            };
        });
        document.querySelectorAll('.forward-action').forEach(el => { el.onclick = () => showToast('Пересылка в разработке'); });
        document.querySelectorAll('.delete-action').forEach(el => {
            el.onclick = () => {
                const idx = el.closest('.message').dataset.idx;
                const msg = messagesData[currentChat][idx];
                if (msg && msg.from === currentUser) {
                    if (confirm('Удалить сообщение?')) socket.emit('deleteMessage', { chatId: currentChat, messageIndex: idx });
                } else showToast('Можно удалять только свои сообщения');
            };
        });
        container.scrollTop = container.scrollHeight;
    }

    async function loadMessages() {
        if (currentChat === 'favorites') {
            const favoritesKey = `favorites_${currentUser}`;
            messagesData['favorites'] = JSON.parse(localStorage.getItem(favoritesKey) || '[]');
            renderMessages();
            return;
        }
        const res = await fetch(`/messages/${currentChat}`);
        messagesData[currentChat] = await res.json();
        renderMessages();
    }

    function saveFavoriteMessage(text) {
        const favoritesKey = `favorites_${currentUser}`;
        let favMessages = JSON.parse(localStorage.getItem(favoritesKey) || '[]');
        favMessages.push({ from: currentUser, text: text, time: getFormattedTime() });
        localStorage.setItem(favoritesKey, JSON.stringify(favMessages));
        if (currentChat === 'favorites') {
            messagesData['favorites'] = favMessages;
            renderMessages();
        }
    }

    // ========== МЕНЮ ЧАТА ==========
    function showChatMenu() {
        const menu = document.createElement('div');
        menu.className = 'chat-menu';
        const isMuted = mutedChats[currentChat];
        const isFavorites = currentChat === 'favorites';
        const currentChatObj = allChats.find(c => c.id === currentChat);
        const isGroup = currentChatObj?.isGroup === true;
        const isCreator = isGroup && currentChatObj?.creator === currentUser;
        let html = `<div id="menuClear" style="padding:8px 16px; cursor:pointer;">🧹 Очистить чат</div>`;
        if (isGroup && isCreator) html += `<div id="menuAddSubgroup" style="padding:8px 16px; cursor:pointer;">➕ Добавить подгруппу</div>`;
        html += `<div id="menuSearch" style="padding:8px 16px; cursor:pointer;">🔍 Поиск в чате</div><div id="menuNotifications" style="padding:8px 16px; cursor:pointer;">${isMuted ? '🔔 Вкл уведомления' : '🔕 Выкл уведомления'}</div>`;
        if (!isFavorites) html += `<div id="menuDelete" style="padding:8px 16px; cursor:pointer;">🗑 Удалить чат</div>`;
        menu.innerHTML = html;
        document.body.appendChild(menu);
        const rect = document.querySelector('.chat-header-dots').getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.background = '#0a1428';
        menu.style.border = '1px solid #0af';
        menu.style.borderRadius = '16px';
        menu.style.padding = '8px';
        menu.style.zIndex = '200';
        menu.style.left = rect.left - 120 + 'px';
        menu.style.top = rect.bottom + 5 + 'px';
        menu.querySelector('#menuClear').onclick = () => {
            if (confirm(`Очистить чат "${currentChatName}"?`)) {
                if (currentChat === 'favorites') {
                    localStorage.setItem(`favorites_${currentUser}`, JSON.stringify([]));
                    messagesData['favorites'] = [];
                } else messagesData[currentChat] = [];
                renderMessages();
            }
            menu.remove();
        };
        if (isGroup && isCreator && menu.querySelector('#menuAddSubgroup')) menu.querySelector('#menuAddSubgroup').onclick = () => { showAddSubgroupModal(currentChat, currentChatName); menu.remove(); };
        menu.querySelector('#menuSearch').onclick = () => { openSearch(); menu.remove(); };
        menu.querySelector('#menuNotifications').onclick = () => {
            mutedChats[currentChat] = !mutedChats[currentChat];
            saveMuted();
            renderChats();
            menu.remove();
        };
        if (!isFavorites && menu.querySelector('#menuDelete')) menu.querySelector('#menuDelete').onclick = () => { deleteChat(currentChat, currentChatName, false); menu.remove(); };
        setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
    }

    function showAddSubgroupModal(groupId, groupName) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-box">
                <h3>➕ Добавить подгруппу в "${groupName}"</h3>
                <input type="text" id="subgroupName" placeholder="Название подгруппы">
                <div class="modal-buttons">
                    <button id="confirmCreate">Создать</button>
                    <button id="cancelCreate">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#confirmCreate').onclick = () => {
            const name = modal.querySelector('#subgroupName').value.trim();
            if (!name) return showToast('Введите название');
            if (!subgroups[groupId]) subgroups[groupId] = [];
            subgroups[groupId].push({ id: Date.now(), name: name });
            saveSubgroups();
            renderChats();
            modal.remove();
            showToast(`Подгруппа "${name}" создана`);
        };
        modal.querySelector('#cancelCreate').onclick = () => modal.remove();
    }

    function deleteChat(chatId, chatName, leaveOnly) {
        if (chatId === 'favorites') { showToast('Избранное нельзя удалить'); return; }
        if (confirm(leaveOnly ? `Выйти из чата "${chatName}"?` : `Удалить чат "${chatName}"?`)) {
            if (leaveOnly) {
                const group = groups.find(g => g.id == chatId);
                if (group) group.members = group.members.filter(m => m !== currentUser);
                const channel = channels.find(c => c.id == chatId);
                if (channel) channel.members = channel.members.filter(m => m !== currentUser);
                saveGroups(); saveChannels();
            } else {
                groups = groups.filter(g => g.id != chatId);
                channels = channels.filter(c => c.id != chatId);
                saveGroups(); saveChannels();
            }
            allChats = allChats.filter(c => c.id !== chatId);
            delete messagesData[chatId];
            renderChats();
            if (currentChat === chatId) {
                currentChat = 'favorites';
                currentChatName = 'Избранное';
                document.getElementById('chatTitle').innerText = 'Избранное';
                loadMessages();
                socket.emit('join', currentChat);
            }
            showToast(leaveOnly ? `Вы вышли из ${chatName}` : `Чат ${chatName} удалён`);
        }
    }

    // ========== ПОИСК В ЧАТЕ ==========
    function performSearchInMessages() {
        const query = document.getElementById('messageSearchInput')?.value.toLowerCase();
        const searchCountSpan = document.getElementById('searchCount');
        if (!query) {
            clearAllHighlights();
            if (searchCountSpan) searchCountSpan.innerText = '0';
            return;
        }
        const messages = document.querySelectorAll('.chat-messages .message');
        clearAllHighlights();
        currentMatches = [];
        messages.forEach(msg => {
            const text = msg.innerText.toLowerCase();
            if (text.includes(query)) {
                msg.classList.add('highlight');
                currentMatches.push(msg);
            }
        });
        if (searchCountSpan) searchCountSpan.innerText = currentMatches.length.toString();
        if (currentMatches.length > 0) {
            currentMatchIndex = 0;
            highlightCurrentMatch();
        } else currentMatchIndex = -1;
    }

    function clearAllHighlights() {
        document.querySelectorAll('.chat-messages .message').forEach(msg => {
            msg.classList.remove('highlight', 'current-highlight');
        });
        currentMatches = [];
        currentMatchIndex = -1;
    }

    function highlightCurrentMatch() {
        document.querySelectorAll('.chat-messages .message').forEach(msg => msg.classList.remove('current-highlight'));
        if (currentMatchIndex >= 0 && currentMatches[currentMatchIndex]) {
            const currentMsg = currentMatches[currentMatchIndex];
            currentMsg.classList.add('current-highlight');
            currentMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const searchCountSpan = document.getElementById('searchCount');
            if (searchCountSpan) searchCountSpan.innerText = `${currentMatchIndex + 1}/${currentMatches.length}`;
        } else if (currentMatches.length > 0 && searchCountSpan) searchCountSpan.innerText = currentMatches.length.toString();
    }

    function navigateSearch(delta) {
        if (currentMatches.length === 0) return;
        currentMatchIndex += delta;
        if (currentMatchIndex < 0) currentMatchIndex = currentMatches.length - 1;
        if (currentMatchIndex >= currentMatches.length) currentMatchIndex = 0;
        highlightCurrentMatch();
    }

    function openSearch() {
        document.getElementById('searchBar').style.display = 'flex';
        document.getElementById('messageSearchInput').focus();
    }

    function closeSearch() {
        document.getElementById('searchBar').style.display = 'none';
        clearAllHighlights();
        document.getElementById('messageSearchInput').value = '';
        const searchCountSpan = document.getElementById('searchCount');
        if (searchCountSpan) searchCountSpan.innerText = '0';
    }

    // ========== ЗАГРУЗКА ЧАТОВ ==========
    async function loadChats() {
        const res = await fetch('/chats');
        let chats = await res.json();
        allChats = chats.filter(c => c.name !== 'Новости ST_Link' && !deletedChats.includes(c.id));
        if (!allChats.find(c => c.id === 'favorites')) allChats.unshift({ id: 'favorites', name: 'Избранное', avatar: '⭐', private: true });
        groups.forEach(g => { if (g.members?.includes(currentUser) && !allChats.some(c => c.id === g.id)) allChats.push({ id: g.id, name: g.name, avatar: g.avatar, isGroup: true, creator: g.creator }); });
        channels.forEach(c => { if (c.members?.includes(currentUser) && !allChats.some(ch => ch.id === c.id)) allChats.push({ id: c.id, name: c.name, avatar: c.avatar, isChannel: true, creator: c.creator }); });
    }

    function renderChats() {
        const container = document.getElementById('chatsList');
        if (!container) return;
        container.innerHTML = '';
        allChats.forEach(chat => {
            const isMuted = mutedChats[chat.id];
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.innerHTML = `<div class="chat-info"><span>${chat.avatar || '💬'}</span><span>${chat.name} ${isMuted ? '<span class="chat-muted-icon">🔇</span>' : ''}</span></div>`;
            div.onclick = () => {
                currentChat = chat.id;
                currentChatName = chat.name;
                document.getElementById('chatTitle').innerText = chat.name;
                loadMessages();
                socket.emit('join', chat.id);
                closeSearch();
                replyTo = null;
                document.getElementById('replyIndicator').innerHTML = '<span></span><button id="cancelReplyBtn" style="display:none;">✖ Отмена</button>';
            };
            container.appendChild(div);
            if (subgroups[chat.id] && subgroups[chat.id].length > 0) {
                subgroups[chat.id].forEach(sub => {
                    const subDiv = document.createElement('div');
                    subDiv.className = 'subgroup-item';
                    subDiv.innerHTML = `<div class="chat-info"><span>📌</span><span style="font-size:13px;">${sub.name}</span></div>`;
                    subDiv.onclick = (e) => {
                        e.stopPropagation();
                        currentChat = `sub_${sub.id}`;
                        currentChatName = sub.name;
                        document.getElementById('chatTitle').innerText = sub.name;
                        if (!messagesData[currentChat]) messagesData[currentChat] = [];
                        renderMessages();
                        socket.emit('join', currentChat);
                        closeSearch();
                    };
                    container.appendChild(subDiv);
                });
            }
        });
    }

    // ========== ОСНОВНОЙ ЗАПУСК ==========
    async function startMessenger() {
        await loadUsersList();
        await loadChannelsList();
        await loadGroupsList();
        await loadChats();
        socket = io();
        socket.on('newMessage', (msg) => {
            if (currentChat === 'favorites') return;
            if (!messagesData[currentChat]) messagesData[currentChat] = [];
            messagesData[currentChat].push(msg);
            renderMessages();
            if (!mutedChats[currentChat] && msg.from !== currentUser) {
                const audio = new Audio('/sounds/notifica.mp3');
                audio.play().catch(e => console.log);
                document.title = '🔔 Новое сообщение';
                setTimeout(() => document.title = 'StormLink', 3000);
            }
        });
        socket.on('messageDeleted', ({ chatId, messageIndex }) => {
            if (chatId === 'favorites') return;
            if (messagesData[chatId]) { messagesData[chatId].splice(messageIndex, 1); if (chatId === currentChat) renderMessages(); }
        });

        document.getElementById('app').innerHTML = `
            <button class="burger-btn" id="burgerBtn">☰</button>
            <div class="messenger">
                <div class="icon-bar">
                    <div class="icon-item ${activeLeftTab === 'profile' ? 'active' : ''}" id="tabProfile">👤</div>
                    <div class="icon-item ${activeLeftTab === 'users' ? 'active' : ''}" id="tabUsers">👥</div>
                    <div class="icon-item ${activeLeftTab === 'channels' ? 'active' : ''}" id="tabChannels">📢</div>
                    <div class="icon-item ${activeLeftTab === 'groups' ? 'active' : ''}" id="tabGroups">👥</div>
                </div>
                <div class="content-panel" id="contentPanel">
                    <div class="search-header">
                        <input type="text" id="leftSearchInput" placeholder="Поиск...">
                    </div>
                    <div class="content-header" id="contentTitle">Мой профиль</div>
                    <div class="list-container" id="listContainer"></div>
                </div>
                <div class="chat-panel" id="chatContainer">
                    <div style="display:flex; align-items:center; justify-content:center; height:100%; opacity:0.5;">Выберите чат</div>
                </div>
            </div>
            <button class="friends-icon" id="friendsIcon">👥</button>
        `;

        if (userAvatars[currentUser]) {
            // аватар уже отображается через renderLeftPanelContent
        }

        document.getElementById('tabProfile').onclick = () => { activeLeftTab = 'profile'; renderLeftPanelContent(); };
        document.getElementById('tabUsers').onclick = () => { activeLeftTab = 'users'; renderLeftPanelContent(); };
        document.getElementById('tabChannels').onclick = () => { activeLeftTab = 'channels'; renderLeftPanelContent(); };
        document.getElementById('tabGroups').onclick = () => { activeLeftTab = 'groups'; renderLeftPanelContent(); };
        document.getElementById('leftSearchInput').addEventListener('input', () => renderLeftPanelContent());
        document.getElementById('friendsIcon').onclick = showFriendsList;
        document.getElementById('burgerBtn').onclick = () => document.getElementById('contentPanel').classList.toggle('open');

        renderLeftPanelContent();
        renderChats();
        loadMessages();
        socket.emit('join', currentChat);
    }

    function showFriendsList() {
        const userFriends = friends[currentUser] || [];
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `<div class="friends-list"><h3>👥 Друзья</h3><div id="friendsContainer"></div><button id="closeFriends" class="auth-btn" style="margin-top:16px;">Закрыть</button></div>`;
        document.body.appendChild(modal);
        const container = modal.querySelector('#friendsContainer');
        if (userFriends.length === 0) container.innerHTML = '<p style="text-align:center;">Нет друзей</p>';
        else {
            userFriends.forEach(login => {
                const avatar = userAvatars[login] || null;
                const div = document.createElement('div');
                div.className = 'friend-item';
                div.innerHTML = `<div class="friend-avatar" style="${avatar ? `background-image:url(${avatar}); background-size:cover;` : ''}">${!avatar ? '⚡' : ''}</div><div><strong>${login}</strong></div>`;
                div.onclick = () => { modal.remove(); showUserProfile(login); };
                container.appendChild(div);
            });
        }
        modal.querySelector('#closeFriends').onclick = () => modal.remove();
    }

    renderAuth();
</script>
</body>
</html>

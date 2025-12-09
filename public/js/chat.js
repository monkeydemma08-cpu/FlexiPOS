const roomListEl = document.getElementById('chat-room-list');
const roomSearchEl = document.getElementById('chat-room-search');
const roomFilterEl = document.getElementById('chat-room-filter');
const refreshRoomsBtn = document.getElementById('chat-refresh-rooms');
const layoutEl = document.getElementById('chat-layout');
const backBtn = document.getElementById('chat-back-btn');
const roomNameEl = document.getElementById('chat-room-name');
const roomMetaEl = document.getElementById('chat-room-meta');
const clearChatBtn = document.getElementById('chat-clear-btn');
const messagesEl = document.getElementById('chat-messages');
const pinnedEl = document.getElementById('chat-pinned');
const emptyStateEl = document.getElementById('chat-empty-state');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send-btn');
const mentionBoxEl = document.getElementById('chat-mention-box');
const homeLinkEl = document.getElementById('chat-home-link');
const typingIndicatorEl = document.getElementById('chat-typing-indicator');
const searchToggleEl = document.getElementById('chat-search-toggle');
const searchPanelEl = document.getElementById('chat-search-panel');
const searchCloseEl = document.getElementById('chat-search-close');
const searchTextEl = document.getElementById('chat-search-text');
const searchUserEl = document.getElementById('chat-search-user');
const searchFromEl = document.getElementById('chat-search-from');
const searchToEl = document.getElementById('chat-search-to');
const searchSubmitEl = document.getElementById('chat-search-submit');
const searchResultsEl = document.getElementById('chat-search-results');
const privateUserEl = document.getElementById('chat-private-user');
const privateStartEl = document.getElementById('chat-private-start');

const ROLES_HOME = {
  admin: '/admin.html',
  mesera: '/mesera.html',
  cocina: '/cocina.html',
  bar: '/bar.html',
  caja: '/caja.html',
};

const state = {
  rooms: [],
  selectedRoom: null,
  mensajes: [],
  pinned: [],
  mentionables: [],
  typingUsers: new Map(),
  isTyping: false,
  typingTimeout: null,
  lastReadSentByRoom: new Map(),
  searchResults: [],
};

let socket = null;

const getUser = () => (typeof getStoredUser === 'function' ? getStoredUser() : null);
const authHeaders = () => (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {});
const getCurrentUserId = () => {
  const user = getUser();
  return user?.usuarioId ?? user?.id ?? null;
};

const handleAuthIssues = (status) => {
  if (status === 401 || status === 403) {
    if (typeof handleUnauthorized === 'function') {
      handleUnauthorized();
    }
    return true;
  }
  return false;
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const normalizeMensaje = (msg) => {
  if (!msg) return msg;

  const rawActualId = getCurrentUserId();
  const usuarioIdActual = Number.isFinite(Number(rawActualId)) ? Number(rawActualId) : null;
  const rawMensajeId = msg.usuario_id ?? msg.usuarioId;
  const mensajeUsuarioId = Number.isFinite(Number(rawMensajeId)) ? Number(rawMensajeId) : null;

  const menciona =
    msg.menciona_actual ||
    (msg.menciones || []).some((m) => Number(m.usuario_id) === Number(usuarioIdActual));

  // Forzamos cálculo local: solo es "mine" si el usuario_id del mensaje coincide con el usuario actual
  const esPropio = mensajeUsuarioId != null && usuarioIdActual != null && mensajeUsuarioId === usuarioIdActual;

  return {
    ...msg,
    usuario_id: mensajeUsuarioId,
    menciona_actual: Boolean(menciona),
    es_propietario: Boolean(esPropio),
    read_by_others: Boolean(msg.read_by_others),
  };
};

const applyHomeLink = () => {
  const user = getUser();
  if (!homeLinkEl || !user?.rol) return;
  const path = ROLES_HOME[user.rol] || '/';
  homeLinkEl.href = path;
};

const setRoomLayout = (active) => {
  if (!layoutEl) return;
  if (active) {
    layoutEl.classList.add('room-active');
  } else {
    layoutEl.classList.remove('room-active');
  }
};

const resetGlobalUnread = () => {
  try {
    localStorage.setItem('chatUnreadCount', '0');
  } catch (err) {
    /* ignore */
  }
  const badge = document.getElementById('chat-unread-badge');
  if (badge) {
    badge.style.display = 'none';
    badge.textContent = '';
  }
};

const renderTypingIndicator = () => {
  if (!typingIndicatorEl) return;
  const typingUsers = Array.from(state.typingUsers.values());
  if (!typingUsers.length) {
    typingIndicatorEl.hidden = true;
    typingIndicatorEl.textContent = '';
    return;
  }

  const nombres = typingUsers.slice(0, 2).map((u) => u.nombre || `Usuario ${u.usuario_id}`);
  let texto =
    typingUsers.length === 1
      ? `${nombres[0]} esta escribiendo...`
      : `${typingUsers.length} personas estan escribiendo...`;
  typingIndicatorEl.textContent = texto;
  typingIndicatorEl.hidden = false;
};

const notifyTypingStart = () => {
  if (!state.selectedRoom || !socket || !socket.connected) return;
  if (!state.isTyping) {
    socket.emit('typing:start', { room_id: state.selectedRoom.id });
    state.isTyping = true;
  }
  if (state.typingTimeout) {
    clearTimeout(state.typingTimeout);
  }
  state.typingTimeout = setTimeout(() => {
    notifyTypingStop();
  }, 2500);
};

const notifyTypingStop = () => {
  if (!state.selectedRoom || !socket || !socket.connected) return;
  if (state.typingTimeout) {
    clearTimeout(state.typingTimeout);
  }
  state.typingTimeout = null;
  if (state.isTyping) {
    socket.emit('typing:stop', { room_id: state.selectedRoom.id });
  }
  state.isTyping = false;
};

const updateTypingUsers = (payload) => {
  if (!payload || !state.selectedRoom || Number(payload.room_id) !== Number(state.selectedRoom.id)) return;
  const userId = Number(payload.usuario_id);
  const currentUserId = getCurrentUserId();
  if (userId && currentUserId && userId === Number(currentUserId)) {
    return; // ignorar eco
  }

  if (payload.typing) {
    state.typingUsers.set(userId, { usuario_id: userId, nombre: payload.nombre || '' });
  } else {
    state.typingUsers.delete(userId);
  }
  renderTypingIndicator();
};

const reportMessagesRead = async () => {
  if (!state.selectedRoom || !state.mensajes.length) return;
  if (messagesEl) {
    const distancia = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (distancia > 140) {
      return;
    }
  }
  const lastMessage = state.mensajes[state.mensajes.length - 1];
  const lastId = Number(lastMessage?.id);
  if (!lastId) return;
  const previous = state.lastReadSentByRoom.get(state.selectedRoom.id);
  if (previous && previous >= lastId) return;

  try {
    await fetch('/api/chat/messages/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        room_id: state.selectedRoom.id,
        last_visible_message_id: lastId,
      }),
    });
    state.lastReadSentByRoom.set(state.selectedRoom.id, lastId);
  } catch (error) {
    console.error('No se pudieron marcar los mensajes como leidos:', error);
  }
};

const renderRooms = () => {
  if (!roomListEl) return;
  roomListEl.innerHTML = '';

  if (!state.rooms.length) {
    const empty = document.createElement('div');
    empty.className = 'chat-room-empty';
    empty.textContent = 'No hay salas disponibles para tu negocio.';
    roomListEl.appendChild(empty);
    return;
  }

  state.rooms.forEach((room) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chat-room-item';
    const unread = Number(room.unread_count || 0);
    if (state.selectedRoom && Number(state.selectedRoom.id) === Number(room.id)) {
      item.classList.add('active');
    }
    if (room.tiene_nuevo || unread > 0) {
      item.classList.add('room-unread');
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'chat-room-header-row';

    const title = document.createElement('div');
    title.className = 'chat-room-title';
    const roomName =
      room.tipo === 'private'
        ? room.titulo_privado || room.contacto_nombre || room.contacto_usuario || room.nombre
        : room.nombre || `Sala ${room.id}`;
    title.textContent = roomName;
    title.title = roomName;

    if (unread > 0) {
      const badge = document.createElement('span');
      badge.className = 'chat-room-unread-badge';
      badge.textContent = unread > 99 ? '99+' : unread;
      headerRow.appendChild(title);
      headerRow.appendChild(badge);
    } else {
      headerRow.appendChild(title);
    }

    const meta = document.createElement('div');
    meta.className = 'chat-room-meta';
    if (room.tipo === 'private') {
      const contactLabel = room.contacto_nombre || room.contacto_usuario || 'Privado';
      meta.textContent = `Privada con ${contactLabel}`;
    } else {
      meta.textContent = 'Canal';
    }

    item.appendChild(headerRow);
    item.appendChild(meta);
    item.addEventListener('click', () => selectRoom(room.id));
    roomListEl.appendChild(item);
  });
};

const renderPinned = () => {
  if (!pinnedEl) return;
  pinnedEl.innerHTML = '';
  const pinnedMessages = state.pinned || [];

  if (!pinnedMessages.length) {
    pinnedEl.classList.add('hidden');
    return;
  }

  pinnedEl.classList.remove('hidden');
  pinnedMessages.forEach((msg) => {
    const normalizado = normalizeMensaje(msg);
    const card = document.createElement('div');
    card.className = 'chat-pinned-item';
    const title = document.createElement('div');
    title.className = 'chat-pinned-author';
    title.textContent = normalizado.usuario_nombre || normalizado.usuario_usuario || 'Usuario';
    const text = document.createElement('div');
    text.className = 'chat-pinned-text';
    text.textContent = normalizado.contenido || '';
    const time = document.createElement('div');
    time.className = 'chat-pinned-time';
    time.textContent = formatTime(normalizado.created_at);
    if (state.selectedRoom?.puede_fijar) {
      const unpin = document.createElement('button');
      unpin.type = 'button';
      unpin.className = 'kanm-button ghost';
      unpin.textContent = 'Quitar';
      unpin.style.marginTop = '6px';
      unpin.addEventListener('click', () => togglePin({ ...normalizado, is_pinned: true }));
      card.appendChild(unpin);
    }
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(time);
    pinnedEl.appendChild(card);
  });
};

const renderMessages = () => {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';

  const mensajes = state.mensajes || [];
  if (!mensajes.length) {
    if (emptyStateEl) emptyStateEl.hidden = false;
    return;
  }
  if (emptyStateEl) emptyStateEl.hidden = true;

  const puedeFijar = state.selectedRoom?.puede_fijar;

  mensajes.forEach((msg) => {
    const normalizado = normalizeMensaje(msg);
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message';
    wrapper.dataset.messageId = normalizado.id;
    if (normalizado.es_propietario) wrapper.classList.add('mine');
    if (normalizado.menciona_actual) wrapper.classList.add('mention');
    if (normalizado.is_pinned) wrapper.classList.add('is-pinned');

    const header = document.createElement('div');
    header.className = 'chat-message-header';
    const autor = document.createElement('span');
    autor.className = 'chat-message-author';
    autor.textContent = msg.usuario_nombre || msg.usuario_usuario || 'Usuario';
    const tiempo = document.createElement('span');
    tiempo.className = 'chat-message-time';
    tiempo.textContent = formatTime(normalizado.created_at);
    header.appendChild(autor);
    header.appendChild(tiempo);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'chat-message-body';
    cuerpo.textContent = normalizado.contenido || '';

    const acciones = document.createElement('div');
    acciones.className = 'chat-message-actions';
    if (puedeFijar) {
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'chat-pin-btn';
      pinBtn.textContent = normalizado.is_pinned ? 'Desfijar' : 'Fijar';
      pinBtn.title = normalizado.is_pinned ? 'Desfijar' : 'Fijar mensaje';
      pinBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        togglePin(normalizado);
      });
      acciones.appendChild(pinBtn);
    }

    wrapper.appendChild(header);
    wrapper.appendChild(cuerpo);
    if (acciones.childElementCount > 0) {
      wrapper.appendChild(acciones);
    }

    if (normalizado.es_propietario && normalizado.read_by_others) {
      const status = document.createElement('div');
      status.className = 'chat-message-status';
      status.textContent = 'Visto';
      wrapper.appendChild(status);
    }

    messagesEl.appendChild(wrapper);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
  renderPinned();
  reportMessagesRead();
};

const updatePinnedState = (messageId, isPinned) => {
  state.mensajes = (state.mensajes || []).map((msg) =>
    Number(msg.id) === Number(messageId) ? { ...msg, is_pinned: isPinned ? 1 : 0 } : msg
  );
  state.pinned = state.mensajes.filter((m) => m.is_pinned);
  renderMessages();
};

const handleIncomingMessage = (mensaje) => {
  if (!mensaje) return;
  const normalizado = normalizeMensaje(mensaje);
  normalizado.read_by_others = Boolean(normalizado.read_by_others);
  // Asegurar que traemos el usuario_id normalizado por si el payload viene sin coercción numérica
  const fallbackId = Number.isFinite(Number(normalizado.usuario_id))
    ? Number(normalizado.usuario_id)
    : Number.isFinite(Number(normalizado.usuarioId))
    ? Number(normalizado.usuarioId)
    : null;
  normalizado.usuario_id = fallbackId;
  const roomId = Number(mensaje.room_id);
  const currentRoomId = state.selectedRoom ? Number(state.selectedRoom.id) : null;

  const roomIndex = state.rooms.findIndex((r) => Number(r.id) === roomId);
  if (roomIndex >= 0 && roomId !== currentRoomId) {
    state.rooms[roomIndex].tiene_nuevo = true;
    const currentUnread = Number(state.rooms[roomIndex].unread_count || 0);
    state.rooms[roomIndex].unread_count = currentUnread + 1;
    renderRooms();
  }

  if (currentRoomId && roomId === currentRoomId) {
    const existe = state.mensajes.some((m) => Number(m.id) === Number(normalizado.id));
    if (!existe) {
      state.mensajes.push(normalizado);
      state.pinned = state.mensajes.filter((m) => m.is_pinned);
      renderMessages();
    }
  }
};

const handleMessagesReadEvent = (payload) => {
  if (!payload || !state.selectedRoom || Number(payload.room_id) !== Number(state.selectedRoom.id)) return;
  const readerId = Number(payload.usuario_id);
  const lastRead = Number(payload.last_read_message_id);
  const currentUserId = getCurrentUserId();

  if (!readerId || !lastRead) return;
  if (currentUserId && readerId === Number(currentUserId)) {
    // actualizar cache local para evitar re-envios innecesarios
    state.lastReadSentByRoom.set(state.selectedRoom.id, lastRead);
    return;
  }

  let actualizado = false;
  state.mensajes = (state.mensajes || []).map((msg) => {
    if (msg.es_propietario && Number(msg.id) <= lastRead) {
      if (!msg.read_by_others) actualizado = true;
      return { ...msg, read_by_others: true };
    }
    return msg;
  });

  if (actualizado) {
    renderMessages();
  }
};

const togglePin = async (mensaje) => {
  if (!mensaje?.id) return;
  try {
    const resp = await fetch(`/api/chat/messages/${mensaje.id}/pin`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ is_pinned: !mensaje.is_pinned }),
    });

    if (handleAuthIssues(resp.status)) return;
    if (!resp.ok) return;

    updatePinnedState(mensaje.id, !mensaje.is_pinned);
  } catch (error) {
    console.error('No se pudo fijar/desfijar el mensaje:', error);
  }
};

const clearChat = async () => {
  if (!state.selectedRoom) return;
  const confirmar = window.confirm('Vaciar todo el chat de esta sala?');
  if (!confirmar) return;

  try {
    const resp = await fetch(`/api/chat/rooms/${state.selectedRoom.id}/clear`, {
      method: 'POST',
      headers: { ...authHeaders() },
    });
    if (handleAuthIssues(resp.status)) return;
    if (!resp.ok) return;
    state.mensajes = [];
    state.pinned = [];
    renderMessages();
  } catch (error) {
    console.error('No se pudo vaciar el chat:', error);
  }
};

const joinRoomSocket = (roomId) => {
  if (!socket || !socket.connected) return;
  socket.emit('joinRoom', { room_id: roomId }, (resp) => {
    if (resp?.ok) {
      const roomIndex = state.rooms.findIndex((r) => Number(r.id) === Number(roomId));
      if (roomIndex >= 0) {
        state.rooms[roomIndex].tiene_nuevo = false;
        renderRooms();
      }
    }
  });
};

const leaveRoomSocket = (roomId) => {
  if (!socket || !socket.connected || !roomId) return;
  socket.emit('leaveRoom', { room_id: roomId });
};

const loadMessages = async (roomId) => {
  try {
    state.typingUsers = new Map();
    renderTypingIndicator();
    renderSearchResults([]);
    const params = new URLSearchParams({ room_id: roomId, pagina: 1 });
    const resp = await fetch(`/api/chat/messages?${params.toString()}`, {
      headers: { ...authHeaders() },
    });
    if (handleAuthIssues(resp.status)) return;

    const data = await resp.json();
    if (!data?.ok) return;

    const roomData =
      state.rooms.find((r) => Number(r.id) === Number(roomId)) || data.room || { id: roomId };
    state.selectedRoom = { ...roomData, ...data.room };

    const roomIndex = state.rooms.findIndex((r) => Number(r.id) === Number(roomId));
    if (roomIndex >= 0) {
      state.rooms[roomIndex] = {
        ...state.rooms[roomIndex],
        unread_count: 0,
        tiene_nuevo: false,
      };
    }

    roomNameEl.textContent = state.selectedRoom.nombre || `Sala ${state.selectedRoom.id}`;
    roomMetaEl.textContent =
      state.selectedRoom.tipo === 'private' ? 'Privada' : 'Canal del negocio';

    clearChatBtn.hidden = !state.selectedRoom?.puede_fijar;

    state.mensajes = (data.mensajes || []).map((m) => normalizeMensaje(m));
    state.pinned = state.mensajes.filter((m) => m.is_pinned);
    renderMessages();
    setRoomLayout(true);
    joinRoomSocket(roomId);
    renderRooms();
  } catch (error) {
    console.error('No se pudieron cargar los mensajes:', error);
  }
};

const loadRooms = async () => {
  try {
    const params = new URLSearchParams();
    if (roomFilterEl?.value) params.set('tipo', roomFilterEl.value);
    if (roomSearchEl?.value) params.set('q', roomSearchEl.value.trim());
    const query = params.toString();
    const url = query ? `/api/chat/rooms?${query}` : '/api/chat/rooms';

    const resp = await fetch(url, { headers: { ...authHeaders() } });
    if (handleAuthIssues(resp.status)) return;

    const data = await resp.json();
    if (!data?.ok) return;
    state.rooms = data.rooms || [];
    renderRooms();
  } catch (error) {
    console.error('No se pudieron cargar las salas:', error);
  }
};

const sendMessage = async () => {
  if (!state.selectedRoom) return;
  const texto = (inputEl.value || '').trim();
  if (!texto) return;

  sendBtn.disabled = true;
  try {
    const resp = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ room_id: state.selectedRoom.id, contenido: texto }),
    });
    if (handleAuthIssues(resp.status)) return;

    if (resp.ok) {
      const data = await resp.json();
      inputEl.value = '';
      mentionBoxEl.hidden = true;
      notifyTypingStop();
      if (!socket || !socket.connected) {
        handleIncomingMessage({ ...(data?.mensaje || {}), read_by_others: false });
      }
    }
  } catch (error) {
    console.error('No se pudo enviar el mensaje:', error);
  } finally {
    sendBtn.disabled = false;
  }
};

const updateMentionBox = () => {
  if (!mentionBoxEl || !inputEl) return;
  const cursor = inputEl.selectionStart || inputEl.value.length;
  const antes = inputEl.value.slice(0, cursor);
  if (!inputEl.value.includes('@')) {
    mentionBoxEl.hidden = true;
    mentionBoxEl.innerHTML = '';
    return;
  }
  const match = antes.match(/@([A-Za-z0-9_]*)$/);
  if (!match) {
    mentionBoxEl.hidden = true;
    mentionBoxEl.innerHTML = '';
    return;
  }

  const termino = (match[1] || '').toLowerCase();
  const candidatos = state.mentionables.filter(
    (u) =>
      u.usuario.toLowerCase().includes(termino) ||
      (u.nombre || '').toLowerCase().includes(termino)
  );

  if (!candidatos.length) {
    mentionBoxEl.hidden = true;
    mentionBoxEl.innerHTML = '';
    return;
  }

  mentionBoxEl.innerHTML = '';
  candidatos.slice(0, 5).forEach((user) => {
    const opcion = document.createElement('button');
    opcion.type = 'button';
    opcion.className = 'mention-option';
    opcion.textContent = `${user.nombre || user.usuario} (${user.usuario})`;
    // Evita que el blur del textarea se dispare antes de insertar
    opcion.addEventListener('mousedown', (ev) => ev.preventDefault());
    opcion.addEventListener('click', () => insertMention(user.usuario));
    mentionBoxEl.appendChild(opcion);
  });

  mentionBoxEl.hidden = false;
};

const insertMention = (username) => {
  if (!inputEl) return;
  const cursor = inputEl.selectionStart || inputEl.value.length;
  const antes = inputEl.value.slice(0, cursor);
  const despues = inputEl.value.slice(cursor);
  const match = antes.match(/@([A-Za-z0-9_]*)$/);
  if (!match) return;
  const inicio = antes.lastIndexOf('@');
  const nueva = `${antes.slice(0, inicio)}@${username} `;
  inputEl.value = nueva + despues;
  inputEl.focus();
  const pos = nueva.length;
  inputEl.setSelectionRange(pos, pos);
  mentionBoxEl.hidden = true;
  mentionBoxEl.innerHTML = '';
};

const loadMentionables = async () => {
  try {
    const resp = await fetch('/api/chat/mentions/users', { headers: { ...authHeaders() } });
    if (handleAuthIssues(resp.status)) return;
    const data = await resp.json();
    if (data?.ok) {
      state.mentionables = data.usuarios || [];
      renderSearchUsers();
      populatePrivateUsers();
    }
  } catch (error) {
    console.error('No se pudieron cargar las menciones disponibles:', error);
  }
};

const selectRoom = async (roomId) => {
  const previousRoom = state.selectedRoom ? state.selectedRoom.id : null;
  if (state.isTyping) {
    notifyTypingStop();
  }
  if (previousRoom) {
    leaveRoomSocket(previousRoom);
  }
  await loadMessages(roomId);
};

const renderSearchUsers = () => {
  if (!searchUserEl) return;
  const currentValue = searchUserEl.value;
  searchUserEl.innerHTML = '<option value=\"\">Todos los usuarios</option>';
  (state.mentionables || []).forEach((user) => {
    const opt = document.createElement('option');
    opt.value = user.id;
    opt.textContent = `${user.nombre || user.usuario} (${user.usuario})`;
    searchUserEl.appendChild(opt);
  });
  if (currentValue) {
    searchUserEl.value = currentValue;
  }
};

const toggleSearchPanel = (show) => {
  if (!searchPanelEl) return;
  const visible = show ?? searchPanelEl.classList.contains('hidden');
  if (visible) {
    searchPanelEl.classList.remove('hidden');
  } else {
    searchPanelEl.classList.add('hidden');
  }
};

const renderSearchResults = (resultados = []) => {
  state.searchResults = resultados || [];
  if (!searchResultsEl) return;
  searchResultsEl.innerHTML = '';

  if (!resultados.length) {
    const empty = document.createElement('div');
    empty.className = 'chat-search-item';
    empty.textContent = 'Sin resultados en esta sala.';
    searchResultsEl.appendChild(empty);
    return;
  }

  resultados.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'chat-search-item';
    card.dataset.messageId = item.id;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const autor = item.usuario_nombre || item.usuario_usuario || 'Usuario';
    meta.textContent = `${autor} - ${formatTime(item.created_at)}`;

    const texto = document.createElement('div');
    texto.className = 'texto';
    texto.textContent = item.contenido || '';

    card.appendChild(meta);
    card.appendChild(texto);

    card.addEventListener('click', () => scrollToMessage(item.id));
    searchResultsEl.appendChild(card);
  });
};

const scrollToMessage = (messageId) => {
  if (!messagesEl) return;
  const target = messagesEl.querySelector(`[data-message-id=\"${messageId}\"]`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlight');
    setTimeout(() => target.classList.remove('highlight'), 1200);
  } else {
    console.warn('Mensaje buscado no esta en la vista actual.');
  }
};

const performSearch = async () => {
  if (!state.selectedRoom) return;
  const params = new URLSearchParams();
  params.set('room_id', state.selectedRoom.id);
  if (searchTextEl?.value) params.set('q', searchTextEl.value.trim());
  if (searchUserEl?.value) params.set('usuario_id', searchUserEl.value);
  if (searchFromEl?.value) params.set('fecha_desde', searchFromEl.value);
  if (searchToEl?.value) params.set('fecha_hasta', searchToEl.value);

  const url = `/api/chat/messages/search?${params.toString()}`;
  try {
    const resp = await fetch(url, { headers: { ...authHeaders() } });
    if (handleAuthIssues(resp.status)) return;
    const data = await resp.json();
    if (data?.ok) {
      renderSearchResults(data.resultados || []);
    }
  } catch (error) {
    console.error('No se pudo ejecutar la busqueda en el chat:', error);
  }
};

const populatePrivateUsers = () => {
  if (!privateUserEl) return;
  const currentUserId = getCurrentUserId();
  privateUserEl.innerHTML = '<option value=\"\">Nuevo chat privado...</option>';
  (state.mentionables || []).forEach((user) => {
    if (Number(user.id) === Number(currentUserId)) return;
    const opt = document.createElement('option');
    opt.value = user.id;
    opt.textContent = `${user.nombre || user.usuario} (${user.usuario})`;
    privateUserEl.appendChild(opt);
  });
};

const startPrivateChat = async () => {
  if (!privateUserEl || !privateUserEl.value) return;
  const targetId = Number(privateUserEl.value);
  if (!targetId) return;

  try {
    const resp = await fetch('/api/chat/rooms/private', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ usuario_id: targetId }),
    });

    if (handleAuthIssues(resp.status)) return;
    if (!resp.ok) return;
    const data = await resp.json();
    await loadRooms();
    if (data?.room?.id) {
      await selectRoom(data.room.id);
    }
  } catch (error) {
    console.error('No se pudo crear el chat privado:', error);
  }
};

const initSocket = () => {
  const user = getUser();
  if (!user?.token || typeof io === 'undefined') return;

  socket = io({
    auth: {
      token: user.token,
    },
  });

  socket.on('message:new', (mensaje) => handleIncomingMessage(mensaje));
  socket.on('message:pinned', (payload) => {
    if (!payload?.room_id) return;
    if (state.selectedRoom && Number(state.selectedRoom.id) === Number(payload.room_id)) {
      updatePinnedState(payload.id, payload.is_pinned);
    }
  });
  socket.on('chat:cleared', (payload) => {
    if (state.selectedRoom && Number(state.selectedRoom.id) === Number(payload?.room_id)) {
      state.mensajes = [];
      state.pinned = [];
      renderMessages();
    }
  });
  socket.on('typing:update', (payload) => updateTypingUsers(payload));
  socket.on('messages:read', (payload) => handleMessagesReadEvent(payload));
};

const bindEvents = () => {
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      updateMentionBox();
      notifyTypingStart();
    });
    inputEl.addEventListener('click', updateMentionBox);
    inputEl.addEventListener('blur', () => {
      notifyTypingStop();
      if (mentionBoxEl) mentionBoxEl.hidden = true;
      if (mentionBoxEl) mentionBoxEl.innerHTML = '';
    });
  }
  if (refreshRoomsBtn) refreshRoomsBtn.addEventListener('click', loadRooms);
  if (roomFilterEl) roomFilterEl.addEventListener('change', loadRooms);
  if (roomSearchEl)
    roomSearchEl.addEventListener('input', () => {
      // Pequeno debounce manual
      clearTimeout(roomSearchEl._timer);
      roomSearchEl._timer = setTimeout(loadRooms, 250);
    });
  if (backBtn) backBtn.addEventListener('click', () => setRoomLayout(false));
  if (clearChatBtn) clearChatBtn.addEventListener('click', clearChat);
  if (inputEl) {
    inputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendMessage();
      }
    });
  }
  if (messagesEl) {
    messagesEl.addEventListener('scroll', () => {
      const distancia = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
      if (distancia < 60) {
        reportMessagesRead();
      }
    });
  }
  if (searchToggleEl) searchToggleEl.addEventListener('click', () => toggleSearchPanel(true));
  if (searchCloseEl) searchCloseEl.addEventListener('click', () => toggleSearchPanel(false));
  if (searchSubmitEl) searchSubmitEl.addEventListener('click', performSearch);
  if (privateStartEl) privateStartEl.addEventListener('click', startPrivateChat);
};

document.addEventListener('DOMContentLoaded', () => {
  applyHomeLink();
  resetGlobalUnread();
  bindEvents();
  loadRooms();
  loadMentionables();
  initSocket();
  populatePrivateUsers();
});

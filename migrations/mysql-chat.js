require('dotenv').config();
const { query } = require('../db-mysql');

async function tableExists(table) {
  const rows = await query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function indexExists(table, indexName) {
  const rows = await query(
    `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows.length > 0;
}

async function ensureIndex(table, indexName, columns, options = {}) {
  const { unique = false } = options || {};
  if (!(await tableExists(table))) return;
  if (await indexExists(table, indexName)) return;
  const cols = Array.isArray(columns) ? columns.join(', ') : columns;
  const uniqueSql = unique ? 'UNIQUE ' : '';
  await query(`CREATE ${uniqueSql}INDEX ${indexName} ON ${table} (${cols})`);
}

async function ensureTableChatRooms() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      negocio_id INT NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      tipo VARCHAR(50) NOT NULL DEFAULT 'channel',
      creado_por_usuario_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chat_rooms_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
      CONSTRAINT fk_chat_rooms_creador FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndex('chat_rooms', 'idx_chat_rooms_negocio', ['negocio_id']);
  await ensureIndex('chat_rooms', 'idx_chat_rooms_tipo', ['tipo']);
}

async function ensureTableChatRoomUsers() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_room_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      usuario_id INT NOT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chat_room_users_room FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_room_users_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndex('chat_room_users', 'ux_chat_room_users_room_usuario', ['room_id', 'usuario_id'], { unique: true });
  await ensureIndex('chat_room_users', 'idx_chat_room_users_usuario', ['usuario_id']);
}

async function ensureTableChatMessages() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      negocio_id INT NOT NULL,
      usuario_id INT NOT NULL,
      contenido TEXT NOT NULL,
      tipo VARCHAR(50) NOT NULL DEFAULT 'text',
      is_pinned TINYINT(1) NOT NULL DEFAULT 0,
      reply_to_message_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      CONSTRAINT fk_chat_messages_room FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_messages_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
      CONSTRAINT fk_chat_messages_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      CONSTRAINT fk_chat_messages_reply FOREIGN KEY (reply_to_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndex('chat_messages', 'idx_chat_messages_room', ['room_id']);
  await ensureIndex('chat_messages', 'idx_chat_messages_negocio', ['negocio_id']);
  await ensureIndex('chat_messages', 'idx_chat_messages_room_created', ['room_id', 'created_at']);
}

async function ensureTableChatMentions() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_mentions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      mentioned_usuario_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chat_mentions_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_mentions_usuario FOREIGN KEY (mentioned_usuario_id) REFERENCES usuarios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndex('chat_mentions', 'idx_chat_mentions_message', ['message_id']);
  await ensureIndex('chat_mentions', 'idx_chat_mentions_usuario', ['mentioned_usuario_id']);
}

// Registra lecturas de mensajes por usuario para estados "leído"
async function ensureTableChatMessageReads() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_message_reads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      usuario_id INT NOT NULL,
      read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_chat_message_reads_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_message_reads_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureIndex('chat_message_reads', 'ux_chat_message_reads_message_usuario', ['message_id', 'usuario_id'], {
    unique: true,
  });
  await ensureIndex('chat_message_reads', 'idx_chat_message_reads_usuario', ['usuario_id']);
}

async function seedDefaultRooms() {
  if (!(await tableExists('chat_rooms')) || !(await tableExists('negocios'))) {
    return;
  }

  const negocios = await query('SELECT id FROM negocios');
  for (const negocio of negocios) {
    const existe = await query(
      'SELECT id FROM chat_rooms WHERE negocio_id = ? ORDER BY id ASC LIMIT 1',
      [negocio.id]
    );
    if (existe.length === 0) {
      try {
          await query(`INSERT INTO chat_rooms (negocio_id, nombre, tipo, creado_por_usuario_id) VALUES (?, ?, 'channel', NULL)`, [negocio.id, 'General']);
      } catch (error) {
        console.warn('No se pudo crear la sala General para el negocio', negocio.id, error?.message || error);
      }
    }
  }
}

async function runChatMigrations() {
  await ensureTableChatRooms();
  await ensureTableChatRoomUsers();
  await ensureTableChatMessages();
  await ensureTableChatMentions();
  await ensureTableChatMessageReads();
  await seedDefaultRooms();
}

module.exports = runChatMigrations;

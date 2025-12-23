// =================================================================
// CONFIGURACIÓN GLOBAL
// =================================================================

const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN'; // Reemplazar
const TELEGRAM_API_URL = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN;
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // Reemplazar
const ARCHIVE_AFTER_DAYS = 90;

const IIOT_CONFIG = {
  EDM_WIRE_ITEM_ID: 'HILO-EDM-01', // SKU del rollo de hilo en Master_Inventario
  EDM_WIRE_WARN_LEVEL: 15, // % de nivel de hilo para enviar alerta
  RESIN_WARN_LEVEL: 90, // % de saturación de resina para enviar alerta
  ERROR_STATUSES: ['ERROR', 'ALARM', 'FALLA'] // Estados de máquina que disparan alertas
};

// =================================================================
// PUNTO DE ENTRADA PRINCIPAL (WEBHOOK)
// =================================================================

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    if (contents.message) {
      handleTelegramUpdate(contents);
    } else {
      handleIIoTUpdate(contents);
    }
  } catch (error) {
    Logger.log('Error en doPost: ' + error.toString() + ' | Data: ' + e.postData.contents);
  }
}

// =================================================================
// LÓGICA DE NEGOCIO (ERP/MES) Y TRIGGERS AUTOMÁTICOS
// =================================================================

/**
 * Se ejecuta periódicamente (ej. cada hora) para revisar umbrales críticos.
 */
function checkThresholds() {
  checkInventoryROP();
}

/**
 * Revisa el inventario, compara con el ROP y envía alertas para ítems con bajo stock.
 */
function checkInventoryROP() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Master_Inventario');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const idCol = headers.indexOf('ID_Herramienta / SKU');
  const stockCol = headers.indexOf('Stock_Actual');
  const ropCol = headers.indexOf('ROP');

  if (idCol === -1 || stockCol === -1 || ropCol === -1) return;

  const scriptProperties = PropertiesService.getScriptProperties();
  const lowStockItems = [];

  data.forEach(row => {
    const itemId = row[idCol];
    const stock = parseFloat(row[stockCol]);
    const rop = parseFloat(row[ropCol]);

    if (!isNaN(stock) && !isNaN(rop) && stock <= rop) {
      const lastNotified = scriptProperties.getProperty(itemId);
      if (!lastNotified || (new Date() - new Date(lastNotified)) > 24 * 60 * 60 * 1000) {
        lowStockItems.push(`- *${itemId}*: ${stock} (ROP: ${rop})`);
        scriptProperties.setProperty(itemId, new Date().toISOString());
      }
    } else {
      scriptProperties.deleteProperty(itemId);
    }
  });

  if (lowStockItems.length > 0) {
    const message = '*Alerta Automática de Inventario (Bajo ROP):*\n\n' + lowStockItems.join('\n');
    notifyAllAuthorizedUsers(message);
  }
}

/**
 * Archiva registros antiguos de la hoja de producción a una hoja histórica.
 */
function archiveLog() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sourceSheet = ss.getSheetByName('Registro_Produccion');
  let archiveSheet = ss.getSheetByName('Registro_Produccion_Historico');

  if (!sourceSheet) return;
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet('Registro_Produccion_Historico');
    const headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues();
    archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  }

  const data = sourceSheet.getDataRange().getValues();
  const headers = data.shift();
  const rowsToArchive = [];
  const rowsToKeep = [headers];
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - ARCHIVE_AFTER_DAYS);

  data.forEach(row => {
    const rowDate = new Date(row[0]);
    if (rowDate < thresholdDate) {
      rowsToArchive.push(row);
    } else {
      rowsToKeep.push(row);
    }
  });

  if (rowsToArchive.length > 0) {
    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, rowsToArchive.length, headers.length).setValues(rowsToArchive);
    sourceSheet.clearContents();
    sourceSheet.getRange(1, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
    Logger.log(`Se archivaron ${rowsToArchive.length} registros.`);
  }
}

// =================================================================
// LÓGICA DE TELEGRAM
// =================================================================

function handleTelegramUpdate(update) {
  const message = update.message;
  const chatId = message.chat.id;
  const userId = message.from.id.toString();
  const text = message.text || '';

  if (!isUserAuthorized(userId)) {
    sendMessage(chatId, 'Acceso denegado.');
    return;
  }

  if (text.startsWith('/')) {
    const command = text.split(' ')[0];

    if (command.startsWith('/ayuda_')) {
      getHelpProcedure(chatId, command);
      return;
    }

    switch (command) {
      case '/start':
        sendMainMenu(chatId);
        break;
      case '/status':
        getMachineStatus(chatId);
        break;
      case '/inventario':
        getInventoryStatus(chatId);
        break;
      case '/ayuda':
        sendMessage(chatId, 'Por favor, especifica un código de error. Ejemplo: /ayuda_E101');
        break;
      default:
        sendMessage(chatId, 'Comando no reconocido. Envía /start para ver las opciones.');
        break;
    }
  }
}

function sendMainMenu(chatId) {
  const message = `
Bienvenido al Bot de Gestión del Taller CNC.

*Comandos disponibles:*
\`/status\` - Muestra el estado actual de las máquinas.
\`/inventario\` - Revisa el inventario y muestra alertas de stock bajo.
\`/ayuda_[CODIGO]\` - Muestra el procedimiento para un código de error (ej. \`/ayuda_E101\`).
  `;
  sendMessage(chatId, message);
}

function getMachineStatus(chatId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('IIoT_Bridge');
  if (!sheet) {
    sendMessage(chatId, 'Error: No se encontró la hoja "IIoT_Bridge".');
    return;
  }
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    sendMessage(chatId, 'No hay datos de máquinas disponibles.');
    return;
  }

  data.shift();
  const machineStatus = {};

  data.forEach(row => {
    const timestamp = new Date(row[0]).toLocaleString();
    const machineId = row[1];
    const status = row[2];
    machineStatus[machineId] = `*${machineId}*: ${status} (Últ. act: ${timestamp})`;
  });

  let message = '*Estado de las Máquinas:*\n\n' + Object.values(machineStatus).join('\n');
  sendMessage(chatId, message);
}

function getInventoryStatus(chatId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Master_Inventario');
  if (!sheet) {
    sendMessage(chatId, 'Error: No se encontró la hoja "Master_Inventario".');
    return;
  }
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    sendMessage(chatId, 'No hay datos de inventario disponibles.');
    return;
  }

  const headers = data.shift();
  const lowStockItems = [];

  const idCol = headers.indexOf('ID_Herramienta / SKU');
  const stockCol = headers.indexOf('Stock_Actual');
  const ropCol = headers.indexOf('ROP');

  if (idCol === -1 || stockCol === -1 || ropCol === -1) {
    sendMessage(chatId, "Error: Faltan las columnas 'ID_Herramienta / SKU', 'Stock_Actual', o 'ROP'.");
    return;
  }

  data.forEach(row => {
    const stock = parseFloat(row[stockCol]);
    const rop = parseFloat(row[ropCol]);
    if (!isNaN(stock) && !isNaN(rop) && stock <= rop) {
      lowStockItems.push(`- *${row[idCol]}*: ${stock} (ROP: ${rop})`);
    }
  });

  if (lowStockItems.length > 0) {
    sendMessage(chatId, '*Alerta de Inventario (Bajo ROP):*\n\n' + lowStockItems.join('\n'));
  } else {
    sendMessage(chatId, 'Inventario en orden.');
  }
}

function getHelpProcedure(chatId, commandText) {
  const errorCode = (commandText.split('_')[1] || '').trim().toUpperCase();
  if (!errorCode) return;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Procedimientos_Ayuda');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  let procedure = `No se encontró procedimiento para: *${errorCode}*`;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toUpperCase() === errorCode) {
      procedure = `*Procedimiento para ${errorCode}:*\n\n${data[i][1]}`;
      break;
    }
  }
  sendMessage(chatId, procedure);
}

// =================================================================
// LÓGICA IIOT
// =================================================================

function handleIIoTUpdate(data) {
  Logger.log('Datos IIoT recibidos: ' + JSON.stringify(data));
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('IIoT_Bridge');

  if (sheet) {
    sheet.appendRow([
      new Date(),
      data.machine_id,
      data.status,
      data.spindle_load,
      data.wire_level,
      data.resin_saturation,
      data.filter_pressure,
      data.program_name,
      data.cycle_time_sec
    ]);
  }

  if (IIOT_CONFIG.ERROR_STATUSES.includes((data.status || '').toUpperCase())) {
    notifyAllAuthorizedUsers(`🚨 *Alarma Crítica:* ${data.machine_id} - ${data.status}`);
  }

  if (data.machine_id && data.machine_id.toUpperCase().includes('EDM')) {
    checkConsumableThresholds(data);
    updateEdmWireConsumption(data);
  }
}

function checkConsumableThresholds(data) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const machineId = data.machine_id;

  if (data.wire_level && data.wire_level <= IIOT_CONFIG.EDM_WIRE_WARN_LEVEL) {
    const propKey = `${machineId}_wire_alert`;
    if (!scriptProperties.getProperty(propKey)) {
      notifyAllAuthorizedUsers(`⚠️ *Alerta EDM:* ${machineId}, nivel de hilo bajo: *${data.wire_level}%*`);
      scriptProperties.setProperty(propKey, 'true', {ttl: 21600}); // Re-notificar cada 6 horas
    }
  }

  if (data.resin_saturation && data.resin_saturation >= IIOT_CONFIG.RESIN_WARN_LEVEL) {
    const propKey = `${machineId}_resin_alert`;
    if (!scriptProperties.getProperty(propKey)) {
      notifyAllAuthorizedUsers(`💧 *Alerta EDM:* ${machineId}, saturación de resina alta: *${data.resin_saturation}%*`);
      scriptProperties.setProperty(propKey, 'true', {ttl: 21600});
    }
  }
}

function updateEdmWireConsumption(data) {
  const cycleTimeSeconds = data.cycle_time_sec;
  const cuttingSpeedMetersPerMin = data.cutting_speed_m_min;

  if (!cycleTimeSeconds || !cuttingSpeedMetersPerMin || cycleTimeSeconds <= 0) return;

  const metersConsumed = (cuttingSpeedMetersPerMin / 60) * cycleTimeSeconds;

  const inventorySheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Master_Inventario');
  if (!inventorySheet) return;

  const dataRange = inventorySheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values.shift();
  const idCol = headers.indexOf('ID_Herramienta / SKU');
  const stockCol = headers.indexOf('Stock_Actual');

  if (idCol === -1 || stockCol === -1) return;

  for (let i = 0; i < values.length; i++) {
    if (values[i][idCol] === IIOT_CONFIG.EDM_WIRE_ITEM_ID) {
      const currentStock = parseFloat(values[i][stockCol]);
      if (!isNaN(currentStock)) {
        const newStock = currentStock - metersConsumed;
        inventorySheet.getRange(i + 2, stockCol + 1).setValue(newStock);
        break;
      }
    }
  }
}

// =================================================================
// FUNCIONES AUXILIARES Y DE UTILIDAD
// =================================================================

function notifyAllAuthorizedUsers(message) {
  getAuthorizedUserIds().forEach(id => sendMessage(id, message));
}

function isUserAuthorized(userId) {
  return getAuthorizedUserIds().includes(userId);
}

function getAuthorizedUserIds() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Usuarios_Autorizados');
  if (!sheet) return [];

  return sheet.getRange('A:A').getValues()
    .map(row => row[0].toString().trim())
    .filter(id => id);
}

function sendMessage(chatId, text) {
  const url = TELEGRAM_API_URL + '/sendMessage';
  const payload = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: String(chatId), text: text, parse_mode: 'Markdown' })
  };
  try {
    UrlFetchApp.fetch(url, payload);
  } catch (e) {
    Logger.log('Error al enviar mensaje a Telegram: ' + e.toString());
  }
}

function setWebhook() {
  const webAppUrl = ScriptApp.getService().getUrl();
  const response = UrlFetchApp.fetch(TELEGRAM_API_URL + '/setWebhook?url=' + webAppUrl);
  Logger.log('Respuesta de setWebhook: ' + response.getContentText());
}

function deleteWebhook() {
  const response = UrlFetchApp.fetch(TELEGRAM_API_URL + '/deleteWebhook');
  Logger.log('Respuesta de deleteWebhook: ' + response.getContentText());
}

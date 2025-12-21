# Sistema de Gestión de Taller CNC con Google Sheets y Telegram

Este proyecto implementa una solución de bajo costo para la monitorización y gestión de un taller CNC utilizando Google Sheets como base de datos y un bot de Telegram como interfaz de usuario en tiempo real.

## Características

- **Monitorización de Activos (IIoT):** Recibe y procesa datos de máquinas a través de un endpoint web.
- **Gestión de Inventario:** Calcula el Punto de Pedido (ROP) y envía alertas cuando el stock es bajo.
- **Notificaciones en Tiempo Real:** Envía alertas a través de Telegram sobre el estado de las máquinas, niveles de consumibles y necesidades de inventario.
- **Control por Comandos:** Permite a los usuarios autorizados consultar el estado del taller a través de comandos de Telegram.

## Configuración

Sigue estos pasos para configurar y desplegar el sistema.

### 1. Configurar la Hoja de Cálculo de Google

1.  Crea una nueva hoja de cálculo en Google Sheets.
2.  Obtén el **ID de la Hoja de Cálculo** de la URL. Ejemplo: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.
3.  Crea las siguientes pestañas (hojas) en el archivo:
    *   `Master_Inventario`
    *   `IIoT_Bridge`
    *   `Registro_Produccion`
    *   `Usuarios_Autorizados`
    *   `Log_Errores` (Opcional, para depuración)

### 2. Crear un Bot de Telegram

1.  Habla con [@BotFather](https://t.me/BotFather) en Telegram.
2.  Crea un nuevo bot usando el comando `/newbot`.
3.  Dale un nombre y un `username` a tu bot.
4.  BotFather te proporcionará un **token de acceso API**. Guárdalo, lo necesitarás más adelante.

### 3. Configurar el Proyecto de Google Apps Script

1.  Abre el editor de Google Apps Script asociado a tu hoja de cálculo (`Extensiones > Apps Script`).
2.  Copia el contenido de `Code.gs` y `appsscript.json` de este repositorio en los archivos correspondientes de tu proyecto.
3.  **Actualiza las constantes en `Code.gs`:**
    *   `TELEGRAM_BOT_TOKEN`: Pega el token de tu bot de Telegram.
    *   `SPREADSHEET_ID`: Pega el ID de tu hoja de cálculo.
    *   `AUTHORIZED_USERS`: Añade los IDs de los usuarios de Telegram que tendrán permiso para usar el bot. Puedes obtener tu ID hablando con [@userinfobot](https://t.me/userinfobot).

### 4. Desplegar como Aplicación Web

1.  En el editor de Apps Script, haz clic en `Deploy > New deployment`.
2.  Selecciona el tipo de despliegue `Web app`.
3.  En la configuración:
    *   **Descripción:** `Webhook para Bot de Telegram y Taller CNC`.
    *   **Execute as:** `Me`.
    *   **Who has access:** `Anyone` (Esto es necesario para que la API de Telegram pueda contactar tu script. La seguridad se maneja dentro del script con la lista de usuarios autorizados).
4.  Haz clic en `Deploy`.
5.  **Autoriza los permisos** que solicitará el script.
6.  Copia la **URL de la aplicación web**. La necesitarás para el siguiente paso.

### 5. Configurar el Webhook

El webhook es el mecanismo que permite a Telegram enviar actualizaciones a tu script en tiempo real.

1.  En el editor de Apps Script, selecciona la función `setWebhook` en el menú desplegable y haz clic en `Run`.
2.  Esto le dirá a Telegram que envíe todas las actualizaciones para tu bot a la URL de tu aplicación web.
3.  Puedes verificar el estado en los logs (`View > Logs`). Deberías ver un mensaje de éxito.

¡Listo! Tu bot de Telegram ahora está conectado a tu hoja de cálculo de Google.

## Comandos del Bot

-   `/start`: Muestra el menú principal.
-   `/status`: Devuelve el estado actual de todas las máquinas conectadas.
-   `/inventario`: Muestra una lista de herramientas con stock bajo (por debajo del ROP).
-   `/ayuda [CODIGO_ERROR]`: (Funcionalidad futura) Devuelve el procedimiento asociado a un código de error.

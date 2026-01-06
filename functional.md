# Tactio - Análisis Funcional

Tactio es una herramienta de productividad de escritorio basada en Electron diseñada para optimizar el flujo de trabajo "Copiar, Transformar, Pegar" utilizando Modelos de Lenguaje Grande (LLMs). Actúa como una utilidad en segundo plano que se activa globalmente para procesar texto seleccionado.

## Arquitectura Técnica

* **Runtime**: Electron (v28), Node.js.
* **Lenguaje**: TypeScript (v5).
* **Frontend**: HTML/CSS/TypeScript Vanilla (sin frameworks pesados como React/Vue/Angular).
* **Backend (Main)**: IPC, gestión de ventanas, integración con sistema operativo.
* **Almacenamiento**: Local mediante `store.ts` (configuración JSON) y `safeStorage` de Electron para claves API.

## Funcionalidades Principales

### 1. Activación Global y Captura de Contexto

* **Hotkey Global**: `Ctrl+Shift+G` (Commando+Shift+G en Mac).
* **Flujo de Activación**:
    1. Al pulsar el atajo, la aplicación simula `Ctrl+C` para copiar el texto seleccionado.
    2. Lee el contenido del portapapeles.
    3. Abre una ventana flotante ("tipo Spotlight") cerca de la posición del cursor.
    4. Muestra el texto capturado (o un historial reciente) listo para ser procesado.

### 2. Procesamiento con IA (LLMs)

Tactio soporta múltiples proveedores de IA para transformar el texto:

* **Google Gemini**:
  * Usa el SDK oficial `@google/generative-ai`.
  * Modelos soportados (hardcoded): `gemini-2.0-flash-lite-001`, `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-1.0-pro`.
* **OpenRouter**:
  * Usa la API estándar de OpenAI.
  * Permite acceder a cualquier modelo disponible en OpenRouter.
  * **Filtrado de Modelos Gratuitos**: Incluye una opción en la configuración para listar solo los modelos gratuitos.

### 3. Sistema de "Acciones" (Prompts)

El núcleo de la funcionalidad reside en las "Acciones" configurables:

* **Gestor de Prompts**: Interfaz UI para Crear, Editar y Eliminar acciones.
* **Estructura de una Acción**:
  * **Etiqueta**: Nombre corto (ej: "Resumir", "Traducir").
  * **Icono**: Emoji o texto corto (ej: "📝", "🇪🇸").
  * **Prompt de Sistema**: La instrucción enviada al LLM (ej: "Resume el siguiente texto...").
* **Botonera Rápida**: Las acciones aparecen como botones en la pantalla principal para un acceso inmediato.

### 4. Modos de Salida (Output Modes)

El usuario puede elegir qué hacer con el resultado generado por la IA:

* **Modo Pegar (📋)**:
  * Copia el resultado al portapapeles.
  * Minimiza y oculta la ventana de Tactio.
  * Simula `Ctrl+V` para pegar automáticamente el texto en la aplicación anterior.
* **Modo Archivo (💾)**:
  * Guarda el resultado como un archivo Markdown (`.md`) en un directorio configurado.
  * Genera nombres de archivo inteligentes usando IA (o timestamp si falla).
  * Muestra una alerta de confirmación y permite abrir la carpeta de salida.
  * Mantiene la ventana abierta para seguir trabajando.

### 5. Historial y Gestión de Ventana

* **Historial Reciente**: Muestra los últimos 3 resultados procesados con opción a reutilizarlos (volver a pegar o guardar).
* **Ventana Flotante**:
  * Diseño "Frameless" (sin bordes del SO).
  * **Pin (fijar)**: Opción "Always on Top" (`📌`) para evitar que la ventana se oculte al perder el foco.
  * **Auto-ocultar**: Por defecto, la ventana se oculta al hacer clic fuera de ella (blur).
  * Indicador visual de redimensionamiento en la esquina inferior derecha.

### 6. Configuración

* Selección de Servicio (Gemini vs OpenRouter).
* Gestión segura de API Keys.
* Selección de directorio de salida para archivos.
* Persistencia de preferencias (Modo de salida, etc.).

## Flujo de Usuario Típico

1. Usuario selecciona texto en cualquier app (navegador, IDE, notas).
2. Pulsa `Ctrl+Shift+G`.
3. Aparece Tactio con sus botones de acción (ej: "Explicar Código").
4. Usuario hace clic en "Explicar Código".
5. Tactio envía texto + prompt a la IA.
6. **Si está en modo Pegar**: El texto original se reemplaza por la explicación.
7. **Si está en modo Archivo**: Se crea un archivo `tactio_explicacion.md` en la carpeta de documentos.
